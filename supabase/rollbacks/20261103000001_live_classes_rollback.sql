-- ROLLBACK for 20261103000001_live_classes.sql
-- DESTRUCTIVE: deletes every live session and all attendance records.
-- Run in the Supabase SQL editor, in ONE run, with the confirmation line included:
--   set app.confirm_live_rollback = 'yes';

do $$
begin
  if current_setting('app.confirm_live_rollback', true) is distinct from 'yes' then
    raise exception 'Rollback not confirmed. Run: set app.confirm_live_rollback = ''yes''; first, in the same run.';
  end if;
end $$;

drop table if exists public.live_session_attendance;
drop table if exists public.live_sessions;
drop function if exists public.get_live_session_attendance(uuid);
drop function if exists public.end_live_session(uuid);
drop function if exists public.live_webhook_event(text, uuid, text, timestamptz);
drop function if exists public.leave_live_session(uuid);
drop function if exists public.join_live_session(uuid);
drop function if exists public.apply_live_attendance(uuid, uuid, text, timestamptz);
drop function if exists public.is_enrolled_in_course(uuid);
drop type if exists public.live_session_status;
-- public.owns_course(uuid) is shared with assessments and is intentionally NOT dropped.
