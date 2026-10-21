-- Phase C2 question-retrieval security checks: get_attempt_paper, get_assessment_question_count and the
-- removal of the student read policies on questions / question_options.
--
-- Run AFTER migrations 1-13. Creates its own users, courses and assessments. Paste into the Supabase SQL
-- editor or run with psql against a SCRATCH project/database. One transaction, ROLLED BACK at the end.
-- Any failed check raises an exception; if the script finishes, all checks passed.
--
-- Actors: T1 teacher (owns course C1; ALSO enrolled in C1 to prove a non-student role is refused),
--         AD admin, S1 owner of the attempt, S2 another enrolled student, S3 NOT enrolled.
-- Course C3 is an unpublished (draft) course in which S1 is enrolled.

begin;

-- ---------------------------------------------------------------
-- Test helpers (temporary, vanish at rollback)
-- ---------------------------------------------------------------
create function pg_temp.fails(p_label text, p_sql text, p_states text[])
returns void language plpgsql as $$
declare ok boolean := false;
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = any (p_states) then ok := true;
    else raise exception 'FAIL: % (unexpected error % %)', p_label, sqlstate, sqlerrm;
    end if;
  end;
  if not ok then raise exception 'FAIL: % (statement succeeded)', p_label; end if;
  raise notice 'PASS: %', p_label;
end $$;

-- The statement must fail with one of the SQLSTATEs and (optionally) this exact message.
create function pg_temp.fails_msg(p_label text, p_sql text, p_state text, p_msg text)
returns text language plpgsql as $$
declare got text;
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state then
      if p_msg is not null and sqlerrm <> p_msg then
        raise exception 'FAIL: % (message was "%")', p_label, sqlerrm;
      end if;
      raise notice 'PASS: %', p_label;
      return sqlerrm;
    end if;
    raise exception 'FAIL: % (unexpected error % %)', p_label, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL: % (statement succeeded)', p_label;
end $$;

create function pg_temp.rows(p_label text, p_sql text, p_expected int)
returns void language plpgsql as $$
declare n int;
begin
  execute 'select count(*) from (' || p_sql || ') x' into n;
  if n <> p_expected then raise exception 'FAIL: % (expected % rows, got %)', p_label, p_expected, n; end if;
  raise notice 'PASS: %', p_label;
end $$;

create function pg_temp.affects(p_label text, p_sql text, p_expected int)
returns void language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  if n <> p_expected then raise exception 'FAIL: % (expected % rows affected, got %)', p_label, p_expected, n; end if;
  raise notice 'PASS: %', p_label;
end $$;

create function pg_temp.ok(p_label text, p_cond boolean)
returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FAIL: %', p_label; end if;
  raise notice 'PASS: %', p_label;
end $$;

create function pg_temp.as_user(p_uid uuid)
returns void language plpgsql as $$
begin
  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.as_owner()
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.keys(j jsonb)
returns text language sql as $$ select coalesce(string_agg(k, ',' order by k), '') from jsonb_object_keys(j) k $$;

-- ---------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
select ('00000000-0000-0000-0000-0000000000' || v.suffix)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'pc_' || v.suffix || '@test.local', '{}'
from (values ('c1'), ('c9'), ('e1'), ('e2'), ('e3')) v(suffix);

update public.profiles set role = 'teacher' where id = '00000000-0000-0000-0000-0000000000c1';
update public.profiles set role = 'admin'   where id = '00000000-0000-0000-0000-0000000000c9';

insert into public.classes (grade, name) values (9, 'Class 9') on conflict (grade) do nothing;
insert into public.subjects (name, slug) values ('Geography', 'geography') on conflict (slug) do nothing;

insert into public.courses (title, slug, class_id, subject_id, status, created_by)
select v.t, v.s, c.id, s.id, 'published', '00000000-0000-0000-0000-0000000000c1'
from (values ('PC course 1', 'pc-c1'), ('PC course 2', 'pc-c2')) v(t, s),
     public.classes c, public.subjects s
where c.grade = 9 and s.slug = 'geography';

do $$ begin
  perform set_config('app.c1', (select id::text from public.courses where slug = 'pc-c1'), true);
  perform set_config('app.c2', (select id::text from public.courses where slug = 'pc-c2'), true);
end $$;

