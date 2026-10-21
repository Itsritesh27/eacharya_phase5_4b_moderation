-- eAcharya Phase 5.4B: forum moderation (additive only; no existing table is altered).
-- Depends on: Phase 5.4A (forum_reports), 5.2 (discussions, discussion_replies with is_hidden), public.current_user_role().
-- NOT applied by any script. Apply on a scratch Supabase project first.
--
-- Who moderates: ADMINS ONLY, through the single function can_moderate_forum(). The existing role model is strict
-- (a teacher gets no implicit access to admin areas; teachers already read hidden posts but never change them), and
-- no moderator role exists, so none is invented. To let teachers moderate later, change that one function.
--
-- What moderation may do: change a report's status along fixed transitions, and (only together with "action taken")
-- HIDE the reported discussion or reply by setting the existing is_hidden flag, which is reversible. Nothing is deleted.
--
-- How: members and moderators have NO table privilege to UPDATE reports or to write events. All changes go through the
-- two SECURITY DEFINER functions below, which check the caller's role themselves, lock the report row, validate the
-- transition, apply the change and write the audit row in ONE transaction. The moderator is always auth.uid().

create or replace function public.can_moderate_forum()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_user_role() = 'admin', false);
$$;
revoke all on function public.can_moderate_forum() from public, anon;
grant execute on function public.can_moderate_forum() to authenticated;

-- ---------------------------------------------------------------
-- Audit trail: one append-only row per moderation action. Readable by moderators only.
-- moderator_id is nulled (not the row deleted) if the moderator's account is removed.
-- ---------------------------------------------------------------
create table public.forum_report_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.forum_reports (id) on delete cascade,
  moderator_id uuid references public.profiles (id) on delete set null,
  from_status text not null check (from_status in ('pending', 'reviewed', 'dismissed', 'action_taken')),
  to_status text not null check (to_status in ('pending', 'reviewed', 'dismissed', 'action_taken')),
  content_action text check (content_action in ('hidden', 'restored')),
  note text check (note is null or char_length(btrim(note, E' \t\r\n')) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index forum_report_events_report_idx on public.forum_report_events (report_id, created_at desc);
create index forum_report_events_moderator_idx on public.forum_report_events (moderator_id) where moderator_id is not null;

alter table public.forum_report_events enable row level security;
revoke all on public.forum_report_events from anon, authenticated;
grant select on public.forum_report_events to authenticated;   -- rows still limited by the policy below
create policy "forum_report_events: moderators read" on public.forum_report_events for select to authenticated
  using (public.can_moderate_forum());

-- Moderators may READ every report (members keep reading only their own, from 5.4A). No write policy exists.
create policy "forum_reports: moderators read all" on public.forum_reports for select to authenticated
  using (public.can_moderate_forum());

-- ---------------------------------------------------------------
-- Change a report's status (and optionally hide the reported content, atomically).
-- Allowed transitions:  pending -> reviewed | dismissed | action_taken;  reviewed -> dismissed | action_taken.
-- dismissed and action_taken are final. A second moderator acting on an already-resolved report is refused.
-- ---------------------------------------------------------------
create or replace function public.forum_moderate_report(
  p_report_id uuid,
  p_status text,
  p_note text default null,
  p_hide_content boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.forum_reports%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, ''), E' \t\r\n'), '');
  v_action text := null;
  v_changed int;
