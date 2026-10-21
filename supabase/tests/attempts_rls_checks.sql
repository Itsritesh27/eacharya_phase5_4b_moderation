-- Phase B assessment-attempt security checks (privileges, RLS, RPC behaviour, expiry, constraints, triggers).
--
-- Run AFTER migrations 1-12. Works with or without seed.sql (it creates its own users, courses and
-- assessments and only ever counts rows belonging to those users). Paste into the Supabase SQL editor or
-- run with psql against a SCRATCH project/database.
-- Everything happens in one transaction that is ROLLED BACK, so nothing is kept.
-- Any failed check raises an exception; if the script finishes, all checks passed.
--
-- Actors: T1 teacher (owns course C1), AD admin,
--         S1, S3, S4, S5, S6 students enrolled in C1, S2 student NOT enrolled.
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

-- Builds a one-question (true/false, 2 marks) assessment; optionally publishes it. Stores its id in app.<name>.
create function pg_temp.mk(p_name text, p_course uuid, p_pub boolean, p_limit int, p_dur int,
                           p_opens timestamptz, p_closes timestamptz)
returns uuid language plpgsql as $$
declare a uuid; q uuid;
begin
  insert into public.assessments (title, course_id, total_marks, attempt_limit, duration_minutes, opens_at, closes_at, status)
  values ('PhaseB ' || p_name, p_course, 2, p_limit, p_dur, p_opens, p_closes, 'draft') returning id into a;
  insert into public.questions (assessment_id, question_type, question_text, marks, position)
  values (a, 'true_false', 'Q?', 2, 0) returning id into q;
  insert into public.question_answer_keys (question_id, correct_boolean) values (q, true);
  if p_pub then update public.assessments set status = 'published' where id = a; end if;
  perform set_config('app.' || p_name, a::text, true);
  return a;
end $$;

-- ---------------------------------------------------------------
-- Fixtures (as the database owner)
-- ---------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
select ('00000000-0000-0000-0000-0000000000' || v.suffix)::uuid, '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated', 'pb_' || v.suffix || '@test.local', '{}'
from (values ('b1'), ('b9'), ('a1'), ('a2'), ('a3'), ('a4'), ('a5'), ('a6')) v(suffix);

update public.profiles set role = 'teacher' where id = '00000000-0000-0000-0000-0000000000b1';
update public.profiles set role = 'admin'   where id = '00000000-0000-0000-0000-0000000000b9';

insert into public.classes (grade, name) values (9, 'Class 9') on conflict (grade) do nothing;
insert into public.subjects (name, slug) values ('Geography', 'geography') on conflict (slug) do nothing;

insert into public.courses (title, slug, class_id, subject_id, status, created_by)
select v.t, v.s, c.id, s.id, v.st::public.course_status, '00000000-0000-0000-0000-0000000000b1'
from (values ('PB course 1', 'pb-c1', 'published'), ('PB course 3 (draft)', 'pb-c3', 'draft')) v(t, s, st),
     public.classes c, public.subjects s
where c.grade = 9 and s.slug = 'geography';

do $$ begin
  perform set_config('app.c1', (select id::text from public.courses where slug = 'pb-c1'), true);
  perform set_config('app.c3', (select id::text from public.courses where slug = 'pb-c3'), true);
end $$;

insert into public.enrollments (user_id, course_id)
select ('00000000-0000-0000-0000-0000000000' || v.s)::uuid, current_setting('app.c1')::uuid
from (values ('a1'), ('a3'), ('a4'), ('a5'), ('a6')) v(s);
insert into public.enrollments (user_id, course_id)
values ('00000000-0000-0000-0000-0000000000a1', current_setting('app.c3')::uuid);