-- S1, S2 and the teacher are enrolled in C1; S3 is enrolled nowhere; S1 is also in C2.
insert into public.enrollments (user_id, course_id)
select ('00000000-0000-0000-0000-0000000000' || v.s)::uuid, current_setting('app.c1')::uuid
from (values ('e1'), ('e2'), ('c1')) v(s);
insert into public.enrollments (user_id, course_id)
values ('00000000-0000-0000-0000-0000000000e1', current_setting('app.c2')::uuid);

-- Assessment A: all five question types. Questions and options are inserted OUT of position order on purpose.
do $$
declare a uuid; q uuid; o1 uuid; o2 uuid; o3 uuid;
begin
  insert into public.assessments (title, instructions, course_id, total_marks, duration_minutes, status)
  values ('PC paper A', 'Read carefully', current_setting('app.c1')::uuid, 10, 30, 'draft') returning id into a;
  perform set_config('app.asmA', a::text, true);

  -- position 4: descriptive (no key)
  insert into public.questions (assessment_id, question_type, question_text, marks, position)
  values (a, 'descriptive', 'Q5 describe', 5, 4);
  -- position 2: true_false
  insert into public.questions (assessment_id, question_type, question_text, marks, position)
  values (a, 'true_false', 'Q3 tf', 1, 2) returning id into q;
  insert into public.question_answer_keys (question_id, correct_boolean, explanation)
  values (q, true, 'SENTINEL_EXPLANATION_TF');
  -- position 0: single_choice, options inserted 2,1,0
  insert into public.questions (assessment_id, question_type, question_text, marks, position)
  values (a, 'single_choice', 'Q1 single', 1, 0) returning id into q;
  insert into public.question_options (question_id, option_text, position) values (q, 'S-opt-C', 2) returning id into o3;
  insert into public.question_options (question_id, option_text, position) values (q, 'S-opt-B', 1) returning id into o2;
  insert into public.question_options (question_id, option_text, position) values (q, 'S-opt-A', 0) returning id into o1;
  insert into public.question_correct_options (question_id, option_id) values (q, o2);
  -- position 1: multiple_select
  insert into public.questions (assessment_id, question_type, question_text, marks, position)
  values (a, 'multiple_select', 'Q2 multi', 2, 1) returning id into q;
  insert into public.question_options (question_id, option_text, position) values (q, 'M-opt-B', 1) returning id into o2;
  insert into public.question_options (question_id, option_text, position) values (q, 'M-opt-A', 0) returning id into o1;
  insert into public.question_options (question_id, option_text, position) values (q, 'M-opt-C', 2) returning id into o3;
  insert into public.question_correct_options (question_id, option_id) values (q, o1), (q, o3);
  -- position 3: short_answer
  insert into public.questions (assessment_id, question_type, question_text, marks, position)
  values (a, 'short_answer', 'Q4 short', 1, 3) returning id into q;
  insert into public.question_answer_keys (question_id, accepted_answers, explanation)
  values (q, array['SENTINEL_ACCEPTED'], 'SENTINEL_EXPLANATION_SA');

  update public.assessments set status = 'published' where id = a;
end $$;

-- Assessment B (same course, different questions) and assessment C (other course): isolation targets.
do $$
declare b uuid; c uuid; q uuid;
begin
  insert into public.assessments (title, course_id, total_marks, status)
  values ('PC paper B', current_setting('app.c1')::uuid, 3, 'draft') returning id into b;
  insert into public.questions (assessment_id, question_type, question_text, marks, position)
  values (b, 'true_false', 'B-only question', 3, 0) returning id into q;
  insert into public.question_answer_keys (question_id, correct_boolean) values (q, false);
  update public.assessments set status = 'published' where id = b;
  perform set_config('app.asmB', b::text, true);

  insert into public.assessments (title, course_id, total_marks, status)
  values ('PC paper C', current_setting('app.c2')::uuid, 4, 'draft') returning id into c;
  insert into public.questions (assessment_id, question_type, question_text, marks, position)
  values (c, 'true_false', 'C-only question', 4, 0) returning id into q;
  insert into public.question_answer_keys (question_id, correct_boolean) values (q, true);
  update public.assessments set status = 'published' where id = c;
  perform set_config('app.asmC', c::text, true);
end $$;

-- ===============================================================
-- S1 starts attempts through the real Phase B function
-- ===============================================================
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
do $$
declare i public.attempt_info;
begin
  i := public.start_assessment_attempt(current_setting('app.asmA')::uuid);
  perform set_config('app.attA', i.attempt_id::text, true);
  i := public.start_assessment_attempt(current_setting('app.asmB')::uuid);
  perform set_config('app.attB', i.attempt_id::text, true);
  i := public.start_assessment_attempt(current_setting('app.asmC')::uuid);
  perform set_config('app.attC', i.attempt_id::text, true);
