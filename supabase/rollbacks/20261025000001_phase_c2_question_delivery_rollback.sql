-- ROLLBACK for 20261025000001_phase_c2_question_delivery.sql
--
-- NOT destructive to data: it drops two functions and RE-CREATES the two student read policies exactly as
-- migration 20261017000001 defined them. WARNING: re-creating them re-opens the direct API read of every
-- question and option to enrolled students (Phase C1 finding R1). Only run it if you are abandoning
-- Phase C2 entirely. Not in the migrations folder on purpose.
--
-- One transaction; safe under plain psql.

begin;

drop function if exists public.get_attempt_paper(uuid);
drop function if exists public.get_assessment_question_count(uuid);

drop policy if exists "questions: students read when open" on public.questions;
create policy "questions: students read when open"
  on public.questions for select to authenticated
  using (public.is_assessment_open(assessment_id));

drop policy if exists "question_options: students read when open" on public.question_options;
create policy "question_options: students read when open"
  on public.question_options for select to authenticated
  using (public.is_question_open(question_id));

commit;
