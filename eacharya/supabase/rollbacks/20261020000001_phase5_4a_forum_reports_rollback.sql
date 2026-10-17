-- ROLLBACK for 20261020000001_phase5_4a_forum_reports.sql. DESTRUCTIVE: deletes every forum report.
-- Refuses to run unless the same session first runs:  set app.confirm_forum_reports_rollback = 'yes';
do $$ begin
  if coalesce(current_setting('app.confirm_forum_reports_rollback', true), '') <> 'yes' then
    raise exception 'Refusing to drop forum_reports. Run: set app.confirm_forum_reports_rollback = ''yes''; first.';
  end if;
end $$;
drop table if exists public.forum_reports;