do $$ begin
  perform pg_temp.mk('lim',     current_setting('app.c1')::uuid, true,  2,    30,   null, null);
  perform pg_temp.mk('unl',     current_setting('app.c1')::uuid, true,  null, null, null, null);
  perform pg_temp.mk('one',     current_setting('app.c1')::uuid, true,  1,    30,   null, null);
  perform pg_temp.mk('exp',     current_setting('app.c1')::uuid, true,  3,    30,   null, null);
  perform pg_temp.mk('closing', current_setting('app.c1')::uuid, true,  null, 600,  null, now() + interval '10 minutes');
  perform pg_temp.mk('future',  current_setting('app.c1')::uuid, true,  null, 30,   now() + interval '1 day', now() + interval '2 days');
  perform pg_temp.mk('past',    current_setting('app.c1')::uuid, true,  null, 30,   now() - interval '2 days', now() - interval '1 day');
  perform pg_temp.mk('draft',   current_setting('app.c1')::uuid, false, null, 30,   null, null);
  perform pg_temp.mk('draftc',  current_setting('app.c3')::uuid, true,  null, 30,   null, null);
  perform pg_temp.mk('six',     current_setting('app.c1')::uuid, true,  null, 30,   null, null);
  perform pg_temp.mk('free',    current_setting('app.c1')::uuid, true,  null, 30,   null, null); -- stays attempt-free
end $$;

-- ===============================================================
-- Static structure
-- ===============================================================
select pg_temp.ok('RLS enabled on assessment_attempts',
  (select relrowsecurity from pg_class where oid = 'public.assessment_attempts'::regclass));

select pg_temp.ok('authenticated has SELECT but no INSERT/UPDATE/DELETE/TRUNCATE on attempts',
  has_table_privilege('authenticated', 'public.assessment_attempts', 'select')
  and not has_table_privilege('authenticated', 'public.assessment_attempts', 'insert')
  and not has_table_privilege('authenticated', 'public.assessment_attempts', 'update')
  and not has_table_privilege('authenticated', 'public.assessment_attempts', 'delete')
  and not has_table_privilege('authenticated', 'public.assessment_attempts', 'truncate'));

select pg_temp.ok('anon has no privilege on attempts',
  not has_table_privilege('anon', 'public.assessment_attempts', 'select')
  and not has_table_privilege('anon', 'public.assessment_attempts', 'insert')
  and not has_table_privilege('anon', 'public.assessment_attempts', 'update')
  and not has_table_privilege('anon', 'public.assessment_attempts', 'delete'));

select pg_temp.ok('the only attempt policy is the student read-own SELECT policy',
  (select count(*) = 1 and bool_and(cmd = 'SELECT') from pg_policies
    where schemaname = 'public' and tablename = 'assessment_attempts'));

select pg_temp.ok('the four client functions are executable by authenticated, not by anon or PUBLIC',
  (select bool_and(has_function_privilege('authenticated', p.oid, 'execute')
                   and not has_function_privilege('anon', p.oid, 'execute')
                   and not has_function_privilege('public', p.oid, 'execute'))
     from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('start_assessment_attempt', 'get_my_attempt', 'get_my_open_attempt', 'submit_attempt')));

select pg_temp.ok('internal functions are NOT executable by app roles',
  (select bool_and(not has_function_privilege('authenticated', p.oid, 'execute')
                   and not has_function_privilege('anon', p.oid, 'execute'))
     from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('expire_overdue_attempts', 'attempt_to_info', 'assessment_attempts_guard',
                        'assessments_block_unpublish_with_attempts')));

select pg_temp.ok('client functions are SECURITY DEFINER with an empty search_path',
  (select count(*) = 4 and bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
     from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('start_assessment_attempt', 'get_my_attempt', 'get_my_open_attempt', 'submit_attempt')));

select pg_temp.ok('no client function accepts a user id',
  (select not bool_or(coalesce(p.proargnames::text, '') ~* 'user')
     from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('start_assessment_attempt', 'get_my_attempt', 'get_my_open_attempt', 'submit_attempt')));

select pg_temp.ok('attempts table has no answer, score or key columns',
  not exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'assessment_attempts' and column_name ~* 'answer|score|correct|mark'));

-- ===============================================================
-- Not signed in / anon
-- ===============================================================
select pg_temp.as_owner();
set local role anon;
select pg_temp.fails('anon cannot read attempts', 'select * from public.assessment_attempts', array['42501']);
select pg_temp.fails('anon cannot call start_assessment_attempt',
  format('select * from public.start_assessment_attempt(%L)', current_setting('app.lim')), array['42501']);
select pg_temp.fails('anon cannot call get_my_attempt',
  'select * from public.get_my_attempt(gen_random_uuid())', array['42501']);