end $$;

-- ===============================================================
-- Valid access: the owner of an open attempt
-- ===============================================================
create temp table pc_paper (j jsonb);
grant all on pc_paper to authenticated;
insert into pc_paper select public.get_attempt_paper(current_setting('app.attA')::uuid);
select pg_temp.ok('owner receives a paper', (select count(*) from pc_paper) = 1);
select pg_temp.ok('paper has exactly the allow-listed top-level keys',
  (select pg_temp.keys(j) from pc_paper) = 'assessment,attempt,questions');
select pg_temp.ok('attempt block has exactly the allow-listed keys',
  (select pg_temp.keys(j->'attempt') from pc_paper)
    = 'assessment_id,attempt_id,attempt_number,expires_at,seconds_remaining,server_now,started_at,status');
select pg_temp.ok('attempt block matches the real attempt and is in_progress',
  (select (j->'attempt'->>'attempt_id') = current_setting('app.attA')
      and (j->'attempt'->>'status') = 'in_progress'
      and (j->'attempt'->>'attempt_number')::int = 1
      and (j->'attempt'->>'seconds_remaining')::int between 1 and 1800 from pc_paper));
select pg_temp.ok('assessment block has exactly the allow-listed keys and right values',
  (select pg_temp.keys(j->'assessment') = 'duration_minutes,id,instructions,title,total_marks'
      and j->'assessment'->>'title' = 'PC paper A' and (j->'assessment'->>'total_marks')::numeric = 10 from pc_paper));
select pg_temp.ok('all five questions are returned', (select jsonb_array_length(j->'questions') from pc_paper) = 5);
select pg_temp.ok('questions are in teacher position order (inserted out of order)',
  (select array_agg(e->>'text' order by ord) from pc_paper, jsonb_array_elements(j->'questions') with ordinality t(e, ord))
    = array['Q1 single', 'Q2 multi', 'Q3 tf', 'Q4 short', 'Q5 describe']);
select pg_temp.ok('question types are preserved',
  (select array_agg(e->>'type' order by ord) from pc_paper, jsonb_array_elements(j->'questions') with ordinality t(e, ord))
    = array['single_choice', 'multiple_select', 'true_false', 'short_answer', 'descriptive']);
select pg_temp.ok('positions and marks are preserved',
  (select array_agg((e->>'position') || ':' || trim_scale((e->>'marks')::numeric) order by ord)
     from pc_paper, jsonb_array_elements(j->'questions') with ordinality t(e, ord))
    = array['0:1', '1:2', '2:1', '3:1', '4:5']);
select pg_temp.ok('every question has exactly the allow-listed keys',
  (select bool_and(pg_temp.keys(e) = 'id,image_url,marks,options,position,text,type')
     from pc_paper, jsonb_array_elements(j->'questions') e));
select pg_temp.ok('options come back in position order (inserted reversed)',
  (select array_agg(o->>'text' order by oo)
     from pc_paper, jsonb_array_elements(j->'questions') e, jsonb_array_elements(e->'options') with ordinality t(o, oo)
    where e->>'text' = 'Q1 single') = array['S-opt-A', 'S-opt-B', 'S-opt-C']);
select pg_temp.ok('multiple-select options are in position order',
  (select array_agg(o->>'text' order by oo)
     from pc_paper, jsonb_array_elements(j->'questions') e, jsonb_array_elements(e->'options') with ordinality t(o, oo)
    where e->>'text' = 'Q2 multi') = array['M-opt-A', 'M-opt-B', 'M-opt-C']);
select pg_temp.ok('every option has exactly id and text',
  (select bool_and(pg_temp.keys(o) = 'id,text')
     from pc_paper, jsonb_array_elements(j->'questions') e, jsonb_array_elements(e->'options') o));
select pg_temp.ok('only choice questions carry options',
  (select bool_and((jsonb_array_length(e->'options') > 0) = (e->>'type' in ('single_choice', 'multiple_select')))
     from pc_paper, jsonb_array_elements(j->'questions') e));
