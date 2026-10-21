-- PROPOSAL ONLY. NOT in supabase/migrations/, NOT applied, NOT run by anything. UNTESTED.
-- (No PostgreSQL was available in the sandbox that wrote this file, so it has not even been
--  syntax-checked. Run supabase/tests checks against a scratch project before applying.)
--
-- Phase 4.4: server-side saving, submission, teacher review and private evidence uploads
-- for practical activities. Smallest additive change: new tables, functions, policies and ONE new
-- private bucket. No existing table, policy or bucket is altered.
--
-- Design (same model as the Phase 3 attempts proposal):
--  * Students may READ their own rows. Nobody gets direct INSERT/UPDATE/DELETE on these tables.
--  * Every write goes through SECURITY DEFINER functions that take the user from auth.uid()
--    (never from the client), so ownership, the draft lock and size limits are enforced in the database.
--  * Activities live in code (src/lib/practicals/catalogue.ts), so activity_id is a slug, not a foreign key.
--  * A teacher may review a student only if that student is enrolled in a course the teacher created whose
--    class grade equals the attempt's grade (same "teacher owns the course" rule as lessons/assessments).
--    Admins may review all. Drafts are never visible to teachers.
--  * Marks are optional and live with the review.
--  * The app must still validate completeness (computeProgress) in a server action BEFORE calling
--    submit_practical; the database only enforces what it can know.

create type public.practical_status as enum ('draft', 'submitted', 'reviewed');

create table public.practical_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  activity_id text not null check (activity_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(activity_id) <= 80),
  grade smallint not null check (grade in (9, 10, 11, 12)),
  status public.practical_status not null default 'draft',
  content jsonb not null default '{}'::jsonb
    check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 200000),
  -- client save counter: a save with a lower number than the stored one is ignored
  revision bigint not null default 0 check (revision >= 0),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, activity_id),
  constraint practical_submitted_consistent check ((status = 'draft') = (submitted_at is null))
);
create index practical_attempts_grade_status_idx on public.practical_attempts (grade, status);
create trigger practical_attempts_set_updated_at
  before update on public.practical_attempts
  for each row execute function public.set_updated_at();

create table public.practical_reviews (
  attempt_id uuid primary key references public.practical_attempts (id) on delete cascade,
  reviewer_id uuid references public.profiles (id) on delete set null,
  feedback text not null check (char_length(feedback) between 1 and 5000),
  marks numeric(6, 2) check (marks >= 0),
  max_marks numeric(6, 2) check (max_marks > 0 and max_marks <= 1000),
  reviewed_at timestamptz not null default now(),
  constraint practical_marks_within_max check (marks is null or (max_marks is not null and marks <= max_marks))
);

create table public.practical_evidence (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.practical_attempts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- <user uuid>/<attempt uuid>/<generated uuid>.<ext>: the app generates this; the student's file name is never used in a path
  storage_path text not null unique check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|png|jpg|webp)$'),
  original_name text not null check (char_length(original_name) between 1 and 200),
  mime_type text not null check (mime_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  created_at timestamptz not null default now()
);
create index practical_evidence_attempt_idx on public.practical_evidence (attempt_id);

-- ---------------------------------------------------------------
-- Authorisation helper: may the caller review this attempt? (boolean only)
-- ---------------------------------------------------------------
create or replace function public.can_review_practical(p_attempt uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.practical_attempts a
    where a.id = p_attempt
      and (
        public.is_admin()
        or (
          public.is_teacher_or_admin()
          and exists (
            select 1
            from public.enrollments e
            join public.courses c on c.id = e.course_id
            join public.classes cl on cl.id = c.class_id
            where e.user_id = a.user_id
              and c.created_by = (select auth.uid())
              and cl.grade = a.grade
          )
        )
      )
  );
$$;
revoke all on function public.can_review_practical(uuid) from public, anon;
grant execute on function public.can_review_practical(uuid) to authenticated;

-- ---------------------------------------------------------------
-- RLS: read only. Writes happen through the functions below.
-- ---------------------------------------------------------------
alter table public.practical_attempts enable row level security;
alter table public.practical_reviews enable row level security;
alter table public.practical_evidence enable row level security;
revoke all on public.practical_attempts, public.practical_reviews, public.practical_evidence from anon, authenticated;
grant select on public.practical_attempts, public.practical_reviews, public.practical_evidence to authenticated;

