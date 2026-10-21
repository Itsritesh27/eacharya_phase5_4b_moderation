-- ROLLBACK for 20261021000001_phase5_4b_forum_moderation.sql. DESTRUCTIVE: deletes the moderation audit trail.
-- Report statuses already changed and content already hidden stay as they are (nothing is un-hidden here).
-- Refuses to run unless the same session first runs:  set app.confirm_forum_moderation_rollback = 'yes';
do $$ begin
  if coalesce(current_setting('app.confirm_forum_moderation_rollback', true), '') <> 'yes' then
    raise exception 'Refusing to drop the moderation audit trail. Run: set app.confirm_forum_moderation_rollback = ''yes''; first.';
  end if;
end $$;
drop policy if exists "forum_reports: moderators read all" on public.forum_reports;
drop function if exists public.forum_restore_report_content(uuid, text);
drop function if exists public.forum_moderate_report(uuid, text, text, boolean);
drop table if exists public.forum_report_events;
drop function if exists public.can_moderate_forum();
