-- UPDATE 2026-10-19 (Phase B): PARTLY SUPERSEDED. The attempts table, status enum (now with 'expired'),
-- start/get/submit functions and RLS were implemented differently in
-- supabase/migrations/20261024000001_phase_b_assessment_attempts.sql. Do NOT apply this file's
-- assessment_attempts / attempt_status / submit_attempt(uuid) returns timestamptz on top of it.
-- Only attempt_answers and save_attempt_answer below remain useful (answer saving is a later phase and
-- must be adapted to the attempt_info return type and the 'expired' status).
-- PROPOSAL ONLY. NOT in supabase/migrations/, NOT applied, NOT run by anything.
-- Smallest additive migration needed for student attempts, answer saving and
-- submission (Phase 3.3). Review, adjust, then move into supabase/migrations/
-- with the next timestamp once approved.
--
-- Design: students can READ their own attempts/answers; they cannot write the
-- tables directly. All writes go through SECURITY DEFINER functions that take the
-- user from auth.uid() (never from the client), so ownership, time limit, window,
-- attempt limit and answer shape are enforced in the database. No answer keys are
-- involved: grading stays in Phase 3.4.

create type public.attempt_status as enum ('in_progress', 'submitted');

create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete cascade,
  attempt_number integer not null check (attempt_number >= 1),
  status public.attempt_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  -- least(started_at + duration, closes_at); null = no time limit
  expires_at timestamptz,
  submitted_at timestamptz,
  unique (assessment_id, user_id, attempt_number),
  constraint attempt_submitted_consistent check ((status = 'submitted') = (submitted_at is not null))
);
-- at most one open attempt per student per assessment
create unique index assessment_attempts_one_open_idx
  on public.assessment_attempts (assessment_id, user_id) where status = 'in_progress';
create index assessment_attempts_user_idx on public.assessment_attempts (user_id);