create policy "practical_attempts: student reads own"
  on public.practical_attempts for select to authenticated
  using (user_id = (select auth.uid()));
create policy "practical_attempts: reviewer reads submitted"
  on public.practical_attempts for select to authenticated
  using (status <> 'draft' and public.can_review_practical(id));

create policy "practical_reviews: student reads own"
  on public.practical_reviews for select to authenticated
  using (exists (select 1 from public.practical_attempts a where a.id = attempt_id and a.user_id = (select auth.uid())));
create policy "practical_reviews: reviewer reads"
  on public.practical_reviews for select to authenticated
  using (public.can_review_practical(attempt_id));

create policy "practical_evidence: student reads own"
  on public.practical_evidence for select to authenticated
  using (user_id = (select auth.uid()));
create policy "practical_evidence: reviewer reads submitted"
  on public.practical_evidence for select to authenticated
  using (
    public.can_review_practical(attempt_id)
    and exists (select 1 from public.practical_attempts a where a.id = attempt_id and a.status <> 'draft')
  );

-- ---------------------------------------------------------------
-- Student: save a draft. Locked once submitted. Older revisions are ignored.
-- ---------------------------------------------------------------
create or replace function public.save_practical_draft(p_activity text, p_grade smallint, p_content jsonb, p_revision bigint)
returns table (attempt_id uuid, saved_revision bigint, attempt_status public.practical_status)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.practical_attempts;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  if p_activity is null or p_activity !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or char_length(p_activity) > 80 then
    raise exception 'Invalid activity' using errcode = '22023';
  end if;
  if p_grade is null or p_grade not in (9, 10, 11, 12) then raise exception 'Invalid class' using errcode = '22023'; end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object' or pg_column_size(p_content) > 200000 then
    raise exception 'Invalid content' using errcode = '22023';
  end if;
  if p_revision is null or p_revision < 0 then raise exception 'Invalid revision' using errcode = '22023'; end if;

  select * into v_row from public.practical_attempts a where a.user_id = v_uid and a.activity_id = p_activity for update;
  if not found then
    insert into public.practical_attempts (user_id, activity_id, grade, content, revision)
    values (v_uid, p_activity, p_grade, p_content, p_revision)
    returning * into v_row;
  else
    if v_row.status <> 'draft' then raise exception 'This practical has been submitted and can no longer be changed' using errcode = '55000'; end if;
    if p_revision > v_row.revision then
      update public.practical_attempts a set content = p_content, revision = p_revision
      where a.id = v_row.id returning * into v_row;
    end if;
  end if;
  return query select v_row.id, v_row.revision, v_row.status;
end;
$$;

-- ---------------------------------------------------------------
-- Student: submit. Needs a saved draft and enrolment in a PUBLISHED course of the same class (so a teacher exists to review).
-- ---------------------------------------------------------------
create or replace function public.submit_practical(p_activity text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.practical_attempts;
  v_at timestamptz;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  select * into v_row from public.practical_attempts a where a.user_id = v_uid and a.activity_id = p_activity for update;
  if not found then raise exception 'Save a draft before submitting' using errcode = 'P0002'; end if;
  if v_row.status <> 'draft' then raise exception 'Already submitted' using errcode = '55000'; end if;
  if v_row.content = '{}'::jsonb then raise exception 'The draft is empty' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.enrollments e
    join public.courses c on c.id = e.course_id and c.status = 'published'
    join public.classes cl on cl.id = c.class_id
    where e.user_id = v_uid and cl.grade = v_row.grade
  ) then
    raise exception 'Enrol in a published Class % course before submitting' , v_row.grade using errcode = '42501';
  end if;
  update public.practical_attempts a set status = 'submitted', submitted_at = now() where a.id = v_row.id
  returning a.submitted_at into v_at;
  return v_at;
end;
$$;

