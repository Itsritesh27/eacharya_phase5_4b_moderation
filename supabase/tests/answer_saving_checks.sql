-- Phase D answer-saving security and behaviour checks.
--
-- Run AFTER migrations 1-14. Creates its own users, course and assessments. Paste into the Supabase SQL editor
-- or run with psql against a SCRATCH project/database:
--     psql -X -q -v ON_ERROR_STOP=1 -d <scratch_db> -f supabase/tests/answer_saving_checks.sql
-- Everything happens in one transaction that is ROLLED BACK, so nothing is kept.
-- Any failed check raises an exception; if the script finishes, all checks passed.
--
-- Actors: T1 teacher (owns course C1), AD admin, S1 + S2 students enrolled in C1 (and in C3, a draft course),
--         S3 student NOT enrolled in anything.
-- Assessment A: five questions (one of each type). Assessment B: one other true/false question.

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

create function pg_temp.as_anon()
returns void language plpgsql as $$
begin
  execute 'reset role';
  execute 'set local role anon';
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.as_no_session()
returns void language plpgsql as $$
begin
  execute 'reset role';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.as_owner()
returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- shorthand: save as whoever is current. Ids come from app.* settings.
create function pg_temp.sv(p_att text, p_q text, p_answer jsonb, p_rev int)
returns jsonb language sql as $$
  select public.save_attempt_answer(current_setting('app.' || p_att)::uuid, current_setting('app.' || p_q)::uuid, p_answer, p_rev)
$$;

create function pg_temp.sv_sql(p_att text, p_q text, p_answer text, p_rev text)
returns text language sql as $$
  select format('select public.save_attempt_answer(%L::uuid, %L::uuid, %s, %s)',
                current_setting('app.' || p_att), current_setting('app.' || p_q), p_answer, p_rev)
$$;

create function pg_temp.n_rows(p_att text)
returns bigint language sql security definer as $$
  -- test helper only: counts rows regardless of the current role (students cannot read the table)
  select count(*) from public.attempt_answers where attempt_id = current_setting('app.' || p_att)::uuid
$$;

-- ---------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
select ('00000000-0000-0000-0000-0000000000' || v.suffix)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'pd_' || v.suffix || '@test.local', '{}'
from (values ('d1'), ('d9'), ('e1'), ('e2'), ('e3')) v(suffix);

update public.profiles set role = 'teacher' where id = '00000000-0000-0000-0000-0000000000d1';
update public.profiles set role = 'admin'   where id = '00000000-0000-0000-0000-0000000000d9';

insert into public.classes (grade, name) values (9, 'Class 9') on conflict (grade) do nothing;
insert into public.subjects (name, slug) values ('Geography', 'geography') on conflict (slug) do nothing;

insert into public.courses (title, slug, class_id, subject_id, status, created_by)
select v.t, v.s, c.id, s.id, v.st::public.course_status, '00000000-0000-0000-0000-0000000000d1'
from (values ('PD course 1', 'pd-c1', 'published'), ('PD course 3 (draft)', 'pd-c3', 'draft')) v(t, s, st),
     public.classes c, public.subjects s
where c.grade = 9 and s.slug = 'geography';

do $$ begin
  perform set_config('app.c1', (select id::text from public.courses where slug = 'pd-c1'), true);
  perform set_config('app.c3', (select id::text from public.courses where slug = 'pd-c3'), true);
end $$;

insert into public.enrollments (user_id, course_id)
select ('00000000-0000-0000-0000-0000000000' || v.s)::uuid, current_setting('app.c1')::uuid
from (values ('e1'), ('e2')) v(s);
insert into public.enrollments (user_id, course_id)
select ('00000000-0000-0000-0000-0000000000' || v.s)::uuid, current_setting('app.c3')::uuid
from (values ('e1'), ('e2')) v(s);

-- Assessment A (course C1): 8 marks, 30 minutes, unlimited attempts
do $$
declare a uuid; q uuid; o1 uuid; o2 uuid; m1 uuid; m2 uuid; m3 uuid;
begin
  insert into public.assessments (title, course_id, total_marks, attempt_limit, duration_minutes, status)
  values ('PhaseD A', current_setting('app.c1')::uuid, 8, null, 30, 'draft') returning id into a;
  perform set_config('app.asm_a', a::text, true);

  insert into public.questions (assessment_id, question_type, question_text, marks, position)
  values (a, 'single_choice', 'Longest river?', 2, 0) returning id into q;
  perform set_config('app.q_sc', q::text, true);
  insert into public.question_options (question_id, option_text, position) values (q, 'Nile', 0) returning id into o1;
  insert into public.question_options (question_id, option_text, position) values (q, 'Ganga', 1) returning id into o2;
  insert into public.question_correct_options (question_id, option_id) values (q, o1);
  perform set_config('app.o_sc1', o1::text, true);
  perform set_config('app.o_sc2', o2::text, true);

  insert into public.questions (assessment_id, question_type, question_text, marks, position)
  values (a, 'multiple_select', 'Rivers in India?', 2, 1) returning id into q;
  perform set_config('app.q_ms', q::text, true);
  insert into public.question_options (question_id, option_text, position) values (q, 'Ganga', 0) returning id into m1;
  insert into public.question_options (question_id, option_text, position) values (q, 'Nile', 1) returning id into m2;
  insert into public.question_options (question_id, option_text, position) values (q, 'Yamuna', 2) returning id into m3;
  insert into public.question_correct_options (question_id, option_id) values (q, m1), (q, m3);
  perform set_config('app.o_ms1', m1::text, true);
  perform set_config('app.o_ms2', m2::text, true);
  perform set_config('app.o_ms3', m3::text, true);

  insert into public.questions (assessment_id, question_type, question_text, marks, position)
  values (a, 'true_false', 'India is in Asia?', 1, 2) returning id into q;
  perform set_config('app.q_tf', q::text, true);
  insert into public.question_answer_keys (question_id, correct_boolean) values (q, true);

  insert into public.questions (assessment_id, question_type, question_text, marks, position)
  values (a, 'short_answer', 'Capital of India?', 1, 3) returning id into q;
  perform set_config('app.q_sa', q::text, true);
  insert into public.question_answer_keys (question_id, accepted_answers) values (q, array['New Delhi']);

  insert into public.questions (assessment_id, question_type, question_text, marks, position)
  values (a, 'descriptive', 'Explain monsoons.', 2, 4) returning id into q;
  perform set_config('app.q_de', q::text, true);

  update public.assessments set status = 'published' where id = a;
