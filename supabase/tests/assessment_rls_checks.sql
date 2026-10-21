-- Task 3.1 assessment security checks (RLS, privileges, constraints, triggers).
--
-- Run AFTER migrations 1-4 (works with or without seed.sql; it creates its own users, courses
-- and assessments). Paste into the Supabase SQL editor or run with psql.
-- Everything happens in one transaction that is ROLLED BACK, so nothing is kept.
-- Any failed check raises an exception; if the script finishes, all checks passed.
--
-- Actors: T1 teacher (owns course C1), T2 teacher (owns C2), S1 student enrolled in C1,
--         S2 student NOT enrolled, AD admin.

begin;

-- ---------------------------------------------------------------
-- Test helpers (temporary, vanish at rollback)
-- ---------------------------------------------------------------
-- The statement must fail with one of the expected SQLSTATEs.
create function pg_temp.fails(p_label text, p_sql text, p_states text[])
returns void language plpgsql as $$
declare ok boolean := false;
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = any (p_states) then
      ok := true;
    else
      raise exception 'FAIL: % (unexpected error % %)', p_label, sqlstate, sqlerrm;
    end if;
  end;
  if not ok then raise exception 'FAIL: % (statement succeeded)', p_label; end if;
  raise notice 'PASS: %', p_label;
end $$;

-- The query must return exactly p_expected rows.
create function pg_temp.rows(p_label text, p_sql text, p_expected int)
returns void language plpgsql as $$
declare n int;
begin
  execute 'select count(*) from (' || p_sql || ') x' into n;
  if n <> p_expected then
    raise exception 'FAIL: % (expected % rows, got %)', p_label, p_expected, n;
  end if;
  raise notice 'PASS: %', p_label;
end $$;

-- The DML statement must affect exactly p_expected rows (0 = silently filtered by RLS).
create function pg_temp.affects(p_label text, p_sql text, p_expected int)
returns void language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  if n <> p_expected then
    raise exception 'FAIL: % (expected % rows affected, got %)', p_label, p_expected, n;
  end if;
  raise notice 'PASS: %', p_label;
end $$;

-- ---------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------
-- TEST-1 fix: ignore seed data. The checks below count ALL rows the actor can see,
-- so the seeded '[Sample]' quiz would make them off by one. Remove it INSIDE this
-- transaction only; the final ROLLBACK brings it back, so your seed is untouched.
delete from public.assessments where title like '[Sample]%';

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't1@test.local', '{}'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't2@test.local', '{}'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's1@test.local', '{}'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's2@test.local', '{}'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ad@test.local', '{}');

update public.profiles set role = 'teacher' where id in
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000e1';

insert into public.classes (grade, name) values (9, 'Class 9') on conflict (grade) do nothing;
insert into public.subjects (name, slug) values ('Geography', 'geography') on conflict (slug) do nothing;

insert into public.courses (title, slug, class_id, subject_id, status, created_by)
select v.t, v.s, c.id, s.id, 'published', v.u::uuid
from (values
  ('RLS test C1', 'rls3-c1', '00000000-0000-0000-0000-0000000000c1'),
  ('RLS test C2', 'rls3-c2', '00000000-0000-0000-0000-0000000000c2')
) v(t, s, u), public.classes c, public.subjects s
where c.grade = 9 and s.slug = 'geography';

insert into public.units (course_id, title, position)
select id, 'U of ' || slug, 0 from public.courses where slug in ('rls3-c1', 'rls3-c2');

insert into public.enrollments (user_id, course_id)
select '00000000-0000-0000-0000-0000000000d1', id from public.courses where slug = 'rls3-c1';

select
  set_config('app.c1', (select id::text from public.courses where slug = 'rls3-c1'), true),
  set_config('app.c2', (select id::text from public.courses where slug = 'rls3-c2'), true),
  set_config('app.u1', (select u.id::text from public.units u join public.courses c on c.id = u.course_id where c.slug = 'rls3-c1'), true),
  set_config('app.u2', (select u.id::text from public.units u join public.courses c on c.id = u.course_id where c.slug = 'rls3-c2'), true);

