-- PROPOSAL ONLY. NOT in supabase/migrations/, NOT applied, NOT run by anything.
-- UNTESTED: no PostgreSQL was available when this was written. Run it on a scratch
-- database (with assessment_rls_checks.sql style tests) before approving.
--
-- Phase 3.5: server-side scoring and results.
-- DEPENDS ON phase3_3_attempts_PROPOSAL.sql being approved and applied first
-- (assessment_attempts, attempt_answers, submit_attempt, start_assessment_attempt).
--
-- Design
--  * Scores live in NEW tables with NO student policy, because the proposed attempts
--    policy lets students SELECT their whole own attempt row and answer rows. Putting
--    score columns there would leak scores before release.
--  * Students read results only through SECURITY DEFINER functions that take the user
--    from auth.uid(), check ownership, and apply the release policy.
--  * Scoring runs inside submit_attempt (same transaction, row-locked, idempotent).
--    No service-role key is needed anywhere.
--  * Answer keys are read only inside SECURITY DEFINER functions. Nothing returns them.
--  * Short answer and descriptive questions are never auto-scored (pending review).

-- ---------------------------------------------------------------
-- 1. Release policy on assessments (no such setting exists today)
-- ---------------------------------------------------------------
create type public.results_release as enum ('immediate', 'after_close', 'manual');

alter table public.assessments
  add column results_release public.results_release not null default 'immediate',
  add column results_released_at timestamptz,            -- used when results_release = 'manual'
  add column show_question_feedback boolean not null default false,
  add constraint assessments_after_close_needs_close
    check (results_release <> 'after_close' or closes_at is not null);

grant update (results_release, results_released_at, show_question_feedback)
  on public.assessments to authenticated;

-- ---------------------------------------------------------------
-- 2. Result tables (staff read; students via functions only)
-- ---------------------------------------------------------------
create type public.grading_status as enum ('pending_review', 'graded');
create type public.question_score_status as enum ('auto_graded', 'pending_review', 'graded');

create table public.attempt_results (
  attempt_id uuid primary key references public.assessment_attempts (id) on delete cascade,
  objective_marks numeric(8, 2) not null check (objective_marks >= 0),
  manual_marks numeric(8, 2) not null default 0 check (manual_marks >= 0),
  pending_marks numeric(8, 2) not null default 0 check (pending_marks >= 0),
  max_marks numeric(8, 2) not null check (max_marks > 0),
  grading_status public.grading_status not null,
  -- null until every required question is graded
  final_score numeric(8, 2) check (final_score is null or (final_score >= 0 and final_score <= max_marks)),
  overall_feedback text check (overall_feedback is null or char_length(overall_feedback) <= 5000),
  scored_at timestamptz not null default now(),
  graded_at timestamptz,
  constraint attempt_results_final_consistent
    check ((grading_status = 'graded') = (final_score is not null))
);

