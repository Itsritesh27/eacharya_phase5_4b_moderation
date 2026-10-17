-- Phase 5.4A (forum reports) RLS checks. Needs migrations 1-7. One transaction, rolled back; any failure raises.
-- Passed on local PostgreSQL 16 with a stand-in for Supabase's auth schema; NOT run on a real Supabase project.
begin;
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@t.local','{"full_name":"Asha"}'),
  ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@t.local','{"full_name":"Bala"}'),
  ('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','c@t.local','{"full_name":"Chitra"}');
-- A authors discussion D1 (visible), D2 (hidden); B authors reply R1 on D1.
insert into public.discussions (id, author_id, grade, category, title, body) values
  ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1',10,'climate','Why does the monsoon burst?','Please explain the onset of the monsoon.'),
  ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a1',9,'cartography','Hidden discussion test','Hidden by a moderator in this fixture.');
update public.discussions set is_hidden = true where id = '10000000-0000-0000-0000-000000000002';
insert into public.discussion_replies (id, discussion_id, author_id, body) values
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b2','A reply by B.');

set local role anon;
do $$ begin
  begin perform 1 from public.forum_reports; raise exception 'FAIL anon reads reports';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot read reports'; end;
  begin insert into public.forum_reports (reporter_id, content_type, content_id, reported_discussion_id, reason)
    values (gen_random_uuid(),'discussion','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','spam');
    raise exception 'FAIL anon inserted';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot report'; end;
end $$;
reset role;

-- B reports A's discussion; C reports B's reply
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000b2"}',true);
do $$ declare s text; n int; begin
  insert into public.forum_reports (reporter_id, content_type, content_id, reported_discussion_id, reason, description)
  values ('00000000-0000-0000-0000-0000000000b2','discussion','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','spam','Looks like an advert');
  select status into s from public.forum_reports; if s <> 'pending' then raise exception 'FAIL status %', s; end if;
  raise notice 'PASS: valid discussion report is stored as pending';

  begin insert into public.forum_reports (reporter_id, content_type, content_id, reported_discussion_id, reason)
    values ('00000000-0000-0000-0000-0000000000b2','discussion','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','abusive');
    raise exception 'FAIL duplicate report';
  exception when unique_violation then raise notice 'PASS: duplicate report rejected'; end;

  begin insert into public.forum_reports (reporter_id, content_type, content_id, reported_discussion_id, reason)
    values ('00000000-0000-0000-0000-0000000000a1','discussion','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','abusive');
    raise exception 'FAIL reported as another user';
  exception when insufficient_privilege then raise notice 'PASS: cannot report as another user'; end;

  begin insert into public.forum_reports (reporter_id, content_type, content_id, reported_reply_id, reason)
    values ('00000000-0000-0000-0000-0000000000b2','reply','20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','spam');
    raise exception 'FAIL reported own reply';
  exception when insufficient_privilege then raise notice 'PASS: cannot report your own reply'; end;

  begin insert into public.forum_reports (reporter_id, content_type, content_id, reported_discussion_id, reason)
    values ('00000000-0000-0000-0000-0000000000b2','discussion','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','spam');
    raise exception 'FAIL reported hidden discussion';
  exception when insufficient_privilege then raise notice 'PASS: cannot report hidden content'; end;

  begin insert into public.forum_reports (reporter_id, content_type, content_id, reported_discussion_id, reason)
    values ('00000000-0000-0000-0000-0000000000b2','discussion','99999999-9999-9999-9999-999999999999','99999999-9999-9999-9999-999999999999','spam');
    raise exception 'FAIL reported missing content';
  exception when insufficient_privilege or foreign_key_violation then raise notice 'PASS: cannot report content that does not exist'; end;

  begin insert into public.forum_reports (reporter_id, content_type, content_id, reported_discussion_id, reason, status)
    values ('00000000-0000-0000-0000-0000000000b2','discussion','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','spam','action_taken');
    raise exception 'FAIL set status on insert';
  exception when insufficient_privilege then raise notice 'PASS: users cannot choose a status on insert'; end;

  begin insert into public.forum_reports (reporter_id, content_type, content_id, reported_reply_id, reported_discussion_id, reason)
    values ('00000000-0000-0000-0000-0000000000b2','reply','20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','spam');
    raise exception 'FAIL both references';
  exception when check_violation or insufficient_privilege then raise notice 'PASS: a reply report cannot also reference a discussion'; end;

  begin insert into public.forum_reports (reporter_id, content_type, content_id, reported_discussion_id, reason)
    values ('00000000-0000-0000-0000-0000000000b2','discussion','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','bogus');
    raise exception 'FAIL bad reason';
  exception when check_violation or unique_violation then raise notice 'PASS: unknown reason rejected'; end;

  begin update public.forum_reports set status = 'dismissed'; raise exception 'FAIL user updated status';
  exception when insufficient_privilege then raise notice 'PASS: users cannot update reports'; end;
  begin delete from public.forum_reports; raise exception 'FAIL user deleted report';
  exception when insufficient_privilege then raise notice 'PASS: users cannot delete reports'; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000c3"}',true);