-- Static check: no answer-bearing column exists on anything students can read.
do $$
declare bad text;
begin
  select string_agg(table_name || '.' || column_name, ', ') into bad
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('assessments', 'questions', 'question_options')
    and (column_name ~* 'correct|answer|explanation|solution|key');
  if bad is not null then raise exception 'FAIL: answer-bearing columns on student-readable tables: %', bad; end if;
  raise notice 'PASS: student-readable tables have no answer/explanation columns';
end $$;

-- Every new table has RLS enabled.
do $$
declare bad text;
begin
  select string_agg(relname, ', ') into bad from pg_class
  where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity
    and relname in ('assessments', 'questions', 'question_options', 'question_answer_keys', 'question_correct_options');
  if bad is not null then raise exception 'FAIL: RLS disabled on %', bad; end if;
  raise notice 'PASS: RLS enabled on all five assessment tables';
end $$;

-- ===============================================================
-- Student cannot create or publish
-- ===============================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

select pg_temp.fails('student cannot create an assessment',
  format($f$insert into public.assessments (title, course_id, total_marks, created_by)
            values ('x', %L, 5, '00000000-0000-0000-0000-0000000000d1')$f$, current_setting('app.c1')),
  array['42501']);

-- ===============================================================
-- Teacher T1: create, constraints, ownership
-- ===============================================================
reset role; set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);

do $$
declare a uuid; creator uuid;
begin
  -- created_by is forced to the caller even if the client sends someone else.
  insert into public.assessments (title, description, instructions, course_id, unit_id, created_by,
                                  total_marks, passing_marks, duration_minutes, attempt_limit)
  values ('RLS quiz', 'd', 'i', current_setting('app.c1')::uuid, current_setting('app.u1')::uuid,
          '00000000-0000-0000-0000-0000000000c2', 6, 3, 20, 2)
  returning id, created_by into a, creator;
  if creator <> '00000000-0000-0000-0000-0000000000c1' then
    raise exception 'FAIL: spoofed created_by was accepted (%)', creator;
  end if;
  perform set_config('app.a1', a::text, true);
  raise notice 'PASS: teacher creates a draft in own course; created_by forced to caller';
end $$;

select pg_temp.fails('teacher cannot create in another teacher''s course',
  format($f$insert into public.assessments (title, course_id, total_marks) values ('x', %L, 5)$f$, current_setting('app.c2')),
  array['42501']);
select pg_temp.fails('teacher cannot insert directly as published',
  format($f$insert into public.assessments (title, course_id, total_marks, status) values ('x', %L, 5, 'published')$f$, current_setting('app.c1')),
  array['42501', '23514']); -- the publish trigger fires before the RLS check; either blocks it
select pg_temp.fails('unit from another course rejected',
  format($f$insert into public.assessments (title, course_id, unit_id, total_marks) values ('x', %L, %L, 5)$f$, current_setting('app.c1'), current_setting('app.u2')),
  array['23514']);
select pg_temp.fails('total marks must be positive',
  format($f$insert into public.assessments (title, course_id, total_marks) values ('x', %L, 0)$f$, current_setting('app.c1')),
  array['23514']);
select pg_temp.fails('passing marks cannot exceed total marks',
  format($f$insert into public.assessments (title, course_id, total_marks, passing_marks) values ('x', %L, 5, 6)$f$, current_setting('app.c1')),
  array['23514']);
select pg_temp.fails('closing time must be after opening time',
  format($f$insert into public.assessments (title, course_id, total_marks, opens_at, closes_at) values ('x', %L, 5, now() + interval '2 day', now() + interval '1 day')$f$, current_setting('app.c1')),
  array['23514']);
