-- eAcharya Phase 3, Task 3.1: assessment database and question bank
--
-- ADDITIVE ONLY. This migration creates new types, tables, functions, triggers
-- and policies. It does not alter, drop or re-grant anything from migrations
-- 1-3, and it does not touch existing rows.
--
-- New tables
--   assessments            quiz/test header (course, optional unit, window, limits)
--   questions              question text, type, marks, order. NO answers here.
--   question_options       choices for single_choice / multiple_select. NO flags here.
--   question_answer_keys   STAFF-ONLY: true/false answer, accepted short answers, explanation
--   question_correct_options  STAFF-ONLY: which option(s) are correct
--
-- Secure delivery design
--   Students read assessments / questions / question_options directly through
--   RLS. Those three tables contain no answer information at all, so no
--   column-level trick is needed to keep keys private. The two key tables have
--   NO student policy, so a student query returns zero rows. Explanations are
--   stored with the key (not on `questions`) because they usually reveal the
--   answer. Grading and post-submission review (Tasks 3.3/3.4) must use
--   SECURITY DEFINER functions that read the key tables server-side.

-- ---------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------
create type public.assessment_status as enum ('draft', 'published');
create type public.question_type as enum (
  'single_choice', 'true_false', 'multiple_select', 'short_answer', 'descriptive'
);

-- ---------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 2000),
  instructions text not null default '' check (char_length(instructions) <= 10000),
  course_id uuid not null references public.courses (id) on delete cascade,
  unit_id uuid references public.units (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  status public.assessment_status not null default 'draft',
  total_marks numeric(7, 2) not null check (total_marks > 0),
  passing_marks numeric(7, 2),
  duration_minutes integer check (duration_minutes is null or duration_minutes between 1 and 600),
  -- null = unlimited attempts
  attempt_limit integer check (attempt_limit is null or attempt_limit between 1 and 50),
  opens_at timestamptz,
  closes_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessments_passing_marks_valid check (
    passing_marks is null or (passing_marks > 0 and passing_marks <= total_marks)
  ),
  constraint assessments_window_valid check (
    opens_at is null or closes_at is null or closes_at > opens_at
  )
);

create index assessments_course_status_idx on public.assessments (course_id, status);
create index assessments_unit_id_idx on public.assessments (unit_id) where unit_id is not null;
create index assessments_created_by_idx on public.assessments (created_by);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments (id) on delete cascade,
  question_type public.question_type not null,
  question_text text not null check (char_length(btrim(question_text)) between 1 and 5000),
  image_url text check (
    image_url is null
    or (char_length(image_url) <= 1000 and image_url ~* '^https://')
  ),
  marks numeric(6, 2) not null check (marks > 0 and marks <= 1000),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, position) deferrable initially deferred
);

create table public.question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  option_text text not null check (char_length(btrim(option_text)) between 1 and 1000),
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  unique (question_id, position) deferrable initially deferred,
  -- lets question_correct_options guarantee option and question belong together
  unique (id, question_id)
);

