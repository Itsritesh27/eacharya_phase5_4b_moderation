-- eAcharya Phase 5.3: likes, forum bookmarks and indexed search (owner-approved design). NOT applied by any script: apply on a scratch Supabase project first.
-- Additive, with ONE small change to two existing triggers (section 6).
-- Depends on: Phase 5.2 migration (discussions, discussion_replies), public.profiles, public.set_updated_at().
--
-- Inspection finding (why this is needed):
--   * No like/reaction table exists for discussions or replies.
--   * public.bookmarks (Phase 2) can only point at a lesson or a resource (CHECK/FKs), so it cannot hold a discussion.
--   * discussions.title/body have no text-search index; the 5.2 list uses ILIKE '%text%', which scans every row.
--   * There is no like count to sort by.
--
-- Design:
--   * Likes and bookmarks: one row per (item, user). PRIMARY KEY makes duplicates impossible.
--   * Users can read, add and delete ONLY their own like/bookmark rows (RLS). Nobody can see who else liked anything.
--   * Public like totals are denormalised counters (discussions.like_count, discussion_replies.like_count) kept
--     correct by SECURITY DEFINER triggers. Users have NO column grant on the counters, so they cannot edit them.
--     Counters make "most liked" an ordinary indexed ORDER BY and keep every query on plain RLS (no bypass function).
--   * Search: pg_trgm GIN indexes make ILIKE '%text%' on title and body index-assisted. Correctness never depends on the index.
--   * Likes/bookmarks require the target to be visible to the caller (the sub-select runs under the caller's RLS).

-- ---------------------------------------------------------------
-- 1. Extension (Supabase installs extensions in the "extensions" schema; harmless if already present)
-- ---------------------------------------------------------------
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------
-- 2. Counter columns (not writable by users: no column grant is added)
-- ---------------------------------------------------------------
alter table public.discussions        add column if not exists like_count integer not null default 0 check (like_count >= 0);
alter table public.discussion_replies add column if not exists like_count integer not null default 0 check (like_count >= 0);

-- ---------------------------------------------------------------
-- 3. Tables
-- ---------------------------------------------------------------
create table public.discussion_likes (
  discussion_id uuid not null references public.discussions (id) on delete cascade,
  user_id       uuid not null references public.profiles (id)    on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (discussion_id, user_id)
);
create index discussion_likes_user_idx on public.discussion_likes (user_id, created_at desc);

create table public.discussion_reply_likes (
  reply_id   uuid not null references public.discussion_replies (id) on delete cascade,
  user_id    uuid not null references public.profiles (id)           on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reply_id, user_id)
);
create index discussion_reply_likes_user_idx on public.discussion_reply_likes (user_id, created_at desc);

create table public.discussion_bookmarks (
  user_id       uuid not null references public.profiles (id)    on delete cascade,
  discussion_id uuid not null references public.discussions (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (user_id, discussion_id)
);
create index discussion_bookmarks_user_idx on public.discussion_bookmarks (user_id, created_at desc, discussion_id);

-- ---------------------------------------------------------------
-- 4. Counter triggers (SECURITY DEFINER so they can write the counters users cannot touch)
-- ---------------------------------------------------------------
create or replace function public.forum_bump_discussion_likes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.discussions set like_count = like_count + 1 where id = new.discussion_id;
    return new;
  else
    update public.discussions set like_count = greatest(like_count - 1, 0) where id = old.discussion_id;
    return old;
  end if;
end $$;
revoke all on function public.forum_bump_discussion_likes() from public, anon, authenticated;
create trigger discussion_likes_count after insert or delete on public.discussion_likes
  for each row execute function public.forum_bump_discussion_likes();

create or replace function public.forum_bump_reply_likes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.discussion_replies set like_count = like_count + 1 where id = new.reply_id;
    return new;
  else
    update public.discussion_replies set like_count = greatest(like_count - 1, 0) where id = old.reply_id;
    return old;
  end if;
end $$;
revoke all on function public.forum_bump_reply_likes() from public, anon, authenticated;
create trigger discussion_reply_likes_count after insert or delete on public.discussion_reply_likes
  for each row execute function public.forum_bump_reply_likes();

-- ---------------------------------------------------------------
-- 5. Grants and RLS (anon gets nothing; no UPDATE anywhere: a like/bookmark is created or deleted, never edited)
-- ---------------------------------------------------------------
alter table public.discussion_likes       enable row level security;
alter table public.discussion_reply_likes enable row level security;
alter table public.discussion_bookmarks   enable row level security;
revoke all on public.discussion_likes, public.discussion_reply_likes, public.discussion_bookmarks from anon, authenticated;

grant select, delete on public.discussion_likes, public.discussion_reply_likes, public.discussion_bookmarks to authenticated;
grant insert (discussion_id, user_id) on public.discussion_likes to authenticated;
grant insert (reply_id, user_id)      on public.discussion_reply_likes to authenticated;
grant insert (user_id, discussion_id) on public.discussion_bookmarks to authenticated;

-- likes on discussions
create policy "discussion_likes: read own" on public.discussion_likes for select to authenticated
  using (user_id = (select auth.uid()));
create policy "discussion_likes: add own on visible discussion" on public.discussion_likes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.discussions d where d.id = discussion_id and not d.is_hidden)
  );
create policy "discussion_likes: remove own" on public.discussion_likes for delete to authenticated
  using (user_id = (select auth.uid()));

-- likes on replies (parent discussion must also be visible: the replies policy already checks that)
create policy "reply_likes: read own" on public.discussion_reply_likes for select to authenticated
  using (user_id = (select auth.uid()));
create policy "reply_likes: add own on visible reply" on public.discussion_reply_likes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.discussion_replies r
      join public.discussions d on d.id = r.discussion_id
      where r.id = reply_id and not r.is_hidden and not d.is_hidden
    )
  );
create policy "reply_likes: remove own" on public.discussion_reply_likes for delete to authenticated
  using (user_id = (select auth.uid()));

-- bookmarks
create policy "discussion_bookmarks: read own" on public.discussion_bookmarks for select to authenticated
  using (user_id = (select auth.uid()));
create policy "discussion_bookmarks: add own on visible discussion" on public.discussion_bookmarks for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.discussions d where d.id = discussion_id and not d.is_hidden)
  );
create policy "discussion_bookmarks: remove own" on public.discussion_bookmarks for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------
-- 6. The ONLY change to existing objects.
-- Phase 5.2's set_updated_at triggers fire on EVERY update. The counter triggers above update like_count, so each
-- like would bump updated_at and the UI (which shows "edited" when updated_at is >60s after created_at) would
-- wrongly label liked posts as edited. Restrict both triggers to the columns users can actually edit.
-- (Rollback restores the original "before update" form.)
-- ---------------------------------------------------------------
drop trigger discussions_set_updated_at on public.discussions;
create trigger discussions_set_updated_at before update of title, body, links on public.discussions
  for each row execute function public.set_updated_at();

drop trigger discussion_replies_set_updated_at on public.discussion_replies;
create trigger discussion_replies_set_updated_at before update of body on public.discussion_replies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- 7. Search and sort indexes
-- ---------------------------------------------------------------
create index discussions_title_trgm_idx on public.discussions using gin (title extensions.gin_trgm_ops) where not is_hidden;
create index discussions_body_trgm_idx  on public.discussions using gin (body  extensions.gin_trgm_ops) where not is_hidden;
create index discussions_popular_idx    on public.discussions (like_count desc, created_at desc, id desc) where not is_hidden;