do $$ declare n int; begin
  select count(*) into n from public.forum_reports; if n <> 0 then raise exception 'FAIL C sees % reports', n; end if;
  raise notice 'PASS: another user cannot read B''s report';
  begin insert into public.forum_reports (reporter_id, content_type, content_id, reported_discussion_id, reason)
    values ('00000000-0000-0000-0000-0000000000c3','discussion','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','other');
    raise exception 'FAIL other without description';
  exception when check_violation then raise notice 'PASS: reason "other" needs a description'; end;
  insert into public.forum_reports (reporter_id, content_type, content_id, reported_reply_id, reason)
    values ('00000000-0000-0000-0000-0000000000c3','reply','20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','abusive');
  raise notice 'PASS: valid reply report accepted';
  begin insert into public.forum_reports (reporter_id, content_type, content_id, reported_reply_id, reason)
    values ('00000000-0000-0000-0000-0000000000c3','reply','20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','spam');
    raise exception 'FAIL duplicate reply report';
  exception when unique_violation then raise notice 'PASS: duplicate reply report rejected'; end;
  begin update public.forum_reports set reporter_id = '00000000-0000-0000-0000-0000000000a1'; raise exception 'FAIL reassigned';
  exception when insufficient_privilege then raise notice 'PASS: reporter cannot be reassigned'; end;
end $$;
reset role;

-- Deleted content: reports survive with a null reference and the same type/id; duplicates stay blocked.
select set_config('request.jwt.claims','',true);
do $$ declare n int; r record; begin
  delete from public.discussion_replies where id = '20000000-0000-0000-0000-000000000001';
  select * into r from public.forum_reports where content_id = '20000000-0000-0000-0000-000000000001';
  if r.id is null or r.reported_reply_id is not null or r.content_type <> 'reply' then raise exception 'FAIL report not preserved after reply delete'; end if;
  raise notice 'PASS: deleting a reply keeps the report, reference becomes null';
  begin insert into public.forum_reports (reporter_id, content_type, content_id, reason, description)
    values ('00000000-0000-0000-0000-0000000000c3','reply','20000000-0000-0000-0000-000000000001','spam',null);
    raise exception 'FAIL duplicate after delete';
  exception when unique_violation then raise notice 'PASS: duplicate still blocked after the content is deleted'; end;
  delete from public.discussions where id = '10000000-0000-0000-0000-000000000001';
  select count(*) into n from public.forum_reports where content_id = '10000000-0000-0000-0000-000000000001' and reported_discussion_id is null;
  if n <> 1 then raise exception 'FAIL report lost on discussion delete'; end if;
  raise notice 'PASS: deleting a discussion keeps its report, reference becomes null';
  delete from public.profiles where id = '00000000-0000-0000-0000-0000000000b2';
  select count(*) into n from public.forum_reports where reporter_id = '00000000-0000-0000-0000-0000000000b2';
  if n <> 0 then raise exception 'FAIL reports of a deleted account remain'; end if;
  raise notice 'PASS: deleting an account removes that account''s own reports';
end $$;
rollback;
