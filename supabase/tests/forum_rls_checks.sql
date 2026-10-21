-- Forum (Phase 5.2) RLS checks. Needs migrations 1-5 (through 20261018000001_phase5_2_forum.sql); no seed needed.
-- Everything runs in one transaction that is rolled back. Any failure raises an exception; if the script
-- finishes, every check passed. Passed on a local PostgreSQL 16 with a stand-in for Supabase's auth/storage
-- schemas; NOT yet run against a real Supabase project.
begin;

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Asha Student"}'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{"full_name":"Bala Student"}'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 't@test.local', '{"full_name":"Chitra Teacher"}'),
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'm@test.local', '{"full_name":"Dev Admin"}'),
  ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'x@test.local', '{"full_name":"Esha NoPosts"}');
-- Privileged roles are set by a superuser (auth.uid() is null), as in the existing checks.
update public.profiles set role = 'teacher' where id = '00000000-0000-0000-0000-0000000000c3';
update public.profiles set role = 'admin'   where id = '00000000-0000-0000-0000-0000000000d4';

-- Fixtures created as superuser: one discussion by A, one reply by B, one hidden discussion by A.
insert into public.discussions (id, author_id, grade, category, title, body) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 10, 'climate', 'Why does the monsoon burst?', 'Please explain the onset of the monsoon in simple words.'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 9, 'cartography', 'Hidden discussion test', 'This one is hidden by a moderator in the fixture.');
update public.discussions set is_hidden = true where id = '10000000-0000-0000-0000-000000000002';
insert into public.discussion_replies (id, discussion_id, author_id, body) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'Winds reverse because land heats faster than the sea.');

-- ===================== anonymous =====================
set local role anon;
do $$
begin
  begin perform count(*) from public.discussions; raise exception 'FAIL: anon can read discussions';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot read discussions'; end;
  begin insert into public.discussions (author_id, grade, category, title, body) values (gen_random_uuid(), 9, 'climate', 'Anon title', 'Anon body text here');
    raise exception 'FAIL: anon inserted a discussion';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot insert a discussion'; end;
  begin perform * from public.forum_author_cards(array['00000000-0000-0000-0000-0000000000a1']::uuid[]); raise exception 'FAIL: anon ran forum_author_cards';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot call forum_author_cards'; end;
end $$;
reset role;

