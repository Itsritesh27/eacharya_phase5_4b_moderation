-- Phase 5.4B (forum moderation) checks. Needs migrations 1-8. One transaction, rolled back; any failure raises.
-- Passed on local PostgreSQL 16 with a stand-in for Supabase's auth schema; NOT run on a real Supabase project.
begin;
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@t.local','{"full_name":"Asha Student"}'),
  ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@t.local','{"full_name":"Bala Student"}'),
  ('00000000-0000-0000-0000-0000000000c3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','t@t.local','{"full_name":"Chitra Teacher"}'),
  ('00000000-0000-0000-0000-0000000000d4','00000000-0000-0000-0000-000000000000','authenticated','authenticated','m@t.local','{"full_name":"Dev Admin"}');
update public.profiles set role='teacher' where id='00000000-0000-0000-0000-0000000000c3';
update public.profiles set role='admin'   where id='00000000-0000-0000-0000-0000000000d4';

-- Fixtures (as superuser): A authors discussion D1 and reply R1 on it; B reports both.
insert into public.discussions (id, author_id, grade, category, title, body) values
  ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1',10,'climate','Why does the monsoon burst?','Please explain the onset of the monsoon.');
insert into public.discussion_replies (id, discussion_id, author_id, body) values
  ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','A reply by A.');
insert into public.forum_reports (id, reporter_id, content_type, content_id, reported_discussion_id, reason) values
  ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000b2','discussion','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','spam');
insert into public.forum_reports (id, reporter_id, content_type, content_id, reported_reply_id, reason, description) values
  ('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000b2','reply','20000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','abusive','Rude');
insert into public.forum_reports (id, reporter_id, content_type, content_id, reported_discussion_id, reason) values
  ('30000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000a1','discussion','10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','off_topic');

-- ===== anonymous =====
set local role anon;
do $$ begin
  begin perform public.forum_moderate_report('30000000-0000-0000-0000-000000000001','reviewed'); raise exception 'FAIL anon moderated';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot run moderation functions'; end;
  begin perform 1 from public.forum_report_events; raise exception 'FAIL anon reads events';
  exception when insufficient_privilege then raise notice 'PASS: anon cannot read the audit trail'; end;
end $$;
reset role;

-- ===== student B (reporter) and teacher C: no moderation =====
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000b2"}',true);
do $$ declare n int; begin
  select count(*) into n from public.forum_reports; if n <> 2 then raise exception 'FAIL B should see only own 2 reports, sees %', n; end if;
  raise notice 'PASS: reporter still sees only their own reports';
  begin perform public.forum_moderate_report('30000000-0000-0000-0000-000000000001','dismissed'); raise exception 'FAIL student moderated';
  exception when insufficient_privilege then raise notice 'PASS: student cannot moderate by calling the function'; end;
  begin perform public.forum_restore_report_content('30000000-0000-0000-0000-000000000001'); raise exception 'FAIL student restored';
  exception when insufficient_privilege then raise notice 'PASS: student cannot restore content'; end;
  select count(*) into n from public.forum_report_events; if n <> 0 then raise exception 'FAIL student reads events'; end if;
  raise notice 'PASS: student sees no audit rows';
  begin update public.forum_reports set status='dismissed'; raise exception 'FAIL direct update';
  exception when insufficient_privilege then raise notice 'PASS: direct status update refused'; end;
  begin insert into public.forum_report_events (report_id, from_status, to_status) values ('30000000-0000-0000-0000-000000000001','pending','dismissed'); raise exception 'FAIL direct event insert';
  exception when insufficient_privilege then raise notice 'PASS: events cannot be written directly'; end;
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000c3"}',true);
do $$ declare n int; begin
  select count(*) into n from public.forum_reports; if n <> 0 then raise exception 'FAIL teacher reads % reports', n; end if;
  raise notice 'PASS: teacher cannot read other people''s reports';
  begin perform public.forum_moderate_report('30000000-0000-0000-0000-000000000001','reviewed'); raise exception 'FAIL teacher moderated';
  exception when insufficient_privilege then raise notice 'PASS: teacher cannot moderate (admin-only by design)'; end;
  if public.can_moderate_forum() then raise exception 'FAIL teacher can moderate'; end if;
  raise notice 'PASS: can_moderate_forum() is false for teachers';
