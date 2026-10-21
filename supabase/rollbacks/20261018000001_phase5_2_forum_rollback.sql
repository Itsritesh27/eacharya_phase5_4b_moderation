-- ROLLBACK for 20261018000001_phase5_2_forum.sql. DESTRUCTIVE: deletes every discussion and reply.
-- Refuses to run unless the same session first runs:  set app.confirm_forum_rollback = 'yes';
do $$
begin
  if coalesce(current_setting('app.confirm_forum_rollback', true), '') <> 'yes' then
    raise exception 'Refusing to drop forum tables. Run: set app.confirm_forum_rollback = ''yes''; first.';
  end if;
end $$;
drop table if exists public.discussion_replies;
drop table if exists public.discussions;
drop function if exists public.forum_author_cards(uuid[]);
drop function if exists public.discussions_guard_delete();
drop function if exists public.forum_links_valid(text[]);
