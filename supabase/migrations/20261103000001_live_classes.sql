-- eAcharya: live classes (LiveKit)
-- Tables: live_sessions, live_session_attendance
-- Access model:
--   * the teacher who created a session manages it and sees its attendance
--   * students see sessions of courses they are enrolled in
--   * admins can read everything
-- Video itself runs on LiveKit; this schema only schedules classes and records attendance.

create type public.live_session_status as enum ('scheduled', 'live', 'ended', 'cancelled');

-- ---------------------------------------------------------------
-- Helpers (SECURITY DEFINER avoids recursive RLS; fixed search_path)
-- ---------------------------------------------------------------
-- public.owns_course(uuid) already exists (phase 3 assessments) and is reused as is.

create or replace function public.is_enrolled_in_course(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.enrollments e
    join public.courses c on c.id = e.course_id
    where e.course_id = p_course
      and c.status = 'published'
      and e.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_enrolled_in_course(uuid) from public, anon;
grant execute on function public.is_enrolled_in_course(uuid) to authenticated;

-- ---------------------------------------------------------------
-- live_sessions
-- ---------------------------------------------------------------
create table public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 150),
  description text not null default '' check (char_length(description) <= 1000),
  starts_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 10 and 240),
  status public.live_session_status not null default 'scheduled',
  -- LiveKit room name. Random and unguessable; never shown to students directly.
  room_name text not null unique default ('eacharya-' || replace(gen_random_uuid()::text, '-', '')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index live_sessions_course_idx on public.live_sessions (course_id, starts_at);
create index live_sessions_creator_idx on public.live_sessions (created_by, starts_at desc);

create trigger live_sessions_set_updated_at
  before update on public.live_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- live_session_attendance: one row per student per session
-- ---------------------------------------------------------------
create table public.live_session_attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.live_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  first_joined_at timestamptz not null default now(),
  last_joined_at timestamptz not null default now(),
  last_left_at timestamptz,
  is_in_room boolean not null default true,
  join_count integer not null default 1,
  total_seconds integer not null default 0 check (total_seconds >= 0),
  unique (session_id, user_id)
);

create index live_attendance_user_idx on public.live_session_attendance (user_id);

-- ---------------------------------------------------------------
-- RLS + privileges
-- ---------------------------------------------------------------
alter table public.live_sessions enable row level security;
alter table public.live_session_attendance enable row level security;

revoke all on public.live_sessions, public.live_session_attendance from anon, authenticated;

grant select on public.live_sessions to authenticated;
grant insert (course_id, created_by, title, description, starts_at, duration_minutes)
  on public.live_sessions to authenticated;
grant update (title, description, starts_at, duration_minutes, status, started_at, ended_at)
  on public.live_sessions to authenticated;
grant delete on public.live_sessions to authenticated;

-- Attendance is written only through the SECURITY DEFINER functions below.
grant select on public.live_session_attendance to authenticated;

create policy "live_sessions: owner teacher reads"
  on public.live_sessions for select to authenticated
  using (created_by = (select auth.uid()));

create policy "live_sessions: enrolled students read"
  on public.live_sessions for select to authenticated
  using (public.is_enrolled_in_course(course_id));

create policy "live_sessions: admins read"
  on public.live_sessions for select to authenticated
  using (public.is_admin());

create policy "live_sessions: teacher creates for own course"
  on public.live_sessions for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.current_user_role() = 'teacher'
    and public.owns_course(course_id)
  );

create policy "live_sessions: owner updates"
  on public.live_sessions for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()) and public.owns_course(course_id));

create policy "live_sessions: owner deletes"
  on public.live_sessions for delete to authenticated
  using (created_by = (select auth.uid()));

create policy "live_attendance: student reads own"
  on public.live_session_attendance for select to authenticated
  using (user_id = (select auth.uid()));

create policy "live_attendance: admins read"
  on public.live_session_attendance for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------