select pg_temp.fails('anon cannot call submit_attempt',
  'select * from public.submit_attempt(gen_random_uuid())', array['42501']);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '', true);
select pg_temp.fails('a session without a user id cannot start an attempt',
  format('select * from public.start_assessment_attempt(%L)', current_setting('app.lim')), array['42501']);
select pg_temp.fails('a session without a user id cannot read an attempt',
  'select * from public.get_my_attempt(gen_random_uuid())', array['42501']);
reset role;

-- ===============================================================
-- Non-students cannot start
-- ===============================================================
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.fails('a teacher cannot start an attempt',
  format('select * from public.start_assessment_attempt(%L)', current_setting('app.lim')), array['42501']);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b9');
select pg_temp.fails('an admin cannot start an attempt',
  format('select * from public.start_assessment_attempt(%L)', current_setting('app.lim')), array['42501']);

-- ===============================================================
-- Eligibility: all "not available" cases give the same error and message
-- ===============================================================
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');  -- S2, not enrolled
do $$
declare m1 text; m2 text; m3 text; m4 text;
begin
  m1 := pg_temp.fails_msg('un-enrolled student cannot start',
    format('select * from public.start_assessment_attempt(%L)', current_setting('app.lim')), 'EA001', null);
  m2 := pg_temp.fails_msg('a non-existent assessment is rejected',
    'select * from public.start_assessment_attempt(gen_random_uuid())', 'EA001', null);
  m3 := pg_temp.fails_msg('a null assessment is rejected',
    'select * from public.start_assessment_attempt(null)', 'EA001', null);
  perform pg_temp.ok('un-enrolled and non-existent give the identical message (no existence leak)', m1 = m2 and m2 = m3);
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');  -- S1
do $$
declare m1 text; m2 text;
begin
  m1 := pg_temp.fails_msg('enrolled student cannot start a DRAFT assessment',
    format('select * from public.start_assessment_attempt(%L)', current_setting('app.draft')), 'EA001', null);
  m2 := pg_temp.fails_msg('enrolled student cannot start a published assessment in an UNPUBLISHED course',
    format('select * from public.start_assessment_attempt(%L)', current_setting('app.draftc')), 'EA001', null);
  perform pg_temp.ok('draft / unpublished-course messages match the missing-assessment message', m1 = m2);
end $$;
select pg_temp.fails('assessment that has not opened yet is refused (EA002)',
  format('select * from public.start_assessment_attempt(%L)', current_setting('app.future')), array['EA002']);
select pg_temp.fails('assessment that has closed is refused (EA003)',
  format('select * from public.start_assessment_attempt(%L)', current_setting('app.past')), array['EA003']);
select pg_temp.as_owner();
select pg_temp.rows('refused starts created no attempt rows', 'select 1 from public.assessment_attempts', 0);

-- ===============================================================
-- Start, server-side times, retries, resume
-- ===============================================================
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$
declare r public.attempt_info; r2 public.attempt_info; r3 public.attempt_info;
begin
  r := public.start_assessment_attempt(current_setting('app.lim')::uuid, '11111111-1111-1111-1111-111111111111');
  perform set_config('app.s1_lim1', r.attempt_id::text, true);
  perform pg_temp.ok('S1 starts attempt 1: in_progress, number 1, not resumed',
    r.status = 'in_progress' and r.attempt_number = 1 and r.resumed = false and r.assessment_id = current_setting('app.lim')::uuid);
  perform pg_temp.ok('started_at comes from the database clock', abs(extract(epoch from (r.started_at - clock_timestamp()))) < 5);
  perform pg_temp.ok('expires_at = started_at + duration (30 min)', r.expires_at = r.started_at + interval '30 minutes');
  perform pg_temp.ok('seconds_remaining is about 30 minutes', r.seconds_remaining between 1790 and 1800);
  perform pg_temp.ok('server_now is returned', abs(extract(epoch from (r.server_now - clock_timestamp()))) < 5);

  r2 := public.start_assessment_attempt(current_setting('app.lim')::uuid, '11111111-1111-1111-1111-111111111111');
  perform pg_temp.ok('retry with the same request key returns the same attempt', r2.attempt_id = r.attempt_id and r2.resumed = true);
  perform pg_temp.ok('a retry does not move started_at or expires_at', r2.started_at = r.started_at and r2.expires_at = r.expires_at);

  r3 := public.start_assessment_attempt(current_setting('app.lim')::uuid);
  perform pg_temp.ok('start without a key resumes the open attempt', r3.attempt_id = r.attempt_id and r3.resumed = true);
  r3 := public.start_assessment_attempt(current_setting('app.lim')::uuid, '22222222-2222-2222-2222-222222222222');
  perform pg_temp.ok('start with a NEW key while one is open still resumes (no duplicate)', r3.attempt_id = r.attempt_id and r3.resumed = true);