create table public.attempt_question_scores (
  attempt_id uuid not null references public.assessment_attempts (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete restrict,
  max_marks numeric(6, 2) not null check (max_marks > 0),
  awarded_marks numeric(6, 2) check (awarded_marks is null or awarded_marks >= 0),
  status public.question_score_status not null,
  feedback text check (feedback is null or char_length(feedback) <= 5000),
  graded_by uuid references public.profiles (id) on delete set null,
  graded_at timestamptz,
  primary key (attempt_id, question_id),
  constraint scores_awarded_within_max check (awarded_marks is null or awarded_marks <= max_marks),
  constraint scores_pending_has_no_marks check ((status = 'pending_review') = (awarded_marks is null))
);

alter table public.attempt_results enable row level security;
alter table public.attempt_question_scores enable row level security;
revoke all on public.attempt_results, public.attempt_question_scores from anon, authenticated;
grant select on public.attempt_results, public.attempt_question_scores to authenticated;
-- No insert/update/delete grants: all writes happen inside SECURITY DEFINER functions.

create or replace function public.owns_attempt_course(p_attempt uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assessment_attempts t
    join public.assessments a on a.id = t.assessment_id
    join public.courses c on c.id = a.course_id
    where t.id = p_attempt and c.created_by = (select auth.uid())
  );
$$;
revoke all on function public.owns_attempt_course(uuid) from public, anon;
grant execute on function public.owns_attempt_course(uuid) to authenticated;

-- Staff only. Deliberately no student policy.
create policy "attempt_results: teachers read own courses"
  on public.attempt_results for select to authenticated
  using (public.is_teacher_or_admin() and public.owns_attempt_course(attempt_id));
create policy "attempt_results: admins read"
  on public.attempt_results for select to authenticated using (public.is_admin());
create policy "attempt_question_scores: teachers read own courses"
  on public.attempt_question_scores for select to authenticated
  using (public.is_teacher_or_admin() and public.owns_attempt_course(attempt_id));
create policy "attempt_question_scores: admins read"
  on public.attempt_question_scores for select to authenticated using (public.is_admin());

-- Teachers/admins also need to read submitted answers to grade them (the attempts
-- proposal deferred these policies to this phase).
create policy "attempts: teachers read own courses"
  on public.assessment_attempts for select to authenticated
  using (public.is_teacher_or_admin() and public.owns_attempt_course(id));
create policy "attempt_answers: teachers read own courses"
  on public.attempt_answers for select to authenticated
  using (public.is_teacher_or_admin() and public.owns_attempt_course(attempt_id));

-- ---------------------------------------------------------------
-- 3. Scoring (internal; not callable by app roles)
-- ---------------------------------------------------------------
create or replace function public.score_attempt(p_attempt uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  t record; q record; ans record;
  v_has boolean; v_awarded numeric;
  v_obj numeric := 0; v_pend numeric := 0; v_max numeric := 0;
  v_correct uuid[]; v_selected uuid[]; v_key boolean;
begin
  select * into t from public.assessment_attempts
   where id = p_attempt and status = 'submitted' for update;
  if not found then raise exception 'Attempt is not submitted' using errcode = '23514'; end if;
  -- Idempotent: a second call (double submit, retry) changes nothing.
  if exists (select 1 from public.attempt_results where attempt_id = p_attempt) then return; end if;

  for q in select id, question_type, marks from public.questions
            where assessment_id = t.assessment_id order by position loop
    v_max := v_max + q.marks;

    if q.question_type in ('short_answer', 'descriptive') then
      insert into public.attempt_question_scores (attempt_id, question_id, max_marks, status)
      values (p_attempt, q.id, q.marks, 'pending_review');
      v_pend := v_pend + q.marks;
    else
      select * into ans from public.attempt_answers
       where attempt_id = p_attempt and question_id = q.id;
      v_has := found;
      v_awarded := 0;                      -- unanswered objective question = 0

      if v_has and q.question_type in ('single_choice', 'multiple_select') then
        select coalesce(array_agg(option_id order by option_id), '{}') into v_correct
          from public.question_correct_options where question_id = q.id;
        v_selected := array(select distinct u from unnest(ans.selected_option_ids) u order by u);
        -- all-or-nothing for multiple_select (see approval notes); exact match for single_choice
        if cardinality(v_selected) > 0 and cardinality(v_correct) > 0 and v_selected = v_correct then
          v_awarded := q.marks;
        end if;
      elsif v_has and q.question_type = 'true_false' then
        select correct_boolean into v_key from public.question_answer_keys where question_id = q.id;
        if ans.answer_boolean is not null and v_key is not null and ans.answer_boolean = v_key then
          v_awarded := q.marks;
        end if;
      end if;

      insert into public.attempt_question_scores
        (attempt_id, question_id, max_marks, awarded_marks, status)
      values (p_attempt, q.id, q.marks, v_awarded, 'auto_graded');
      v_obj := v_obj + v_awarded;
    end if;
  end loop;

  if v_max <= 0 then raise exception 'Assessment has no scorable marks' using errcode = '23514'; end if;

  insert into public.attempt_results
    (attempt_id, objective_marks, pending_marks, max_marks, grading_status, final_score, graded_at)
  values (p_attempt, v_obj, v_pend, v_max,
          case when v_pend = 0 then 'graded'::public.grading_status else 'pending_review' end,
          case when v_pend = 0 then v_obj end,
          case when v_pend = 0 then now() end);
end $$;
revoke all on function public.score_attempt(uuid) from public, anon, authenticated;

-- submit_attempt: now scores in the same transaction. Replaces the attempts-proposal version.
create or replace function public.submit_attempt(p_attempt uuid)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare v_at timestamptz;
begin
  update public.assessment_attempts set status = 'submitted', submitted_at = now()
   where id = p_attempt and user_id = (select auth.uid()) and status = 'in_progress'
   returning submitted_at into v_at;
  if v_at is null then
    select submitted_at into v_at from public.assessment_attempts
     where id = p_attempt and user_id = (select auth.uid()) and status = 'submitted';
  end if;
  if v_at is null then raise exception 'Attempt not found' using errcode = '42501'; end if;
  perform public.score_attempt(p_attempt);   -- no-op if already scored
  return v_at;
end $$;
revoke all on function public.submit_attempt(uuid) from public, anon;
grant execute on function public.submit_attempt(uuid) to authenticated;

-- NOTE: start_assessment_attempt in the attempts proposal closes an EXPIRED open attempt
-- by setting status = 'submitted' without scoring. When approving, add
--   perform public.score_attempt(<that attempt id>);
-- there too (or the expired attempt would never get a result).

-- ---------------------------------------------------------------
-- 4. Manual grading (owning teacher or admin only)
-- ---------------------------------------------------------------
create or replace function public.grade_attempt_answer(
  p_attempt uuid, p_question uuid, p_marks numeric, p_feedback text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare s record; r record; v_pending numeric; v_manual numeric;
begin
  if not (public.is_admin() or (public.is_teacher_or_admin() and public.owns_attempt_course(p_attempt))) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select * into r from public.attempt_results where attempt_id = p_attempt for update;
  if not found then raise exception 'Attempt has no result yet' using errcode = '23514'; end if;
  select * into s from public.attempt_question_scores
   where attempt_id = p_attempt and question_id = p_question;
  if not found or s.status = 'auto_graded' then
    raise exception 'This question is not manually graded' using errcode = '23514';
  end if;
  if p_marks is null or p_marks < 0 or p_marks > s.max_marks then
    raise exception 'Marks must be between 0 and %', s.max_marks using errcode = '23514';
  end if;

  update public.attempt_question_scores
     set awarded_marks = p_marks, status = 'graded', feedback = nullif(btrim(p_feedback), ''),
         graded_by = (select auth.uid()), graded_at = now()
   where attempt_id = p_attempt and question_id = p_question;

  select coalesce(sum(max_marks) filter (where status = 'pending_review'), 0),
         coalesce(sum(awarded_marks) filter (where status = 'graded'), 0)
    into v_pending, v_manual
    from public.attempt_question_scores where attempt_id = p_attempt;

  update public.attempt_results set
    pending_marks = v_pending, manual_marks = v_manual,
    grading_status = case when v_pending = 0 then 'graded'::public.grading_status else 'pending_review' end,
    final_score = case when v_pending = 0 then objective_marks + v_manual end,
    graded_at = case when v_pending = 0 then now() end
  where attempt_id = p_attempt;
end $$;
revoke all on function public.grade_attempt_answer(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.grade_attempt_answer(uuid, uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------
-- 5. Student reads (only way for a student to see results)
-- ---------------------------------------------------------------
create or replace function public.results_visible(p_assessment uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select case a.results_release
           when 'immediate'   then true
           when 'after_close' then a.closes_at is not null and a.closes_at <= now()
           when 'manual'      then a.results_released_at is not null and a.results_released_at <= now()
         end from public.assessments a where a.id = p_assessment), false);
$$;
revoke all on function public.results_visible(uuid) from public, anon, authenticated;

create or replace function public.get_my_results()
returns table (
  attempt_id uuid, assessment_id uuid, assessment_title text, attempt_number integer,
  submitted_at timestamptz, released boolean, grading_status public.grading_status,
  score numeric, max_marks numeric, percentage numeric, overall_feedback text)
language sql stable security definer set search_path = '' as $$
  select t.id, a.id, a.title, t.attempt_number, t.submitted_at,
         v.rel, r.grading_status,
         case when v.rel then coalesce(r.final_score, r.objective_marks) end,  -- provisional while pending
         case when v.rel then r.max_marks end,
         case when v.rel and r.grading_status = 'graded' and r.max_marks > 0
              then round(r.final_score * 100 / r.max_marks, 2) end,
         case when v.rel then r.overall_feedback end
  from public.assessment_attempts t
  join public.assessments a on a.id = t.assessment_id
  left join public.attempt_results r on r.attempt_id = t.id
  cross join lateral (select public.results_visible(a.id) as rel) v
  where t.user_id = (select auth.uid()) and t.status = 'submitted'
  order by t.submitted_at desc;
$$;

-- Per-question marks and teacher feedback. NEVER returns correct answers or explanations.
create or replace function public.get_my_result_detail(p_attempt uuid)
returns table (
  question_id uuid, position integer, question_text text,
  awarded_marks numeric, max_marks numeric, status public.question_score_status, feedback text)
language sql stable security definer set search_path = '' as $$
  select s.question_id, q.position, q.question_text, s.awarded_marks, s.max_marks, s.status, s.feedback
  from public.assessment_attempts t
  join public.assessments a on a.id = t.assessment_id
  join public.attempt_question_scores s on s.attempt_id = t.id
  join public.questions q on q.id = s.question_id
  where t.id = p_attempt and t.user_id = (select auth.uid()) and t.status = 'submitted'
    and a.show_question_feedback and public.results_visible(a.id)
  order by q.position;
$$;

do $$
declare f text;
begin
  foreach f in array array['get_my_results()', 'get_my_result_detail(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
