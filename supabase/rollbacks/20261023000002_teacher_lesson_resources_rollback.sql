drop policy if exists "resources: teachers create own" on public.resources;
create policy "resources: teachers create own"
  on public.resources for insert to authenticated
  with check (
    public.is_teacher_or_admin()
    and created_by = (select auth.uid())
    and (is_published = false or public.is_admin())
  );

drop policy if exists "resources: teachers update own" on public.resources;
create policy "resources: teachers update own drafts"
  on public.resources for update to authenticated
  using (public.is_teacher_or_admin() and created_by = (select auth.uid()) and is_published = false)
  with check (created_by = (select auth.uid()) and is_published = false);

drop policy if exists "resources: teachers delete own" on public.resources;
create policy "resources: teachers delete own drafts"
  on public.resources for delete to authenticated
  using (public.is_teacher_or_admin() and created_by = (select auth.uid()) and is_published = false);