end $$;
select pg_temp.rows('exactly one attempt row exists after start + retries + resume',
  format('select 1 from public.assessment_attempts where assessment_id = %L', current_setting('app.lim')), 1);
select pg_temp.fails('request key cannot be reused for a different assessment (EA006)',
  format('select * from public.start_assessment_attempt(%L, %L)', current_setting('app.unl'), '11111111-1111-1111-1111-111111111111'),
  array['EA006']);

do $$
declare r public.attempt_info;
begin
  r := public.get_my_attempt(current_setting('app.s1_lim1')::uuid);
  perform pg_temp.ok('get_my_attempt returns the owner''s in-progress attempt', r.status = 'in_progress' and r.attempt_number = 1);
  perform pg_temp.ok('get_my_open_attempt returns exactly that attempt',
    (select count(*) = 1 and bool_and(attempt_id = current_setting('app.s1_lim1')::uuid)
       from public.get_my_open_attempt(current_setting('app.lim')::uuid)));
end $$;

-- untimed + never-closing assessment: no deadline
do $$
declare r public.attempt_info;
begin
  r := public.start_assessment_attempt(current_setting('app.unl')::uuid);
  perform pg_temp.ok('untimed, never-closing assessment: expires_at and seconds_remaining are null',
    r.expires_at is null and r.seconds_remaining is null and r.status = 'in_progress');
end $$;

-- deadline is capped by closes_at
do $$
declare r public.attempt_info; v_closes timestamptz;
begin
  r := public.start_assessment_attempt(current_setting('app.closing')::uuid);
  select closes_at into v_closes from public.assessments where id = current_setting('app.closing')::uuid;
  perform pg_temp.ok('expires_at is capped at closes_at (600 min duration, 10 min to close)', r.expires_at = v_closes);
  perform pg_temp.ok('seconds_remaining reflects the earlier closing time', r.seconds_remaining between 590 and 600);
end $$;

-- ===============================================================
-- Submit (status only) and attempt limit
-- ===============================================================
do $$
declare r public.attempt_info; r2 public.attempt_info; r3 public.attempt_info;
begin
  r := public.submit_attempt(current_setting('app.s1_lim1')::uuid);
  perform pg_temp.ok('submit marks the attempt submitted with a server timestamp',
    r.status = 'submitted' and r.submitted_at is not null and r.seconds_remaining = 0
    and abs(extract(epoch from (r.submitted_at - clock_timestamp()))) < 5);
  r2 := public.submit_attempt(current_setting('app.s1_lim1')::uuid);
  perform pg_temp.ok('submitting again is idempotent and keeps submitted_at', r2.status = 'submitted' and r2.submitted_at = r.submitted_at);
  perform pg_temp.ok('open attempt is gone after submit',
    (select count(*) from public.get_my_open_attempt(current_setting('app.lim')::uuid)) = 0);

  r3 := public.start_assessment_attempt(current_setting('app.lim')::uuid, '33333333-3333-3333-3333-333333333333');
  perform set_config('app.s1_lim2', r3.attempt_id::text, true);
  perform pg_temp.ok('after submitting, a new attempt starts with number 2', r3.attempt_number = 2 and r3.resumed = false);
  perform public.submit_attempt(r3.attempt_id);
end $$;
select pg_temp.fails('third attempt is refused when the limit is 2 (EA004)',
  format('select * from public.start_assessment_attempt(%L)', current_setting('app.lim')), array['EA004']);
select pg_temp.fails('retrying a refused start with a fresh key is still refused',
  format('select * from public.start_assessment_attempt(%L, gen_random_uuid())', current_setting('app.lim')), array['EA004']);
