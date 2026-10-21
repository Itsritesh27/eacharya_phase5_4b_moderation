-- eAcharya Phase 1: profile provisioning, role protection, helper functions, RLS

-- ---------------------------------------------------------------
-- Profile provisioning on signup
-- The role is ALWAYS 'student'. Nothing from raw_user_meta_data is used
-- for the role, so a browser-supplied role can never be honoured.
-- ---------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120),
    'student'
  );
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------
-- Role helper functions (SECURITY DEFINER avoids recursive RLS on profiles)
-- ---------------------------------------------------------------
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;

create or replace function public.is_teacher_or_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() in ('teacher', 'admin'), false);
$$;

revoke all on function public.current_user_role() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.is_teacher_or_admin() from public, anon;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_teacher_or_admin() to authenticated;

-- ---------------------------------------------------------------
-- Role-change guard (defence in depth on top of RLS).
-- Only an existing admin session, or a trusted backend role (service_role /
-- postgres, i.e. auth.uid() is null), may change profiles.role or id.
-- ---------------------------------------------------------------
create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'profiles.id is immutable';
  end if;

  if new.role is distinct from old.role then
    if (select auth.uid()) is not null and not public.is_admin() then
      raise exception 'Only administrators may change a user role'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_protect_privileged_columns
  before update on public.profiles
  for each row execute function public.protect_profile_privileged_columns();

-- Block self-service inserts that set a privileged role (profiles are created
-- only by the signup trigger, but this keeps the guarantee even if an insert
-- policy is added later).
create or replace function public.protect_profile_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role <> 'student' and (select auth.uid()) is not null and not public.is_admin() then
    raise exception 'Only administrators may create privileged profiles'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_insert
  before insert on public.profiles
  for each row execute function public.protect_profile_insert();

-- ---------------------------------------------------------------
-- Admin-only role change. The `role` column is deliberately NOT grantable to
-- the `authenticated` role, so the only way to change a role from the app is
-- this function, which verifies the caller is an admin (from the database,
-- not from the request) and refuses self-changes to avoid lock-out.
-- ---------------------------------------------------------------
create or replace function public.admin_set_user_role(target_user uuid, new_role public.user_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only administrators may change a user role' using errcode = '42501';
  end if;
  if target_user = (select auth.uid()) then
    raise exception 'You cannot change your own role' using errcode = '42501';
  end if;
  update public.profiles set role = new_role where id = target_user;
end;
$$;

revoke all on function public.admin_set_user_role(uuid, public.user_role) from public, anon;
grant execute on function public.admin_set_user_role(uuid, public.user_role) to authenticated;

-- ---------------------------------------------------------------
-- Enable RLS on every application table
-- ---------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.subjects enable row level security;
alter table public.courses enable row level security;
alter table public.units enable row level security;
alter table public.lessons enable row level security;

-- ---------------------------------------------------------------
-- Table privileges: least privilege, RLS decides the rows
-- ---------------------------------------------------------------
revoke all on public.profiles, public.classes, public.subjects,
  public.courses, public.units, public.lessons from anon, authenticated;

grant select on public.classes, public.subjects, public.courses,
  public.units, public.lessons to anon, authenticated;

grant select on public.profiles to authenticated;
-- Users may edit only their own display fields; role is NOT grantable.
grant update (full_name, avatar_url) on public.profiles to authenticated;

grant insert, update, delete on public.classes, public.subjects,
  public.courses, public.units, public.lessons to authenticated;

-- ---------------------------------------------------------------
-- profiles policies
-- ---------------------------------------------------------------
create policy "profiles: read own"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy "profiles: admins read all"
  on public.profiles for select to authenticated
  using (public.is_admin());

create policy "profiles: update own display fields"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "profiles: admins update any"
  on public.profiles for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- No INSERT or DELETE policies: profiles are created by the signup trigger
-- and removed via cascade from auth.users.

-- ---------------------------------------------------------------
-- classes / subjects: public read of active rows, admin write
-- ---------------------------------------------------------------
create policy "classes: public read active"
  on public.classes for select to anon, authenticated
  using (is_active or public.is_admin());

create policy "classes: admins manage"
  on public.classes for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "subjects: public read active"
  on public.subjects for select to anon, authenticated
  using (is_active or public.is_admin());

create policy "subjects: admins manage"
  on public.subjects for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------
-- courses
-- ---------------------------------------------------------------
create policy "courses: public read published"
  on public.courses for select to anon, authenticated
  using (status = 'published');

create policy "courses: teachers read own drafts"
  on public.courses for select to authenticated
  using (created_by = (select auth.uid()) and public.is_teacher_or_admin());

create policy "courses: admins read all"
  on public.courses for select to authenticated
  using (public.is_admin());

create policy "courses: teachers create own drafts"
  on public.courses for insert to authenticated
  with check (
    public.is_teacher_or_admin()
    and created_by = (select auth.uid())
    and (status = 'draft' or public.is_admin())
  );

create policy "courses: teachers update own drafts"
  on public.courses for update to authenticated
  using (
    public.is_teacher_or_admin()
    and created_by = (select auth.uid())
    and status = 'draft'
  )
  with check (
    created_by = (select auth.uid())
    and status = 'draft'
  );

-- Publishing (status -> 'published') requires admin.
create policy "courses: admins manage"
  on public.courses for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "courses: teachers delete own drafts"
  on public.courses for delete to authenticated
  using (
    public.is_teacher_or_admin()
    and created_by = (select auth.uid())
    and status = 'draft'
  );

-- ---------------------------------------------------------------
-- units: visible when the parent course is visible
-- ---------------------------------------------------------------
create policy "units: read when course visible"
  on public.units for select to anon, authenticated
  using (
    exists (
      select 1 from public.courses c
      where c.id = units.course_id
    )
  );

create policy "units: teachers manage in own drafts"
  on public.units for all to authenticated
  using (
    public.is_teacher_or_admin()
    and exists (
      select 1 from public.courses c
      where c.id = units.course_id
        and c.created_by = (select auth.uid())
        and c.status = 'draft'
    )
  )
  with check (
    public.is_teacher_or_admin()
    and exists (
      select 1 from public.courses c
      where c.id = units.course_id
        and c.created_by = (select auth.uid())
        and c.status = 'draft'
    )
  );

create policy "units: admins manage"
  on public.units for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------
-- lessons: public sees published lessons of published courses
-- ---------------------------------------------------------------
create policy "lessons: public read published"
  on public.lessons for select to anon, authenticated
  using (
    is_published
    and exists (
      select 1 from public.units u
      join public.courses c on c.id = u.course_id
      where u.id = lessons.unit_id and c.status = 'published'
    )
  );

create policy "lessons: teachers read own drafts"
  on public.lessons for select to authenticated
  using (
    public.is_teacher_or_admin()
    and exists (
      select 1 from public.units u
      join public.courses c on c.id = u.course_id
      where u.id = lessons.unit_id
        and c.created_by = (select auth.uid())
    )
  );

create policy "lessons: teachers manage in own drafts"
  on public.lessons for all to authenticated
  using (
    public.is_teacher_or_admin()
    and exists (
      select 1 from public.units u
      join public.courses c on c.id = u.course_id
      where u.id = lessons.unit_id
        and c.created_by = (select auth.uid())
        and c.status = 'draft'
    )
  )
  with check (
    public.is_teacher_or_admin()
    and exists (
      select 1 from public.units u
      join public.courses c on c.id = u.course_id
      where u.id = lessons.unit_id
        and c.created_by = (select auth.uid())
        and c.status = 'draft'
    )
  );

create policy "lessons: admins manage"
  on public.lessons for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
