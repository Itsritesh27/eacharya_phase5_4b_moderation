-- eAcharya Phase 5.4A: forum reports (additive only; no existing object is altered).
-- Depends on: Phase 5.2 migration (discussions, discussion_replies), public.profiles, public.set_updated_at().
-- NOT applied by any script. Apply on a scratch Supabase project first.
--
-- Scope: members can SUBMIT a report and read THEIR OWN reports. There is deliberately no moderator access,
-- no status change path and no automatic hide/delete/penalty here; that is Phase 5.4B.
--
-- Deletion convention: the report row must survive when the reported content is deleted (a discussion with no
-- replies can be deleted by its author; replies can be deleted by theirs). So:
--   * content_type + content_id are a plain record of WHAT was reported (no foreign key, never nulled);
--   * reported_discussion_id / reported_reply_id are real foreign keys with ON DELETE SET NULL, so a live report
--     can be linked to its content, and after deletion the reference simply becomes null (no broken reference).
--   * reporter_id cascades with the profile (a deleted account takes its own reports with it).
-- Duplicates: UNIQUE (reporter_id, content_type, content_id), which still holds after the content is deleted.

create table public.forum_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  content_type text not null check (content_type in ('discussion', 'reply')),
  content_id uuid not null,
  reported_discussion_id uuid references public.discussions (id) on delete set null,
  reported_reply_id uuid references public.discussion_replies (id) on delete set null,
  reason text not null check (reason in ('spam', 'abusive', 'inappropriate', 'off_topic', 'misinformation', 'other')),
  description text check (description is null or char_length(btrim(description, E' \t\r\n')) between 1 and 1000),
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'dismissed', 'action_taken')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A discussion report never points at a reply and vice versa (nulls are allowed once content is deleted).
  check (
    (content_type = 'discussion' and reported_reply_id is null)
    or (content_type = 'reply' and reported_discussion_id is null)
  ),
  -- "Other" must be explained.
  check (reason <> 'other' or description is not null),
  unique (reporter_id, content_type, content_id)
);
create index forum_reports_status_idx on public.forum_reports (status, created_at desc);
create index forum_reports_discussion_idx on public.forum_reports (reported_discussion_id) where reported_discussion_id is not null;
create index forum_reports_reply_idx on public.forum_reports (reported_reply_id) where reported_reply_id is not null;
create trigger forum_reports_set_updated_at before update on public.forum_reports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- Grants: anon nothing. authenticated may read their own rows (RLS) and insert only the columns below, so
-- status, id and timestamps always take their defaults. No UPDATE and no DELETE privilege exists for users.
-- ---------------------------------------------------------------
alter table public.forum_reports enable row level security;
revoke all on public.forum_reports from anon, authenticated;
grant select on public.forum_reports to authenticated;
grant insert (reporter_id, content_type, content_id, reported_discussion_id, reported_reply_id, reason, description)
  on public.forum_reports to authenticated;

create policy "forum_reports: read own" on public.forum_reports for select to authenticated
  using (reporter_id = (select auth.uid()));

-- Insert as yourself, as pending, on content you can see (the sub-selects run under your own RLS), that is not
-- hidden and is not your own. The reference column must match content_id, so the two cannot disagree.
create policy "forum_reports: report visible content as self" on public.forum_reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and status = 'pending'
    and (
      (content_type = 'discussion'
        and reported_discussion_id = content_id
        and exists (select 1 from public.discussions d
                    where d.id = content_id and not d.is_hidden and d.author_id <> (select auth.uid())))
      or
      (content_type = 'reply'
        and reported_reply_id = content_id
        and exists (select 1 from public.discussion_replies r
                    join public.discussions d on d.id = r.discussion_id
                    where r.id = content_id and not r.is_hidden and not d.is_hidden
                      and r.author_id <> (select auth.uid())))
    )
  );