-- join_live_session: called by the token route with the caller's own session.
-- Returns 'host' (the teacher who owns it), 'participant' (enrolled student) or null (no access).
-- Records attendance for participants. The time window is enforced by the app.
-- ---------------------------------------------------------------
create or replace function public.join_live_session(p_session uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.live_sessions;
begin
  if v_uid is null then return null; end if;
  select * into v_row from public.live_sessions where id = p_session;
  if not found or v_row.status in ('ended', 'cancelled') then return null; end if;

  if v_row.created_by = v_uid then return 'host'; end if;

  if not exists (
    select 1 from public.enrollments e
    join public.courses c on c.id = e.course_id
    where e.user_id = v_uid and e.course_id = v_row.course_id and c.status = 'published'
  ) then
    return null;
  end if;

  insert into public.live_session_attendance (session_id, user_id)
  values (p_session, v_uid)
  on conflict (session_id, user_id) do update
    set last_joined_at = case when public.live_session_attendance.is_in_room
                              then public.live_session_attendance.last_joined_at else now() end,
        join_count = case when public.live_session_attendance.is_in_room
                          then public.live_session_attendance.join_count
                          else public.live_session_attendance.join_count + 1 end,
        is_in_room = true;
  return 'participant';
end;
$$;

-- ---------------------------------------------------------------
-- apply_live_attendance: internal. Closes an open stay and adds its length to total_seconds.
-- ---------------------------------------------------------------
create or replace function public.apply_live_attendance(p_session uuid, p_user uuid, p_event text, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_event = 'join' then
    update public.live_session_attendance
      set last_joined_at = case when is_in_room then last_joined_at else p_at end,
          join_count = case when is_in_room then join_count else join_count + 1 end,
          is_in_room = true
      where session_id = p_session and user_id = p_user;
  elsif p_event = 'leave' then
    update public.live_session_attendance
      set total_seconds = total_seconds + greatest(0, extract(epoch from (p_at - last_joined_at))::int),
          last_left_at = p_at,
          is_in_room = false
      where session_id = p_session and user_id = p_user and is_in_room;
  end if;
end;
$$;

revoke all on function public.apply_live_attendance(uuid, uuid, text, timestamptz) from public, anon, authenticated;

-- leave_live_session: the student's own browser reports that they left (fallback when webhooks are off).
create or replace function public.leave_live_session(p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then return; end if;
  perform public.apply_live_attendance(p_session, (select auth.uid()), 'leave', now());
end;
$$;

revoke all on function public.join_live_session(uuid) from public, anon;
revoke all on function public.leave_live_session(uuid) from public, anon;
grant execute on function public.join_live_session(uuid) to authenticated;
grant execute on function public.leave_live_session(uuid) to authenticated;

-- ---------------------------------------------------------------
-- LiveKit webhook entry point. Only the service role (used by the verified webhook route) may call it.
-- ---------------------------------------------------------------
create or replace function public.live_webhook_event(p_room text, p_user uuid, p_event text, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.live_sessions;
begin
  select * into v_row from public.live_sessions where room_name = p_room;
  if not found then return; end if;

  if p_event = 'room_finished' then
    update public.live_session_attendance
      set total_seconds = total_seconds + greatest(0, extract(epoch from (p_at - last_joined_at))::int),
          last_left_at = p_at, is_in_room = false
      where session_id = v_row.id and is_in_room;
    return;
  end if;

  if p_user is null or p_user = v_row.created_by then return; end if;
  perform public.apply_live_attendance(v_row.id, p_user, p_event, p_at);
end;
$$;

revoke all on function public.live_webhook_event(text, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.live_webhook_event(text, uuid, text, timestamptz) to service_role;

-- ---------------------------------------------------------------
-- Teacher actions on their own session
-- ---------------------------------------------------------------
-- Close every open stay when the teacher ends the class.
create or replace function public.end_live_session(p_session uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  update public.live_sessions
    set status = 'ended', ended_at = now(), started_at = coalesce(started_at, now())
    where id = p_session and created_by = v_uid and status in ('scheduled', 'live');
  if not found then return false; end if;

  update public.live_session_attendance
    set total_seconds = total_seconds + greatest(0, extract(epoch from (now() - last_joined_at))::int),
        last_left_at = now(), is_in_room = false
    where session_id = p_session and is_in_room;
  return true;
end;
$$;

-- Attendance report with names (teachers cannot read student profiles directly).
create or replace function public.get_live_session_attendance(p_session uuid)
returns table (
  user_id uuid, full_name text, first_joined_at timestamptz, last_left_at timestamptz,
  join_count integer, total_seconds integer, is_in_room boolean, is_enrolled boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.user_id, p.full_name, a.first_joined_at, a.last_left_at,
         coalesce(a.join_count, 0), coalesce(a.total_seconds, 0), coalesce(a.is_in_room, false), true
  from public.live_sessions s
  join public.enrollments e on e.course_id = s.course_id
  join public.profiles p on p.id = e.user_id
  left join public.live_session_attendance a on a.session_id = s.id and a.user_id = e.user_id
  where s.id = p_session
    and (s.created_by = (select auth.uid()) or public.is_admin())
  order by (a.id is null), p.full_name;
$$;

revoke all on function public.end_live_session(uuid) from public, anon;
revoke all on function public.get_live_session_attendance(uuid) from public, anon;
grant execute on function public.end_live_session(uuid) to authenticated;
grant execute on function public.get_live_session_attendance(uuid) to authenticated;
