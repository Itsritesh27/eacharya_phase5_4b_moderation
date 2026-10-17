-- eAcharya Phase 1: initial schema
-- Tables: profiles, classes, subjects, courses, units, lessons

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------
create type public.user_role as enum ('student', 'teacher', 'admin');
create type public.course_status as enum ('draft', 'published');

-- ---------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  avatar_url text,
  role public.user_role not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- classes
-- ---------------------------------------------------------------
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  grade smallint not null unique check (grade in (9, 10, 11, 12)),
  name text not null,
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- subjects
-- ---------------------------------------------------------------
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- courses
-- ---------------------------------------------------------------
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text not null default '',
  class_id uuid not null references public.classes (id) on delete restrict,
  subject_id uuid not null references public.subjects (id) on delete restrict,
  thumbnail_url text,
  status public.course_status not null default 'draft',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index courses_class_id_idx on public.courses (class_id);
create index courses_subject_id_idx on public.courses (subject_id);
create index courses_created_by_idx on public.courses (created_by);
create index courses_status_idx on public.courses (status);

create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------
-- units
-- ---------------------------------------------------------------
create table public.units (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  title text not null,
  description text not null default '',
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  unique (course_id, position) deferrable initially deferred
);

create index units_course_id_idx on public.units (course_id);

-- ---------------------------------------------------------------
-- lessons
-- ---------------------------------------------------------------
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units (id) on delete cascade,
  title text not null,
  description text not null default '',
  position integer not null check (position >= 0),
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unit_id, position) deferrable initially deferred
);

create index lessons_unit_id_idx on public.lessons (unit_id);

create trigger lessons_set_updated_at
  before update on public.lessons
  for each row execute function public.set_updated_at();
