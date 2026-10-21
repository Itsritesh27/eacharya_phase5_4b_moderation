-- Live classes RLS / function checks. Run after ALL migrations (incl. 20261103000001_live_classes.sql) and seed.sql.
-- Everything happens in a transaction that is rolled back. Any failed check raises an exception;
-- if the script finishes, all checks passed.

begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't1@test.local', '{"full_name":"Teacher One"}'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't2@test.local', '{"full_name":"Teacher Two"}'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's1@test.local', '{"full_name":"Student Enrolled"}'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 's2@test.local', '{"full_name":"Student Outsider"}');

-- Superuser (auth.uid() is null) may promote.
update public.profiles set role = 'teacher' where id in
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2');

insert into public.courses (id, title, slug, class_id, subject_id, status, created_by)
select '00000000-0000-0000-0000-0000000000e1', 'Live Test Course', 'live-test-course',
       (select id from public.classes limit 1), (select id from public.subjects limit 1),
       'published', '00000000-0000-0000-0000-0000000000c1';

insert into public.enrollments (user_id, course_id)
values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1');

-- ---------------- Teacher 2 (not the course owner) ----------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);

do $$
begin
  begin
    insert into public.live_sessions (course_id, created_by, title, starts_at, duration_minutes)
    values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c2', 'Hijack', now() + interval '1 day', 45);
    raise exception 'FAIL: a teacher scheduled a class on someone else''s course';
  exception when insufficient_privilege then
    raise notice 'PASS: teacher cannot schedule on a course they do not own';
  end;
end $$;

-- ---------------- Student cannot schedule ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
do $$
begin
  begin
    insert into public.live_sessions (course_id, created_by, title, starts_at, duration_minutes)
    values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', 'Student class', now() + interval '1 day', 45);
    raise exception 'FAIL: a student scheduled a class';
  exception when insufficient_privilege then
    raise notice 'PASS: student cannot schedule a class';
  end;
end $$;

-- ---------------- Teacher 1 schedules ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
begin
  insert into public.live_sessions (course_id, created_by, title, starts_at, duration_minutes)
  values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1',
          'Rivers of India', now() + interval '1 hour', 45);
  raise notice 'PASS: owner teacher schedules a class';
end $$;

-- Give the new row a fixed id (superuser only) so the remaining checks can refer to it.
reset role;
update public.live_sessions set id = '00000000-0000-0000-0000-0000000000f1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);

do $$
begin
  if public.join_live_session('00000000-0000-0000-0000-0000000000f1') <> 'host' then
    raise exception 'FAIL: owner is not host';
  end if;
  raise notice 'PASS: owner joins as host';
end $$;

-- ---------------- Visibility ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
do $$
declare n int;
begin
  if (select count(*) from public.live_sessions) <> 1 then raise exception 'FAIL: enrolled student cannot see the class'; end if;
  raise notice 'PASS: enrolled student sees the class';
  if public.join_live_session('00000000-0000-0000-0000-0000000000f1') is distinct from 'participant' then
    raise exception 'FAIL: enrolled student could not join';
  end if;
  if (select count(*) from public.live_session_attendance) <> 1 then raise exception 'FAIL: attendance not recorded on join'; end if;
  raise notice 'PASS: enrolled student joins and is recorded';
  begin
    insert into public.live_session_attendance (session_id, user_id) values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1');
    raise exception 'FAIL: student wrote attendance directly';
  exception when insufficient_privilege then
    raise notice 'PASS: students cannot write attendance directly';
  end;
  update public.live_sessions set status = 'ended';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: student updated a class'; end if;
  raise notice 'PASS: students cannot update a class (0 rows)';
  if (select count(*) from public.get_live_session_attendance('00000000-0000-0000-0000-0000000000f1')) <> 0 then
    raise exception 'FAIL: student read the attendance report';
  end if;
  raise notice 'PASS: students get no attendance report';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.live_sessions) <> 0 then raise exception 'FAIL: outsider sees the class'; end if;
  if public.join_live_session('00000000-0000-0000-0000-0000000000f1') is not null then raise exception 'FAIL: outsider joined'; end if;
  raise notice 'PASS: non-enrolled student cannot see or join';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.live_sessions) <> 0 then raise exception 'FAIL: other teacher sees the class'; end if;
  if public.join_live_session('00000000-0000-0000-0000-0000000000f1') is not null then raise exception 'FAIL: other teacher joined'; end if;
  if (select count(*) from public.get_live_session_attendance('00000000-0000-0000-0000-0000000000f1')) <> 0 then raise exception 'FAIL: other teacher read attendance'; end if;
  if public.end_live_session('00000000-0000-0000-0000-0000000000f1') then raise exception 'FAIL: other teacher ended the class'; end if;
  begin
    perform public.live_webhook_event('x', null, 'room_finished', now());
    raise exception 'FAIL: webhook function callable by authenticated';
  exception when insufficient_privilege then
    raise notice 'PASS: webhook function is not callable by users';
  end;
  raise notice 'PASS: another teacher cannot see, join, read attendance or end the class';
