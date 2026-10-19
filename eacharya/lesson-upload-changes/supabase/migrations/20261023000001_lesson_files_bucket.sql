-- Lets teachers upload lesson videos / downloadable video files straight from the dashboard.
-- Public-read bucket (the files are served to students through plain https URLs, which is what
-- lesson_content.video_url / video_sources and the /api/lessons/:id/download route expect).
-- Only teachers/admins can write, and only inside their own <uid>/ folder.
-- NOTE: Supabase also has a project-wide upload cap (Dashboard > Storage > Settings > "Upload file
-- size limit"; 50 MB on the free plan). The effective limit is the smaller of the two.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lesson-videos',
  'lesson-videos',
  true,
  524288000, -- 500 MB
  array['video/mp4', 'video/webm', 'video/ogg']
)
on conflict (id) do nothing;

create policy "lesson-videos: staff read own folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'lesson-videos'
    and (
      public.is_admin()
      or (public.is_teacher_or_admin() and (storage.foldername(name))[1] = (select auth.uid())::text)
    )
  );

create policy "lesson-videos: staff upload to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'lesson-videos'
    and public.is_teacher_or_admin()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "lesson-videos: staff update own folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'lesson-videos'
    and public.is_teacher_or_admin()
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "lesson-videos: staff delete own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'lesson-videos'
    and (
      public.is_admin()
      or (public.is_teacher_or_admin() and (storage.foldername(name))[1] = (select auth.uid())::text)
    )
  );
