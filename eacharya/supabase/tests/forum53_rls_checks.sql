-- Phase 5.3 checks (likes, bookmarks, counters, indexes). Needs migrations 1-6. Passed 23 checks on local PostgreSQL 16 with a stand-in auth schema; NOT run on real Supabase.
begin;
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@t.local','{"full_name":"Asha"}'),
  ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@t.local','{"full_name":"Bala"}');
insert into public.discussions (id, author_id, grade, category, title, body) values
  ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1',10,'climate','Why does the monsoon burst?','Please explain the onset of the monsoon.'),
  ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a1',9,'cartography','Hidden discussion test','Hidden by a moderator in this fixture.');
update public.discussions set is_hidden = true where id = '10000000-0000-0000-0000-000000000002';
-- Backdate so the updated_at checks below are meaningful (now() is constant inside one transaction).
update public.discussions set created_at = now() - interval '1 day', updated_at = now() - interval '1 day';
insert into public.discussion_replies (id, discussion_id, author_id, body) values
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','A reply.');

-- anon
set local role anon;
do $$ begin
  begin perform 1 from public.discussion_likes; raise exception 'FAIL anon reads likes';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot read likes'; end;
  begin perform 1 from public.discussion_bookmarks; raise exception 'FAIL anon reads bookmarks';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot read bookmarks'; end;
end $$;
reset role;

-- B likes, bookmarks
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000b2"}',true);
do $$ declare n int; c int; begin
  insert into public.discussion_likes (discussion_id,user_id) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b2');
  select like_count into c from public.discussions where id='10000000-0000-0000-0000-000000000001';
  if c <> 1 then raise exception 'FAIL count after like = %', c; end if; raise notice 'PASS: like increments count to 1';
  begin insert into public.discussion_likes (discussion_id,user_id) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b2');
    raise exception 'FAIL duplicate like';
  exception when unique_violation then raise notice 'PASS: duplicate like rejected'; end;
  select like_count into c from public.discussions where id='10000000-0000-0000-0000-000000000001';
  if c <> 1 then raise exception 'FAIL count inflated = %', c; end if; raise notice 'PASS: count not inflated by duplicate';
  begin insert into public.discussion_likes (discussion_id,user_id) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1');
    raise exception 'FAIL like as someone else';
  exception when insufficient_privilege then raise notice 'PASS: cannot like as another user'; end;
  begin insert into public.discussion_likes (discussion_id,user_id) values ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000b2');
    raise exception 'FAIL liked hidden discussion';
  exception when insufficient_privilege then raise notice 'PASS: cannot like hidden discussion'; end;
  begin update public.discussions set like_count = 999 where id='10000000-0000-0000-0000-000000000001';
    raise exception 'FAIL user edited like_count';
  exception when insufficient_privilege then raise notice 'PASS: user cannot write like_count'; end;
  select count(*) into n from public.discussions where id='10000000-0000-0000-0000-000000000001' and updated_at = created_at or false;
  insert into public.discussion_reply_likes (reply_id,user_id) values ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b2');
  select like_count into c from public.discussion_replies where id='20000000-0000-0000-0000-000000000001';
  if c <> 1 then raise exception 'FAIL reply count %', c; end if; raise notice 'PASS: reply like counted';
  delete from public.discussion_likes where discussion_id='10000000-0000-0000-0000-000000000001';
  select like_count into c from public.discussions where id='10000000-0000-0000-0000-000000000001';
  if c <> 0 then raise exception 'FAIL count after unlike %', c; end if; raise notice 'PASS: unlike reverses the like';
  delete from public.discussion_likes where discussion_id='10000000-0000-0000-0000-000000000001';
  select like_count into c from public.discussions where id='10000000-0000-0000-0000-000000000001';
  if c <> 0 then raise exception 'FAIL double unlike %', c; end if; raise notice 'PASS: second unlike is a no-op, count stays 0';
  -- bookmarks
  insert into public.discussion_bookmarks (user_id,discussion_id) values ('00000000-0000-0000-0000-0000000000b2','10000000-0000-0000-0000-000000000001');
  begin insert into public.discussion_bookmarks (user_id,discussion_id) values ('00000000-0000-0000-0000-0000000000b2','10000000-0000-0000-0000-000000000001');
    raise exception 'FAIL duplicate bookmark';
  exception when unique_violation then raise notice 'PASS: duplicate bookmark rejected'; end;
  begin insert into public.discussion_bookmarks (user_id,discussion_id) values ('00000000-0000-0000-0000-0000000000a1','10000000-0000-0000-0000-000000000001');
    raise exception 'FAIL bookmark as another user';
  exception when insufficient_privilege then raise notice 'PASS: cannot bookmark as another user'; end;
  begin insert into public.discussion_bookmarks (user_id,discussion_id) values ('00000000-0000-0000-0000-0000000000b2','10000000-0000-0000-0000-000000000002');
    raise exception 'FAIL bookmarked hidden';
  exception when insufficient_privilege then raise notice 'PASS: cannot bookmark hidden discussion'; end;
  begin update public.discussion_bookmarks set user_id = '00000000-0000-0000-0000-0000000000a1';
    raise exception 'FAIL bookmark update';
  exception when insufficient_privilege then raise notice 'PASS: bookmarks cannot be updated'; end;
  insert into public.discussion_likes (discussion_id,user_id) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b2');
