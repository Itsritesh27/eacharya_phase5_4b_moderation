-- LOCAL TEST STAND-IN for the parts of Supabase these migrations rely on.
-- NEVER run this on a real Supabase project. It refuses if Supabase roles already exist.
do $$
begin
  -- Real Supabase has these; a scratch local Postgres does not.
  if exists (select 1 from pg_roles where rolname in ('supabase_admin', 'authenticator', 'supabase_auth_admin'))
     or exists (select 1 from pg_namespace where nspname in ('auth', 'storage', 'extensions')) then
    raise exception 'Refusing to run: this looks like a real Supabase project (or an already-stubbed DB). The stub is for scratch local databases only.';
  end if;
  -- roles are cluster-wide; reuse them when an earlier scratch database created them
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema auth;
create schema extensions;
create schema storage;
grant usage on schema auth, extensions, storage to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid,
  aud text,
  role text,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

-- Same behaviour as Supabase: the user id comes from the JWT claims setting.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(
    coalesce(current_setting('request.jwt.claim.sub', true),
             (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')),
    '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

create table storage.buckets (
  id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select string_to_array(name, '/')
$$;
grant select on storage.buckets, storage.objects to anon, authenticated;
