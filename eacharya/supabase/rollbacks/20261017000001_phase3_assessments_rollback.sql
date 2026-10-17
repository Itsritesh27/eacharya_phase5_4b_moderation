-- ROLLBACK for 20261017000001_phase3_assessments.sql
--
-- DESTRUCTIVE: permanently deletes every assessment, question, option and
-- answer key. It does NOT touch courses, lessons, enrolments, progress or any
-- other Phase 1-2 data. Not in the migrations folder on purpose, so it is never
-- applied automatically.
--
-- Before running: export what you need, e.g.
--   select * from public.assessments;  (and the four question tables)
-- Run it only in the Supabase SQL editor (as the database owner), in ONE run,
-- with the confirmation line below included:
--
--   set app.confirm_assessment_rollback = 'yes';

do $$
begin
  if current_setting('app.confirm_assessment_rollback', true) is distinct from 'yes' then
    raise exception 'Rollback not confirmed. Run: set app.confirm_assessment_rollback = ''yes''; first, in the same run.';
  end if;
end $$;

-- Tables (children first). Dropping a table also drops its policies and triggers.
drop table if exists public.question_correct_options;
drop table if exists public.question_answer_keys;
drop table if exists public.question_options;
drop table if exists public.questions;
drop table if exists public.assessments;

-- Functions
drop function if exists public.assert_assessment_publishable(uuid, numeric);
drop function if exists public.assessments_before_insert();
drop function if exists public.assessments_guard_update();
drop function if exists public.assessments_validate();
drop function if exists public.questions_guard_update();
drop function if exists public.question_options_validate();
drop function if exists public.question_answer_keys_validate();
drop function if exists public.question_correct_options_validate();
drop function if exists public.is_question_open(uuid);
drop function if exists public.is_assessment_open(uuid);
drop function if exists public.is_enrolled_in_assessment(uuid);
drop function if exists public.question_assessment_is_draft(uuid);
drop function if exists public.assessment_is_draft(uuid);
drop function if exists public.owns_question_course(uuid);
drop function if exists public.owns_assessment_course(uuid);
drop function if exists public.owns_course(uuid);

-- Types
drop type if exists public.question_type;
drop type if exists public.assessment_status;

-- If you use the Supabase CLI migration history, also remove the record:
--   delete from supabase_migrations.schema_migrations where version = '20261017000001';
