-- A small stand-in for the parts of Supabase that schema.sql relies on (for local tests only).
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb,
  created_at timestamptz default now(),
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz
);
-- Like Supabase: the signed-in user's id comes from the request's JWT.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