-- STAFF-ONLY. One row per question that needs a key or explanation.
create table public.question_answer_keys (
  question_id uuid primary key references public.questions (id) on delete cascade,
  -- true_false questions only
  correct_boolean boolean,
  -- short_answer questions only (matched after trimming; case per case_sensitive)
  accepted_answers text[] not null default '{}' check (cardinality(accepted_answers) <= 20),
  case_sensitive boolean not null default false,
  -- shown to students only after submission (delivered by a server-side function later)
  explanation text check (explanation is null or char_length(explanation) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- STAFF-ONLY. Correct option(s) for single_choice / multiple_select.
create table public.question_correct_options (
  question_id uuid not null,
  option_id uuid not null,
  primary key (question_id, option_id),
  foreign key (option_id, question_id)
    references public.question_options (id, question_id) on delete cascade
);
create index question_correct_options_option_idx on public.question_correct_options (option_id);

comment on table public.question_answer_keys is
  'STAFF ONLY. Never grant to anon and never add a student policy. Students must not read answer keys before submission.';
comment on table public.question_correct_options is
  'STAFF ONLY. Never grant to anon and never add a student policy. Students must not read answer keys before submission.';

-- ---------------------------------------------------------------
-- Helper functions (SECURITY DEFINER, fixed search_path, boolean results only)
-- ---------------------------------------------------------------

-- Teacher authority = the teacher created the course (same rule as lessons/resources).
create or replace function public.owns_course(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.courses c
    where c.id = p_course and c.created_by = (select auth.uid())
  );
$$;

create or replace function public.owns_assessment_course(p_assessment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assessments a
    join public.courses c on c.id = a.course_id
    where a.id = p_assessment and c.created_by = (select auth.uid())
  );
$$;

create or replace function public.owns_question_course(p_question uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.questions q
    join public.assessments a on a.id = q.assessment_id
    join public.courses c on c.id = a.course_id
    where q.id = p_question and c.created_by = (select auth.uid())
  );
$$;

create or replace function public.assessment_is_draft(p_assessment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.assessments a
    where a.id = p_assessment and a.status = 'draft'
  );
$$;

create or replace function public.question_assessment_is_draft(p_question uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.questions q
    join public.assessments a on a.id = q.assessment_id
    where q.id = p_question and a.status = 'draft'
  );
$$;

-- Published assessment, in a published course the caller is enrolled in.
create or replace function public.is_enrolled_in_assessment(p_assessment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assessments a
    join public.courses c on c.id = a.course_id
    join public.enrollments e on e.course_id = c.id
    where a.id = p_assessment
      and a.status = 'published'
      and c.status = 'published'
      and e.user_id = (select auth.uid())
  );
$$;

-- As above, and inside the opens_at / closes_at window. Gates question content.
create or replace function public.is_assessment_open(p_assessment uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assessments a
    join public.courses c on c.id = a.course_id
    join public.enrollments e on e.course_id = c.id
    where a.id = p_assessment
      and a.status = 'published'
      and c.status = 'published'
      and e.user_id = (select auth.uid())
      and (a.opens_at is null or a.opens_at <= now())
      and (a.closes_at is null or a.closes_at > now())
  );
$$;

create or replace function public.is_question_open(p_question uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select public.is_assessment_open(q.assessment_id)
       from public.questions q where q.id = p_question),
    false
  );
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'owns_course(uuid)', 'owns_assessment_course(uuid)', 'owns_question_course(uuid)',
    'assessment_is_draft(uuid)', 'question_assessment_is_draft(uuid)',
    'is_enrolled_in_assessment(uuid)', 'is_assessment_open(uuid)', 'is_question_open(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------
-- Publish validation: a published assessment is always complete and consistent.
-- Runs from a trigger only; not callable by app roles.
-- ---------------------------------------------------------------
create or replace function public.assert_assessment_publishable(p_assessment uuid, p_total_marks numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  q record;
  v_count integer;
  v_sum numeric;
  n_opts integer;
  n_correct integer;
begin
  select count(*), coalesce(sum(marks), 0) into v_count, v_sum
  from public.questions where assessment_id = p_assessment;

  if v_count = 0 then
    raise exception 'An assessment needs at least one question before it can be published'
      using errcode = '23514';
  end if;

  if v_sum <> p_total_marks then
    raise exception 'Question marks add up to %, but total marks is %', v_sum, p_total_marks
      using errcode = '23514';
  end if;

  for q in
    select id, question_type, position from public.questions
    where assessment_id = p_assessment order by position
  loop
    if q.question_type in ('single_choice', 'multiple_select') then
      select count(*) into n_opts from public.question_options where question_id = q.id;
      select count(*) into n_correct from public.question_correct_options where question_id = q.id;
      if n_opts < 2 then
        raise exception 'Question % needs at least two options', q.position + 1
          using errcode = '23514';
      end if;
      if q.question_type = 'single_choice' and n_correct <> 1 then
        raise exception 'Question % needs exactly one correct option', q.position + 1
          using errcode = '23514';
      end if;
      if q.question_type = 'multiple_select' and n_correct < 1 then
        raise exception 'Question % needs at least one correct option', q.position + 1
          using errcode = '23514';
      end if;
    elsif q.question_type = 'true_false' then
      if not exists (
        select 1 from public.question_answer_keys k
        where k.question_id = q.id and k.correct_boolean is not null
      ) then
        raise exception 'Question % needs a correct true/false answer', q.position + 1
          using errcode = '23514';
      end if;
    elsif q.question_type = 'short_answer' then
      if not exists (
        select 1 from public.question_answer_keys k
        where k.question_id = q.id and cardinality(k.accepted_answers) >= 1
      ) then
        raise exception 'Question % needs at least one accepted answer', q.position + 1
          using errcode = '23514';
      end if;
    end if;
    -- descriptive questions are marked by hand and need no key.
  end loop;
end;
$$;

revoke all on function public.assert_assessment_publishable(uuid, numeric)
  from public, anon, authenticated;

-- ---------------------------------------------------------------
-- Triggers: assessments
-- ---------------------------------------------------------------
create trigger assessments_set_updated_at
  before update on public.assessments
  for each row execute function public.set_updated_at();

-- The creator is always the signed-in caller; a browser-supplied created_by is
-- overwritten. Trusted backends (no end-user session) may set it explicitly.
create or replace function public.assessments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.created_by := (select auth.uid());
  end if;
  return new;
end;
$$;

create trigger assessments_before_insert
  before insert on public.assessments
  for each row execute function public.assessments_before_insert();

-- Ownership columns cannot be changed from an end-user session.
create or replace function public.assessments_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'assessments.id is immutable';
  end if;
  if (select auth.uid()) is not null
     and (new.created_by is distinct from old.created_by
          or new.course_id is distinct from old.course_id) then
    raise exception 'The creator and course of an assessment cannot be changed'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger assessments_guard_update
  before update on public.assessments
  for each row execute function public.assessments_guard_update();

-- Unit must belong to the course; published assessments must be complete.
create or replace function public.assessments_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.unit_id is not null and not exists (
    select 1 from public.units u where u.id = new.unit_id and u.course_id = new.course_id
  ) then
    raise exception 'The unit does not belong to the assessment''s course'
      using errcode = '23514';
  end if;

  if new.status = 'published' then
    perform public.assert_assessment_publishable(new.id, new.total_marks);
  end if;
  return new;
end;
$$;

create trigger assessments_validate
  before insert or update on public.assessments
  for each row execute function public.assessments_validate();

revoke all on function public.assessments_before_insert() from public, anon, authenticated;
revoke all on function public.assessments_guard_update() from public, anon, authenticated;
revoke all on function public.assessments_validate() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- Triggers: questions, options, keys
-- ---------------------------------------------------------------
create trigger questions_set_updated_at
  before update on public.questions
  for each row execute function public.set_updated_at();

create trigger question_answer_keys_set_updated_at
  before update on public.question_answer_keys
  for each row execute function public.set_updated_at();

-- A question cannot be moved to another assessment or change type
-- (that would orphan or mismatch its options and key).
create or replace function public.questions_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
     or new.assessment_id is distinct from old.assessment_id
     or new.question_type is distinct from old.question_type then
    raise exception 'A question''s assessment and type cannot be changed; delete and recreate it'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger questions_guard_update
  before update on public.questions
  for each row execute function public.questions_guard_update();

-- Options exist only for choice questions, at most 10 each.
create or replace function public.question_options_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.question_type;
begin
  select question_type into t from public.questions where id = new.question_id;
  if t is null or t not in ('single_choice', 'multiple_select') then
    raise exception 'Options are only allowed on single-choice and multiple-select questions'
      using errcode = '23514';
  end if;
  if (select count(*) from public.question_options where question_id = new.question_id) >= 10 then
    raise exception 'A question can have at most 10 options' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger question_options_validate
  before insert on public.question_options
  for each row execute function public.question_options_validate();

-- Key shape must match the question type.
create or replace function public.question_answer_keys_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.question_type;
begin
  select question_type into t from public.questions where id = new.question_id;
  if t is null then
    raise exception 'Unknown question' using errcode = '23503';
  end if;

  if t <> 'true_false' and new.correct_boolean is not null then
    raise exception 'correct_boolean is only for true/false questions' using errcode = '23514';
  end if;
  if t <> 'short_answer' and cardinality(new.accepted_answers) > 0 then
    raise exception 'accepted_answers is only for short-answer questions' using errcode = '23514';
  end if;
  if exists (
    select 1 from unnest(new.accepted_answers) a
    where a is null or char_length(btrim(a)) not between 1 and 200
  ) then
    raise exception 'Each accepted answer must be 1 to 200 characters' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger question_answer_keys_validate
  before insert or update on public.question_answer_keys
  for each row execute function public.question_answer_keys_validate();

-- Correct options only on choice questions; single_choice has at most one.
create or replace function public.question_correct_options_validate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.question_type;
begin
  select question_type into t from public.questions where id = new.question_id;
  if t is null or t not in ('single_choice', 'multiple_select') then
    raise exception 'Correct options are only for single-choice and multiple-select questions'
      using errcode = '23514';
  end if;
  if t = 'single_choice' and exists (
    select 1 from public.question_correct_options where question_id = new.question_id
  ) then
    raise exception 'A single-choice question has exactly one correct option; remove the old one first'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger question_correct_options_validate
  before insert on public.question_correct_options
  for each row execute function public.question_correct_options_validate();

revoke all on function public.questions_guard_update() from public, anon, authenticated;
revoke all on function public.question_options_validate() from public, anon, authenticated;
revoke all on function public.question_answer_keys_validate() from public, anon, authenticated;
revoke all on function public.question_correct_options_validate() from public, anon, authenticated;

-- ---------------------------------------------------------------
-- RLS + privileges
-- ---------------------------------------------------------------
alter table public.assessments enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.question_answer_keys enable row level security;
alter table public.question_correct_options enable row level security;

revoke all on public.assessments, public.questions, public.question_options,
  public.question_answer_keys, public.question_correct_options from anon, authenticated;
-- anon gets nothing: assessments are never public.

-- created_by and course_id are insert-only; no one can update them via the API.
grant select, delete on public.assessments to authenticated;
grant insert (title, description, instructions, course_id, unit_id, created_by, status,
              total_marks, passing_marks, duration_minutes, attempt_limit, opens_at, closes_at)
  on public.assessments to authenticated;
grant update (title, description, instructions, unit_id, status,
              total_marks, passing_marks, duration_minutes, attempt_limit, opens_at, closes_at)
  on public.assessments to authenticated;

grant select, delete on public.questions to authenticated;
grant insert (assessment_id, question_type, question_text, image_url, marks, position)
  on public.questions to authenticated;
grant update (question_text, image_url, marks, position) on public.questions to authenticated;

grant select, delete on public.question_options to authenticated;
grant insert (question_id, option_text, position) on public.question_options to authenticated;
grant update (option_text, position) on public.question_options to authenticated;

-- Key tables: privileges are granted, but policies below match staff only,
-- so a student (or any non-owner) sees zero rows and cannot write.
grant select, delete on public.question_answer_keys to authenticated;
grant insert (question_id, correct_boolean, accepted_answers, case_sensitive, explanation)
  on public.question_answer_keys to authenticated;
grant update (correct_boolean, accepted_answers, case_sensitive, explanation)
  on public.question_answer_keys to authenticated;

grant select, insert, delete on public.question_correct_options to authenticated;

-- ---------------------------------------------------------------
-- assessments policies
-- ---------------------------------------------------------------
create policy "assessments: students read available"
  on public.assessments for select to authenticated
  using (status = 'published' and public.is_enrolled_in_assessment(id));

create policy "assessments: teachers read own courses"
  on public.assessments for select to authenticated
  using (public.is_teacher_or_admin() and public.owns_course(course_id));

create policy "assessments: teachers create drafts in own courses"
  on public.assessments for insert to authenticated
  with check (
    public.is_teacher_or_admin()
    and public.owns_course(course_id)
    and created_by = (select auth.uid())
    and status = 'draft'
  );

create policy "assessments: teachers update in own courses"
  on public.assessments for update to authenticated
  using (public.is_teacher_or_admin() and public.owns_course(course_id))
  with check (public.is_teacher_or_admin() and public.owns_course(course_id));

create policy "assessments: teachers delete own drafts"
  on public.assessments for delete to authenticated
  using (
    public.is_teacher_or_admin()
    and public.owns_course(course_id)
    and status = 'draft'
  );

create policy "assessments: admins manage"
  on public.assessments for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------
-- questions policies (content is locked while an assessment is published)
-- ---------------------------------------------------------------
create policy "questions: students read when open"
  on public.questions for select to authenticated
  using (public.is_assessment_open(assessment_id));

create policy "questions: teachers read own"
  on public.questions for select to authenticated
  using (public.is_teacher_or_admin() and public.owns_assessment_course(assessment_id));

create policy "questions: teachers manage in own drafts"
  on public.questions for all to authenticated
  using (
    public.is_teacher_or_admin()
    and public.owns_assessment_course(assessment_id)
    and public.assessment_is_draft(assessment_id)
  )
  with check (
    public.is_teacher_or_admin()
    and public.owns_assessment_course(assessment_id)
    and public.assessment_is_draft(assessment_id)
  );

create policy "questions: admins read all"
  on public.questions for select to authenticated
  using (public.is_admin());

create policy "questions: admins manage drafts"
  on public.questions for all to authenticated
  using (public.is_admin() and public.assessment_is_draft(assessment_id))
  with check (public.is_admin() and public.assessment_is_draft(assessment_id));

-- ---------------------------------------------------------------
-- question_options policies
-- ---------------------------------------------------------------
create policy "question_options: students read when open"
  on public.question_options for select to authenticated
  using (public.is_question_open(question_id));

create policy "question_options: teachers read own"
  on public.question_options for select to authenticated
  using (public.is_teacher_or_admin() and public.owns_question_course(question_id));

create policy "question_options: teachers manage in own drafts"
  on public.question_options for all to authenticated
  using (
    public.is_teacher_or_admin()
    and public.owns_question_course(question_id)
    and public.question_assessment_is_draft(question_id)
  )
  with check (
    public.is_teacher_or_admin()
    and public.owns_question_course(question_id)
    and public.question_assessment_is_draft(question_id)
  );

create policy "question_options: admins read all"
  on public.question_options for select to authenticated
  using (public.is_admin());

create policy "question_options: admins manage drafts"
  on public.question_options for all to authenticated
  using (public.is_admin() and public.question_assessment_is_draft(question_id))
  with check (public.is_admin() and public.question_assessment_is_draft(question_id));

-- ---------------------------------------------------------------
-- question_answer_keys policies (STAFF ONLY: no student policy exists)
-- ---------------------------------------------------------------
create policy "question_answer_keys: teachers read own"
  on public.question_answer_keys for select to authenticated
  using (public.is_teacher_or_admin() and public.owns_question_course(question_id));

create policy "question_answer_keys: teachers manage in own drafts"
  on public.question_answer_keys for all to authenticated
  using (
    public.is_teacher_or_admin()
    and public.owns_question_course(question_id)
    and public.question_assessment_is_draft(question_id)
  )
  with check (
    public.is_teacher_or_admin()
    and public.owns_question_course(question_id)
    and public.question_assessment_is_draft(question_id)
  );

create policy "question_answer_keys: admins read all"
  on public.question_answer_keys for select to authenticated
  using (public.is_admin());

create policy "question_answer_keys: admins manage drafts"
  on public.question_answer_keys for all to authenticated
  using (public.is_admin() and public.question_assessment_is_draft(question_id))
  with check (public.is_admin() and public.question_assessment_is_draft(question_id));

-- ---------------------------------------------------------------
-- question_correct_options policies (STAFF ONLY: no student policy exists)
-- ---------------------------------------------------------------
create policy "question_correct_options: teachers read own"
  on public.question_correct_options for select to authenticated
  using (public.is_teacher_or_admin() and public.owns_question_course(question_id));

create policy "question_correct_options: teachers manage in own drafts"
  on public.question_correct_options for all to authenticated
  using (
    public.is_teacher_or_admin()
    and public.owns_question_course(question_id)
    and public.question_assessment_is_draft(question_id)
  )
  with check (
    public.is_teacher_or_admin()
    and public.owns_question_course(question_id)
    and public.question_assessment_is_draft(question_id)
  );

create policy "question_correct_options: admins read all"
  on public.question_correct_options for select to authenticated
  using (public.is_admin());

create policy "question_correct_options: admins manage drafts"
  on public.question_correct_options for all to authenticated
  using (public.is_admin() and public.question_assessment_is_draft(question_id))
  with check (public.is_admin() and public.question_assessment_is_draft(question_id));