do $$
declare r public.attempt_info;
begin
  r := public.start_assessment_attempt(current_setting('app.lim')::uuid, '33333333-3333-3333-3333-333333333333');
  perform pg_temp.ok('an old request key still returns its original attempt after the limit is reached',
    r.attempt_id = current_setting('app.s1_lim2')::uuid and r.attempt_number = 2 and r.status = 'submitted');
end $$;
select pg_temp.rows('limit 2 -> exactly two attempt rows',
  format('select 1 from public.assessment_attempts where assessment_id = %L', current_setting('app.lim')), 2);

-- unlimited assessment: several attempts in sequence
do $$
declare r public.attempt_info; i int;
begin
  perform public.submit_attempt((select attempt_id from public.get_my_open_attempt(current_setting('app.unl')::uuid)));
  for i in 2..4 loop
    r := public.start_assessment_attempt(current_setting('app.unl')::uuid);
    perform pg_temp.ok('unlimited assessment allows attempt ' || i, r.attempt_number = i);
    perform public.submit_attempt(r.attempt_id);
  end loop;
end $$;

-- ===============================================================
-- Cross-student access and direct table access
-- ===============================================================
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');  -- S3 starts own attempt first
do $$
declare r public.attempt_info;
begin
  r := public.start_assessment_attempt(current_setting('app.lim')::uuid);
  perform set_config('app.s3_lim1', r.attempt_id::text, true);
  perform pg_temp.ok('S3 gets attempt number 1 independently of S1''s attempts', r.attempt_number = 1);
end $$;
select pg_temp.as_owner();
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$
declare r public.attempt_info;
begin
  perform set_config('app.s1_closing', (select attempt_id::text from public.get_my_open_attempt(current_setting('app.closing')::uuid)), true);
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
do $$
declare m_other text; m_missing text;
begin
  m_other := pg_temp.fails_msg('S3 cannot get S1''s attempt',
    format('select * from public.get_my_attempt(%L)', current_setting('app.s1_lim2')), 'EA005', null);
  m_missing := pg_temp.fails_msg('a non-existent attempt id is refused',
    'select * from public.get_my_attempt(gen_random_uuid())', 'EA005', null);
  perform pg_temp.ok('someone else''s attempt and a missing attempt give the identical message', m_other = m_missing);
end $$;
select pg_temp.fails('S3 cannot submit S1''s open attempt',
  format('select * from public.submit_attempt(%L)', current_setting('app.s1_closing')), array['EA005']);
select pg_temp.rows('S3 sees only own attempt rows through the table',
  'select 1 from public.assessment_attempts', 1);
select pg_temp.rows('S3 cannot select S1''s attempt row by id',
  format('select 1 from public.assessment_attempts where id = %L', current_setting('app.s1_lim2')), 0);
select pg_temp.ok('get_my_open_attempt for S3 returns only S3''s attempt',
  (select count(*) = 1 and bool_and(attempt_id = current_setting('app.s3_lim1')::uuid)
     from public.get_my_open_attempt(current_setting('app.lim')::uuid)));
select pg_temp.fails('student cannot INSERT an attempt directly',
  format($f$insert into public.assessment_attempts (assessment_id, user_id, attempt_number) values (%L, '00000000-0000-0000-0000-0000000000a3', 5)$f$, current_setting('app.lim')),
  array['42501']);
select pg_temp.fails('student cannot UPDATE their own attempt directly (e.g. to extend or submit)',
  format($f$update public.assessment_attempts set status = 'submitted', submitted_at = now() where id = %L$f$, current_setting('app.s3_lim1')),
  array['42501']);
select pg_temp.fails('student cannot UPDATE expires_at directly',
  format($f$update public.assessment_attempts set expires_at = now() + interval '9 days' where id = %L$f$, current_setting('app.s3_lim1')),
  array['42501']);
select pg_temp.fails('student cannot DELETE an attempt',
  format($f$delete from public.assessment_attempts where id = %L$f$, current_setting('app.s3_lim1')), array['42501']);
select pg_temp.fails('internal expire_overdue_attempts is not callable by a student',
  'select public.expire_overdue_attempts()', array['42501']);