end $$;

-- Assessment B (course C1): one other true/false question
do $$
declare a uuid; q uuid;
begin
  insert into public.assessments (title, course_id, total_marks, attempt_limit, duration_minutes, status)
  values ('PhaseD B', current_setting('app.c1')::uuid, 2, null, 30, 'draft') returning id into a;
  perform set_config('app.asm_b', a::text, true);
  insert into public.questions (assessment_id, question_type, question_text, marks, position)
  values (a, 'true_false', 'B question?', 2, 0) returning id into q;
  perform set_config('app.q_b', q::text, true);
  insert into public.question_answer_keys (question_id, correct_boolean) values (q, true);
  update public.assessments set status = 'published' where id = a;
end $$;

-- Attempts (through the real start function)
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
do $$
declare r public.attempt_info;
begin
  select * into r from public.start_assessment_attempt(current_setting('app.asm_a')::uuid);
  perform set_config('app.att_s1', r.attempt_id::text, true);
  select * into r from public.start_assessment_attempt(current_setting('app.asm_b')::uuid);
  perform set_config('app.att_s1_b', r.attempt_id::text, true);
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
do $$
declare r public.attempt_info;
begin
  select * into r from public.start_assessment_attempt(current_setting('app.asm_a')::uuid);
  perform set_config('app.att_s2', r.attempt_id::text, true);
end $$;
select pg_temp.as_owner();

-- ===============================================================
-- Static structure
-- ===============================================================
select pg_temp.ok('RLS enabled on attempt_answers',
  (select relrowsecurity from pg_class where oid = 'public.attempt_answers'::regclass));

select pg_temp.ok('attempt_answers has no policy at all (direct access denied by default)',
  (select count(*) = 0 from pg_policies where schemaname = 'public' and tablename = 'attempt_answers'));

select pg_temp.ok('neither authenticated nor anon has any privilege on attempt_answers',
  not has_table_privilege('authenticated', 'public.attempt_answers', 'select')
  and not has_table_privilege('authenticated', 'public.attempt_answers', 'insert')
  and not has_table_privilege('authenticated', 'public.attempt_answers', 'update')
  and not has_table_privilege('authenticated', 'public.attempt_answers', 'delete')
  and not has_table_privilege('authenticated', 'public.attempt_answers', 'truncate')
  and not has_table_privilege('anon', 'public.attempt_answers', 'select')
  and not has_table_privilege('anon', 'public.attempt_answers', 'insert')
  and not has_table_privilege('anon', 'public.attempt_answers', 'update')
  and not has_table_privilege('anon', 'public.attempt_answers', 'delete'));

select pg_temp.ok('one row per (attempt, question) is a database constraint',
  exists (select 1 from pg_constraint where conrelid = 'public.attempt_answers'::regclass
           and conname = 'attempt_answers_one_per_question' and contype = 'u'));

select pg_temp.ok('the two client functions are executable by authenticated, not by anon or PUBLIC',
  (select count(*) = 2 and bool_and(has_function_privilege('authenticated', p.oid, 'execute')
                   and not has_function_privilege('anon', p.oid, 'execute')
                   and not has_function_privilege('public', p.oid, 'execute'))
     from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('save_attempt_answer', 'get_attempt_answers')));

select pg_temp.ok('internal functions and the guard trigger function are NOT executable by app roles',
  (select count(*) = 3 and bool_and(not has_function_privilege('authenticated', p.oid, 'execute')
                   and not has_function_privilege('anon', p.oid, 'execute'))
     from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('open_attempt_for_answers', 'normalize_attempt_answer', 'attempt_answers_guard')));

select pg_temp.ok('all five functions are SECURITY DEFINER with an empty search_path',
  (select count(*) = 5 and bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
     from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('save_attempt_answer', 'get_attempt_answers', 'open_attempt_for_answers',
                        'normalize_attempt_answer', 'attempt_answers_guard')));

select pg_temp.ok('no client function accepts a user id',
  (select not bool_or(coalesce(p.proargnames::text, '') ~* 'user')
     from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('save_attempt_answer', 'get_attempt_answers')));

