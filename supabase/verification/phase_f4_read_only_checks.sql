-- Phase F4: READ-ONLY checks for a configured Supabase project.
-- Run in Supabase SQL Editor after applying prerequisite migrations.
-- These queries inspect metadata only; they do not change application data or schema.

-- 1) Required relations and RLS status.
select n.nspname as schema_name, c.relname as object_name,
       c.relkind, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'assessments','questions','assessment_attempts','attempt_answers',
    'attempt_results','attempt_question_scores'
  )
order by c.relname;

-- 2) Required functions and SECURITY DEFINER status.
select n.nspname as schema_name, p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'submit_attempt','score_attempt','grade_attempt_answer',
    'get_my_results','get_my_result_detail','get_teacher_grading_queue'
  )
order by p.proname;

-- 3) Grants on score tables. Students should not have direct access.
select table_name, privilege_type, grantee
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('attempt_results','attempt_question_scores')
  and grantee in ('anon','authenticated')
order by table_name, grantee, privilege_type;

-- 4) Policies on score tables. Inspect whether any policy allows student reads.
select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('attempt_results','attempt_question_scores')
order by tablename, policyname;

-- 5) Applied migration history. Supabase CLI migration history table may not exist
-- in all projects; if this query errors, check the dashboard migration list instead.
select version, name
from supabase_migrations.schema_migrations
where version in ('20261024000001','20261026000001','20261027000001','20261028000001')
order by version;
