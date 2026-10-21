-- eAcharya Phase 2: student learning experience
-- New tables: lesson_content, enrollments, lesson_progress, lesson_notes, resources, bookmarks
-- Plus: private storage bucket "resources" and its policies.

create type public.progress_status as enum ('in_progress', 'completed');
create type public.resource_type as enum ('pdf', 'notes', 'presentation', 'image', 'link');

-- ---------------------------------------------------------------
-- Enrolment helper. SECURITY DEFINER so it can read enrollments without
-- recursive RLS; fixed search_path. Only true for a PUBLISHED lesson in a
-- PUBLISHED course that the caller is enrolled in.
-- ---------------------------------------------------------------
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, course_id)
);
create index enrollments_course_id_idx on public.enrollments (course_id);

create or replace function public.is_enrolled_in_lesson(p_lesson uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lessons l
    join public.units u on u.id = l.unit_id
    join public.courses c on c.id = u.course_id
    join public.enrollments e on e.course_id = c.id
    where l.id = p_lesson
      and l.is_published
      and c.status = 'published'
      and e.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_enrolled_in_lesson(uuid) from public, anon;
grant execute on function public.is_enrolled_in_lesson(uuid) to authenticated;

-- Does the caller (teacher) own the course that contains this lesson?
create or replace function public.owns_lesson_course(p_lesson uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.lessons l
    join public.units u on u.id = l.unit_id
    join public.courses c on c.id = u.course_id
    where l.id = p_lesson
      and c.created_by = (select auth.uid())
  );
$$;

revoke all on function public.owns_lesson_course(uuid) from public, anon;
grant execute on function public.owns_lesson_course(uuid) to authenticated;

-- ---------------------------------------------------------------
-- lesson_content: gated lesson material (video, objectives, transcript).
-- Kept apart from `lessons` (which is public curriculum outline) so that
-- content is visible only to enrolled students, the owning teacher and admins.
-- ---------------------------------------------------------------
create table public.lesson_content (
  lesson_id uuid primary key references public.lessons (id) on delete cascade,
  video_url text check (
    video_url is null
    or (char_length(video_url) <= 500 and video_url ~* '^https://')
  ),
  objectives text[] not null default '{}',
  transcript text check (transcript is null or char_length(transcript) <= 100000),
  duration_minutes integer check (duration_minutes is null or duration_minutes between 0 and 600),
  updated_at timestamptz not null default now()
);

create trigger lesson_content_set_updated_at
  before update on public.lesson_content
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- lesson_progress: one row per student per lesson
-- ---------------------------------------------------------------
create table public.lesson_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  status public.progress_status not null default 'in_progress',
  position_seconds integer not null default 0
    check (position_seconds >= 0 and position_seconds <= 86400),
  completed_at timestamptz,
  last_accessed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id),
  check ((status = 'completed') = (completed_at is not null))
);
create index lesson_progress_lesson_id_idx on public.lesson_progress (lesson_id);
create index lesson_progress_recent_idx on public.lesson_progress (user_id, last_accessed_at desc);

create trigger lesson_progress_set_updated_at
  before update on public.lesson_progress
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- lesson_notes: private per-student notes
-- ---------------------------------------------------------------
create table public.lesson_notes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  body text not null check (char_length(body) <= 5000),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create trigger lesson_notes_set_updated_at
  before update on public.lesson_notes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- resources (e-Content)
-- ---------------------------------------------------------------
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  resource_type public.resource_type not null,
  course_id uuid references public.courses (id) on delete cascade,
  unit_id uuid references public.units (id) on delete cascade,
  lesson_id uuid references public.lessons (id) on delete cascade,
  topic text check (topic is null or char_length(topic) <= 80),
  external_url text check (
    external_url is null
    or (char_length(external_url) <= 1000 and external_url ~* '^https?://')
  ),
  -- Path inside the private "resources" storage bucket, e.g. '<teacher-uuid>/notes.pdf'
  storage_path text check (
    storage_path is null
    or (char_length(storage_path) <= 500 and storage_path !~ '\.\.' and storage_path !~ '^/')
  ),
  body text check (body is null or char_length(body) <= 100000),
  thumbnail_url text check (
    thumbnail_url is null
    or (char_length(thumbnail_url) <= 1000 and thumbnail_url ~* '^https://')
  ),
  is_published boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resources_content_matches_type check (
    (resource_type = 'link' and external_url is not null)
    or (resource_type = 'notes' and body is not null)
    or (resource_type in ('pdf', 'presentation', 'image') and storage_path is not null)
  ),
  constraint resources_scope_has_course check (
    (unit_id is null and lesson_id is null) or course_id is not null
  )
);

create index resources_course_id_idx on public.resources (course_id);
create index resources_unit_id_idx on public.resources (unit_id);
create index resources_lesson_id_idx on public.resources (lesson_id);
create index resources_type_idx on public.resources (resource_type);
create index resources_published_created_idx on public.resources (is_published, created_at desc);
create index resources_created_by_idx on public.resources (created_by);

create trigger resources_set_updated_at
  before update on public.resources
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- bookmarks: a student bookmarks either a lesson or a resource
-- ---------------------------------------------------------------
create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id uuid references public.lessons (id) on delete cascade,
  resource_id uuid references public.resources (id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((lesson_id is not null) <> (resource_id is not null))
);
create unique index bookmarks_user_lesson_uniq on public.bookmarks (user_id, lesson_id)
  where lesson_id is not null;
create unique index bookmarks_user_resource_uniq on public.bookmarks (user_id, resource_id)
  where resource_id is not null;
create index bookmarks_user_created_idx on public.bookmarks (user_id, created_at desc);