select pg_temp.as_owner();  -- table lookups below need to see options (the student cannot)
select pg_temp.ok('option ids are the real option ids of that question',
  (select count(*) from pc_paper p, jsonb_array_elements(p.j->'questions') e, jsonb_array_elements(e->'options') o
    where not exists (select 1 from public.question_options qo where qo.id = (o->>'id')::uuid
                        and qo.question_id = (e->>'id')::uuid)) = 0);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.ok('no answer, explanation or key text appears anywhere in the payload',
  (select j::text !~* 'SENTINEL|explanation|accepted|case_sensitive|correct|is_correct' from pc_paper));
select pg_temp.ok('no other assessment''s questions are included',
  (select j::text !~ 'B-only question|C-only question' from pc_paper));

-- The same student's other attempts return only their own assessment's questions.
select pg_temp.ok('attempt on assessment B returns only B''s question',
  (select jsonb_array_length(j->'questions') = 1 and j->'questions'->0->>'text' = 'B-only question'
     from (select public.get_attempt_paper(current_setting('app.attB')::uuid) j) x));
select pg_temp.ok('attempt on assessment C (other course) returns only C''s question',
  (select jsonb_array_length(j->'questions') = 1 and j->'questions'->0->>'text' = 'C-only question'
     from (select public.get_attempt_paper(current_setting('app.attC')::uuid) j) x));

select pg_temp.ok('retrieving twice is allowed and changes nothing (same attempt, still in_progress)',
  (select public.get_attempt_paper(current_setting('app.attA')::uuid)->'attempt'->>'status') = 'in_progress');

-- ===============================================================
-- Direct reads are closed for the student; staff keep theirs
-- ===============================================================
select pg_temp.rows('S1 cannot read questions directly', 'select 1 from public.questions', 0);
select pg_temp.rows('S1 cannot read options directly', 'select 1 from public.question_options', 0);
select pg_temp.rows('S1 still sees zero answer-key rows', 'select 1 from public.question_answer_keys', 0);
select pg_temp.rows('S1 still sees zero correct-option rows', 'select 1 from public.question_correct_options', 0);
select pg_temp.rows('S1 can still read the assessment header', 'select 1 from public.assessments', 3);

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.rows('teacher still reads own questions (5 + 1 + 1)', 'select 1 from public.questions', 7);
select pg_temp.rows('teacher still reads own options (3 + 3)', 'select 1 from public.question_options', 6);
select pg_temp.rows('teacher still reads own answer keys', 'select 1 from public.question_answer_keys', 4);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c9');
select pg_temp.ok('admin still reads all questions', (select count(*) from public.questions) >= 7);

-- ===============================================================
-- Question count function (replaces the old direct count)
-- ===============================================================
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.ok('question count = 5 for an enrolled student while open',
  public.get_assessment_question_count(current_setting('app.asmA')::uuid) = 5);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
select pg_temp.ok('question count is null for a non-enrolled student',
  public.get_assessment_question_count(current_setting('app.asmA')::uuid) is null);
select pg_temp.ok('question count is null for a null id', public.get_assessment_question_count(null) is null);

-- ===============================================================
-- Cross-student and invalid attempts
-- ===============================================================
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select pg_temp.fails('another enrolled student cannot get S1''s paper (EA005)',
  format($f$select public.get_attempt_paper(%L)$f$, current_setting('app.attA')), array['EA005']);
select pg_temp.fails('another student cannot get S1''s paper for any of S1''s attempts',
  format($f$select public.get_attempt_paper(%L)$f$, current_setting('app.attC')), array['EA005']);
do $$
declare m1 text; m2 text;
begin
  begin perform public.get_attempt_paper(current_setting('app.attA')::uuid);
  exception when others then m1 := sqlerrm; end;
  begin perform public.get_attempt_paper('99999999-9999-4999-8999-999999999999');
  exception when others then m2 := sqlerrm; end;
  if m1 is null or m1 is distinct from m2 then
    raise exception 'FAIL: someone else''s attempt and a missing attempt must give the same message (% / %)', m1, m2;
  end if;
  raise notice 'PASS: someone else''s attempt and a missing attempt are indistinguishable';
end $$;
select pg_temp.fails('a nonexistent attempt id is refused (EA005)',
  $f$select public.get_attempt_paper('99999999-9999-4999-8999-999999999999')$f$, array['EA005']);
select pg_temp.fails('a null attempt id is refused (EA005)', $f$select public.get_attempt_paper(null)$f$, array['EA005']);

