-- Quello che Supabase dà già e un Postgres nudo no: lo schema `auth` con la
-- tabella degli utenti, `auth.uid()` e i due ruoli delle policy. Serve solo a
-- test/schema-sql.test.js per caricare supabase/schema.sql fuori da Supabase.
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key, email text, raw_user_meta_data jsonb, created_at timestamptz default clock_timestamp()
);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
-- In Supabase i ruoli dell'API hanno già i permessi di tabella sullo schema
-- public, e le policy RLS decidono il resto. Qui si danno a mano.
grant usage on schema public, auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
alter default privileges in schema public grant all on tables to authenticated, anon;
