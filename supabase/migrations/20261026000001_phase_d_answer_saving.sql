-- eAcharya Phase D: secure answer saving (autosave) and restore for an open assessment attempt.
--
-- SCOPE: store and read back a student's in-progress answers. NOT here: submission changes (submit_attempt
-- is untouched and still status-only), scoring, results, teacher grading views, UI.
--
-- Design
--   * attempt_answers has NO grant for anon or authenticated and RLS is enabled with NO policy, so the two
--     SECURITY DEFINER functions below are the only way in or out. (Teacher / admin read access belongs to
--     the grading phase and will add its own policy or function.)
--   * The caller always comes from auth.uid(). No function takes a user id.
--   * Ownership: the attempt must belong to the caller. "Missing" and "someone else's" give the same error.
--   * State: the attempt must be EFFECTIVELY in progress at the moment of the call (not submitted, not expired,
--     deadline not passed by the database clock) and the assessment must still be published, the course
--     published, the student enrolled and the window open. There is no grace period after the deadline.
--   * Membership: the question must belong to the attempt's assessment; the option ids in an answer must
--     belong to that question. "Missing" and "another assessment's" question give the same error.
--   * One row per (attempt, question), enforced by a unique constraint; saving is an upsert.
--   * Ordering and duplicates: every save carries a client revision (integer, increases with each edit of that
--     question). The database keeps the highest revision only. A repeated request (same revision) or a late,
--     out-of-order one (lower revision) is NOT an error and changes nothing: the response says applied=false
--     and returns what is stored, so the client can reconcile.
--   * Clearing an answer stores NULL (not a delete), so its revision still protects against a late older save.
--   * Concurrency with submission: a save holds a SHARE lock on the attempt row; submit_attempt takes FOR UPDATE.
--     A save either commits before the submit (and counts) or runs after it and is refused.
--   * Backstop: a trigger on attempt_answers repeats the open / deadline / membership checks and makes
--     attempt_id and question_id immutable and the revision strictly increasing, even for the table owner.
--
-- Answer shapes (exactly one key; anything else is refused):
--   single_choice    {"option_id": "<uuid>"}
--   multiple_select  {"option_ids": ["<uuid>", ...]}      distinct, 1..50, stored sorted; [] clears
--   true_false       {"value": true | false}
--   short_answer     {"text": "..."}                       up to 500 characters; blank clears
--   descriptive      {"text": "..."}                       up to 10000 characters; blank clears
--   JSON null / SQL null clears the answer for any type.
--
-- New error codes (SQLSTATE):
--   EA008 the question is not part of this attempt's assessment (missing or another assessment's: same text)
--   EA009 the answer (or revision) is not valid for this question
-- Reused: 42501 not signed in / not a student, EA001 not available, EA002 not open yet, EA003 closed,
--         EA005 attempt not found (missing or not yours), EA007 attempt no longer open.

-- ---------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------
create table public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.assessment_attempts (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  -- normalized answer object; null = the student cleared it
  answer jsonb,
  revision integer not null check (revision between 1 and 1000000000),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint attempt_answers_one_per_question unique (attempt_id, question_id),
  constraint attempt_answers_shape check (
    answer is null or (jsonb_typeof(answer) = 'object' and octet_length(answer::text) <= 40000)
  )
);

create index attempt_answers_question_idx on public.attempt_answers (question_id);

comment on table public.attempt_answers is
  'Student in-progress answers. Written and read ONLY by save_attempt_answer / get_attempt_answers (SECURITY DEFINER). No direct grants.';

alter table public.attempt_answers enable row level security;
revoke all on public.attempt_answers from anon, authenticated;
-- No policy on purpose: with RLS on and no policy, every direct read or write by an app role is denied.

-- ---------------------------------------------------------------
-- Backstop trigger (runs for every role, including the table owner)
-- ---------------------------------------------------------------
create or replace function public.attempt_answers_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_att public.assessment_attempts%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.attempt_id is distinct from old.attempt_id
       or new.question_id is distinct from old.question_id
       or new.id is distinct from old.id
       or new.created_at is distinct from old.created_at then
      raise exception 'An answer cannot be moved to another attempt or question' using errcode = '42501';
    end if;
    if new.revision <= old.revision then
      raise exception 'An answer revision can only increase' using errcode = '42501';
    end if;
  end if;

  select * into v_att from public.assessment_attempts t where t.id = new.attempt_id;
  if not found
     or v_att.status <> 'in_progress'
     or (v_att.expires_at is not null and v_att.expires_at <= clock_timestamp()) then
    raise exception 'This attempt is no longer open.' using errcode = 'EA007';
  end if;
  if not exists (
    select 1 from public.questions q
     where q.id = new.question_id and q.assessment_id = v_att.assessment_id
  ) then
    raise exception 'That question is not part of this attempt.' using errcode = 'EA008';
  end if;

  new.updated_at := clock_timestamp();
  return new;
end;
$$;