-- ---------------------------------------------------------------
-- Teacher/admin: write feedback and optional marks for a submitted attempt they may review.
-- ---------------------------------------------------------------
create or replace function public.review_practical(p_attempt uuid, p_feedback text, p_marks numeric, p_max_marks numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_status public.practical_status;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  if not public.can_review_practical(p_attempt) then raise exception 'Not allowed' using errcode = '42501'; end if;
  select status into v_status from public.practical_attempts where id = p_attempt for update;
  if v_status is null or v_status = 'draft' then raise exception 'Only submitted work can be reviewed' using errcode = '55000'; end if;
  insert into public.practical_reviews (attempt_id, reviewer_id, feedback, marks, max_marks)
  values (p_attempt, v_uid, p_feedback, p_marks, p_max_marks)
  on conflict (attempt_id) do update
    set reviewer_id = excluded.reviewer_id, feedback = excluded.feedback,
        marks = excluded.marks, max_marks = excluded.max_marks, reviewed_at = now();
  update public.practical_attempts set status = 'reviewed' where id = p_attempt;
end;
$$;

-- ---------------------------------------------------------------
-- Student: record an uploaded evidence file (draft only, at most 5 files per attempt).
-- The path must be exactly <caller>/<attempt>/<file> so it matches the storage policy below.
-- ---------------------------------------------------------------
create or replace function public.register_practical_evidence(p_attempt uuid, p_path text, p_name text, p_mime text, p_size integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
begin
  if v_uid is null then raise exception 'Not signed in' using errcode = '28000'; end if;
  if not exists (select 1 from public.practical_attempts a where a.id = p_attempt and a.user_id = v_uid and a.status = 'draft') then
    raise exception 'Evidence can only be added to your own draft' using errcode = '42501';
  end if;
  if split_part(p_path, '/', 1) <> v_uid::text or split_part(p_path, '/', 2) <> p_attempt::text then
    raise exception 'Invalid file path' using errcode = '22023';
  end if;
  if (select count(*) from public.practical_evidence where attempt_id = p_attempt) >= 5 then
    raise exception 'At most 5 files per practical' using errcode = '54000';
  end if;
  insert into public.practical_evidence (attempt_id, user_id, storage_path, original_name, mime_type, size_bytes)
  values (p_attempt, v_uid, p_path, p_name, p_mime, p_size) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.save_practical_draft(text, smallint, jsonb, bigint) from public, anon;
revoke all on function public.submit_practical(text) from public, anon;
revoke all on function public.review_practical(uuid, text, numeric, numeric) from public, anon;
revoke all on function public.register_practical_evidence(uuid, text, text, text, integer) from public, anon;
grant execute on function public.save_practical_draft(text, smallint, jsonb, bigint) to authenticated;
grant execute on function public.submit_practical(text) to authenticated;
grant execute on function public.review_practical(uuid, text, numeric, numeric) to authenticated;
grant execute on function public.register_practical_evidence(uuid, text, text, text, integer) to authenticated;

-- ---------------------------------------------------------------
-- Storage: NEW private bucket. The existing "resources" bucket is staff-write only and is NOT reused.
-- 5 MB limit; PDF and common image types only. The bucket's MIME list trusts the browser, so the server
-- action must also check the file's leading bytes before uploading.
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('practical-evidence', 'practical-evidence', false, 5242880,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "practical-evidence: student uploads to own draft"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'practical-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.practical_attempts a
      where a.id::text = (storage.foldername(name))[2] and a.user_id = (select auth.uid()) and a.status = 'draft'
    )
  );

create policy "practical-evidence: student reads own"
  on storage.objects for select to authenticated
  using (bucket_id = 'practical-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "practical-evidence: reviewer reads submitted"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'practical-evidence'
    and exists (
      select 1 from public.practical_evidence ev
      join public.practical_attempts a on a.id = ev.attempt_id
      where ev.storage_path = storage.objects.name and a.status <> 'draft' and public.can_review_practical(a.id)
    )
  );

create policy "practical-evidence: student deletes own while draft"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'practical-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.practical_attempts a
      where a.id::text = (storage.foldername(name))[2] and a.user_id = (select auth.uid()) and a.status = 'draft'
    )
  );
-- No public policy, no update policy. Files are served only through short-lived signed URLs created with the caller's own session.

-- ROLLBACK (destructive; run by hand only):
--   drop table public.practical_evidence, public.practical_reviews, public.practical_attempts;
--   drop function public.register_practical_evidence(uuid, text, text, text, integer), public.review_practical(uuid, text, numeric, numeric),
--     public.submit_practical(text), public.save_practical_draft(text, smallint, jsonb, bigint), public.can_review_practical(uuid);
--   drop type public.practical_status;
--   delete the 4 "practical-evidence" policies on storage.objects, then empty and delete the bucket in the dashboard.