select pg_temp.fails('attempt limit must be at least 1',
  format($f$insert into public.assessments (title, course_id, total_marks, attempt_limit) values ('x', %L, 5, 0)$f$, current_setting('app.c1')),
  array['23514']);
select pg_temp.fails('teacher cannot change created_by',
  format($f$update public.assessments set created_by = '00000000-0000-0000-0000-0000000000c2' where id = %L$f$, current_setting('app.a1')),
  array['42501']);
select pg_temp.fails('teacher cannot move an assessment to another course',
  format($f$update public.assessments set course_id = %L where id = %L$f$, current_setting('app.c2'), current_setting('app.a1')),
  array['42501']);

-- Questions, options, keys
do $$
declare a uuid := current_setting('app.a1')::uuid; q uuid; o1 uuid; o2 uuid;
begin
  insert into public.questions (assessment_id, question_type, question_text, marks, position)
    values (a, 'single_choice', 'Q1?', 2, 0) returning id into q;
  perform set_config('app.q1', q::text, true);
  insert into public.question_options (question_id, option_text, position) values (q, 'A', 0) returning id into o1;
  insert into public.question_options (question_id, option_text, position) values (q, 'B', 1) returning id into o2;
  perform set_config('app.o1', o1::text, true);
  perform set_config('app.o2', o2::text, true);
  insert into public.question_correct_options (question_id, option_id) values (q, o1);

  insert into public.questions (assessment_id, question_type, question_text, marks, position)
    values (a, 'true_false', 'Q2?', 1, 1) returning id into q;
  perform set_config('app.q2', q::text, true);
  insert into public.question_answer_keys (question_id, correct_boolean, explanation) values (q, true, 'because');

  insert into public.questions (assessment_id, question_type, question_text, marks, position)
    values (a, 'short_answer', 'Q3?', 1, 2) returning id into q;
  perform set_config('app.q3', q::text, true);
  insert into public.question_answer_keys (question_id, accepted_answers) values (q, array['equator']);

  insert into public.questions (assessment_id, question_type, question_text, marks, position)
    values (a, 'descriptive', 'Q4?', 1, 3) returning id into q;
  perform set_config('app.q4', q::text, true);
  raise notice 'PASS: teacher builds questions of every type with options and keys';
end $$;

select pg_temp.fails('single-choice cannot get a second correct option',
  format($f$insert into public.question_correct_options (question_id, option_id) values (%L, %L)$f$, current_setting('app.q1'), current_setting('app.o2')),
  array['23514']);
select pg_temp.fails('options rejected on a true/false question',
  format($f$insert into public.question_options (question_id, option_text, position) values (%L, 'x', 0)$f$, current_setting('app.q2')),
  array['23514']);
select pg_temp.fails('accepted answers rejected on a non-short-answer question',
  format($f$update public.question_answer_keys set accepted_answers = array['x'] where question_id = %L$f$, current_setting('app.q2')),
  array['23514']);
select pg_temp.fails('correct_boolean rejected on a short-answer question',
  format($f$update public.question_answer_keys set correct_boolean = true where question_id = %L$f$, current_setting('app.q3')),
  array['23514']);
select pg_temp.fails('question marks must be positive',
  format($f$insert into public.questions (assessment_id, question_type, question_text, marks, position) values (%L, 'descriptive', 'x', 0, 9)$f$, current_setting('app.a1')),
  array['23514']);
select pg_temp.fails('duplicate question position rejected at commit time',
  format($f$set constraints all immediate; insert into public.questions (assessment_id, question_type, question_text, marks, position) values (%L, 'descriptive', 'x', 1, 0)$f$, current_setting('app.a1')),
  array['23505']);
select pg_temp.fails('question type cannot be changed',
  format($f$update public.questions set question_type = 'descriptive' where id = %L$f$, current_setting('app.q1')),
  array['42501']);