-- ===================== student A =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$
declare n int; new_id uuid;
begin
  -- Create as self.
  insert into public.discussions (author_id, grade, category, title, body, links, client_token)
  values ('00000000-0000-0000-0000-0000000000a1', 11, 'physical-geography', 'What causes tides?', 'Is it only the moon, or the sun as well?', array['https://example.org/tides'], '30000000-0000-0000-0000-000000000001')
  returning id into new_id;
  raise notice 'PASS: student creates a discussion as self';

  -- Duplicate submission with the same token is rejected by the database.
  begin
    insert into public.discussions (author_id, grade, category, title, body, client_token)
    values ('00000000-0000-0000-0000-0000000000a1', 11, 'physical-geography', 'What causes tides?', 'Is it only the moon, or the sun as well?', '30000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: duplicate client_token accepted';
  exception when unique_violation then raise notice 'PASS: duplicate submission (same token) rejected'; end;

  -- Impersonation.
  begin
    insert into public.discussions (author_id, grade, category, title, body)
    values ('00000000-0000-0000-0000-0000000000b2', 9, 'climate', 'Pretend to be B', 'I am pretending to be somebody else.');
    raise exception 'FAIL: student posted as another user';
  exception when insufficient_privilege then raise notice 'PASS: cannot post as another user'; end;

  -- Columns users must not set.
  begin
    insert into public.discussions (author_id, grade, category, title, body, is_hidden)
    values ('00000000-0000-0000-0000-0000000000a1', 9, 'climate', 'Hidden on insert', 'Trying to set is_hidden myself.', true);
    raise exception 'FAIL: student set is_hidden on insert';
  exception when insufficient_privilege then raise notice 'PASS: users cannot set is_hidden'; end;
  begin
    insert into public.discussions (author_id, grade, category, title, body, created_at)
    values ('00000000-0000-0000-0000-0000000000a1', 9, 'climate', 'Backdated post', 'Trying to set created_at myself.', '2020-01-01');
    raise exception 'FAIL: student set created_at';
  exception when insufficient_privilege then raise notice 'PASS: users cannot set created_at'; end;

  -- Constraints.
  begin insert into public.discussions (author_id, grade, category, title, body) values ('00000000-0000-0000-0000-0000000000a1', 9, 'climate', 'abc', 'A body that is long enough.'); raise exception 'FAIL: short title accepted';
  exception when check_violation then raise notice 'PASS: short title rejected'; end;
  begin insert into public.discussions (author_id, grade, category, title, body) values ('00000000-0000-0000-0000-0000000000a1', 9, 'climate', repeat('x', 201), 'A body that is long enough.'); raise exception 'FAIL: 201-char title accepted';
  exception when check_violation then raise notice 'PASS: over-long title rejected'; end;
  begin insert into public.discussions (author_id, grade, category, title, body) values ('00000000-0000-0000-0000-0000000000a1', 9, 'climate', 'Valid title here', E'   \n\t  '); raise exception 'FAIL: whitespace-only body accepted';
  exception when check_violation then raise notice 'PASS: whitespace-only body rejected'; end;
  begin insert into public.discussions (author_id, grade, category, title, body) values ('00000000-0000-0000-0000-0000000000a1', 8, 'climate', 'Valid title here', 'A body that is long enough.'); raise exception 'FAIL: class 8 accepted';
  exception when check_violation then raise notice 'PASS: class outside 9-12 rejected'; end;
  begin insert into public.discussions (author_id, grade, category, title, body) values ('00000000-0000-0000-0000-0000000000a1', 9, 'made-up', 'Valid title here', 'A body that is long enough.'); raise exception 'FAIL: unknown category accepted';
  exception when check_violation then raise notice 'PASS: unknown category rejected'; end;
  begin insert into public.discussions (author_id, grade, category, title, body, links) values ('00000000-0000-0000-0000-0000000000a1', 9, 'climate', 'Valid title here', 'A body that is long enough.', array['http://insecure.example']); raise exception 'FAIL: http link accepted';
  exception when check_violation then raise notice 'PASS: non-https link rejected'; end;
  begin insert into public.discussions (author_id, grade, category, title, body, links) values ('00000000-0000-0000-0000-0000000000a1', 9, 'climate', 'Valid title here', 'A body that is long enough.', array['javascript:alert(1)']); raise exception 'FAIL: javascript: link accepted';
  exception when check_violation then raise notice 'PASS: javascript: link rejected'; end;
  begin insert into public.discussions (author_id, grade, category, title, body, links) values ('00000000-0000-0000-0000-0000000000a1', 9, 'climate', 'Valid title here', 'A body that is long enough.', array['https://a.org','https://b.org','https://c.org','https://d.org']); raise exception 'FAIL: 4 links accepted';
  exception when check_violation then raise notice 'PASS: more than 3 links rejected'; end;

  -- Edit own: title/body/links yes; grade, category, author, created_at no.
  update public.discussions set title = 'What causes ocean tides?' where id = new_id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: author cannot edit own discussion'; end if;
  raise notice 'PASS: author edits own discussion';
  begin update public.discussions set grade = 12 where id = new_id; raise exception 'FAIL: author changed grade';
  exception when insufficient_privilege then raise notice 'PASS: author cannot change class'; end;
  begin update public.discussions set author_id = '00000000-0000-0000-0000-0000000000b2' where id = new_id; raise exception 'FAIL: author reassigned authorship';
  exception when insufficient_privilege then raise notice 'PASS: author cannot reassign authorship'; end;

  -- Reading: all classes visible; hidden discussion still visible to its own author.
  select count(*) into n from public.discussions where id in ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002');
  if n <> 2 then raise exception 'FAIL: author should see own visible and own hidden discussion (saw %)', n; end if;
  raise notice 'PASS: author sees own visible and hidden discussions';

  -- Own discussion with someone else's reply cannot be deleted.
  begin delete from public.discussions where id = '10000000-0000-0000-0000-000000000001'; raise exception 'FAIL: deleted a discussion that has replies';
  exception when check_violation then raise notice 'PASS: discussion with replies cannot be deleted by its author'; end;
  -- Without replies it can.
  delete from public.discussions where id = new_id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: author cannot delete own reply-free discussion'; end if;
  raise notice 'PASS: author deletes own discussion with no replies';

  -- Cannot edit or delete someone else's reply.
  update public.discussion_replies set body = 'Edited by A' where id = '20000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A edited B''s reply'; end if;
  delete from public.discussion_replies where id = '20000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A deleted B''s reply'; end if;
  raise notice 'PASS: cannot edit or delete another user''s reply';

  -- A cannot see profile data of others (existing privacy model unchanged).
  select count(*) into n from public.profiles where id <> '00000000-0000-0000-0000-0000000000a1';
  if n <> 0 then raise exception 'FAIL: profiles of others readable'; end if;
  raise notice 'PASS: profiles of other users remain private';
end $$;
reset role;

-- ===================== student B =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
do $$
declare n int; rid uuid;
begin
  select count(*) into n from public.discussions where id = '10000000-0000-0000-0000-000000000001';
  if n <> 1 then raise exception 'FAIL: B cannot read a discussion from another class'; end if;
  select count(*) into n from public.discussions where id = '10000000-0000-0000-0000-000000000002';
  if n <> 0 then raise exception 'FAIL: B can read a hidden discussion'; end if;
  raise notice 'PASS: all-class reads work; hidden discussion is not visible to others';

  update public.discussions set title = 'Hijacked title' where id = '10000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B edited A''s discussion'; end if;
  delete from public.discussions where id = '10000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: B deleted A''s discussion'; end if;
  raise notice 'PASS: cannot edit or delete another user''s discussion';

  -- Reply: as self on a visible discussion.
  insert into public.discussion_replies (discussion_id, author_id, body, client_token)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'Second reply from B.', '40000000-0000-0000-0000-000000000001') returning id into rid;
  raise notice 'PASS: student replies as self';
  begin insert into public.discussion_replies (discussion_id, author_id, body, client_token)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', 'Second reply from B.', '40000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: duplicate reply token accepted';
  exception when unique_violation then raise notice 'PASS: duplicate reply submission rejected'; end;
  begin insert into public.discussion_replies (discussion_id, author_id, body) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Pretending to be A.');
    raise exception 'FAIL: replied as another user';
  exception when insufficient_privilege then raise notice 'PASS: cannot reply as another user'; end;
  begin insert into public.discussion_replies (discussion_id, author_id, body) values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b2', 'Reply to a hidden discussion.');
    raise exception 'FAIL: replied to a hidden discussion';
  exception when insufficient_privilege then raise notice 'PASS: cannot reply to a hidden discussion'; end;
  begin insert into public.discussion_replies (discussion_id, author_id, body) values ('99999999-0000-0000-0000-000000000009', '00000000-0000-0000-0000-0000000000b2', 'Reply to nothing.');
    raise exception 'FAIL: replied to a missing discussion';
  exception when insufficient_privilege or foreign_key_violation then raise notice 'PASS: cannot reply to a missing discussion'; end;
  begin insert into public.discussion_replies (discussion_id, author_id, body) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', E'  \n ');
    raise exception 'FAIL: blank reply accepted';
  exception when check_violation then raise notice 'PASS: blank reply rejected'; end;
  begin insert into public.discussion_replies (discussion_id, author_id, body) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', repeat('x', 5001));
    raise exception 'FAIL: 5001-char reply accepted';
  exception when check_violation then raise notice 'PASS: over-long reply rejected'; end;
  begin update public.discussion_replies set discussion_id = '10000000-0000-0000-0000-000000000002' where id = rid;
    raise exception 'FAIL: reply moved to another discussion';
  exception when insufficient_privilege then raise notice 'PASS: reply cannot be moved to another discussion'; end;

  update public.discussion_replies set body = 'Edited by B.' where id = rid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: author cannot edit own reply'; end if;
  delete from public.discussion_replies where id = rid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: author cannot delete own reply'; end if;
  raise notice 'PASS: author edits and deletes own reply';

  -- Author cards: names and verified roles, only for authors of visible content.
  select count(*) into n from public.forum_author_cards(array['00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000e5']::uuid[]);
  if n <> 2 then raise exception 'FAIL: forum_author_cards returned % rows (expected the 2 authors, not the user with no posts)', n; end if;
  if (select display_name from public.forum_author_cards(array['00000000-0000-0000-0000-0000000000a1']::uuid[])) <> 'Asha Student' then raise exception 'FAIL: wrong display name'; end if;
  if (select role from public.forum_author_cards(array['00000000-0000-0000-0000-0000000000a1']::uuid[])) <> 'student' then raise exception 'FAIL: wrong role'; end if;
  raise notice 'PASS: author cards expose only name and role, only for people with visible posts';