-- ===============================================================
-- Who may call: not signed in, anon, teacher, admin, direct table access
-- ===============================================================
select pg_temp.as_anon();
select pg_temp.fails('anon cannot save', pg_temp.sv_sql('att_s1', 'q_tf', '''{"value": true}''::jsonb', '1'), array['42501']);
select pg_temp.fails('anon cannot restore', format('select public.get_attempt_answers(%L)', current_setting('app.att_s1')), array['42501']);

select pg_temp.as_no_session();
select pg_temp.fails('a request without a user cannot save', pg_temp.sv_sql('att_s1', 'q_tf', '''{"value": true}''::jsonb', '1'), array['42501']);
select pg_temp.fails('a request without a user cannot restore', format('select public.get_attempt_answers(%L)', current_setting('app.att_s1')), array['42501']);

select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1');
select pg_temp.fails('a teacher cannot save', pg_temp.sv_sql('att_s1', 'q_tf', '''{"value": true}''::jsonb', '1'), array['42501']);
select pg_temp.fails('a teacher cannot restore', format('select public.get_attempt_answers(%L)', current_setting('app.att_s1')), array['42501']);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000d9');
select pg_temp.fails('an admin cannot save', pg_temp.sv_sql('att_s1', 'q_tf', '''{"value": true}''::jsonb', '1'), array['42501']);
select pg_temp.fails('an admin cannot restore', format('select public.get_attempt_answers(%L)', current_setting('app.att_s1')), array['42501']);
select pg_temp.fails('an admin cannot read the table directly', 'select * from public.attempt_answers', array['42501']);

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.fails('a student cannot SELECT attempt_answers directly', 'select * from public.attempt_answers', array['42501']);
select pg_temp.fails('a student cannot INSERT into attempt_answers directly',
  format('insert into public.attempt_answers (attempt_id, question_id, answer, revision) values (%L, %L, %L, 1)',
         current_setting('app.att_s1'), current_setting('app.q_tf'), '{"value": true}'), array['42501']);
select pg_temp.fails('a student cannot UPDATE attempt_answers directly', 'update public.attempt_answers set revision = 99', array['42501']);
select pg_temp.fails('a student cannot DELETE from attempt_answers directly', 'delete from public.attempt_answers', array['42501']);
select pg_temp.fails('internal helper open_attempt_for_answers is not callable by a student',
  format('select public.open_attempt_for_answers(%L, false)', current_setting('app.att_s1')), array['42501']);
select pg_temp.fails('internal helper normalize_attempt_answer is not callable by a student',
  format('select public.normalize_attempt_answer(%L, ''true_false'', ''{"value": true}'')', current_setting('app.q_tf')), array['42501']);

-- ===============================================================
-- Attempt ownership and question membership
-- ===============================================================
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select pg_temp.fails('S2 cannot save into S1''s attempt', pg_temp.sv_sql('att_s1', 'q_tf', '''{"value": true}''::jsonb', '1'), array['EA005']);
select pg_temp.fails('S2 cannot restore S1''s attempt', format('select public.get_attempt_answers(%L)', current_setting('app.att_s1')), array['EA005']);
select pg_temp.fails('a random attempt id looks the same as someone else''s (EA005)',
  format('select public.save_attempt_answer(gen_random_uuid(), %L, ''{"value": true}'', 1)', current_setting('app.q_tf')), array['EA005']);
select pg_temp.fails('a null attempt id is EA005',
  format('select public.save_attempt_answer(null, %L, ''{"value": true}'', 1)', current_setting('app.q_tf')), array['EA005']);

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
select pg_temp.fails('S3 (not enrolled) cannot save into S1''s attempt', pg_temp.sv_sql('att_s1', 'q_tf', '''{"value": true}''::jsonb', '1'), array['EA005']);
select pg_temp.fails('S3 (not enrolled) cannot restore S1''s attempt', format('select public.get_attempt_answers(%L)', current_setting('app.att_s1')), array['EA005']);

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.fails('a question of ANOTHER assessment is refused (EA008)', pg_temp.sv_sql('att_s1', 'q_b', '''{"value": true}''::jsonb', '1'), array['EA008']);
select pg_temp.fails('a random question id is refused with the same code (EA008)',
  format('select public.save_attempt_answer(%L, gen_random_uuid(), ''{"value": true}'', 1)', current_setting('app.att_s1')), array['EA008']);
select pg_temp.fails('a null question id is refused (EA008)',
  format('select public.save_attempt_answer(%L, null, ''{"value": true}'', 1)', current_setting('app.att_s1')), array['EA008']);
select pg_temp.as_owner();
select pg_temp.ok('nothing was stored by the refused saves', pg_temp.n_rows('att_s1') = 0 and pg_temp.n_rows('att_s1_b') = 0);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');

-- ===============================================================
-- Saving, duplicates, ordering, clearing (S1 on A)
-- ===============================================================
do $$
declare r jsonb;
begin
  r := pg_temp.sv('att_s1', 'q_sc', jsonb_build_object('option_id', current_setting('app.o_sc1')), 1);
  perform pg_temp.ok('first save is applied, revision 1, normalized answer returned',
    (r->>'applied')::boolean and (r->>'revision')::int = 1
    and r->'answer' = jsonb_build_object('option_id', current_setting('app.o_sc1'))
    and (r->>'question_id') = current_setting('app.q_sc'));
  perform pg_temp.ok('the response carries the server clock and the deadline',
    r->>'server_now' is not null and r->>'expires_at' is not null and (r->>'seconds_remaining')::int between 1 and 1800);
  perform pg_temp.ok('exactly the documented keys are returned',
    (select array_agg(k order by k) from jsonb_object_keys(r) k)
    = array['answer', 'applied', 'expires_at', 'question_id', 'revision', 'saved_at', 'seconds_remaining', 'server_now']);

  -- duplicate request (same revision, same body): no error, no change, no second row
  r := pg_temp.sv('att_s1', 'q_sc', jsonb_build_object('option_id', current_setting('app.o_sc1')), 1);
  perform pg_temp.ok('a repeated request is a no-op: applied=false, same stored answer',
    not (r->>'applied')::boolean and (r->>'revision')::int = 1
    and r->'answer' = jsonb_build_object('option_id', current_setting('app.o_sc1')));
  perform pg_temp.ok('still exactly one row after the duplicate', pg_temp.n_rows('att_s1') = 1);

  -- same revision but a DIFFERENT body: first write wins, nothing changes
  r := pg_temp.sv('att_s1', 'q_sc', jsonb_build_object('option_id', current_setting('app.o_sc2')), 1);
  perform pg_temp.ok('same revision, different body: not applied, stored answer unchanged',
    not (r->>'applied')::boolean and r->'answer' = jsonb_build_object('option_id', current_setting('app.o_sc1')));

  -- newer revision wins
  r := pg_temp.sv('att_s1', 'q_sc', jsonb_build_object('option_id', current_setting('app.o_sc2')), 3);
  perform pg_temp.ok('a higher revision is applied (revision jumps to 3)',
    (r->>'applied')::boolean and (r->>'revision')::int = 3
    and r->'answer' = jsonb_build_object('option_id', current_setting('app.o_sc2')));

  -- late, out-of-order older save must not overwrite
  r := pg_temp.sv('att_s1', 'q_sc', jsonb_build_object('option_id', current_setting('app.o_sc1')), 2);
  perform pg_temp.ok('a late older revision does not overwrite (applied=false, stored revision 3 returned)',
    not (r->>'applied')::boolean and (r->>'revision')::int = 3
    and r->'answer' = jsonb_build_object('option_id', current_setting('app.o_sc2')));

  -- clear stores null and keeps the revision, so a late older save cannot resurrect the answer
  r := pg_temp.sv('att_s1', 'q_sc', null, 4);
  perform pg_temp.ok('clearing (SQL null) is applied, answer null, revision 4',
    (r->>'applied')::boolean and (r->>'revision')::int = 4 and r->'answer' = 'null'::jsonb);
  r := pg_temp.sv('att_s1', 'q_sc', jsonb_build_object('option_id', current_setting('app.o_sc1')), 4);
  perform pg_temp.ok('a late save with the cleared revision cannot resurrect the answer',
    not (r->>'applied')::boolean and r->'answer' = 'null'::jsonb);
  r := pg_temp.sv('att_s1', 'q_sc', 'null'::jsonb, 5);
  perform pg_temp.ok('clearing with JSON null is also accepted', (r->>'applied')::boolean and r->'answer' = 'null'::jsonb);
  perform pg_temp.ok('still exactly one row for that question', pg_temp.n_rows('att_s1') = 1);
  r := pg_temp.sv('att_s1', 'q_sc', jsonb_build_object('option_id', current_setting('app.o_sc1')), 6);
  perform pg_temp.ok('after clearing, a newer revision can set an answer again', (r->>'applied')::boolean and (r->>'revision')::int = 6);
end $$;

-- ===============================================================
-- Per-type validation
-- ===============================================================
do $$
declare r jsonb;
begin
  -- multiple_select: stored sorted and distinct
  r := pg_temp.sv('att_s1', 'q_ms',
        jsonb_build_object('option_ids', jsonb_build_array(current_setting('app.o_ms3'), current_setting('app.o_ms1'))), 1);
  perform pg_temp.ok('multiple_select is stored sorted',
    (r->>'applied')::boolean and r->'answer' = jsonb_build_object('option_ids',
      (select to_jsonb(array_agg(x order by x)) from unnest(array[current_setting('app.o_ms3')::uuid, current_setting('app.o_ms1')::uuid]) x)));
  r := pg_temp.sv('att_s1', 'q_ms', '{"option_ids": []}'::jsonb, 2);
  perform pg_temp.ok('multiple_select with an empty list clears the answer', (r->>'applied')::boolean and r->'answer' = 'null'::jsonb);

  -- true_false
  r := pg_temp.sv('att_s1', 'q_tf', '{"value": false}'::jsonb, 1);
  perform pg_temp.ok('true_false false is stored as false (not cleared)', (r->>'applied')::boolean and r->'answer' = '{"value": false}'::jsonb);

  -- short_answer / descriptive
  r := pg_temp.sv('att_s1', 'q_sa', '{"text": "  New Delhi "}'::jsonb, 1);
  perform pg_temp.ok('short_answer text is stored as typed (scoring trims later)', r->'answer' = '{"text": "  New Delhi "}'::jsonb);
  r := pg_temp.sv('att_s1', 'q_sa', '{"text": "   "}'::jsonb, 2);
  perform pg_temp.ok('a blank short answer clears it', (r->>'applied')::boolean and r->'answer' = 'null'::jsonb);
  r := pg_temp.sv('att_s1', 'q_sa', jsonb_build_object('text', repeat('a', 500)), 3);
  perform pg_temp.ok('short_answer at exactly 500 characters is accepted', (r->>'applied')::boolean);
  r := pg_temp.sv('att_s1', 'q_de', jsonb_build_object('text', repeat('é', 10000)), 1);
  perform pg_temp.ok('descriptive at exactly 10000 characters (multi-byte) is accepted', (r->>'applied')::boolean);
end $$;

select pg_temp.fails('single_choice: a missing option id is refused',
  pg_temp.sv_sql('att_s1', 'q_sc', '''{"option_id": "11111111-1111-4111-8111-111111111111"}''::jsonb', '7'), array['EA009']);
select pg_temp.fails('single_choice: an option of ANOTHER question is refused',
  pg_temp.sv_sql('att_s1', 'q_sc', format('jsonb_build_object(''option_id'', %L)', current_setting('app.o_ms1')), '7'), array['EA009']);
select pg_temp.fails('single_choice: not a uuid is refused',
  pg_temp.sv_sql('att_s1', 'q_sc', '''{"option_id": "nope"}''::jsonb', '7'), array['EA009']);
select pg_temp.fails('single_choice: a number is refused',
  pg_temp.sv_sql('att_s1', 'q_sc', '''{"option_id": 5}''::jsonb', '7'), array['EA009']);
select pg_temp.fails('single_choice: the wrong shape ({"text"}) is refused',
  pg_temp.sv_sql('att_s1', 'q_sc', '''{"text": "x"}''::jsonb', '7'), array['EA009']);
select pg_temp.fails('single_choice: an extra key is refused',
  pg_temp.sv_sql('att_s1', 'q_sc', format('jsonb_build_object(''option_id'', %L, ''is_correct'', true)', current_setting('app.o_sc1')), '7'), array['EA009']);
select pg_temp.fails('single_choice: an array is refused',
  pg_temp.sv_sql('att_s1', 'q_sc', format('jsonb_build_array(%L)', current_setting('app.o_sc1')), '7'), array['EA009']);
select pg_temp.fails('single_choice: a bare string is refused',
  pg_temp.sv_sql('att_s1', 'q_sc', '''"x"''::jsonb', '7'), array['EA009']);
select pg_temp.fails('single_choice: an empty object is refused',
  pg_temp.sv_sql('att_s1', 'q_sc', '''{}''::jsonb', '7'), array['EA009']);
select pg_temp.fails('multiple_select: a duplicate option id is refused',
  pg_temp.sv_sql('att_s1', 'q_ms', format('jsonb_build_object(''option_ids'', jsonb_build_array(%L, %L))', current_setting('app.o_ms1'), current_setting('app.o_ms1')), '7'), array['EA009']);
select pg_temp.fails('multiple_select: one option of another question is refused',
  pg_temp.sv_sql('att_s1', 'q_ms', format('jsonb_build_object(''option_ids'', jsonb_build_array(%L, %L))', current_setting('app.o_ms1'), current_setting('app.o_sc1')), '7'), array['EA009']);
select pg_temp.fails('multiple_select: option_ids that is not an array is refused',
  pg_temp.sv_sql('att_s1', 'q_ms', format('jsonb_build_object(''option_ids'', %L)', current_setting('app.o_ms1')), '7'), array['EA009']);
select pg_temp.fails('multiple_select: more than 50 ids is refused',
  pg_temp.sv_sql('att_s1', 'q_ms', '(select jsonb_build_object(''option_ids'', jsonb_agg(gen_random_uuid())) from generate_series(1, 51))', '7'), array['EA009']);
select pg_temp.fails('true_false: the string "true" is refused',
  pg_temp.sv_sql('att_s1', 'q_tf', '''{"value": "true"}''::jsonb', '7'), array['EA009']);
select pg_temp.fails('true_false: a number is refused',
  pg_temp.sv_sql('att_s1', 'q_tf', '''{"value": 1}''::jsonb', '7'), array['EA009']);
select pg_temp.fails('short_answer: 501 characters is refused',
  pg_temp.sv_sql('att_s1', 'q_sa', format('jsonb_build_object(''text'', %L)', repeat('a', 501)), '7'), array['EA009']);
select pg_temp.fails('short_answer: a non-string text is refused',
  pg_temp.sv_sql('att_s1', 'q_sa', '''{"text": 12}''::jsonb', '7'), array['EA009']);
select pg_temp.fails('descriptive: 10001 characters is refused',
  pg_temp.sv_sql('att_s1', 'q_de', format('jsonb_build_object(''text'', %L)', repeat('a', 10001)), '7'), array['EA009']);
select pg_temp.fails('descriptive: an extra key is refused',
  pg_temp.sv_sql('att_s1', 'q_de', '''{"text": "x", "score": 5}''::jsonb', '7'), array['EA009']);
select pg_temp.fails('revision 0 is refused', pg_temp.sv_sql('att_s1', 'q_tf', '''{"value": true}''::jsonb', '0'), array['EA009']);
select pg_temp.fails('a negative revision is refused', pg_temp.sv_sql('att_s1', 'q_tf', '''{"value": true}''::jsonb', '-1'), array['EA009']);
select pg_temp.fails('a revision above 1000000000 is refused', pg_temp.sv_sql('att_s1', 'q_tf', '''{"value": true}''::jsonb', '1000000001'), array['EA009']);
select pg_temp.fails('a null revision is refused', pg_temp.sv_sql('att_s1', 'q_tf', '''{"value": true}''::jsonb', 'null'), array['EA009']);
select pg_temp.as_owner();
select pg_temp.ok('as owner: refused answers changed nothing (true_false still false at revision 1)',
  (select answer = '{"value": false}'::jsonb and revision = 1 from public.attempt_answers
    where attempt_id = current_setting('app.att_s1')::uuid and question_id = current_setting('app.q_tf')::uuid));
select pg_temp.ok('as owner: S1 attempt A has exactly 5 rows (one per question), none duplicated',
  pg_temp.n_rows('att_s1') = 5);
select pg_temp.ok('as owner: nothing was ever stored on the other attempt (B) or for S2',
  pg_temp.n_rows('att_s1_b') = 0 and pg_temp.n_rows('att_s2') = 0);

-- ===============================================================
-- Restore
-- ===============================================================
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
do $$
declare r jsonb;
begin
  r := public.get_attempt_answers(current_setting('app.att_s1')::uuid);
  perform pg_temp.ok('restore returns the attempt state and one entry per saved question, in question order',
    (r->'attempt'->>'status') = 'in_progress'
    and jsonb_array_length(r->'answers') = 5
    and (r->'answers'->0->>'question_id') = current_setting('app.q_sc')
    and (r->'answers'->4->>'question_id') = current_setting('app.q_de'));
  perform pg_temp.ok('restore returns exactly the documented keys, and no keys, scores or other users',
    (select array_agg(k order by k) from jsonb_object_keys(r) k) = array['answers', 'attempt']
    and (select array_agg(k order by k) from jsonb_object_keys(r->'attempt') k)
        = array['attempt_id', 'expires_at', 'seconds_remaining', 'server_now', 'status']
    and (select array_agg(k order by k) from jsonb_object_keys(r->'answers'->0) k)
        = array['answer', 'question_id', 'revision', 'saved_at']);
  perform pg_temp.ok('restore returns the latest saved answers and revisions',
    (r->'answers'->0->>'revision')::int = 6
    and (r->'answers'->0->'answer') = jsonb_build_object('option_id', current_setting('app.o_sc1'))
    and (r->'answers'->1->'answer') = 'null'::jsonb and (r->'answers'->1->>'revision')::int = 2
    and (r->'answers'->2->'answer') = '{"value": false}'::jsonb);
  r := public.get_attempt_answers(current_setting('app.att_s1_b')::uuid);
  perform pg_temp.ok('restore of an attempt with no answers is an empty list, not an error', jsonb_array_length(r->'answers') = 0);
end $$;

-- S2 saves on the same questions; S1 must never see it and vice versa
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
do $$
declare r jsonb;
begin
  r := pg_temp.sv('att_s2', 'q_sc', jsonb_build_object('option_id', current_setting('app.o_sc2')), 1);
  perform pg_temp.ok('S2 can save to their own attempt', (r->>'applied')::boolean and (r->>'revision')::int = 1);
  r := public.get_attempt_answers(current_setting('app.att_s2')::uuid);
  perform pg_temp.ok('S2 restore returns only S2''s single answer',
    jsonb_array_length(r->'answers') = 1 and (r->'answers'->0->'answer') = jsonb_build_object('option_id', current_setting('app.o_sc2')));
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
do $$
declare r jsonb;
begin
  r := public.get_attempt_answers(current_setting('app.att_s1')::uuid);
  perform pg_temp.ok('S1 restore is unaffected by S2''s save', (r->'answers'->0->>'revision')::int = 6 and jsonb_array_length(r->'answers') = 5);
end $$;

-- the paper itself is unchanged and still carries no answers
do $$
declare p jsonb;
begin
  p := public.get_attempt_paper(current_setting('app.att_s1')::uuid);
  perform pg_temp.ok('get_attempt_paper still returns the 5 questions',
    jsonb_array_length(p->'questions') = 5);
  perform pg_temp.ok('the paper contains no saved answer, revision or key',
    p::text !~* '(revision|"answer"|is_correct|correct_boolean|accepted)');
end $$;

-- ===============================================================
-- After submission: no edits, no duplicate effect
-- ===============================================================
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
do $$
declare r public.attempt_info;
begin
  select * into r from public.submit_attempt(current_setting('app.att_s1')::uuid);
  perform pg_temp.ok('S1 submitted attempt 1', r.status = 'submitted');
end $$;
select pg_temp.fails('after submission: save is refused (EA007)', pg_temp.sv_sql('att_s1', 'q_tf', '''{"value": true}''::jsonb', '9'), array['EA007']);
select pg_temp.fails('after submission: even a CLEAR is refused (EA007)', pg_temp.sv_sql('att_s1', 'q_tf', 'null', '9'), array['EA007']);
select pg_temp.fails('after submission: a repeat of an earlier save is refused too (EA007)',
  pg_temp.sv_sql('att_s1', 'q_sc', format('jsonb_build_object(''option_id'', %L)', current_setting('app.o_sc1')), '6'), array['EA007']);
select pg_temp.fails('after submission: restore is refused (EA007); results are a later phase', format('select public.get_attempt_answers(%L)', current_setting('app.att_s1')), array['EA007']);
select pg_temp.as_owner();
select pg_temp.ok('after submission: stored answers are exactly as they were',
  pg_temp.n_rows('att_s1') = 5
  and (select revision = 6 from public.attempt_answers where attempt_id = current_setting('app.att_s1')::uuid and question_id = current_setting('app.q_sc')::uuid)
  and (select answer = '{"value": false}'::jsonb from public.attempt_answers where attempt_id = current_setting('app.att_s1')::uuid and question_id = current_setting('app.q_tf')::uuid));

-- backstop trigger: even the table owner cannot change a finished attempt's answers
select pg_temp.fails('trigger: owner UPDATE of a submitted attempt''s answer is refused',
  format('update public.attempt_answers set answer = ''{"value": true}'', revision = revision + 1 where attempt_id = %L and question_id = %L',
         current_setting('app.att_s1'), current_setting('app.q_tf')), array['EA007']);
select pg_temp.fails('trigger: owner INSERT for a submitted attempt is refused (EA007, before any unique check)',
  format('insert into public.attempt_answers (attempt_id, question_id, answer, revision) values (%L, %L, null, 1)',
         current_setting('app.att_s1'), current_setting('app.q_sc')), array['EA007']);

-- backstop trigger on a live attempt
select pg_temp.fails('trigger: an answer cannot be moved to another question',
  format('update public.attempt_answers set question_id = %L, revision = revision + 1 where attempt_id = %L and question_id = %L',
         current_setting('app.q_b'), current_setting('app.att_s2'), current_setting('app.q_sc')), array['42501']);
select pg_temp.fails('trigger: an answer cannot be moved to another attempt',
  format('update public.attempt_answers set attempt_id = %L, revision = revision + 1 where attempt_id = %L and question_id = %L',
         current_setting('app.att_s1_b'), current_setting('app.att_s2'), current_setting('app.q_sc')), array['42501']);
select pg_temp.fails('trigger: the revision cannot go down (or stay the same)',
  format('update public.attempt_answers set revision = revision where attempt_id = %L and question_id = %L',
         current_setting('app.att_s2'), current_setting('app.q_sc')), array['42501']);
select pg_temp.fails('trigger: a question of another assessment cannot be inserted even by the owner (EA008)',
  format('insert into public.attempt_answers (attempt_id, question_id, answer, revision) values (%L, %L, null, 1)',
         current_setting('app.att_s2'), current_setting('app.q_b')), array['EA008']);
select pg_temp.fails('constraint: an answer that is not a JSON object is refused',
  format('insert into public.attempt_answers (attempt_id, question_id, answer, revision) values (%L, %L, ''[1]'', 1)',
         current_setting('app.att_s2'), current_setting('app.q_tf')), array['23514']);
select pg_temp.fails('constraint: revision 0 is refused at table level',
  format('insert into public.attempt_answers (attempt_id, question_id, answer, revision) values (%L, %L, null, 0)',
         current_setting('app.att_s2'), current_setting('app.q_tf')), array['23514']);

-- A second attempt after the first was submitted starts clean
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
do $$
declare r public.attempt_info; j jsonb;
begin
  select * into r from public.start_assessment_attempt(current_setting('app.asm_a')::uuid);
  perform pg_temp.ok('S1 starts attempt 2 (unlimited attempts)', r.attempt_number = 2 and r.status = 'in_progress');
  perform set_config('app.att_s1_2', r.attempt_id::text, true);
  j := public.get_attempt_answers(r.attempt_id);
  perform pg_temp.ok('attempt 2 starts with no answers (attempt 1''s are not carried over)', jsonb_array_length(j->'answers') = 0);
  j := pg_temp.sv('att_s1_2', 'q_sc', jsonb_build_object('option_id', current_setting('app.o_sc2')), 1);
  perform pg_temp.ok('attempt 2 can save independently at revision 1', (j->>'applied')::boolean);
end $$;

-- ===============================================================
-- Deadline and access are re-checked at call time
-- ===============================================================
select pg_temp.as_owner();
-- an overdue attempt that is still marked in_progress, and one that expires in two seconds
insert into public.assessment_attempts (assessment_id, user_id, attempt_number, started_at, expires_at)
values (current_setting('app.asm_b')::uuid, '00000000-0000-0000-0000-0000000000e2', 1, now() - interval '2 hours', now() - interval '1 hour');
do $$ begin
  perform set_config('app.att_overdue', (select id::text from public.assessment_attempts
    where assessment_id = current_setting('app.asm_b')::uuid and user_id = '00000000-0000-0000-0000-0000000000e2'), true);
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select pg_temp.fails('overdue attempt (status still in_progress): save is refused (EA007)',
  format('select public.save_attempt_answer(%L, %L, ''{"value": true}'', 1)', current_setting('app.att_overdue'), current_setting('app.q_b')), array['EA007']);
select pg_temp.fails('overdue attempt: restore is refused (EA007)',
  format('select public.get_attempt_answers(%L)', current_setting('app.att_overdue')), array['EA007']);

select pg_temp.as_owner();
insert into public.assessment_attempts (assessment_id, user_id, attempt_number, started_at, expires_at)
values (current_setting('app.asm_a')::uuid, '00000000-0000-0000-0000-0000000000e3', 1, clock_timestamp(), clock_timestamp() + interval '2 seconds');
do $$ begin
  perform set_config('app.att_short', (select id::text from public.assessment_attempts
    where assessment_id = current_setting('app.asm_a')::uuid and user_id = '00000000-0000-0000-0000-0000000000e3'), true);
end $$;
-- S3 is not enrolled, so this attempt (inserted by the owner) is refused with EA001 even before its deadline
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
select pg_temp.fails('an attempt whose owner is no longer enrolled is refused (EA001)',
  pg_temp.sv_sql('att_short', 'q_tf', '''{"value": true}''::jsonb', '1'), array['EA001']);
select pg_temp.as_owner();
insert into public.enrollments (user_id, course_id) values ('00000000-0000-0000-0000-0000000000e3', current_setting('app.c1')::uuid);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e3');
do $$
declare r jsonb;
begin
  r := pg_temp.sv('att_short', 'q_tf', '{"value": true}'::jsonb, 1);
  perform pg_temp.ok('before the deadline: save works', (r->>'applied')::boolean and (r->>'seconds_remaining')::int <= 2);
  perform pg_sleep(2.3);
end $$;
select pg_temp.fails('after the deadline passes (database clock, same session): save is refused (EA007)',
  pg_temp.sv_sql('att_short', 'q_tf', '''{"value": false}''::jsonb', '2'), array['EA007']);
select pg_temp.fails('after the deadline: restore is refused (EA007)',
  format('select public.get_attempt_answers(%L)', current_setting('app.att_short')), array['EA007']);
select pg_temp.as_owner();
select pg_temp.ok('the answer saved before the deadline is still the one stored',
  (select answer = '{"value": true}'::jsonb and revision = 1 from public.attempt_answers
    where attempt_id = current_setting('app.att_short')::uuid));

-- access changes after the attempt started
select pg_temp.as_owner();
delete from public.enrollments where user_id = '00000000-0000-0000-0000-0000000000e2' and course_id = current_setting('app.c1')::uuid;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select pg_temp.fails('unenrolled mid-attempt: save is refused (EA001)', pg_temp.sv_sql('att_s2', 'q_sc', '''{"option_id": "11111111-1111-4111-8111-111111111111"}''::jsonb', '2'), array['EA001']);
select pg_temp.fails('unenrolled mid-attempt: restore is refused (EA001)', format('select public.get_attempt_answers(%L)', current_setting('app.att_s2')), array['EA001']);
select pg_temp.as_owner();
insert into public.enrollments (user_id, course_id) values ('00000000-0000-0000-0000-0000000000e2', current_setting('app.c1')::uuid);
update public.courses set status = 'draft' where id = current_setting('app.c1')::uuid;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select pg_temp.fails('course unpublished mid-attempt: save is refused (EA001)', pg_temp.sv_sql('att_s2', 'q_tf', '''{"value": true}''::jsonb', '1'), array['EA001']);
select pg_temp.as_owner();
update public.courses set status = 'published' where id = current_setting('app.c1')::uuid;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
do $$
declare r jsonb;
begin
  r := pg_temp.sv('att_s2', 'q_tf', '{"value": true}'::jsonb, 1);
  perform pg_temp.ok('once access is back, saving works again', (r->>'applied')::boolean);
end $$;

-- window closed by the teacher while the attempt is open
select pg_temp.as_owner();
update public.assessments set closes_at = now() - interval '1 minute' where id = current_setting('app.asm_a')::uuid;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2');
select pg_temp.fails('assessment closed mid-attempt: save is refused (EA003)', pg_temp.sv_sql('att_s2', 'q_tf', '''{"value": false}''::jsonb', '2'), array['EA003']);
select pg_temp.fails('assessment closed mid-attempt: restore is refused (EA003)', format('select public.get_attempt_answers(%L)', current_setting('app.att_s2')), array['EA003']);
select pg_temp.as_owner();
update public.assessments set closes_at = null where id = current_setting('app.asm_a')::uuid;

-- ===============================================================
-- Cleanup behaviour: deleting a student removes their answers without error
-- ===============================================================
select pg_temp.as_owner();
select pg_temp.ok('S2 has answers before deletion',
  (select count(*) from public.attempt_answers a join public.assessment_attempts t on t.id = a.attempt_id
    where t.user_id = '00000000-0000-0000-0000-0000000000e2') > 0);
delete from public.profiles where id = '00000000-0000-0000-0000-0000000000e2';
select pg_temp.ok('deleting a student cascades: no answers or attempts remain for them',
  (select count(*) from public.attempt_answers a join public.assessment_attempts t on t.id = a.attempt_id
    where t.user_id = '00000000-0000-0000-0000-0000000000e2') = 0);

rollback;
select 'ALL PHASE D CHECKS PASSED' as result;