select pg_temp.fails('a student cannot call the internal attempt_to_info helper',
  format('select public.attempt_to_info(t, true) from public.assessment_attempts t where id = %L', current_setting('app.s3_lim1')), array['42501']);

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');  -- S2: not enrolled, no attempts
select pg_temp.rows('S2 sees no attempt rows', 'select 1 from public.assessment_attempts', 0);
select pg_temp.fails('S2 cannot get S3''s attempt', format('select * from public.get_my_attempt(%L)', current_setting('app.s3_lim1')), array['EA005']);
select pg_temp.rows('get_my_open_attempt returns nothing to a student who is not enrolled',
  format('select * from public.get_my_open_attempt(%L)', current_setting('app.lim')), 0);

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');  -- teacher
select pg_temp.rows('teacher sees no attempt rows yet (roster access is a later phase)', 'select 1 from public.assessment_attempts', 0);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b9');  -- admin
select pg_temp.rows('admin sees no attempt rows yet', 'select 1 from public.assessment_attempts', 0);
select pg_temp.fails('teacher/admin cannot call get_my_attempt for a student''s attempt',
  format('select * from public.get_my_attempt(%L)', current_setting('app.s3_lim1')), array['EA005']);

-- ===============================================================
-- Server-side expiry (fixtures are inserted as the owner with deadlines in the past)
-- ===============================================================
select pg_temp.as_owner();
insert into public.assessment_attempts (assessment_id, user_id, attempt_number, started_at, expires_at)
values
  -- S1 on 'one': overdue open attempt
  (current_setting('app.one')::uuid, '00000000-0000-0000-0000-0000000000a1', 1, now() - interval '2 hours', now() - interval '1 hour'),
  -- S3 on 'exp': overdue open attempt (for a late submit)
  (current_setting('app.exp')::uuid, '00000000-0000-0000-0000-0000000000a3', 1, now() - interval '2 hours', now() - interval '1 hour'),
  -- S4 on 'exp': overdue open attempt (start must close it and open attempt 2)
  (current_setting('app.exp')::uuid, '00000000-0000-0000-0000-0000000000a4', 1, now() - interval '2 hours', now() - interval '1 hour'),
  -- S6 on 'exp': overdue open attempt that is only read through get_my_open_attempt
  (current_setting('app.exp')::uuid, '00000000-0000-0000-0000-0000000000a6', 1, now() - interval '2 hours', now() - interval '1 hour');
insert into public.assessment_attempts (assessment_id, user_id, attempt_number, started_at, expires_at, request_key)
values (current_setting('app.exp')::uuid, '00000000-0000-0000-0000-0000000000a5', 1,
        now() - interval '2 hours', now() - interval '1 hour', '55555555-5555-5555-5555-555555555555');

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.ok('a direct SELECT can show a stale in_progress (documented limitation)',
  (select status = 'in_progress' from public.assessment_attempts where assessment_id = current_setting('app.one')::uuid));
do $$
declare r public.attempt_info;
begin
  select * into r from public.get_my_open_attempt(current_setting('app.one')::uuid);
  perform pg_temp.ok('get_my_open_attempt returns nothing for an overdue attempt', r.attempt_id is null);
end $$;
select pg_temp.ok('get_my_attempt reports an overdue attempt as expired with 0 seconds left',
  (select status = 'expired' and seconds_remaining = 0 from public.get_my_attempt(
     (select id from public.assessment_attempts where assessment_id = current_setting('app.one')::uuid))));
select pg_temp.fails('an expired attempt still counts toward the limit (limit 1 -> EA004)',
  format('select * from public.start_assessment_attempt(%L)', current_setting('app.one')), array['EA004']);
select pg_temp.as_owner();
select pg_temp.ok('expiry was persisted: status expired, expired_at = the deadline',
  (select status = 'expired' and expired_at = expires_at from public.assessment_attempts
    where assessment_id = current_setting('app.one')::uuid));

-- late submit
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
do $$
declare r public.attempt_info;
begin
  r := public.submit_attempt((select id from public.assessment_attempts where assessment_id = current_setting('app.exp')::uuid
                              and user_id = '00000000-0000-0000-0000-0000000000a3'));
  perform pg_temp.ok('submitting after the deadline yields expired, not submitted', r.status = 'expired' and r.submitted_at is null);
