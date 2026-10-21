-- PROPOSAL ONLY. NOT in supabase/migrations/, NOT applied. UNTESTED (no PostgreSQL available when written).
-- Phase 5.1 inspection found NO discussion/forum/thread/reply tables, so the forum page reads nothing yet.
-- Minimal additive schema for discussions and replies. Nothing existing is altered.
--
-- Model: any signed-in user may read visible posts and write their own; authors edit/delete their own;
-- teachers/admins may hide (moderate) posts. Writes use plain RLS policies with column-limited grants.
-- Categories are a slug list kept in code (src/lib/forum/categories.ts) and enforced here by a CHECK.
-- Open decisions for you: should students see all classes or only their own? Should teachers post
-- announcements? Is editing time-limited? Pagination/search (ilike vs full-text) is chosen when the list query is built.

create table public.discussions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  grade smallint not null check (grade in (9, 10, 11, 12)),
  category text not null check (category in
    ('physical-geography', 'human-geography', 'indian-geography', 'cartography', 'climate', 'practical-work')),
  title text not null check (char_length(title) between 5 and 200),
  body text not null check (char_length(body) between 1 and 10000),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index discussions_listing_idx on public.discussions (grade, category, created_at desc) where not is_hidden;
create trigger discussions_set_updated_at before update on public.discussions
  for each row execute function public.set_updated_at();

create table public.discussion_replies (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references public.discussions (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index discussion_replies_thread_idx on public.discussion_replies (discussion_id, created_at);
create trigger discussion_replies_set_updated_at before update on public.discussion_replies
  for each row execute function public.set_updated_at();

alter table public.discussions enable row level security;
alter table public.discussion_replies enable row level security;
revoke all on public.discussions, public.discussion_replies from anon, authenticated;
grant select on public.discussions, public.discussion_replies to authenticated;
grant insert (grade, category, title, body, author_id) on public.discussions to authenticated;
grant insert (discussion_id, body, author_id) on public.discussion_replies to authenticated;
grant update (title, body) on public.discussions to authenticated;
grant update (body) on public.discussion_replies to authenticated;
grant delete on public.discussions, public.discussion_replies to authenticated;
-- is_hidden is changed only by moderators through the functions below (no column grant).

create policy "discussions: read visible or own or moderator" on public.discussions for select to authenticated
  using (not is_hidden or author_id = (select auth.uid()) or public.is_teacher_or_admin());
create policy "discussions: insert as self" on public.discussions for insert to authenticated
  with check (author_id = (select auth.uid()));
create policy "discussions: author edits own" on public.discussions for update to authenticated
  using (author_id = (select auth.uid()) and not is_hidden) with check (author_id = (select auth.uid()));
create policy "discussions: author or admin deletes" on public.discussions for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());

create policy "replies: read visible or own or moderator" on public.discussion_replies for select to authenticated
  using (
    (not is_hidden or author_id = (select auth.uid()) or public.is_teacher_or_admin())
    and exists (select 1 from public.discussions d where d.id = discussion_id)  -- inherits the parent's visibility via its RLS
  );
create policy "replies: insert as self" on public.discussion_replies for insert to authenticated
  with check (author_id = (select auth.uid())
    and exists (select 1 from public.discussions d where d.id = discussion_id and not d.is_hidden));
create policy "replies: author edits own" on public.discussion_replies for update to authenticated
  using (author_id = (select auth.uid()) and not is_hidden) with check (author_id = (select auth.uid()));
create policy "replies: author or admin deletes" on public.discussion_replies for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());

-- Moderation: teachers/admins can hide or restore. Fixed search_path, caller checked inside.
create or replace function public.set_discussion_hidden(p_id uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_teacher_or_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  update public.discussions set is_hidden = p_hidden where id = p_id;
end $$;
create or replace function public.set_reply_hidden(p_id uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_teacher_or_admin() then raise exception 'Not allowed' using errcode = '42501'; end if;
  update public.discussion_replies set is_hidden = p_hidden where id = p_id;
end $$;
revoke all on function public.set_discussion_hidden(uuid, boolean), public.set_reply_hidden(uuid, boolean) from public, anon;
grant execute on function public.set_discussion_hidden(uuid, boolean), public.set_reply_hidden(uuid, boolean) to authenticated;

-- Author names: profiles is not readable by other users today. Showing an author name needs either a
-- security-definer view/function returning only (id, full_name) or a deliberate profiles policy. Not included.
-- ROLLBACK: drop table public.discussion_replies, public.discussions; drop function public.set_discussion_hidden(uuid, boolean), public.set_reply_hidden(uuid, boolean);