create table public.attempt_answers (
  attempt_id uuid not null references public.assessment_attempts (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete restrict,
  selected_option_ids uuid[] not null default '{}' check (cardinality(selected_option_ids) <= 10),
  answer_boolean boolean,
  answer_text text check (answer_text is null or char_length(answer_text) <= 10000),
  -- client-side save counter: a save with a lower number than the stored one is ignored
  revision bigint not null default 0,
  saved_at timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

alter table public.assessment_attempts enable row level security;
alter table public.attempt_answers enable row level security;
revoke all on public.assessment_attempts, public.attempt_answers from anon, authenticated;
grant select on public.assessment_attempts, public.attempt_answers to authenticated;

create policy "attempts: students read own"
  on public.assessment_attempts for select to authenticated
  using (user_id = (select auth.uid()));

create policy "attempt_answers: students read own"
  on public.attempt_answers for select to authenticated
  using (exists (
    select 1 from public.assessment_attempts t
    where t.id = attempt_id and t.user_id = (select auth.uid())
  ));
-- Teacher/admin read policies belong to Task 3.4 (results). No write policies at all.

-- A published assessment with attempts can no longer be moved back to draft.
create or replace function public.assessments_block_unpublish_with_attempts()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'published' and new.status = 'draft'
     and exists (select 1 from public.assessment_attempts where assessment_id = old.id) then
    raise exception 'Students have already started this assessment, so it cannot be moved back to draft'
      using errcode = '23514';
  end if;
  return new;
end $$;
create trigger assessments_block_unpublish_with_attempts
  before update on public.assessments
  for each row execute function public.assessments_block_unpublish_with_attempts();
revoke all on function public.assessments_block_unpublish_with_attempts() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- Student operations (the only write path)
-- ---------------------------------------------------------------
create or replace function public.start_assessment_attempt(p_assessment uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  a record;
  v_open uuid;
  v_n integer;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in to continue' using errcode = '42501'; end if;
  if not public.is_assessment_open(p_assessment) then
    raise exception 'This assessment is not open to you right now' using errcode = '42501';
  end if;
  select * into a from public.assessments where id = p_assessment;

  -- resume an unexpired open attempt instead of creating another
  select id into v_open from public.assessment_attempts
   where assessment_id = p_assessment and user_id = v_uid and status = 'in_progress'
     and (expires_at is null or expires_at > now());
  if v_open is not null then return v_open; end if;

  select coalesce(max(attempt_number), 0) into v_n from public.assessment_attempts
   where assessment_id = p_assessment and user_id = v_uid;
  if a.attempt_limit is not null and v_n >= a.attempt_limit then
    raise exception 'You have used all attempts for this assessment' using errcode = '23514';
  end if;

  -- an expired, unsubmitted attempt is closed out so the one-open-attempt index is free
  update public.assessment_attempts set status = 'submitted', submitted_at = now()
   where assessment_id = p_assessment and user_id = v_uid and status = 'in_progress';

  insert into public.assessment_attempts (assessment_id, user_id, attempt_number, expires_at)
  values (
    p_assessment, v_uid, v_n + 1,
    case when a.duration_minutes is null and a.closes_at is null then null
         else least(
           coalesce(now() + make_interval(mins => a.duration_minutes), 'infinity'::timestamptz),
           coalesce(a.closes_at, 'infinity'::timestamptz)) end
  ) returning id into v_id;
  return v_id;
end $$;

create or replace function public.save_attempt_answer(
  p_attempt uuid, p_question uuid,
  p_revision bigint, p_option_ids uuid[] default '{}', p_boolean boolean default null, p_text text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  t record;
  q record;
  v_ids uuid[] := coalesce(p_option_ids, '{}');
  v_rows integer;
begin
  -- FOR SHARE: a concurrent submit_attempt (which updates this row) waits for in-flight saves,
  -- and a save that starts after submission sees status = 'submitted' and is rejected.
  select * into t from public.assessment_attempts where id = p_attempt and user_id = v_uid for share;
  if not found then raise exception 'Attempt not found' using errcode = '42501'; end if;
  if t.status <> 'in_progress' or (t.expires_at is not null and now() > t.expires_at + interval '10 seconds') then
    raise exception 'This attempt is closed' using errcode = '23514';
  end if;
  select id, question_type into q from public.questions where id = p_question and assessment_id = t.assessment_id;
  if not found then raise exception 'Question not found' using errcode = '23514'; end if;

  if q.question_type in ('single_choice','multiple_select') then
    if (select count(*) from public.question_options o where o.question_id = q.id and o.id = any (v_ids))
         <> cardinality(v_ids) then
      raise exception 'Invalid option' using errcode = '23514';
    end if;
    if q.question_type = 'single_choice' and cardinality(v_ids) > 1 then
      raise exception 'Choose one option' using errcode = '23514';
    end if;
    p_boolean := null; p_text := null;
  elsif q.question_type = 'true_false' then
    v_ids := '{}'; p_text := null;
  else
    v_ids := '{}'; p_boolean := null;
  end if;

  insert into public.attempt_answers
    (attempt_id, question_id, selected_option_ids, answer_boolean, answer_text, revision, saved_at)
  values (p_attempt, p_question, v_ids, p_boolean, p_text, p_revision, now())
  on conflict (attempt_id, question_id) do update
    set selected_option_ids = excluded.selected_option_ids, answer_boolean = excluded.answer_boolean,
        answer_text = excluded.answer_text, revision = excluded.revision, saved_at = excluded.saved_at
    where public.attempt_answers.revision < excluded.revision;
  get diagnostics v_rows = row_count;
  -- true = written; false = a newer save already exists (this older one was ignored)
  return v_rows > 0;
end $$;

create or replace function public.submit_attempt(p_attempt uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_at timestamptz;
begin
  -- Idempotent: the first call sets the timestamp; repeats return it unchanged.
  update public.assessment_attempts set status = 'submitted', submitted_at = now()
   where id = p_attempt and user_id = (select auth.uid()) and status = 'in_progress'
   returning submitted_at into v_at;
  if v_at is null then
    select submitted_at into v_at from public.assessment_attempts
     where id = p_attempt and user_id = (select auth.uid()) and status = 'submitted';
  end if;
  if v_at is null then raise exception 'Attempt not found' using errcode = '42501'; end if;
  return v_at;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'start_assessment_attempt(uuid)',
    'save_attempt_answer(uuid, uuid, bigint, uuid[], boolean, text)',
    'submit_attempt(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