select pg_temp.fails('correct option must belong to the same question',
  format($f$insert into public.question_correct_options (question_id, option_id) values (%L, %L)$f$, current_setting('app.q4'), current_setting('app.o1')),
  array['23514', '23503']);

-- Publish rules (marks add up to 5 but total_marks is 6)
select pg_temp.fails('cannot publish when question marks differ from total marks',
  format($f$update public.assessments set status = 'published' where id = %L$f$, current_setting('app.a1')),
  array['23514']);

select pg_temp.affects('teacher fixes total marks',
  format($f$update public.assessments set total_marks = 5, passing_marks = 3 where id = %L$f$, current_setting('app.a1')), 1);

do $$
declare q uuid;
begin
  insert into public.questions (assessment_id, question_type, question_text, marks, position)
    values (current_setting('app.a1')::uuid, 'multiple_select', 'incomplete', 1, 4) returning id into q;
  update public.assessments set total_marks = 6 where id = current_setting('app.a1')::uuid;
  begin
    update public.assessments set status = 'published' where id = current_setting('app.a1')::uuid;
    raise exception 'FAIL: published with an incomplete multiple-select question';
  exception when check_violation then
    raise notice 'PASS: cannot publish with a question that has no options/correct answer';
  end;
  delete from public.questions where id = q;
  update public.assessments set total_marks = 5 where id = current_setting('app.a1')::uuid;
end $$;

select pg_temp.affects('teacher publishes a valid assessment in own course',
  format($f$update public.assessments set status = 'published' where id = %L$f$, current_setting('app.a1')), 1);

-- Locked while published
select pg_temp.fails('teacher cannot add a question to a published assessment',
  format($f$insert into public.questions (assessment_id, question_type, question_text, marks, position) values (%L, 'descriptive', 'x', 1, 9)$f$, current_setting('app.a1')),
  array['42501']);
select pg_temp.affects('teacher cannot edit a question of a published assessment',
  format($f$update public.questions set marks = 5 where id = %L$f$, current_setting('app.q1')), 0);
select pg_temp.affects('teacher cannot delete a question of a published assessment',
  format($f$delete from public.questions where id = %L$f$, current_setting('app.q1')), 0);
select pg_temp.affects('teacher cannot change an answer key of a published assessment',
  format($f$update public.question_answer_keys set correct_boolean = false where question_id = %L$f$, current_setting('app.q2')), 0);
select pg_temp.affects('teacher cannot remove correct options of a published assessment',
  format($f$delete from public.question_correct_options where question_id = %L$f$, current_setting('app.q1')), 0);
select pg_temp.affects('teacher cannot edit options of a published assessment',
  format($f$update public.question_options set option_text = 'changed' where question_id = %L$f$, current_setting('app.q1')), 0);
select pg_temp.affects('teacher cannot delete a published assessment',
  format($f$delete from public.assessments where id = %L$f$, current_setting('app.a1')), 0);
select pg_temp.rows('owner teacher can still read the answer keys',
  format($f$select 1 from public.question_answer_keys where question_id = %L$f$, current_setting('app.q2')), 1);

-- ===============================================================
-- Teacher T2 (other teacher) sees and changes nothing of T1's
-- ===============================================================
reset role; set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);

select pg_temp.rows('other teacher cannot read the assessment', 'select 1 from public.assessments', 0);
select pg_temp.rows('other teacher cannot read questions', 'select 1 from public.questions', 0);
select pg_temp.rows('other teacher cannot read options', 'select 1 from public.question_options', 0);
select pg_temp.rows('other teacher cannot read answer keys', 'select 1 from public.question_answer_keys', 0);
select pg_temp.rows('other teacher cannot read correct options', 'select 1 from public.question_correct_options', 0);
select pg_temp.affects('other teacher cannot update the assessment',
  format($f$update public.assessments set title = 'hijack' where id = %L$f$, current_setting('app.a1')), 0);
