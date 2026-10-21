-- eAcharya Phase B: secure assessment attempts (start, resume, status-only submit, server-side expiry).
--
-- SCOPE: database + RPCs only. No question delivery, no answer saving, no scoring, no UI.
--
-- Design
--   * Students can SELECT their own attempt rows. There is NO insert/update/delete grant and NO write
--     policy, so the SECURITY DEFINER functions below are the only write path.
--   * Every function takes the user from auth.uid(). None accepts a user id from the client.
--   * Times (started_at, expires_at, submitted_at, expired_at) are written from the database clock
--     (clock_timestamp()), never from the client.
--   * Concurrency: a per-student advisory transaction lock serialises start requests for one student, and
--     unique indexes are the independent backstop (attempt number, one open attempt, request key).
--   * Retries: an optional request_key makes a start idempotent (same key -> same attempt, no new row).
--   * Expiry is enforced when an attempt is read, started or submitted, and by expire_overdue_attempts()
--     (ready for a scheduled job). A direct table SELECT can therefore show a stale 'in_progress';
--     read through the functions, which report the effective status.
--
-- Error codes raised by the functions (SQLSTATE):
--   42501 not signed in / not a student        EA001 assessment not available (missing, draft, not enrolled: same text)
--   EA002 not open yet                         EA003 closed
--   EA004 attempt limit reached                EA005 attempt not found (missing or not yours: same text)
--   EA006 request key already used for a different assessment

-- ---------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------
create type public.attempt_status as enum ('in_progress', 'submitted', 'expired');

-- What every attempt function returns. `status` is the EFFECTIVE status (an overdue in_progress row
-- is reported as 'expired'). seconds_remaining is null when the attempt has no deadline.
create type public.attempt_info as (
  attempt_id uuid,
  assessment_id uuid,
  attempt_number integer,
  status public.attempt_status,
  started_at timestamptz,
  expires_at timestamptz,
  submitted_at timestamptz,
  server_now timestamptz,
  seconds_remaining integer,
  resumed boolean
);

-- ---------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------
create table public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  -- RESTRICT: an assessment (or its course) with attempts cannot be deleted by accident (ASM-8).
  assessment_id uuid not null references public.assessments (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete cascade,
  attempt_number integer not null check (attempt_number >= 1),
  status public.attempt_status not null default 'in_progress',
  started_at timestamptz not null default clock_timestamp(),
  -- least(started_at + duration, closes_at); null only if the assessment is untimed AND never closes
  expires_at timestamptz,
  submitted_at timestamptz,
  expired_at timestamptz,
  -- client-generated idempotency key for one start click
  request_key uuid,
  constraint assessment_attempts_unique_number unique (assessment_id, user_id, attempt_number),
  constraint assessment_attempts_deadline_after_start check (expires_at is null or expires_at >= started_at),
  constraint assessment_attempts_submitted_consistent check ((status = 'submitted') = (submitted_at is not null)),
  constraint assessment_attempts_expired_consistent check ((status = 'expired') = (expired_at is not null))
);

-- at most one open attempt per student per assessment
create unique index assessment_attempts_one_open_idx
  on public.assessment_attempts (assessment_id, user_id) where status = 'in_progress';
-- a request key can create at most one attempt per student
create unique index assessment_attempts_request_key_idx
  on public.assessment_attempts (user_id, request_key) where request_key is not null;
create index assessment_attempts_user_idx on public.assessment_attempts (user_id);
-- lets expire_overdue_attempts() find overdue rows without scanning finished ones
create index assessment_attempts_open_deadline_idx
  on public.assessment_attempts (expires_at) where status = 'in_progress';

comment on table public.assessment_attempts is
  'Student attempts. Written ONLY by the SECURITY DEFINER attempt functions. Direct SELECT may show a stale in_progress; use get_my_attempt().';

-- ---------------------------------------------------------------
-- Guard trigger: identity and clocks are immutable, finished attempts are frozen.
-- Runs for every role including the table owner.
-- ---------------------------------------------------------------
create or replace function public.assessment_attempts_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.assessment_id is distinct from old.assessment_id
     or new.user_id is distinct from old.user_id
     or new.attempt_number is distinct from old.attempt_number
     or new.started_at is distinct from old.started_at
     or new.expires_at is distinct from old.expires_at
     or new.request_key is distinct from old.request_key then
    raise exception 'Attempt identity, start time, deadline and request key cannot be changed'
      using errcode = '42501';
  end if;
  if old.status <> 'in_progress' and new is distinct from old then
    raise exception 'A finished attempt cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger assessment_attempts_guard
  before update on public.assessment_attempts
  for each row execute function public.assessment_attempts_guard();

