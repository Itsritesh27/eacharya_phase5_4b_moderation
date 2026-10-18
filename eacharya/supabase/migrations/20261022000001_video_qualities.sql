-- Multi-quality lesson videos + student downloads.
-- video_sources: [{"label":"1080p","height":1080,"url":"https://.../lesson-1080.mp4"}, ...]
-- (direct https .mp4/.webm files, or one .m3u8 HLS master playlist for adaptive "Auto").
-- Existing rows are unaffected: they keep using video_url.
alter table public.lesson_content
  add column if not exists video_sources jsonb not null default '[]'::jsonb
    check (jsonb_typeof(video_sources) = 'array' and jsonb_array_length(video_sources) <= 8),
  add column if not exists allow_download boolean not null default true;