end $$;
reset role;

-- A: sees none of B's rows, cannot delete them
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1"}',true);
do $$ declare n int; begin
  select count(*) into n from public.discussion_bookmarks; if n<>0 then raise exception 'FAIL A sees % bookmarks', n; end if; raise notice 'PASS: A cannot read B bookmarks';
  select count(*) into n from public.discussion_likes; if n<>0 then raise exception 'FAIL A sees likes'; end if; raise notice 'PASS: A cannot read B likes';
  delete from public.discussion_bookmarks; get diagnostics n = row_count; if n<>0 then raise exception 'FAIL A deleted B bookmark'; end if; raise notice 'PASS: A cannot delete B bookmarks';
  delete from public.discussion_likes; get diagnostics n = row_count; if n<>0 then raise exception 'FAIL A deleted B like'; end if; raise notice 'PASS: A cannot delete B likes';
  -- a like must not make the post look "edited"
  select count(*) into n from public.discussions where id='10000000-0000-0000-0000-000000000001' and updated_at = created_at;
  if n<>1 then raise exception 'FAIL like bumped updated_at'; end if; raise notice 'PASS: like does not change updated_at';
  update public.discussions set title='Why does the monsoon burst early?' where id='10000000-0000-0000-0000-000000000001';
  select count(*) into n from public.discussions where id='10000000-0000-0000-0000-000000000001' and updated_at > created_at + interval '1 hour';
  if n<>1 then raise exception 'FAIL edit did not bump updated_at'; end if; raise notice 'PASS: real edit still bumps updated_at';
end $$;
reset role;

-- deleting a discussion cascades likes/bookmarks (as superuser: clear the simulated JWT so the 5.2 delete guard treats this as direct SQL)
select set_config('request.jwt.claims','',true);
do $$ declare n int; begin
  delete from public.discussions where id='10000000-0000-0000-0000-000000000001';
  select count(*) into n from public.discussion_likes; if n<>0 then raise exception 'FAIL like orphan'; end if;
  select count(*) into n from public.discussion_bookmarks; if n<>0 then raise exception 'FAIL bookmark orphan'; end if;
  raise notice 'PASS: deleting a discussion removes its likes and bookmarks';
end $$;

-- search indexes exist and are usable
do $$ declare n int; begin
  select count(*) into n from pg_indexes where schemaname='public' and indexname in ('discussions_title_trgm_idx','discussions_body_trgm_idx','discussions_popular_idx');
  if n<>3 then raise exception 'FAIL indexes missing'; end if; raise notice 'PASS: search and popularity indexes exist';
end $$;
rollback;
