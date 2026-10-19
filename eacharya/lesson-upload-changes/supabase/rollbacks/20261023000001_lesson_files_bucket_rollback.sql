drop policy if exists "lesson-videos: staff read own folder" on storage.objects;
drop policy if exists "lesson-videos: staff upload to own folder" on storage.objects;
drop policy if exists "lesson-videos: staff update own folder" on storage.objects;
drop policy if exists "lesson-videos: staff delete own folder" on storage.objects;
-- Empty the bucket in the dashboard first, then:
-- delete from storage.buckets where id = 'lesson-videos';