end $$;
reset role;

-- ===================== teacher =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);
do $$
declare n int;
begin
  insert into public.discussions (author_id, grade, category, title, body) values ('00000000-0000-0000-0000-0000000000c3', 12, 'indian-geography', 'Teacher question here', 'Teachers can post like students can.');
  insert into public.discussion_replies (discussion_id, author_id, body) values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c3', 'A teacher reply.');
  raise notice 'PASS: teacher posts and replies like a student';
  update public.discussions set title = 'Teacher edits student' where id = '10000000-0000-0000-0000-000000000001'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: teacher edited a student discussion'; end if;
  update public.discussion_replies set body = 'Teacher edits reply' where id = '20000000-0000-0000-0000-000000000001'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: teacher edited a student reply'; end if;
  delete from public.discussions where id = '10000000-0000-0000-0000-000000000001'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: teacher deleted a student discussion'; end if;
  delete from public.discussion_replies where id = '20000000-0000-0000-0000-000000000001'; get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: teacher deleted a student reply'; end if;
  raise notice 'PASS: teacher cannot edit or delete others'' content (moderation is a later task)';
  select count(*) into n from public.discussions where id = '10000000-0000-0000-0000-000000000002';
  if n <> 1 then raise exception 'FAIL: teacher cannot read hidden discussions'; end if;
  raise notice 'PASS: teacher can read hidden discussions';
  if (select role from public.forum_author_cards(array['00000000-0000-0000-0000-0000000000c3']::uuid[])) <> 'teacher' then raise exception 'FAIL: teacher badge'; end if;
  raise notice 'PASS: teacher badge comes from the database role';
end $$;
reset role;

-- ===================== admin =====================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d4","role":"authenticated"}', true);
do $$
declare n int;
begin
  delete from public.discussions where id = '10000000-0000-0000-0000-000000000001'; get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: admin cannot delete a discussion with replies'; end if;
  select count(*) into n from public.discussion_replies where discussion_id = '10000000-0000-0000-0000-000000000001';
  if n <> 0 then raise exception 'FAIL: replies not removed with their discussion'; end if;
  raise notice 'PASS: admin can delete a discussion (replies cascade)';
end $$;
reset role;

-- Database-level uniqueness is per author: another user may reuse a token value.
do $$
begin
  insert into public.discussions (author_id, grade, category, title, body, client_token) values ('00000000-0000-0000-0000-0000000000e5', 9, 'climate', 'Token reuse is per author', 'Different author, same token value.', '30000000-0000-0000-0000-000000000001');
  raise notice 'PASS: idempotency token is scoped per author';
end $$;

rollback;