end $$;
reset role;

-- ===== admin D =====
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000d4"}',true);
do $$ declare n int; res jsonb; e record; begin
  select count(*) into n from public.forum_reports; if n <> 3 then raise exception 'FAIL admin sees % reports', n; end if;
  raise notice 'PASS: admin reads all reports';

  res := public.forum_moderate_report('30000000-0000-0000-0000-000000000001','reviewed','Looking into it');
  if res->>'status' <> 'reviewed' then raise exception 'FAIL review'; end if;
  select * into e from public.forum_report_events where report_id='30000000-0000-0000-0000-000000000001';
  if e.moderator_id <> '00000000-0000-0000-0000-0000000000d4' or e.from_status<>'pending' or e.to_status<>'reviewed' or e.note<>'Looking into it' then raise exception 'FAIL audit row %', e; end if;
  raise notice 'PASS: review recorded with moderator (from the session), transition and note';

  begin perform public.forum_moderate_report('30000000-0000-0000-0000-000000000001','reviewed'); raise exception 'FAIL same status again';
  exception when check_violation then raise notice 'PASS: reviewed -> reviewed refused'; end;
  begin perform public.forum_moderate_report('30000000-0000-0000-0000-000000000001','pending'); raise exception 'FAIL back to pending';
  exception when check_violation then raise notice 'PASS: cannot move back to pending'; end;
  begin perform public.forum_moderate_report('30000000-0000-0000-0000-000000000001','nonsense'); raise exception 'FAIL bogus status';
  exception when check_violation then raise notice 'PASS: unknown status refused'; end;
  begin perform public.forum_moderate_report('30000000-0000-0000-0000-000000000001','dismissed','x',true); raise exception 'FAIL hide on dismiss';
  exception when check_violation then raise notice 'PASS: hiding only allowed with "action taken"'; end;
  begin perform public.forum_moderate_report('30000000-0000-0000-0000-000000000001','action_taken',repeat('x',1001)); raise exception 'FAIL long note';
  exception when check_violation then raise notice 'PASS: over-long note refused'; end;
  begin perform public.forum_moderate_report('99999999-9999-9999-9999-999999999999','reviewed'); raise exception 'FAIL missing report';
  exception when no_data_found then raise notice 'PASS: missing report refused'; end;

  -- dismiss with no note, then terminal
  perform public.forum_moderate_report('30000000-0000-0000-0000-000000000003','dismissed');
  select count(*) into n from public.forum_report_events where report_id='30000000-0000-0000-0000-000000000003' and note is null and to_status='dismissed';
  if n <> 1 then raise exception 'FAIL dismiss without note'; end if;
  raise notice 'PASS: dismiss without a note works';
  begin perform public.forum_moderate_report('30000000-0000-0000-0000-000000000003','action_taken'); raise exception 'FAIL dismissed is not final';
  exception when check_violation then raise notice 'PASS: a dismissed report is final'; end;

  -- action taken + hide discussion
  select count(*) into n from public.discussions where is_hidden; if n <> 0 then raise exception 'FAIL precondition'; end if;
  res := public.forum_moderate_report('30000000-0000-0000-0000-000000000001','action_taken','Removed from view',true);
  if res->>'content_action' <> 'hidden' then raise exception 'FAIL hide result %', res; end if;
  select count(*) into n from public.discussions where id='10000000-0000-0000-0000-000000000001' and is_hidden; if n<>1 then raise exception 'FAIL not hidden'; end if;
  select count(*) into n from public.forum_reports where id='30000000-0000-0000-0000-000000000001' and status='action_taken'; if n<>1 then raise exception 'FAIL status'; end if;
  select count(*) into n from public.discussion_replies where id='20000000-0000-0000-0000-000000000001'; if n<>1 then raise exception 'FAIL reply deleted'; end if;
  raise notice 'PASS: action taken + hide sets is_hidden, keeps the reply and records the event';
  begin perform public.forum_moderate_report('30000000-0000-0000-0000-000000000001','dismissed'); raise exception 'FAIL action_taken not final';
  exception when check_violation then raise notice 'PASS: an action-taken report is final'; end;