-- ---------------------------------------------------------------
-- RLS + privileges
-- ---------------------------------------------------------------
alter table public.enrollments enable row level security;
alter table public.lesson_content enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.lesson_notes enable row level security;
alter table public.resources enable row level security;
alter table public.bookmarks enable row level security;

revoke all on public.enrollments, public.lesson_content, public.lesson_progress,
  public.lesson_notes, public.resources, public.bookmarks from anon, authenticated;

grant select, delete on public.enrollments to authenticated;
grant insert (user_id, course_id) on public.enrollments to authenticated;

grant select, insert, update, delete on public.lesson_content to authenticated;

grant select on public.lesson_progress to authenticated;
grant insert (user_id, lesson_id, status, position_seconds, completed_at, last_accessed_at)
  on public.lesson_progress to authenticated;
grant update (status, position_seconds, completed_at, last_accessed_at)
  on public.lesson_progress to authenticated;

grant select, delete on public.lesson_notes to authenticated;
grant insert (user_id, lesson_id, body) on public.lesson_notes to authenticated;
grant update (body) on public.lesson_notes to authenticated;

grant select, insert, update, delete on public.resources to authenticated;

grant select, delete on public.bookmarks to authenticated;
grant insert (user_id, lesson_id, resource_id) on public.bookmarks to authenticated;

-- enrollments
create policy "enrollments: read own"
  on public.enrollments for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "enrollments: admins read all"
  on public.enrollments for select to authenticated
  using (public.is_admin());

create policy "enrollments: enrol self in published course"
  on public.enrollments for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.courses c
      where c.id = enrollments.course_id and c.status = 'published'
    )
  );

create policy "enrollments: leave own"
  on public.enrollments for delete to authenticated
  using ((select auth.uid()) = user_id);

-- lesson_content
create policy "lesson_content: enrolled students read"
  on public.lesson_content for select to authenticated
  using (public.is_enrolled_in_lesson(lesson_id));

create policy "lesson_content: owner teachers manage"
  on public.lesson_content for all to authenticated
  using (public.is_teacher_or_admin() and public.owns_lesson_course(lesson_id))
  with check (public.is_teacher_or_admin() and public.owns_lesson_course(lesson_id));

create policy "lesson_content: admins manage"
  on public.lesson_content for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- lesson_progress
create policy "lesson_progress: read own"
  on public.lesson_progress for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "lesson_progress: insert own when enrolled"
  on public.lesson_progress for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.is_enrolled_in_lesson(lesson_id)
  );

create policy "lesson_progress: update own when enrolled"
  on public.lesson_progress for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and public.is_enrolled_in_lesson(lesson_id)
  );

-- lesson_notes (private: nobody but the author, not even admins, via the API)
create policy "lesson_notes: read own"
  on public.lesson_notes for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "lesson_notes: insert own when enrolled"
  on public.lesson_notes for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and public.is_enrolled_in_lesson(lesson_id)
  );

create policy "lesson_notes: update own"
  on public.lesson_notes for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "lesson_notes: delete own"
  on public.lesson_notes for delete to authenticated
  using ((select auth.uid()) = user_id);

-- resources: signed-in users see published resources; staff manage
create policy "resources: read published"
  on public.resources for select to authenticated
  using (
    is_published
    and (
      course_id is null
      or exists (
        select 1 from public.courses c
        where c.id = resources.course_id and c.status = 'published'
      )
    )
  );

create policy "resources: teachers read own"
  on public.resources for select to authenticated
  using (created_by = (select auth.uid()) and public.is_teacher_or_admin());

create policy "resources: teachers create own"
  on public.resources for insert to authenticated
  with check (
    public.is_teacher_or_admin()
    and created_by = (select auth.uid())
    and (is_published = false or public.is_admin())
  );

create policy "resources: teachers update own drafts"
  on public.resources for update to authenticated
  using (
    public.is_teacher_or_admin()
    and created_by = (select auth.uid())
    and is_published = false
  )
  with check (
    created_by = (select auth.uid())
    and is_published = false
  );

create policy "resources: teachers delete own drafts"
  on public.resources for delete to authenticated
  using (
    public.is_teacher_or_admin()
    and created_by = (select auth.uid())
    and is_published = false
  );

create policy "resources: admins manage"
  on public.resources for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- bookmarks
create policy "bookmarks: read own"
  on public.bookmarks for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "bookmarks: add own visible target"
  on public.bookmarks for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      (lesson_id is not null
        and exists (select 1 from public.lessons l where l.id = bookmarks.lesson_id))
      or (resource_id is not null
        and exists (select 1 from public.resources r where r.id = bookmarks.resource_id))
    )
  );

create policy "bookmarks: delete own"
  on public.bookmarks for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------
-- Storage: private "resources" bucket
-- Files live at <uploader-uuid>/<file>. Students never get direct access;
-- the app creates short-lived signed URLs using the student's own session,
-- which only works for files attached to a published resource (policy below).
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resources',
  'resources',
  false,
  26214400, -- 25 MB
  array[
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
on conflict (id) do nothing;

create policy "resources bucket: read files of published resources"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'resources'
    and exists (
      select 1 from public.resources r
      where r.storage_path = storage.objects.name
        and r.is_published
    )
  );

create policy "resources bucket: staff read own folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'resources'
    and (
      public.is_admin()
      or (public.is_teacher_or_admin() and (storage.foldername(name))[1] = (select auth.uid())::text)
    )
  );

create policy "resources bucket: staff upload to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'resources'
    and public.is_teacher_or_admin()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "resources bucket: staff update own folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'resources'
    and public.is_teacher_or_admin()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "resources bucket: staff delete own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'resources'
    and (
      public.is_admin()
      or (public.is_teacher_or_admin() and (storage.foldername(name))[1] = (select auth.uid())::text)
    )
  );