select pg_temp.fails('other teacher cannot add a question',
  format($f$insert into public.questions (assessment_id, question_type, question_text, marks, position) values (%L, 'descriptive', 'x', 1, 9)$f$, current_setting('app.a1')),
  array['42501']);

-- ===============================================================
-- Student S2 (not enrolled)
-- ===============================================================
reset role; set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);

select pg_temp.rows('non-enrolled student sees no assessments', 'select 1 from public.assessments', 0);
select pg_temp.rows('non-enrolled student sees no questions', 'select 1 from public.questions', 0);
select pg_temp.rows('non-enrolled student sees no options', 'select 1 from public.question_options', 0);

-- ===============================================================
-- Student S1 (enrolled in C1)
-- ===============================================================
reset role; set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);

select pg_temp.rows('enrolled student sees the published assessment', 'select 1 from public.assessments', 1);
-- Phase C2: students no longer read question content directly (only via get_attempt_paper).
select pg_temp.rows('enrolled student cannot read questions directly (Phase C2)', 'select 1 from public.questions', 0);
select pg_temp.rows('enrolled student cannot read options directly (Phase C2)', 'select 1 from public.question_options', 0);
select pg_temp.rows('student gets zero answer-key rows', 'select 1 from public.question_answer_keys', 0);
select pg_temp.rows('student gets zero correct-option rows', 'select 1 from public.question_correct_options', 0);
select pg_temp.fails('student cannot write an answer key',
  format($f$insert into public.question_answer_keys (question_id, correct_boolean) values (%L, false)$f$, current_setting('app.q4')),
  array['42501', '23514']);
select pg_temp.fails('student cannot mark an option correct',
  format($f$insert into public.question_correct_options (question_id, option_id) values (%L, %L)$f$, current_setting('app.q1'), current_setting('app.o2')),
  array['42501', '23514']);
select pg_temp.affects('student cannot change assessment fields',
  format($f$update public.assessments set total_marks = 1, status = 'draft' where id = %L$f$, current_setting('app.a1')), 0);
select pg_temp.affects('student cannot delete questions',
  format($f$delete from public.questions where id = %L$f$, current_setting('app.q1')), 0);
select pg_temp.fails('student cannot call the publish validator directly',
  format($f$select public.assert_assessment_publishable(%L, 5)$f$, current_setting('app.a1')),
  array['42501']);

-- ===============================================================
-- Anonymous visitors: no access to any assessment table
-- ===============================================================
reset role; set local role anon;
select pg_temp.fails('anon cannot read assessments', 'select 1 from public.assessments', array['42501']);
select pg_temp.fails('anon cannot read questions', 'select 1 from public.questions', array['42501']);
select pg_temp.fails('anon cannot read options', 'select 1 from public.question_options', array['42501']);
select pg_temp.fails('anon cannot read answer keys', 'select 1 from public.question_answer_keys', array['42501']);
select pg_temp.fails('anon cannot read correct options', 'select 1 from public.question_correct_options', array['42501']);

-- ===============================================================
-- Availability window, draft state, unpublished course (owner changes state)
-- ===============================================================
reset role;
update public.assessments set opens_at = now() - interval '2 hour', closes_at = now() - interval '1 hour'
  where id = current_setting('app.a1')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
select pg_temp.rows('closed window: assessment still listed', 'select 1 from public.assessments', 1);
select pg_temp.rows('closed window: questions hidden', 'select 1 from public.questions', 0);
select pg_temp.rows('closed window: options hidden', 'select 1 from public.question_options', 0);

reset role;
update public.assessments set opens_at = now() + interval '1 day', closes_at = now() + interval '2 day'
  where id = current_setting('app.a1')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
select pg_temp.rows('not yet open: questions hidden', 'select 1 from public.questions', 0);

