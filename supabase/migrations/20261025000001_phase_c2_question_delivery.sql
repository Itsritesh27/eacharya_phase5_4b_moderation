-- eAcharya Phase C2: secure question retrieval for an assessment attempt.
--
-- SCOPE: read-only delivery of question content to the student who owns an open attempt.
-- NOT here: answer saving, submission changes, scoring, explanations, exam pages.
--
-- What this migration does
--   1. get_attempt_paper(attempt)          the ONLY student path to question content (SECURITY DEFINER)
--   2. get_assessment_question_count(asm)  replaces the one direct student read of `questions`
--   3. Drops the two student SELECT policies on `questions` and `question_options`
--      (migration 4), so a student can no longer read the paper straight from the API.
--      All teacher/admin policies and all table grants are untouched. Answer-key tables were
--      never student-readable and are not touched.
--
-- Design
--   * The caller comes from auth.uid(). No function takes a user id.
--   * Ownership: the attempt must belong to the caller. "Missing" and "someone else's" give the same
--     error (EA005), exactly like get_my_attempt in Phase B.
--   * State: the attempt must be EFFECTIVELY in_progress. Overdue attempts are expired first, using the
--     Phase B helper. Submitted and expired attempts get EA007 and no content.
--   * Access is re-checked at call time with the Phase B / migration-4 helpers: student role, published
--     assessment, published course, enrolment, opens_at / closes_at.
--   * Only questions with questions.assessment_id = the attempt's assessment are returned, ordered by
--     questions.position (options by question_options.position): the same order the teacher set.
--   * The payload is an explicit allow-list built with jsonb_build_object. It never uses to_jsonb(row),
--     never reads question_answer_keys or question_correct_options, and never states how many options
--     are correct.
--
-- New error code (SQLSTATE):  EA007 the attempt is no longer open (submitted or expired).
-- Reused:  42501 not signed in / not a student   EA001 not available   EA002 not open yet
--          EA003 closed   EA005 attempt not found (missing or not yours: same text)

-- ---------------------------------------------------------------
-- get_attempt_paper
-- ---------------------------------------------------------------
create or replace function public.get_attempt_paper(p_attempt uuid)
returns jsonb
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
  v_info public.attempt_info;
  v_questions jsonb;
begin
  if v_uid is null or public.current_user_role() is distinct from 'student' then
    raise exception 'Only signed-in students can open an assessment paper' using errcode = '42501';
  end if;

  -- Ownership is part of the lookup: a null id, a missing id and another student's id all look the same.
  select * into v_row from public.assessment_attempts t
   where t.id = p_attempt and t.user_id = v_uid;
  if not found then
    raise exception 'Attempt not found.' using errcode = 'EA005';
  end if;

  -- Effective status: close an overdue attempt first, then re-read it.
  if v_row.status = 'in_progress' and v_row.expires_at is not null
     and v_row.expires_at <= clock_timestamp() then
    perform public.expire_overdue_attempts(v_uid, v_row.assessment_id);
    select * into v_row from public.assessment_attempts t where t.id = v_row.id;
  end if;
  if v_row.status <> 'in_progress' then
    raise exception 'This attempt is no longer open.' using errcode = 'EA007';
  end if;

  -- Availability and access, re-checked now (the assessment may have changed since the attempt started).
  select * into v_asm from public.assessments a where a.id = v_row.assessment_id;
  if not found or not public.is_enrolled_in_assessment(v_row.assessment_id) then
    raise exception 'This assessment is not available.' using errcode = 'EA001';
  end if;
  v_now := clock_timestamp();
  if v_asm.opens_at is not null and v_asm.opens_at > v_now then
    raise exception 'This assessment has not opened yet.' using errcode = 'EA002';
  end if;
  if (v_asm.closes_at is not null and v_asm.closes_at <= v_now)
     or not public.is_assessment_open(v_row.assessment_id) then
    raise exception 'This assessment is closed.' using errcode = 'EA003';
  end if;

  -- Explicit allow-list. Only this assessment's questions; same order as the teacher set.
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', q.id,
             'position', q.position,
             'type', q.question_type,
             'text', q.question_text,
             'image_url', q.image_url,
             'marks', q.marks,
             'options', case
               when q.question_type in ('single_choice', 'multiple_select') then
                 coalesce((
                   select jsonb_agg(jsonb_build_object('id', o.id, 'text', o.option_text) order by o.position)
                   from public.question_options o
                   where o.question_id = q.id
                 ), '[]'::jsonb)
               else '[]'::jsonb
             end
           ) order by q.position
         ), '[]'::jsonb)
    into v_questions
    from public.questions q
   where q.assessment_id = v_row.assessment_id;

  v_info := public.attempt_to_info(v_row, true);

  return jsonb_build_object(
    'attempt', jsonb_build_object(
      'attempt_id', v_info.attempt_id,
      'assessment_id', v_info.assessment_id,
      'attempt_number', v_info.attempt_number,
      'status', v_info.status,
      'started_at', v_info.started_at,
      'expires_at', v_info.expires_at,
      'server_now', v_info.server_now,
      'seconds_remaining', v_info.seconds_remaining
    ),
    'assessment', jsonb_build_object(
      'id', v_asm.id,
      'title', v_asm.title,
      'instructions', v_asm.instructions,
      'total_marks', v_asm.total_marks,
      'duration_minutes', v_asm.duration_minutes
    ),
    'questions', v_questions
  );
end;
$$;

-- ---------------------------------------------------------------
-- get_assessment_question_count
-- Replaces the direct count the student page made on `questions`. Same behaviour as before:
-- a number only while the assessment is open to this student, otherwise null.
-- ---------------------------------------------------------------
create or replace function public.get_assessment_question_count(p_assessment uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or p_assessment is null then
    return null;
  end if;
  if not public.is_assessment_open(p_assessment) then
    return null;
  end if;
  return (select count(*)::integer from public.questions q where q.assessment_id = p_assessment);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['get_attempt_paper(uuid)', 'get_assessment_question_count(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------
-- Close the direct path. Teacher and admin policies on these tables are unchanged.
-- ---------------------------------------------------------------
drop policy if exists "questions: students read when open" on public.questions;
drop policy if exists "question_options: students read when open" on public.question_options;
