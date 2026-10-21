-- eAcharya Phase 5.2: discussions and replies (additive only).
-- Inspection finding: migrations 1-4 contained NO forum tables. Nothing existing is altered.
-- Depends on existing helpers: public.set_updated_at(), public.is_admin(), public.is_teacher_or_admin(), public.profiles.
-- NOT applied automatically. Apply on a scratch Supabase project first.
--
-- Decisions (owner-approved):
--   1. Authors may delete their own discussion only while it has NO replies (enforced by trigger AND checked by the app).
--   2. Every signed-in user may read all classes.
--   3. Teachers post and reply exactly like students (no announcement type).
--   4. Author shown as full name plus a role badge taken from profiles.role (verified server-side).
--   5. No rate limiting yet; validation constraints and an idempotency token prevent duplicate submissions.
-- ---------------------------------------------------------------
-- Link validation (CHECK constraints cannot contain subqueries, so use an immutable function)
-- ---------------------------------------------------------------
create or replace function public.forum_links_valid(p_links text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_links is not null
     and coalesce(array_length(p_links, 1), 0) <= 3
     and not exists (
       select 1 from unnest(p_links) as l
       where l is null or char_length(l) > 500 or l !~ '^https://[^[:space:]]+$'
     );
$$;

-- ---------------------------------------------------------------
-- discussions
-- ---------------------------------------------------------------
create table public.discussions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  grade smallint not null check (grade in (9, 10, 11, 12)),
  category text not null check (category in
    ('physical-geography', 'human-geography', 'indian-geography', 'cartography', 'climate', 'practical-work')),
  title text not null check (char_length(btrim(title, E' \t\r\n')) between 5 and 200),
  body text not null check (char_length(btrim(body, E' \t\r\n')) between 10 and 10000),
  links text[] not null default '{}' check (public.forum_links_valid(links)),
  client_token uuid,                       -- idempotency key generated when the form opens
  is_hidden boolean not null default false, -- reserved for the later moderation task; no write path in 5.2
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_id, client_token)
);
create index discussions_listing_idx on public.discussions (grade, category, created_at desc) where not is_hidden;
create index discussions_author_idx on public.discussions (author_id, created_at desc);
create trigger discussions_set_updated_at before update on public.discussions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- discussion_replies (flat thread: no parent_reply_id, so no nesting)
-- ---------------------------------------------------------------
create table public.discussion_replies (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references public.discussions (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(btrim(body, E' \t\r\n')) between 1 and 5000),
  client_token uuid,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (author_id, client_token)
);
create index discussion_replies_thread_idx on public.discussion_replies (discussion_id, created_at, id);
create trigger discussion_replies_set_updated_at before update on public.discussion_replies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- Delete guard (decision 1). BEFORE DELETE runs after the row is locked, and a reply insert takes a
-- KEY SHARE lock on its parent through the foreign key, so a reply and a delete cannot both slip through.
-- Admins and direct SQL (auth.uid() is null) are exempt. SECURITY DEFINER so hidden replies still count.
-- ---------------------------------------------------------------
create or replace function public.discussions_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.is_admin() then
    if exists (select 1 from public.discussion_replies r where r.discussion_id = old.id) then
      raise exception 'This discussion has replies, so it can no longer be deleted.' using errcode = '23514';
    end if;
  end if;
  return old;
end $$;
revoke all on function public.discussions_guard_delete() from public, anon, authenticated;
create trigger discussions_guard_delete before delete on public.discussions
  for each row execute function public.discussions_guard_delete();

-- ---------------------------------------------------------------
-- Grants (column-limited; anon gets nothing)
-- ---------------------------------------------------------------
alter table public.discussions enable row level security;
alter table public.discussion_replies enable row level security;
revoke all on public.discussions, public.discussion_replies from anon, authenticated;

grant select on public.discussions, public.discussion_replies to authenticated;
grant insert (author_id, grade, category, title, body, links, client_token) on public.discussions to authenticated;
grant insert (author_id, discussion_id, body, client_token) on public.discussion_replies to authenticated;
-- Editing: title, body, links only. grade/category/author_id/created_at/is_hidden cannot be changed by users.
grant update (title, body, links) on public.discussions to authenticated;
grant update (body) on public.discussion_replies to authenticated;
grant delete on public.discussions, public.discussion_replies to authenticated;

-- ---------------------------------------------------------------
-- RLS: discussions
-- ---------------------------------------------------------------
create policy "discussions: read visible, own, or staff" on public.discussions for select to authenticated
  using (not is_hidden or author_id = (select auth.uid()) or public.is_teacher_or_admin());

create policy "discussions: insert as self" on public.discussions for insert to authenticated
  with check (author_id = (select auth.uid()) and not is_hidden);

create policy "discussions: author edits own" on public.discussions for update to authenticated
  using (author_id = (select auth.uid()) and not is_hidden)
  with check (author_id = (select auth.uid()));

-- Authors delete their own discussion (the trigger above refuses once replies exist); admins may delete any.
create policy "discussions: author or admin deletes" on public.discussions for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());

-- ---------------------------------------------------------------
-- RLS: replies
-- ---------------------------------------------------------------
create policy "replies: read visible, own, or staff" on public.discussion_replies for select to authenticated
  using (
    (not is_hidden or author_id = (select auth.uid()) or public.is_teacher_or_admin())
    and exists (select 1 from public.discussions d where d.id = discussion_id)  -- inherits parent visibility
  );

create policy "replies: insert as self on visible discussion" on public.discussion_replies for insert to authenticated
  with check (
    author_id = (select auth.uid()) and not is_hidden
    and exists (select 1 from public.discussions d where d.id = discussion_id and not d.is_hidden)
  );

create policy "replies: author edits own" on public.discussion_replies for update to authenticated
  using (author_id = (select auth.uid()) and not is_hidden)
  with check (author_id = (select auth.uid()));

create policy "replies: author or admin deletes" on public.discussion_replies for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());

-- ---------------------------------------------------------------
-- Author display: profiles are readable only by their owner and admins, so other users cannot see names.
-- This returns ONLY (id, display_name, role) and ONLY for people who authored a discussion or reply the
-- caller can already see. No email, no avatar, no other profile columns.
-- ---------------------------------------------------------------
create or replace function public.forum_author_cards(p_ids uuid[])
returns table (id uuid, display_name text, role public.user_role)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         coalesce(nullif(btrim(p.full_name), ''), 'eAcharya member') as display_name,
         p.role
  from public.profiles p
  where (select auth.uid()) is not null
    and p.id = any (coalesce(p_ids, '{}'))
    and cardinality(coalesce(p_ids, '{}')) <= 200
    and (
      exists (select 1 from public.discussions d where d.author_id = p.id and (not d.is_hidden or public.is_teacher_or_admin()))
      or exists (select 1 from public.discussion_replies r where r.author_id = p.id and (not r.is_hidden or public.is_teacher_or_admin()))
    );
$$;
revoke all on function public.forum_author_cards(uuid[]) from public, anon;
grant execute on function public.forum_author_cards(uuid[]) to authenticated;
