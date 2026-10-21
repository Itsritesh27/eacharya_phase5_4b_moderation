-- RLS / privilege-escalation checks. NOT YET RUN against a live database.
-- Run in the Supabase SQL editor (or `psql`) AFTER applying both migrations and seed.sql.
-- Everything happens inside a transaction that is rolled back, so no data is kept.
-- Any failed check raises an exception; if the script finishes, all checks passed.

begin;

-- Two test users. The signup trigger must create 'student' profiles for both,
-- even though we try to smuggle a role in the metadata.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"User A","role":"admin"}'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{"full_name":"User B"}');

do $$
begin
  if (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000a1') <> 'student' then
    raise exception 'FAIL: signup honoured a role from metadata';
  end if;
  if (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000b2') <> 'student' then
    raise exception 'FAIL: new profile is not student by default';
  end if;
  raise notice 'PASS: new accounts default to student (metadata role ignored)';
end $$;

-- Act as user A (a plain student).
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- Student cannot read another user's profile.
  select count(*) into n from public.profiles where id = '00000000-0000-0000-0000-0000000000b2';
  if n <> 0 then raise exception 'FAIL: student can read another profile'; end if;
  raise notice 'PASS: student cannot read other profiles';

  -- Student can read own profile.
  select count(*) into n from public.profiles where id = '00000000-0000-0000-0000-0000000000a1';
  if n <> 1 then raise exception 'FAIL: student cannot read own profile'; end if;
  raise notice 'PASS: student can read own profile';
end $$;

-- Self-promotion must fail (no UPDATE privilege on the role column).
do $$
begin
  begin
    update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';
    raise exception 'FAIL: student updated own role';
  exception when insufficient_privilege then
    raise notice 'PASS: student cannot change own role';
  end;
end $$;

-- Student cannot use the admin role-change function.
do $$
begin
  begin
    perform public.admin_set_user_role('00000000-0000-0000-0000-0000000000b2', 'teacher');
    raise exception 'FAIL: student used admin_set_user_role';
  exception when insufficient_privilege then
    raise notice 'PASS: student cannot call admin_set_user_role';
  end;
end $$;

-- Student cannot create a course.
do $$
begin
  begin
    insert into public.courses (title, slug, class_id, subject_id, created_by)
    select 'x', 'rls-test-x', c.id, s.id, '00000000-0000-0000-0000-0000000000a1'
    from public.classes c, public.subjects s limit 1;
    raise exception 'FAIL: student created a course';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS: student cannot create courses';
  end;
end $$;

-- Anonymous visitors: published courses only.
reset role;
set local role anon;
do $$
declare n int;
begin
  select count(*) into n from public.courses where status <> 'published';
  if n <> 0 then raise exception 'FAIL: anon can see non-published courses'; end if;
  begin
    perform 1 from public.profiles limit 1;
    raise exception 'FAIL: anon can read profiles';
  exception when insufficient_privilege then
    raise notice 'PASS: anon cannot read profiles';
  end;
  raise notice 'PASS: anon sees published courses only';
end $$;

-- ===============================================================
-- Phase 2 checks (needs seed.sql so the sample course and lesson exist)
-- ===============================================================
reset role;

select
  set_config('app.course_id',
    (select id::text from public.courses where slug = 'sample-class-9-geography'), true),
  set_config('app.lesson_id',
    (select l.id::text from public.lessons l
       join public.units u on u.id = l.unit_id
       join public.courses c on c.id = u.course_id
      where c.slug = 'sample-class-9-geography'
      order by u.position, l.position limit 1), true);

do $$
begin
  if coalesce(current_setting('app.course_id', true), '') = ''
     or coalesce(current_setting('app.lesson_id', true), '') = '' then
    raise exception 'FAIL: seed.sql sample course/lesson not found; run the seed first';
  end if;
end $$;

-- ---- as User A (student) ----
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

do $$
declare n int;
begin
  -- Not enrolled yet: gated lesson content is hidden.
  select count(*) into n from public.lesson_content
   where lesson_id = current_setting('app.lesson_id')::uuid;
  if n <> 0 then raise exception 'FAIL: non-enrolled student can read lesson content'; end if;
  raise notice 'PASS: lesson content hidden until enrolled';

  -- Progress cannot be recorded without enrolment.
  begin
    insert into public.lesson_progress (user_id, lesson_id, status, completed_at)
    values ('00000000-0000-0000-0000-0000000000a1', current_setting('app.lesson_id')::uuid, 'completed', now());
    raise exception 'FAIL: progress recorded without enrolment';
  exception when insufficient_privilege then
    raise notice 'PASS: progress needs enrolment';
  end;

  -- Cannot enrol someone else.
  begin
    insert into public.enrollments (user_id, course_id)
    values ('00000000-0000-0000-0000-0000000000b2', current_setting('app.course_id')::uuid);
    raise exception 'FAIL: student enrolled another user';
  exception when insufficient_privilege then
    raise notice 'PASS: cannot enrol another user';
  end;

  -- Enrol self, then a duplicate must be rejected by the unique constraint.
  insert into public.enrollments (user_id, course_id)
  values ('00000000-0000-0000-0000-0000000000a1', current_setting('app.course_id')::uuid);
  begin
    insert into public.enrollments (user_id, course_id)
    values ('00000000-0000-0000-0000-0000000000a1', current_setting('app.course_id')::uuid);
    raise exception 'FAIL: duplicate enrolment allowed';
  exception when unique_violation then
    raise notice 'PASS: duplicate enrolment rejected';
  end;

  -- Enrolled: lesson content is now visible.
  select count(*) into n from public.lesson_content
   where lesson_id = current_setting('app.lesson_id')::uuid;
  if n <> 1 then raise exception 'FAIL: enrolled student cannot read lesson content'; end if;
  raise notice 'PASS: enrolled student can read lesson content';

  -- Own progress works; completion is idempotent at the row level (primary key).
  insert into public.lesson_progress (user_id, lesson_id, status, completed_at)
  values ('00000000-0000-0000-0000-0000000000a1', current_setting('app.lesson_id')::uuid, 'completed', now());
  begin
    insert into public.lesson_progress (user_id, lesson_id, status, completed_at)
    values ('00000000-0000-0000-0000-0000000000a1', current_setting('app.lesson_id')::uuid, 'completed', now());
    raise exception 'FAIL: duplicate progress row allowed';
  exception when unique_violation then
    raise notice 'PASS: one progress row per student per lesson';
  end;

  -- Cannot write progress as someone else (even when that user could be enrolled).
  begin
    insert into public.lesson_progress (user_id, lesson_id, status, completed_at)
    values ('00000000-0000-0000-0000-0000000000b2', current_setting('app.lesson_id')::uuid, 'completed', now());
    raise exception 'FAIL: wrote progress for another user';
  exception when insufficient_privilege then
    raise notice 'PASS: cannot write another user''s progress';
  end;

  -- Private note, and bookmark uniqueness.
  insert into public.lesson_notes (user_id, lesson_id, body)
  values ('00000000-0000-0000-0000-0000000000a1', current_setting('app.lesson_id')::uuid, 'A private note');

  insert into public.bookmarks (user_id, lesson_id)
  values ('00000000-0000-0000-0000-0000000000a1', current_setting('app.lesson_id')::uuid);
  begin
    insert into public.bookmarks (user_id, lesson_id)
    values ('00000000-0000-0000-0000-0000000000a1', current_setting('app.lesson_id')::uuid);
    raise exception 'FAIL: duplicate bookmark allowed';
  exception when unique_violation then
    raise notice 'PASS: duplicate bookmark rejected';
  end;
end $$;

-- ---- as User B (another student, NOT enrolled) ----
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);

do $$
declare n int;
begin
  select count(*) into n from public.lesson_notes;
  if n <> 0 then raise exception 'FAIL: student can read another student''s notes'; end if;
  select count(*) into n from public.lesson_progress;
  if n <> 0 then raise exception 'FAIL: student can read another student''s progress'; end if;
  select count(*) into n from public.bookmarks;
  if n <> 0 then raise exception 'FAIL: student can read another student''s bookmarks'; end if;
  select count(*) into n from public.enrollments;
  if n <> 0 then raise exception 'FAIL: student can read another student''s enrolments'; end if;
  raise notice 'PASS: notes, progress, bookmarks and enrolments are private per student';
end $$;

-- ---- anonymous visitors cannot touch learning tables or storage objects ----
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.enrollments limit 1;
    raise exception 'FAIL: anon can read enrollments';
  exception when insufficient_privilege then
    raise notice 'PASS: anon cannot read enrollments';
  end;
  begin
    perform 1 from public.resources limit 1;
    raise exception 'FAIL: anon can read resources';
  exception when insufficient_privilege then
    raise notice 'PASS: anon cannot read resources';
  end;
end $$;

reset role;

rollback;