create trigger attempt_answers_guard
  before insert or update on public.attempt_answers
  for each row execute function public.attempt_answers_guard();

revoke all on function public.attempt_answers_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- Internal helper: the caller's attempt, only if it is open and still accessible right now.
-- Not executable by app roles. Raises 42501 / EA005 / EA007 / EA001 / EA002 / EA003.
-- p_lock = true takes a SHARE lock on the attempt row (see "Concurrency with submission" above).
-- Note: it does not try to mark an overdue attempt as expired, because the exception it raises would roll
-- that update back anyway. The effective status is computed everywhere and the sweeper does the marking.
-- ---------------------------------------------------------------
create or replace function public.open_attempt_for_answers(p_attempt uuid, p_lock boolean)
returns public.assessment_attempts
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.assessment_attempts%rowtype;
  v_asm public.assessments%rowtype;
  v_now timestamptz;
begin
  if v_uid is null or public.current_user_role() is distinct from 'student' then
    raise exception 'Only signed-in students can save answers' using errcode = '42501';
  end if;

  if p_lock then
    select * into v_row from public.assessment_attempts t
     where t.id = p_attempt and t.user_id = v_uid for share;
  else
    select * into v_row from public.assessment_attempts t
     where t.id = p_attempt and t.user_id = v_uid;
  end if;
  if not found then
    raise exception 'Attempt not found.' using errcode = 'EA005';
  end if;

  v_now := clock_timestamp();
  if v_row.status <> 'in_progress' or (v_row.expires_at is not null and v_row.expires_at <= v_now) then
    raise exception 'This attempt is no longer open.' using errcode = 'EA007';
  end if;

  select * into v_asm from public.assessments a where a.id = v_row.assessment_id;
  if not found or not public.is_enrolled_in_assessment(v_row.assessment_id) then
    raise exception 'This assessment is not available.' using errcode = 'EA001';
  end if;
  if v_asm.opens_at is not null and v_asm.opens_at > v_now then
    raise exception 'This assessment has not opened yet.' using errcode = 'EA002';
  end if;
  if (v_asm.closes_at is not null and v_asm.closes_at <= v_now)
     or not public.is_assessment_open(v_row.assessment_id) then
    raise exception 'This assessment is closed.' using errcode = 'EA003';
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------
-- Internal helper: validate and normalize one answer for one question. Returns the stored form
-- (NULL = clear). Raises EA009 for anything that is not exactly one of the shapes listed at the top.
-- ---------------------------------------------------------------
create or replace function public.normalize_attempt_answer(
  p_question uuid, p_type public.question_type, p_answer jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_val jsonb;
  v_text text;
  v_ids uuid[];
  v_item jsonb;
  v_id uuid;
  v_max integer;
begin
  if p_answer is null or jsonb_typeof(p_answer) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_answer) <> 'object' or (select count(*) from jsonb_object_keys(p_answer)) <> 1 then
    raise exception 'That answer is not valid.' using errcode = 'EA009';
  end if;
  select k into v_key from jsonb_object_keys(p_answer) k;
  v_val := p_answer -> v_key;

  if p_type = 'single_choice' then
    if v_key <> 'option_id' or jsonb_typeof(v_val) <> 'string'
       or (v_val #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'That answer is not valid.' using errcode = 'EA009';
    end if;
    v_id := (v_val #>> '{}')::uuid;
    if not exists (select 1 from public.question_options o where o.id = v_id and o.question_id = p_question) then
      raise exception 'That answer is not valid.' using errcode = 'EA009';
    end if;
    return jsonb_build_object('option_id', v_id);

  elsif p_type = 'multiple_select' then
    if v_key <> 'option_ids' or jsonb_typeof(v_val) <> 'array' then
      raise exception 'That answer is not valid.' using errcode = 'EA009';
    end if;
    if jsonb_array_length(v_val) = 0 then
      return null;
    end if;
    if jsonb_array_length(v_val) > 50 then
      raise exception 'That answer is not valid.' using errcode = 'EA009';
    end if;
    v_ids := '{}';
    for v_item in select value from jsonb_array_elements(v_val) loop
      if jsonb_typeof(v_item) <> 'string'
         or (v_item #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'That answer is not valid.' using errcode = 'EA009';
      end if;
      v_id := (v_item #>> '{}')::uuid;
      if v_id = any (v_ids) then
        raise exception 'That answer is not valid.' using errcode = 'EA009';
      end if;
      v_ids := v_ids || v_id;
    end loop;
    select count(*) into v_max from public.question_options o
     where o.question_id = p_question and o.id = any (v_ids);
    if v_max <> cardinality(v_ids) then
      raise exception 'That answer is not valid.' using errcode = 'EA009';
    end if;
    return jsonb_build_object('option_ids', (select to_jsonb(array_agg(x order by x)) from unnest(v_ids) x));

  elsif p_type = 'true_false' then
    if v_key <> 'value' or jsonb_typeof(v_val) <> 'boolean' then
      raise exception 'That answer is not valid.' using errcode = 'EA009';
    end if;
    return jsonb_build_object('value', v_val);

  elsif p_type in ('short_answer', 'descriptive') then
    if v_key <> 'text' or jsonb_typeof(v_val) <> 'string' then
      raise exception 'That answer is not valid.' using errcode = 'EA009';
    end if;
    v_text := v_val #>> '{}';
    v_max := case p_type when 'short_answer' then 500 else 10000 end;
    if char_length(v_text) > v_max then
      raise exception 'That answer is not valid.' using errcode = 'EA009';
    end if;
    if btrim(v_text) = '' then
      return null;
    end if;
    return jsonb_build_object('text', v_text);
  end if;

  raise exception 'That answer is not valid.' using errcode = 'EA009';
end;
$$;

revoke all on function public.open_attempt_for_answers(uuid, boolean) from public, anon, authenticated;
revoke all on function public.normalize_attempt_answer(uuid, public.question_type, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- save_attempt_answer
-- Returns: {applied, question_id, revision, answer, saved_at, server_now, expires_at, seconds_remaining}
-- applied=false means "nothing changed" (a repeat or an older revision); the stored state is returned.
-- ---------------------------------------------------------------
create or replace function public.save_attempt_answer(
  p_attempt uuid, p_question uuid, p_answer jsonb, p_revision integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_att public.assessment_attempts%rowtype;
  v_type public.question_type;
  v_norm jsonb;
  v_row public.attempt_answers%rowtype;
  v_applied boolean := false;
  v_now timestamptz;
begin
  v_att := public.open_attempt_for_answers(p_attempt, true);

  if p_revision is null or p_revision < 1 or p_revision > 1000000000 then
    raise exception 'That answer is not valid.' using errcode = 'EA009';
  end if;

  select q.question_type into v_type from public.questions q
   where q.id = p_question and q.assessment_id = v_att.assessment_id;
  if not found then
    raise exception 'That question is not part of this attempt.' using errcode = 'EA008';
  end if;

  v_norm := public.normalize_attempt_answer(p_question, v_type, p_answer);

  -- Upsert keeping only the highest revision. The unique constraint makes a duplicate row impossible even
  -- when two requests race; the loser's WHERE clause is re-evaluated against the winner's row.
  insert into public.attempt_answers as aa (attempt_id, question_id, answer, revision)
  values (p_attempt, p_question, v_norm, p_revision)
  on conflict (attempt_id, question_id) do update
     set answer = excluded.answer, revision = excluded.revision
   where aa.revision < excluded.revision
  returning * into v_row;

  if found then
    v_applied := true;
  else
    select * into v_row from public.attempt_answers aa
     where aa.attempt_id = p_attempt and aa.question_id = p_question;
  end if;

  v_now := clock_timestamp();
  return jsonb_build_object(
    'applied', v_applied,
    'question_id', v_row.question_id,
    'revision', v_row.revision,
    'answer', v_row.answer,
    'saved_at', v_row.updated_at,
    'server_now', v_now,
    'expires_at', v_att.expires_at,
    'seconds_remaining', case when v_att.expires_at is null then null
                              else greatest(0, floor(extract(epoch from (v_att.expires_at - v_now))))::integer end
  );
end;
$$;

-- ---------------------------------------------------------------
-- get_attempt_answers: restore the caller's saved answers for one OPEN attempt.
-- Returns: {attempt: {attempt_id, status, expires_at, server_now, seconds_remaining},
--           answers: [{question_id, revision, answer, saved_at}]}   (cleared answers have answer = null)
-- ---------------------------------------------------------------
create or replace function public.get_attempt_answers(p_attempt uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_att public.assessment_attempts%rowtype;
  v_now timestamptz;
  v_answers jsonb;
begin
  v_att := public.open_attempt_for_answers(p_attempt, false);
  v_now := clock_timestamp();

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'question_id', aa.question_id,
             'revision', aa.revision,
             'answer', aa.answer,
             'saved_at', aa.updated_at
           ) order by q.position
         ), '[]'::jsonb)
    into v_answers
    from public.attempt_answers aa
    join public.questions q on q.id = aa.question_id
   where aa.attempt_id = p_attempt
     and q.assessment_id = v_att.assessment_id;

  return jsonb_build_object(
    'attempt', jsonb_build_object(
      'attempt_id', v_att.id,
      'status', 'in_progress',
      'expires_at', v_att.expires_at,
      'server_now', v_now,
      'seconds_remaining', case when v_att.expires_at is null then null
                                else greatest(0, floor(extract(epoch from (v_att.expires_at - v_now))))::integer end
    ),
    'answers', v_answers
  );
end;
$$;

-- Only signed-in users may execute; anon and PUBLIC may not.
do $$
declare f text;
begin
  foreach f in array array['save_attempt_answer(uuid, uuid, jsonb, integer)', 'get_attempt_answers(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