end $$;
reset role;

-- hidden discussion: ordinary users cannot see it, the author and admin can
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000b2"}',true);
do $$ declare n int; begin
  select count(*) into n from public.discussions where id='10000000-0000-0000-0000-000000000001'; if n<>0 then raise exception 'FAIL hidden visible to others'; end if;
  select count(*) into n from public.discussion_replies where id='20000000-0000-0000-0000-000000000001'; if n<>0 then raise exception 'FAIL replies of hidden discussion visible'; end if;
  raise notice 'PASS: hidden discussion (and its replies) disappear for ordinary users';
end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000d4"}',true);
do $$ declare n int; res jsonb; begin
  -- restore
  res := public.forum_restore_report_content('30000000-0000-0000-0000-000000000001','Mistake');
  select count(*) into n from public.discussions where id='10000000-0000-0000-0000-000000000001' and not is_hidden; if n<>1 then raise exception 'FAIL restore'; end if;
  select count(*) into n from public.forum_report_events where report_id='30000000-0000-0000-0000-000000000001' and content_action='restored' and to_status='action_taken'; if n<>1 then raise exception 'FAIL restore audit'; end if;
  raise notice 'PASS: restore un-hides the content and is audited';
  begin perform public.forum_restore_report_content('30000000-0000-0000-0000-000000000001'); raise exception 'FAIL double restore';
  exception when check_violation then raise notice 'PASS: restoring visible content refused'; end;
  begin perform public.forum_restore_report_content('30000000-0000-0000-0000-000000000002'); raise exception 'FAIL restore on pending';
  exception when check_violation then raise notice 'PASS: restore needs an action-taken report'; end;

  -- reply report: hide a reply
  perform public.forum_moderate_report('30000000-0000-0000-0000-000000000002','action_taken',null,true);
  select count(*) into n from public.discussion_replies where id='20000000-0000-0000-0000-000000000001' and is_hidden; if n<>1 then raise exception 'FAIL reply hide'; end if;
  raise notice 'PASS: a reply report can hide the reply';
  select count(*) into n from public.forum_report_events; if n <> 5 then raise exception 'FAIL expected 5 audit rows, have %', n; end if;
  raise notice 'PASS: every action left exactly one audit row (5)';
end $$;
reset role;

-- Deleted content: report survives; hide is refused, status-only action still works.
select set_config('request.jwt.claims','',true);
insert into public.forum_reports (id, reporter_id, content_type, content_id, reported_reply_id, reason) values
  ('30000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-0000000000b2','reply','20000000-0000-0000-0000-0000000000ff',null,'spam');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000d4"}',true);
do $$ declare res jsonb; begin
  begin perform public.forum_moderate_report('30000000-0000-0000-0000-000000000004','action_taken',null,true); raise exception 'FAIL hid deleted content';
  exception when check_violation then raise notice 'PASS: hiding deleted content is refused with a clear error'; end;
  res := public.forum_moderate_report('30000000-0000-0000-0000-000000000004','action_taken','Already gone');
  if res->>'status' <> 'action_taken' then raise exception 'FAIL status on deleted'; end if;
  begin perform public.forum_restore_report_content('30000000-0000-0000-0000-000000000004'); raise exception 'FAIL restore deleted';
  exception when check_violation then raise notice 'PASS: restoring deleted content is refused'; end;
  raise notice 'PASS: reports about deleted content can still be resolved';
end $$;
reset role;

-- moderator account removed: audit rows stay, moderator_id becomes null
select set_config('request.jwt.claims','',true);
do $$ declare n int; begin
  delete from public.profiles where id='00000000-0000-0000-0000-0000000000d4';
  select count(*) into n from public.forum_report_events where moderator_id is null; if n < 5 then raise exception 'FAIL audit lost'; end if;
  raise notice 'PASS: deleting a moderator account keeps the audit rows';
end $$;
rollback;