end $$;
select pg_temp.as_owner();
select pg_temp.ok('late submit stored expired with no submitted_at',
  (select status = 'expired' and submitted_at is null from public.assessment_attempts
    where assessment_id = current_setting('app.exp')::uuid and user_id = '00000000-0000-0000-0000-0000000000a3'));

-- start closes the overdue attempt and opens a fresh one (limit 3)
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4');
do $$
declare r public.attempt_info;
begin
  r := public.start_assessment_attempt(current_setting('app.exp')::uuid);
  perform pg_temp.ok('start after an overdue attempt opens attempt 2 (not a resume of the dead one)',
    r.attempt_number = 2 and r.resumed = false and r.status = 'in_progress');
end $$;
select pg_temp.as_owner();
select pg_temp.ok('the overdue attempt 1 was closed as expired',
  (select status = 'expired' from public.assessment_attempts
    where assessment_id = current_setting('app.exp')::uuid and user_id = '00000000-0000-0000-0000-0000000000a4' and attempt_number = 1));

-- retry of a click after the attempt expired: same attempt, no new row
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a5');
do $$
declare r public.attempt_info;
begin
  r := public.start_assessment_attempt(current_setting('app.exp')::uuid, '55555555-5555-5555-5555-555555555555');
  perform pg_temp.ok('retrying a start whose attempt has since expired returns that attempt as expired',
    r.attempt_number = 1 and r.status = 'expired' and r.resumed = true);
end $$;
select pg_temp.rows('...and created no extra attempt',
  format('select 1 from public.assessment_attempts where assessment_id = %L', current_setting('app.exp')), 1);

-- expire_overdue_attempts (owner / scheduler path)
select pg_temp.as_owner();
select pg_temp.ok('expire_overdue_attempts closes remaining overdue attempts and reports the count (S6)',
  public.expire_overdue_attempts() >= 1);
select pg_temp.ok('...and is then idempotent', public.expire_overdue_attempts() = 0);
select pg_temp.ok('no overdue in_progress attempts remain',
  not exists (select 1 from public.assessment_attempts where status = 'in_progress' and expires_at <= clock_timestamp()));

-- ===============================================================
-- Enrolment removed mid-attempt
-- ===============================================================
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a6');
do $$
declare r public.attempt_info;
begin
  r := public.start_assessment_attempt(current_setting('app.six')::uuid);
  perform set_config('app.s6_six', r.attempt_id::text, true);
end $$;
select pg_temp.as_owner();
delete from public.enrollments where user_id = '00000000-0000-0000-0000-0000000000a6' and course_id = current_setting('app.c1')::uuid;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a6');
select pg_temp.rows('un-enrolled student gets no open attempt from get_my_open_attempt',
  format('select * from public.get_my_open_attempt(%L)', current_setting('app.six')), 0);
select pg_temp.fails('un-enrolled student cannot start a new attempt (EA001)',
  format('select * from public.start_assessment_attempt(%L)', current_setting('app.unl')), array['EA001']);
select pg_temp.fails('...nor re-enter via start with the old key/resume (EA001)',
  format('select * from public.start_assessment_attempt(%L)', current_setting('app.six')), array['EA001']);

-- ===============================================================
-- Guard trigger and constraints (as the table owner: they hold for everyone)
-- ===============================================================
select pg_temp.as_owner();
select pg_temp.fails('even the owner cannot move expires_at',
  format($f$update public.assessment_attempts set expires_at = now() + interval '9 days' where id = %L$f$, current_setting('app.s3_lim1')), array['42501']);
select pg_temp.fails('even the owner cannot move started_at',
  format($f$update public.assessment_attempts set started_at = now() - interval '9 days' where id = %L$f$, current_setting('app.s3_lim1')), array['42501']);
select pg_temp.fails('even the owner cannot reassign an attempt to another user',
  format($f$update public.assessment_attempts set user_id = '00000000-0000-0000-0000-0000000000a2' where id = %L$f$, current_setting('app.s3_lim1')), array['42501']);
select pg_temp.fails('even the owner cannot change attempt_number',
  format($f$update public.assessment_attempts set attempt_number = 9 where id = %L$f$, current_setting('app.s3_lim1')), array['42501']);
