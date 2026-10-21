-- ROLLBACK for 20261024000001_phase_b_assessment_attempts.sql
--
-- DESTRUCTIVE: permanently deletes every assessment attempt (and, once later phases exist, anything that
-- hangs off attempts). It does NOT touch assessments, questions, answer keys, courses, enrolments or any
-- other earlier data. Not in the migrations folder on purpose, so it is never applied automatically.
--
-- Before running: export what you need, e.g.  select * from public.assessment_attempts;
-- Run it as the database owner (Supabase SQL editor), in ONE run, with the confirmation line included:
--
--   set app.confirm_attempts_rollback = 'yes';
--
-- The whole script is one transaction: if the confirmation is missing, the check fails, the transaction
-- aborts, every later statement is skipped and nothing is dropped, even under plain psql without
-- ON_ERROR_STOP.

begin;

do $$
begin
  if current_setting('app.confirm_attempts_rollback', true) is distinct from 'yes' then
    raise exception 'Rollback not confirmed. Run: set app.confirm_attempts_rollback = ''yes''; first, in the same run.';
  end if;
end $$;

drop trigger if exists assessments_block_unpublish_with_attempts on public.assessments;
drop function if exists public.assessments_block_unpublish_with_attempts();

drop function if exists public.start_assessment_attempt(uuid, uuid);
drop function if exists public.get_my_attempt(uuid);
drop function if exists public.get_my_open_attempt(uuid);
drop function if exists public.submit_attempt(uuid);
drop function if exists public.expire_overdue_attempts(uuid, uuid);
drop function if exists public.attempt_to_info(public.assessment_attempts, boolean);

drop table if exists public.assessment_attempts;   -- also drops its policy, indexes and guard trigger
drop function if exists public.assessment_attempts_guard();

drop type if exists public.attempt_info;
drop type if exists public.attempt_status;

commit;