revoke all on function public.assessment_attempts_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- RLS and grants: read-only for students, nothing for anon
-- ---------------------------------------------------------------
alter table public.assessment_attempts enable row level security;
revoke all on public.assessment_attempts from anon, authenticated;
grant select on public.assessment_attempts to authenticated;

create policy "attempts: students read own"
  on public.assessment_attempts for select to authenticated
  using (user_id = (select auth.uid()));
-- Teacher / admin read access belongs to the grading phase. No write policies exist on purpose.

-- ---------------------------------------------------------------
-- Internal helpers (not executable by app roles)
-- ---------------------------------------------------------------
create or replace function public.attempt_to_info(p_row public.assessment_attempts, p_resumed boolean)
returns public.attempt_info
language sql
volatile
set search_path = ''
as $$
  select
    p_row.id,
    p_row.assessment_id,
    p_row.attempt_number,
    case when p_row.status = 'in_progress' and p_row.expires_at is not null
              and p_row.expires_at <= clock_timestamp()
         then 'expired'::public.attempt_status else p_row.status end,
    p_row.started_at,
    p_row.expires_at,
    p_row.submitted_at,
    clock_timestamp(),
    case when p_row.status <> 'in_progress' then 0
         when p_row.expires_at is null then null
         else greatest(0, floor(extract(epoch from (p_row.expires_at - clock_timestamp()))))::integer end,
    p_resumed;
$$;