reset role;
update public.assessments set opens_at = null, closes_at = null where id = current_setting('app.a1')::uuid;
update public.assessments set status = 'draft' where id = current_setting('app.a1')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
select pg_temp.rows('draft assessment hidden from enrolled student', 'select 1 from public.assessments', 0);
select pg_temp.rows('draft questions hidden from enrolled student', 'select 1 from public.questions', 0);

reset role;
update public.assessments set status = 'published' where id = current_setting('app.a1')::uuid;
update public.courses set status = 'draft' where id = current_setting('app.c1')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
select pg_temp.rows('unpublished course hides its assessment', 'select 1 from public.assessments', 0);
reset role;
update public.courses set status = 'published' where id = current_setting('app.c1')::uuid;

-- ===============================================================
-- Admin
-- ===============================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);

select pg_temp.rows('admin reads all assessments', 'select 1 from public.assessments', 1);
select pg_temp.rows('admin reads all answer keys', 'select 1 from public.question_answer_keys', 2);
select pg_temp.rows('admin reads all correct options', 'select 1 from public.question_correct_options', 1);
select pg_temp.fails('admin cannot edit content while published',
  format($f$insert into public.questions (assessment_id, question_type, question_text, marks, position) values (%L, 'descriptive', 'x', 1, 9)$f$, current_setting('app.a1')),
  array['42501']);
select pg_temp.fails('admin cannot change created_by from a session',
  format($f$update public.assessments set created_by = '00000000-0000-0000-0000-0000000000e1' where id = %L$f$, current_setting('app.a1')),
  array['42501']);
select pg_temp.affects('admin unpublishes',
  format($f$update public.assessments set status = 'draft' where id = %L$f$, current_setting('app.a1')), 1);
select pg_temp.affects('admin edits a question while draft',
  format($f$update public.questions set marks = 2 where id = %L$f$, current_setting('app.q2')), 1);
select pg_temp.fails('admin cannot republish when marks no longer add up',
  format($f$update public.assessments set status = 'published' where id = %L$f$, current_setting('app.a1')),
  array['23514']);
select pg_temp.affects('admin restores marks',
  format($f$update public.questions set marks = 1 where id = %L$f$, current_setting('app.q2')), 1);
select pg_temp.affects('admin republishes',
  format($f$update public.assessments set status = 'published' where id = %L$f$, current_setting('app.a1')), 1);

-- ===============================================================
-- Role demotion removes teacher access immediately
-- ===============================================================
reset role;
update public.profiles set role = 'student' where id = '00000000-0000-0000-0000-0000000000c1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
select pg_temp.rows('demoted teacher loses access to the assessment', 'select 1 from public.assessments', 0);
select pg_temp.rows('demoted teacher loses access to answer keys', 'select 1 from public.question_answer_keys', 0);
select pg_temp.fails('demoted teacher cannot create assessments',
  format($f$insert into public.assessments (title, course_id, total_marks) values ('x', %L, 5)$f$, current_setting('app.c1')),
  array['42501']);

-- ===============================================================
-- Deletion rules (owner role)
-- ===============================================================
reset role;
delete from public.units where id = current_setting('app.u1')::uuid;
do $$
begin
  if (select unit_id from public.assessments where id = current_setting('app.a1')::uuid) is not null then
    raise exception 'FAIL: deleting a unit did not clear assessments.unit_id';
  end if;
  raise notice 'PASS: deleting a unit keeps the assessment and clears unit_id';
end $$;

delete from public.courses where id = current_setting('app.c1')::uuid;
select pg_temp.rows('deleting the course cascades to assessments', 'select 1 from public.assessments', 0);
select pg_temp.rows('...and to questions', 'select 1 from public.questions', 0);
select pg_temp.rows('...and to options', 'select 1 from public.question_options', 0);
select pg_temp.rows('...and to answer keys', 'select 1 from public.question_answer_keys', 0);
select pg_temp.rows('...and to correct options', 'select 1 from public.question_correct_options', 0);

rollback;
