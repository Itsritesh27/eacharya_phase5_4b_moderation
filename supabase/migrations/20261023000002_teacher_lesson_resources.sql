-- Teachers can attach study materials (PDF, slides, images) to their own lessons and have them
-- visible to students straight away, without an admin publishing each file.
-- Scope is limited to courses the teacher created; files still live in the private "resources"
-- bucket under the teacher's own <uid>/ folder, and students read them via short-lived signed URLs.

drop policy if exists "resources: teachers create own" on public.resources;
create policy "resources: teachers create own"
  on public.resources for insert to authenticated
  with check (
    public.is_teacher_or_admin()
    and created_by = (select auth.uid())
    and (
      is_published = false
      or public.is_admin()
      or (
        course_id is not null
        and exists (
          select 1 from public.courses c
          where c.id = resources.course_id and c.created_by = (select auth.uid())
        )
        and (
          unit_id is null
          or exists (
            select 1 from public.units u
            where u.id = resources.unit_id and u.course_id = resources.course_id
          )
        )
        and (
          lesson_id is null
          or exists (
            select 1 from public.lessons l
            join public.units u on u.id = l.unit_id
            where l.id = resources.lesson_id and u.course_id = resources.course_id
          )
        )
      )
    )
  );

drop policy if exists "resources: teachers update own drafts" on public.resources;
create policy "resources: teachers update own"
  on public.resources for update to authenticated
  using (public.is_teacher_or_admin() and created_by = (select auth.uid()))
  with check (
    created_by = (select auth.uid())
    and (
      is_published = false
      or exists (
        select 1 from public.courses c
        where c.id = resources.course_id and c.created_by = (select auth.uid())
      )
    )
  );

drop policy if exists "resources: teachers delete own drafts" on public.resources;
create policy "resources: teachers delete own"
  on public.resources for delete to authenticated
  using (public.is_teacher_or_admin() and created_by = (select auth.uid()));