-- Marks overdue open attempts as expired. expired_at = the deadline itself, not the time we noticed.
create or replace function public.expire_overdue_attempts(p_user uuid default null, p_assessment uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  update public.assessment_attempts t
     set status = 'expired', expired_at = t.expires_at
   where t.status = 'in_progress'
     and t.expires_at is not null
     and t.expires_at <= clock_timestamp()
     and (p_user is null or t.user_id = p_user)
     and (p_assessment is null or t.assessment_id = p_assessment);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.attempt_to_info(public.assessment_attempts, boolean) from public, anon, authenticated;
revoke all on function public.expire_overdue_attempts(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------
-- start_assessment_attempt
-- ---------------------------------------------------------------
create or replace function public.start_assessment_attempt(p_assessment uuid, p_request_key uuid default null)
returns public.attempt_info
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_now timestamptz;
  v_asm public.assessments%rowtype;
  v_row public.assessment_attempts%rowtype;
  v_used integer;
begin
  if v_uid is null or public.current_user_role() is distinct from 'student' then
    raise exception 'Only signed-in students can start an assessment' using errcode = '42501';
  end if;
  if p_assessment is null then
    raise exception 'This assessment is not available.' using errcode = 'EA001';
  end if;

  -- One start at a time per student: makes limit checks and attempt numbering race-free.
  perform pg_advisory_xact_lock(hashtextextended('eac_attempt_start:' || v_uid::text, 0));

  -- Idempotent retry: the same key returns the original attempt, never a second one.
  if p_request_key is not null then
    select * into v_row from public.assessment_attempts t
     where t.user_id = v_uid and t.request_key = p_request_key;
    if found then
      if v_row.assessment_id <> p_assessment then
        raise exception 'This request key was already used.' using errcode = 'EA006';
      end if;
      if v_row.status = 'in_progress' and v_row.expires_at is not null
         and v_row.expires_at <= clock_timestamp() then
        perform public.expire_overdue_attempts(v_uid, p_assessment);
        select * into v_row from public.assessment_attempts t where t.id = v_row.id;
      end if;
      return public.attempt_to_info(v_row, true);
    end if;
  end if;

  perform public.expire_overdue_attempts(v_uid, p_assessment);

  -- Share lock: the limit, duration and window we read cannot change until we commit.
  select * into v_asm from public.assessments a where a.id = p_assessment for share;
  if not found or not public.is_enrolled_in_assessment(p_assessment) then
    raise exception 'This assessment is not available.' using errcode = 'EA001';
  end if;

  v_now := clock_timestamp();
  if v_asm.opens_at is not null and v_asm.opens_at > v_now then
    raise exception 'This assessment has not opened yet.' using errcode = 'EA002';
  end if;
  if (v_asm.closes_at is not null and v_asm.closes_at <= v_now)
     or not public.is_assessment_open(p_assessment) then
    raise exception 'This assessment is closed.' using errcode = 'EA003';
  end if;

  -- Resume the open attempt if there is one (overdue ones were closed above).
  select * into v_row from public.assessment_attempts t
   where t.assessment_id = p_assessment and t.user_id = v_uid and t.status = 'in_progress';
  if found then
    return public.attempt_to_info(v_row, true);
  end if;

  -- Expired and submitted attempts both count toward the limit.
  select count(*) into v_used from public.assessment_attempts t
   where t.assessment_id = p_assessment and t.user_id = v_uid;
  if v_asm.attempt_limit is not null and v_used >= v_asm.attempt_limit then
    raise exception 'You have used all attempts for this assessment.' using errcode = 'EA004';
  end if;

  insert into public.assessment_attempts
    (assessment_id, user_id, attempt_number, status, started_at, expires_at, request_key)
  values (
    p_assessment, v_uid,
    (select coalesce(max(t.attempt_number), 0) + 1 from public.assessment_attempts t
      where t.assessment_id = p_assessment and t.user_id = v_uid),
    'in_progress', v_now,
    least(v_now + make_interval(mins => v_asm.duration_minutes), v_asm.closes_at),
    p_request_key
  )
  returning * into v_row;

  return public.attempt_to_info(v_row, false);
end;
$$;

-- ---------------------------------------------------------------
-- get_my_attempt: one attempt by id; "missing" and "someone else's" are indistinguishable
-- ---------------------------------------------------------------
create or replace function public.get_my_attempt(p_attempt uuid)
returns public.attempt_info
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.assessment_attempts%rowtype;
begin
  if v_uid is null then
    raise exception 'Please sign in.' using errcode = '42501';
  end if;
  select * into v_row from public.assessment_attempts t where t.id = p_attempt and t.user_id = v_uid;
  if not found then
    raise exception 'Attempt not found.' using errcode = 'EA005';
  end if;
  if v_row.status = 'in_progress' and v_row.expires_at is not null and v_row.expires_at <= clock_timestamp() then
    perform public.expire_overdue_attempts(v_uid, v_row.assessment_id);
    select * into v_row from public.assessment_attempts t where t.id = p_attempt;
  end if;
  return public.attempt_to_info(v_row, true);
end;
$$;

-- ---------------------------------------------------------------
-- get_my_open_attempt: 0 or 1 row; requires current enrolment
-- ---------------------------------------------------------------
create or replace function public.get_my_open_attempt(p_assessment uuid)
returns setof public.attempt_info
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.assessment_attempts%rowtype;
begin
  if v_uid is null then
    raise exception 'Please sign in.' using errcode = '42501';
  end if;
  if p_assessment is null or not public.is_enrolled_in_assessment(p_assessment) then
    return;
  end if;
  perform public.expire_overdue_attempts(v_uid, p_assessment);
  select * into v_row from public.assessment_attempts t
   where t.assessment_id = p_assessment and t.user_id = v_uid and t.status = 'in_progress';
  if found then
    return next public.attempt_to_info(v_row, true);
  end if;
  return;
end;
$$;

-- ---------------------------------------------------------------
-- submit_attempt: STATUS ONLY. Reads no answers, computes no score (Phase D extends this).
-- ---------------------------------------------------------------
create or replace function public.submit_attempt(p_attempt uuid)
returns public.attempt_info
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_now timestamptz;
  v_row public.assessment_attempts%rowtype;
begin
  if v_uid is null then
    raise exception 'Please sign in.' using errcode = '42501';
  end if;
  select * into v_row from public.assessment_attempts t
   where t.id = p_attempt and t.user_id = v_uid for update;
  if not found then
    raise exception 'Attempt not found.' using errcode = 'EA005';
  end if;

  -- Idempotent: already submitted or already expired just reports its status.
  if v_row.status <> 'in_progress' then
    return public.attempt_to_info(v_row, true);
  end if;

  v_now := clock_timestamp();
  if v_row.expires_at is not null and v_row.expires_at <= v_now then
    update public.assessment_attempts t
       set status = 'expired', expired_at = t.expires_at
     where t.id = v_row.id returning * into v_row;
    return public.attempt_to_info(v_row, true);
  end if;

  update public.assessment_attempts t
     set status = 'submitted', submitted_at = v_now
   where t.id = v_row.id returning * into v_row;
  return public.attempt_to_info(v_row, true);
end;
$$;

-- Only signed-in users may execute; anon and PUBLIC may not.
do $$
declare f text;
begin
  foreach f in array array[
    'start_assessment_attempt(uuid, uuid)', 'get_my_attempt(uuid)',
    'get_my_open_attempt(uuid)', 'submit_attempt(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------
-- A published assessment that has attempts cannot go back to draft (the draft-only
-- question editing rules would otherwise let questions change under existing attempts).
-- ---------------------------------------------------------------
create or replace function public.assessments_block_unpublish_with_attempts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'published' and new.status = 'draft'
     and exists (select 1 from public.assessment_attempts t where t.assessment_id = old.id) then
    raise exception 'Students have already attempted this assessment, so it cannot be moved back to draft.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger assessments_block_unpublish_with_attempts
  before update of status on public.assessments
  for each row execute function public.assessments_block_unpublish_with_attempts();

revoke all on function public.assessments_block_unpublish_with_attempts() from public, anon, authenticated;