-- Student with no enrolment holds an attempt row (inserted by the owner; the functions would never create it).
select pg_temp.as_owner();
insert into public.assessment_attempts (id, assessment_id, user_id, attempt_number, status, expires_at)
values ('33333333-3333-4333-8333-333333333333', current_setting('app.asmA')::uuid,
        '00000000-0000-0000-0000-0000000000e3', 1, 'in_progress', now() + interval '1 hour');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
select pg_temp.fails('a student who is not enrolled gets nothing even with an attempt row (EA001)',
  $f$select public.get_attempt_paper('33333333-3333-4333-8333-333333333333')$f$, array['EA001']);

-- Roles and sessions
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.fails('a teacher (even enrolled) is refused (42501)',
  format($f$select public.get_attempt_paper(%L)$f$, current_setting('app.attA')), array['42501']);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c9');
select pg_temp.fails('an admin is refused (42501)',
  format($f$select public.get_attempt_paper(%L)$f$, current_setting('app.attA')), array['42501']);
select pg_temp.as_owner();
reset role; set local role authenticated;
select set_config('request.jwt.claims', '', true);
select pg_temp.fails('an authenticated role with no user id is refused (42501)',
  format($f$select public.get_attempt_paper(%L)$f$, current_setting('app.attA')), array['42501']);
reset role; set local role anon;
select pg_temp.fails('anon cannot execute get_attempt_paper', 
  format($f$select public.get_attempt_paper(%L)$f$, current_setting('app.attA')), array['42501']);
select pg_temp.fails('anon cannot execute get_assessment_question_count',
  format($f$select public.get_assessment_question_count(%L)$f$, current_setting('app.asmA')), array['42501']);
select pg_temp.fails('anon cannot read questions', 'select 1 from public.questions', array['42501']);
select pg_temp.as_owner();

-- ===============================================================
-- Attempt state
-- ===============================================================
insert into public.assessment_attempts (id, assessment_id, user_id, attempt_number, status, submitted_at)
values ('44444444-4444-4444-8444-444444444444', current_setting('app.asmB')::uuid,
        '00000000-0000-0000-0000-0000000000e2', 1, 'submitted', now());
insert into public.assessment_attempts (id, assessment_id, user_id, attempt_number, status, expired_at)
values ('55555555-5555-4555-8555-555555555555', current_setting('app.asmC')::uuid,
        '00000000-0000-0000-0000-0000000000e2', 1, 'expired', now());
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select pg_temp.fails('a submitted attempt gets no paper (EA007)',
  $f$select public.get_attempt_paper('44444444-4444-4444-8444-444444444444')$f$, array['EA007']);
select pg_temp.fails('an expired attempt gets no paper (EA007)',
  $f$select public.get_attempt_paper('55555555-5555-4555-8555-555555555555')$f$, array['EA007']);

-- S2 (enrolled in C1 only; not in C2): an attempt on C's assessment (course C2) must be refused (EA007 first
-- because it is expired; use a fresh open row to test enrolment).
select pg_temp.as_owner();
insert into public.assessment_attempts (id, assessment_id, user_id, attempt_number, status, expires_at)
values ('66666666-6666-4666-8666-666666666666', current_setting('app.asmC')::uuid,
        '00000000-0000-0000-0000-0000000000e2', 2, 'in_progress', now() + interval '1 hour');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select pg_temp.fails('an open attempt on an assessment of a course the student is not enrolled in is refused (EA001)',
  $f$select public.get_attempt_paper('66666666-6666-4666-8666-666666666666')$f$, array['EA001']);

-- Overdue open attempt: the effective status is expired, the row is closed, and no paper is returned.
select pg_temp.as_owner();
insert into public.assessment_attempts (id, assessment_id, user_id, attempt_number, status, started_at, expires_at)
values ('77777777-7777-4777-8777-777777777777', current_setting('app.asmA')::uuid,
        '00000000-0000-0000-0000-0000000000e2', 1, 'in_progress', now() - interval '2 hours', now() - interval '1 hour');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select pg_temp.fails('an overdue attempt gets no paper (EA007)',
  $f$select public.get_attempt_paper('77777777-7777-4777-8777-777777777777')$f$, array['EA007']);
-- Note: the EA007 error rolls the call back, so the expiry write inside it is not kept (lazy expiry; the
-- effective status is what matters, and get_my_attempt / start / submit / expire_overdue_attempts persist it).
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select pg_temp.ok('the overdue attempt reads as expired through get_my_attempt and never as a paper',
  (select (public.get_my_attempt('77777777-7777-4777-8777-777777777777')).status = 'expired'));
