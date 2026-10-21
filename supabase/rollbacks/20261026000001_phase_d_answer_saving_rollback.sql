-- ROLLBACK for 20261026000001_phase_d_answer_saving.sql
--
-- WARNING: DESTRUCTIVE. Dropping attempt_answers deletes every saved answer for every attempt, and it cannot be
-- undone. Only run it if you are abandoning Phase D entirely, and export the table first if you need the data.
-- Not in the migrations folder on purpose. One transaction; safe under plain psql.

begin;

drop function if exists public.save_attempt_answer(uuid, uuid, jsonb, integer);
drop function if exists public.get_attempt_answers(uuid);
drop function if exists public.open_attempt_for_answers(uuid, boolean);
drop function if exists public.normalize_attempt_answer(uuid, public.question_type, jsonb);
drop table if exists public.attempt_answers;          -- also drops its trigger and indexes
drop function if exists public.attempt_answers_guard();

commit;