select pg_temp.fails('even the owner cannot change the request key',
  format($f$update public.assessment_attempts set request_key = gen_random_uuid() where id = %L$f$, current_setting('app.s1_lim1')), array['42501']);
select pg_temp.fails('a submitted attempt is frozen (cannot be reopened)',
  format($f$update public.assessment_attempts set status = 'in_progress', submitted_at = null where id = %L$f$, current_setting('app.s1_lim1')), array['42501']);
select pg_temp.fails('an expired attempt is frozen (cannot be re-opened)',
  format($f$update public.assessment_attempts set status = 'in_progress', expired_at = null where assessment_id = %L and user_id = '00000000-0000-0000-0000-0000000000a1'$f$, current_setting('app.one')), array['42501']);

select pg_temp.fails('submitted status requires submitted_at (check constraint)',
  format($f$insert into public.assessment_attempts (assessment_id, user_id, attempt_number, status)
            values (%L, '00000000-0000-0000-0000-0000000000a2', 1, 'submitted')$f$, current_setting('app.free')), array['23514']);
select pg_temp.fails('expired status requires expired_at (check constraint)',
  format($f$insert into public.assessment_attempts (assessment_id, user_id, attempt_number, status)
            values (%L, '00000000-0000-0000-0000-0000000000a2', 1, 'expired')$f$, current_setting('app.free')), array['23514']);
select pg_temp.fails('deadline cannot precede the start (check constraint)',
  format($f$insert into public.assessment_attempts (assessment_id, user_id, attempt_number, started_at, expires_at)
            values (%L, '00000000-0000-0000-0000-0000000000a2', 1, now(), now() - interval '1 minute')$f$, current_setting('app.free')), array['23514']);
select pg_temp.fails('attempt_number must be >= 1',
  format($f$insert into public.assessment_attempts (assessment_id, user_id, attempt_number)
            values (%L, '00000000-0000-0000-0000-0000000000a2', 0)$f$, current_setting('app.free')), array['23514']);
select pg_temp.fails('only one open attempt per student per assessment (unique index)',
  format($f$insert into public.assessment_attempts (assessment_id, user_id, attempt_number)
            values (%L, '00000000-0000-0000-0000-0000000000a6', 2)$f$, current_setting('app.six')), array['23505']);
select pg_temp.fails('attempt numbers are unique per student per assessment',
  format($f$insert into public.assessment_attempts (assessment_id, user_id, attempt_number, status, submitted_at)
            values (%L, '00000000-0000-0000-0000-0000000000a6', 1, 'submitted', now())$f$, current_setting('app.six')), array['23505']);
select pg_temp.fails('a request key can create only one attempt per student (unique index)',
  format($f$insert into public.assessment_attempts (assessment_id, user_id, attempt_number, status, submitted_at, request_key)
            values (%L, '00000000-0000-0000-0000-0000000000a1', 7, 'submitted', now(), '11111111-1111-1111-1111-111111111111')$f$, current_setting('app.unl')), array['23505']);
insert into public.assessment_attempts (assessment_id, user_id, attempt_number, status, submitted_at, request_key)
values (current_setting('app.unl')::uuid, '00000000-0000-0000-0000-0000000000a3', 7, 'submitted', now(), '11111111-1111-1111-1111-111111111111');
select pg_temp.ok('the same request key is allowed for a different student', true);

-- ===============================================================
-- Assessment lifecycle rules
-- ===============================================================
select pg_temp.fails('an assessment with attempts cannot go back to draft (owner)',
  format($f$update public.assessments set status = 'draft' where id = %L$f$, current_setting('app.lim')), array['23514']);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.fails('an assessment with attempts cannot go back to draft (teacher)',
  format($f$update public.assessments set status = 'draft' where id = %L$f$, current_setting('app.lim')), array['23514']);
select pg_temp.affects('an attempt-free published assessment can still be unpublished by its teacher',
  format($f$update public.assessments set status = 'draft' where id = %L$f$, current_setting('app.free')), 1);
select pg_temp.as_owner();
select pg_temp.fails('an assessment with attempts cannot be deleted (RESTRICT)',
  format($f$delete from public.assessments where id = %L$f$, current_setting('app.lim')), array['23503']);

select pg_temp.as_owner();
rollback;