select pg_temp.as_owner();

-- ===============================================================
-- Availability changes after the attempt started
-- ===============================================================
-- S1 attempt A is still open. Window moves into the future.
update public.assessments set opens_at = now() + interval '1 hour' where id = current_setting('app.asmA')::uuid;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.fails('assessment re-scheduled to the future: no paper (EA002)',
  format($f$select public.get_attempt_paper(%L)$f$, current_setting('app.attA')), array['EA002']);
select pg_temp.as_owner();
update public.assessments set opens_at = null, closes_at = now() - interval '1 minute' where id = current_setting('app.asmA')::uuid;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.fails('assessment closed after the attempt started: no paper (EA003)',
  format($f$select public.get_attempt_paper(%L)$f$, current_setting('app.attA')), array['EA003']);
select pg_temp.ok('question count is null once closed', public.get_assessment_question_count(current_setting('app.asmA')::uuid) is null);
select pg_temp.as_owner();
update public.assessments set closes_at = null where id = current_setting('app.asmA')::uuid;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.ok('window restored: paper is available again',
  jsonb_array_length(public.get_attempt_paper(current_setting('app.attA')::uuid)->'questions') = 5);

select pg_temp.as_owner();
update public.courses set status = 'draft' where id = current_setting('app.c1')::uuid;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.fails('course unpublished after the attempt started: no paper (EA001)',
  format($f$select public.get_attempt_paper(%L)$f$, current_setting('app.attA')), array['EA001']);
select pg_temp.as_owner();
update public.courses set status = 'published' where id = current_setting('app.c1')::uuid;

delete from public.enrollments where user_id = '00000000-0000-0000-0000-0000000000e1' and course_id = current_setting('app.c1')::uuid;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.fails('student unenrolled after the attempt started: no paper (EA001)',
  format($f$select public.get_attempt_paper(%L)$f$, current_setting('app.attA')), array['EA001']);
select pg_temp.as_owner();

-- A submitted attempt (Phase B status-only submit) no longer yields a paper.
insert into public.enrollments (user_id, course_id) values ('00000000-0000-0000-0000-0000000000e1', current_setting('app.c1')::uuid);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select public.submit_attempt(current_setting('app.attA')::uuid);
select pg_temp.fails('after submit the owner gets no paper (EA007)',
  format($f$select public.get_attempt_paper(%L)$f$, current_setting('app.attA')), array['EA007']);
select pg_temp.as_owner();

-- ===============================================================
-- Static properties
-- ===============================================================
select pg_temp.ok('get_attempt_paper never references the answer-key tables',
  pg_get_functiondef('public.get_attempt_paper(uuid)'::regprocedure) !~* 'question_answer_keys|question_correct_options|to_jsonb|row_to_json');
select pg_temp.ok('get_attempt_paper takes no user id parameter (only the attempt id)',
  (select pronargs = 1 from pg_proc where oid = 'public.get_attempt_paper(uuid)'::regprocedure));
select pg_temp.ok('both functions are SECURITY DEFINER with an empty search_path',
  (select count(*) = 2 and bool_and(prosecdef) and bool_and(proconfig = array['search_path=""'])
     from pg_proc where oid in ('public.get_attempt_paper(uuid)'::regprocedure,
                                'public.get_assessment_question_count(uuid)'::regprocedure)));
select pg_temp.ok('PUBLIC and anon have no EXECUTE on the new functions',
  not has_function_privilege('anon', 'public.get_attempt_paper(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.get_assessment_question_count(uuid)', 'execute')
  and not has_function_privilege('public', 'public.get_attempt_paper(uuid)', 'execute'));
select pg_temp.ok('authenticated has EXECUTE on the new functions',
  has_function_privilege('authenticated', 'public.get_attempt_paper(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.get_assessment_question_count(uuid)', 'execute'));
select pg_temp.ok('no student read policy remains on questions or question_options',
  (select count(*) = 0 from pg_policies where schemaname = 'public' and tablename in ('questions', 'question_options')
      and policyname ilike '%students%'));
select pg_temp.ok('teacher and admin read policies on questions/options are still present',
  (select count(*) = 4 from pg_policies where schemaname = 'public' and tablename in ('questions', 'question_options')
      and cmd = 'SELECT'));

rollback;