begin
  if (select auth.uid()) is null or not public.can_moderate_forum() then
    raise exception 'You do not have permission to moderate the forum.' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('reviewed', 'dismissed', 'action_taken') then
    raise exception 'Choose a valid new status.' using errcode = '23514';
  end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'The note must be 1,000 characters or fewer.' using errcode = '23514';
  end if;
  if coalesce(p_hide_content, false) and p_status <> 'action_taken' then
    raise exception 'Content can only be hidden when the report is marked "action taken".' using errcode = '23514';
  end if;

  select * into r from public.forum_reports where id = p_report_id for update;   -- serialises two moderators
  if not found then
    raise exception 'This report no longer exists.' using errcode = 'P0002';
  end if;

  if not (
    (r.status = 'pending'  and p_status in ('reviewed', 'dismissed', 'action_taken')) or
    (r.status = 'reviewed' and p_status in ('dismissed', 'action_taken'))
  ) then
    raise exception 'This report is already "%" and cannot be changed to "%".', r.status, p_status using errcode = '23514';
  end if;

  if coalesce(p_hide_content, false) then
    if r.content_type = 'discussion' and r.reported_discussion_id is not null then
      update public.discussions set is_hidden = true where id = r.reported_discussion_id and not is_hidden;
      get diagnostics v_changed = row_count;
      if not exists (select 1 from public.discussions where id = r.reported_discussion_id) then v_changed := -1; end if;
    elsif r.content_type = 'reply' and r.reported_reply_id is not null then
      update public.discussion_replies set is_hidden = true where id = r.reported_reply_id and not is_hidden;
      get diagnostics v_changed = row_count;
      if not exists (select 1 from public.discussion_replies where id = r.reported_reply_id) then v_changed := -1; end if;
    else
      v_changed := -1;
    end if;
    if v_changed = -1 then
      raise exception 'The reported content no longer exists, so it cannot be hidden. Mark the report without hiding.' using errcode = '23514';
    end if;
    if v_changed > 0 then v_action := 'hidden'; end if;   -- already hidden: status still recorded, no content change claimed
  end if;

  update public.forum_reports set status = p_status where id = r.id;
  insert into public.forum_report_events (report_id, moderator_id, from_status, to_status, content_action, note)
  values (r.id, (select auth.uid()), r.status, p_status, v_action, v_note);

  return jsonb_build_object('status', p_status, 'content_action', v_action);
end $$;
revoke all on function public.forum_moderate_report(uuid, text, text, boolean) from public, anon;
grant execute on function public.forum_moderate_report(uuid, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------
-- Undo a hide. Only for reports already marked "action taken"; the status stays, an audit row is added.
-- ---------------------------------------------------------------
create or replace function public.forum_restore_report_content(p_report_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.forum_reports%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, ''), E' \t\r\n'), '');
  v_changed int := 0;
begin
  if (select auth.uid()) is null or not public.can_moderate_forum() then
    raise exception 'You do not have permission to moderate the forum.' using errcode = '42501';
  end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'The note must be 1,000 characters or fewer.' using errcode = '23514';
  end if;

  select * into r from public.forum_reports where id = p_report_id for update;
  if not found then
    raise exception 'This report no longer exists.' using errcode = 'P0002';
  end if;
  if r.status <> 'action_taken' then
    raise exception 'Only reports marked "action taken" can have their content restored.' using errcode = '23514';
  end if;

  if r.content_type = 'discussion' and r.reported_discussion_id is not null then
    update public.discussions set is_hidden = false where id = r.reported_discussion_id and is_hidden;
    get diagnostics v_changed = row_count;
  elsif r.content_type = 'reply' and r.reported_reply_id is not null then
    update public.discussion_replies set is_hidden = false where id = r.reported_reply_id and is_hidden;
    get diagnostics v_changed = row_count;
  else
    raise exception 'The reported content no longer exists, so there is nothing to restore.' using errcode = '23514';
  end if;
  if v_changed = 0 then
    raise exception 'This content is already visible.' using errcode = '23514';
  end if;

  insert into public.forum_report_events (report_id, moderator_id, from_status, to_status, content_action, note)
  values (r.id, (select auth.uid()), r.status, r.status, 'restored', v_note);
  return jsonb_build_object('status', r.status, 'content_action', 'restored');
end $$;
revoke all on function public.forum_restore_report_content(uuid, text) from public, anon;
grant execute on function public.forum_restore_report_content(uuid, text) to authenticated;