end $$;

-- ---------------- Webhook (service role) ----------------
reset role;
do $$
declare v_room text; v_before int;
begin
  select room_name into v_room from public.live_sessions where id = '00000000-0000-0000-0000-0000000000f1';
  -- student leaves 90 seconds after the join the app recorded
  update public.live_session_attendance set last_joined_at = now() - interval '90 seconds';
  perform public.live_webhook_event(v_room, '00000000-0000-0000-0000-0000000000d1', 'leave', now());
  if (select total_seconds from public.live_session_attendance) not between 89 and 92 then raise exception 'FAIL: leave did not add the stay'; end if;
  if (select is_in_room from public.live_session_attendance) then raise exception 'FAIL: still in room after leave'; end if;
  -- duplicate leave must not double count
  v_before := (select total_seconds from public.live_session_attendance);
  perform public.live_webhook_event(v_room, '00000000-0000-0000-0000-0000000000d1', 'leave', now() + interval '1 minute');
  if (select total_seconds from public.live_session_attendance) <> v_before then raise exception 'FAIL: duplicate leave double counted'; end if;
  -- rejoin
  perform public.live_webhook_event(v_room, '00000000-0000-0000-0000-0000000000d1', 'join', now());
  if (select join_count from public.live_session_attendance) <> 2 or not (select is_in_room from public.live_session_attendance) then
    raise exception 'FAIL: rejoin not recorded';
  end if;
  -- the host is never recorded as attendance
  perform public.live_webhook_event(v_room, '00000000-0000-0000-0000-0000000000c1', 'join', now());
  if (select count(*) from public.live_session_attendance) <> 1 then raise exception 'FAIL: host recorded as attendee'; end if;
  raise notice 'PASS: webhook join/leave accounting (no double counting, host ignored)';
end $$;

-- ---------------- End class ----------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$
begin
  if (select count(*) from public.get_live_session_attendance('00000000-0000-0000-0000-0000000000f1') where is_in_room) <> 1 then
    raise exception 'FAIL: owner report does not show the student in class';
  end if;
  if not public.end_live_session('00000000-0000-0000-0000-0000000000f1') then raise exception 'FAIL: owner could not end class'; end if;
  if (select count(*) from public.get_live_session_attendance('00000000-0000-0000-0000-0000000000f1') where is_in_room) <> 0 then
    raise exception 'FAIL: ending the class did not close open attendance';
  end if;
  raise notice 'PASS: owner reads attendance and ending the class closes open stays';
end $$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
do $$
begin
  if public.join_live_session('00000000-0000-0000-0000-0000000000f1') is not null then raise exception 'FAIL: joined an ended class'; end if;
  raise notice 'PASS: cannot join an ended class';
end $$;

rollback;
