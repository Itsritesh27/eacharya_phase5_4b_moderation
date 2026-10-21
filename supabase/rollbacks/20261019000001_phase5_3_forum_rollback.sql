-- ROLLBACK for 20261019000001_phase5_3_forum_likes_bookmarks_search.sql. DESTRUCTIVE: deletes all likes and forum bookmarks.
-- Refuses to run unless the same session first runs:  set app.confirm_forum53_rollback = 'yes';
do $$ begin
  if coalesce(current_setting('app.confirm_forum53_rollback', true), '') <> 'yes' then
    raise exception 'Refusing to drop likes/bookmarks. Run: set app.confirm_forum53_rollback = ''yes''; first.';
  end if;
end $$;
drop index if exists public.discussions_popular_idx, public.discussions_body_trgm_idx, public.discussions_title_trgm_idx;
-- restore the Phase 5.2 form of the two triggers
drop trigger if exists discussions_set_updated_at on public.discussions;
create trigger discussions_set_updated_at before update on public.discussions for each row execute function public.set_updated_at();
drop trigger if exists discussion_replies_set_updated_at on public.discussion_replies;
create trigger discussion_replies_set_updated_at before update on public.discussion_replies for each row execute function public.set_updated_at();
drop table if exists public.discussion_bookmarks, public.discussion_reply_likes, public.discussion_likes;
drop function if exists public.forum_bump_reply_likes();
drop function if exists public.forum_bump_discussion_likes();
alter table public.discussion_replies drop column if exists like_count;
alter table public.discussions drop column if exists like_count;
-- pg_trgm is left installed (other things may use it).
