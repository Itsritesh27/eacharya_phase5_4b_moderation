-- Phase 3 assessment workflow checks (READ ONLY).
-- Run in Supabase SQL Editor after all assessment migrations have been applied.
-- This script DOES NOT change data or schema. Interpret any rows returned by anomaly
-- queries as items to investigate; do not patch production records just to make them pass.

-- 1) Assessment workflow tables and whether RLS is enabled.
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and c.relname in (
    'assessments', 'questions', 'question_options', 'question_answer_keys',
    'question_correct_options', 'assessment_attempts', 'attempt_answers',
    'attempt_results', 'attempt_question_scores'
  )
order by c.relname;

-- 2) Workflow RPCs, security-definer status, and role execute grants.
-- `authenticated_can_execute = true` is expected for student/teacher-facing RPCs;
-- internal score_attempt and helper functions should not be callable by app roles.
select p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'start_assessment_attempt', 'get_my_attempt', 'get_my_open_attempt',
    'get_attempt_paper', 'save_attempt_answer', 'get_attempt_answers',
    'submit_attempt', 'score_attempt', 'grade_attempt_answer',
    'get_my_results', 'get_my_result_detail', 'get_teacher_grading_queue',
    'get_teacher_assessment_analytics', 'get_teacher_student_progress',
    'get_teacher_question_analysis', 'release_assessment_results'
  )
order by p.proname, pg_get_function_identity_arguments(p.oid);

-- 3) Direct table grants. Score/answer-key/answer tables should not be directly
-- readable by students; inspect table grants together with the RLS policy output below.
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'attempt_answers', 'attempt_results', 'attempt_question_scores',
    'question_answer_keys', 'question_correct_options'
  )
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

-- 4) Policies on assessment/answer/score tables. There should be no student policy
-- that permits direct reads of answer keys, correct options, answers or result tables.
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'assessments', 'questions', 'question_options', 'question_answer_keys',
    'question_correct_options', 'assessment_attempts', 'attempt_answers',
    'attempt_results', 'attempt_question_scores'
  )
order by tablename, policyname;

-- 5) Anomaly: a submitted attempt with no result row. A successful submit is expected
-- to score in the same transaction, so any rows here require investigation.
select t.id as attempt_id, t.assessment_id, t.user_id, t.submitted_at, t.status
from public.assessment_attempts t
left join public.attempt_results r on r.attempt_id = t.id
where t.status = 'submitted' and r.attempt_id is null
order by t.submitted_at desc nulls last;

-- 6) Anomaly: result rows for an attempt that is not submitted.
select r.attempt_id, t.status as attempt_status, r.grading_status, r.final_score
from public.attempt_results r
join public.assessment_attempts t on t.id = r.attempt_id
where t.status <> 'submitted'
order by t.submitted_at desc nulls last;

-- 7) Anomaly: graded status and final score/pending marks disagree.
select attempt_id, grading_status, pending_marks, final_score, objective_marks, manual_marks, max_marks
from public.attempt_results
where (grading_status = 'graded' and (final_score is null or pending_marks <> 0))
   or (grading_status = 'pending_review' and (final_score is not null or pending_marks <= 0))
order by attempt_id;

-- 8) Anomaly: objective/manual aggregates do not match per-question scores.
-- Pending answers are intentionally excluded from awarded totals until graded.
with score_totals as (
  select s.attempt_id,
         coalesce(sum(s.awarded_marks) filter (where s.status = 'auto_graded'), 0)::numeric(8,2) as objective_from_questions,
         coalesce(sum(s.awarded_marks) filter (where s.status = 'graded'), 0)::numeric(8,2) as manual_from_questions,
         coalesce(sum(s.max_marks), 0)::numeric(8,2) as max_from_questions
  from public.attempt_question_scores s
  group by s.attempt_id
)
select r.attempt_id,
       r.objective_marks, st.objective_from_questions,
       r.manual_marks, st.manual_from_questions,
       r.max_marks, st.max_from_questions
from public.attempt_results r
join score_totals st on st.attempt_id = r.attempt_id
where r.objective_marks <> st.objective_from_questions
   or r.manual_marks <> st.manual_from_questions
   or r.max_marks <> st.max_from_questions
order by r.attempt_id;

-- 9) Anomaly: question-score rows missing from or exceeding an attempt's assessment
-- paper. Published papers should remain immutable once attempts exist.
with expected as (
  select t.id as attempt_id, count(q.id)::bigint as expected_count
  from public.assessment_attempts t
  join public.questions q on q.assessment_id = t.assessment_id
  where t.status = 'submitted'
  group by t.id
), actual as (
  select s.attempt_id, count(*)::bigint as actual_count
  from public.attempt_question_scores s
  group by s.attempt_id
)
select coalesce(e.attempt_id, a.attempt_id) as attempt_id,
       coalesce(e.expected_count, 0) as expected_question_scores,
       coalesce(a.actual_count, 0) as actual_question_scores
from expected e
full join actual a on a.attempt_id = e.attempt_id
where coalesce(e.expected_count, 0) <> coalesce(a.actual_count, 0)
order by attempt_id;

-- 10) Result release settings and attempt/result counts for a quick operational summary.
select a.id as assessment_id,
       a.title as assessment_title,
       a.status as assessment_status,
       a.results_release,
       a.results_released_at,
       count(distinct t.id) as attempts,
       count(distinct t.id) filter (where t.status = 'submitted') as submitted,
       count(distinct r.attempt_id) filter (where r.grading_status = 'graded') as graded,
       count(distinct r.attempt_id) filter (where r.grading_status = 'pending_review') as pending_review
from public.assessments a
left join public.assessment_attempts t on t.assessment_id = a.id
left join public.attempt_results r on r.attempt_id = t.id
group by a.id, a.title, a.status, a.results_release, a.results_released_at
order by a.created_at desc;
