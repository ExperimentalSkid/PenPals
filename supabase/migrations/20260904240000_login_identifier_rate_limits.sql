-- Protect the username/alias sign-in path, which is resolved through a
-- database function instead of Supabase Auth's /auth/v1/token endpoint.
-- Only one-way hashes are stored and the table is never client-readable.

create table if not exists public.auth_login_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0)
);

create index if not exists auth_login_rate_limits_window_idx
  on public.auth_login_rate_limits (window_started_at);

alter table public.auth_login_rate_limits enable row level security;
revoke all on table public.auth_login_rate_limits from public, anon, authenticated;

create or replace function public.consume_login_identifier_attempt(p_identifier text)
returns boolean
language plpgsql
security definer
volatile
set search_path = pg_catalog, public, extensions
as $$
declare
  normalized text := lower(btrim(coalesce(p_identifier, '')));
  hashed_key text;
  current_row public.auth_login_rate_limits;
begin
  if normalized = '' or char_length(normalized) > 320 then
    return false;
  end if;

  hashed_key := encode(extensions.digest('identifier:' || normalized, 'sha256'), 'hex');
  select * into current_row
    from public.auth_login_rate_limits
   where key_hash = hashed_key
   for update;

  if not found then
    insert into public.auth_login_rate_limits (key_hash, window_started_at, attempts)
    values (hashed_key, now(), 1);
    return true;
  end if;

  if current_row.window_started_at <= now() - interval '5 minutes' then
    update public.auth_login_rate_limits
       set window_started_at = now(), attempts = 1
     where key_hash = hashed_key;
    return true;
  end if;

  if current_row.attempts >= 10 then
    return false;
  end if;

  update public.auth_login_rate_limits
     set attempts = current_row.attempts + 1
   where key_hash = hashed_key;
  return true;
end;
$$;

revoke all on function public.consume_login_identifier_attempt(text) from public, anon, authenticated;

create or replace function public.consume_login_client_attempt(p_client_key text)
returns boolean
language plpgsql
security definer
volatile
set search_path = pg_catalog, public, extensions
as $$
declare
  normalized text := btrim(coalesce(p_client_key, ''));
  hashed_key text;
  current_row public.auth_login_rate_limits;
begin
  if normalized = '' or char_length(normalized) > 200 then
    return false;
  end if;

  hashed_key := encode(extensions.digest('client:' || normalized, 'sha256'), 'hex');
  select * into current_row
    from public.auth_login_rate_limits
   where key_hash = hashed_key
   for update;

  if not found then
    insert into public.auth_login_rate_limits (key_hash, window_started_at, attempts)
    values (hashed_key, now(), 1);
    return true;
  end if;

  if current_row.window_started_at <= now() - interval '5 minutes' then
    update public.auth_login_rate_limits
       set window_started_at = now(), attempts = 1
     where key_hash = hashed_key;
    return true;
  end if;

  if current_row.attempts >= 30 then
    return false;
  end if;

  update public.auth_login_rate_limits
     set attempts = current_row.attempts + 1
   where key_hash = hashed_key;
  return true;
end;
$$;

revoke all on function public.consume_login_client_attempt(text) from public, anon, authenticated;
grant execute on function public.consume_login_client_attempt(text) to anon, authenticated;

-- Apply the identifier bucket inside the resolver itself so a caller cannot
-- bypass throttling by posting directly to the public RPC endpoint.
create or replace function public.resolve_login_identifier(p_identifier text, p_password text)
returns text
language sql
security definer
volatile
set search_path = pg_catalog, public, extensions
as $$
  with allowed as materialized (
    select public.consume_login_identifier_attempt(p_identifier) as ok
  ), normalized as (
    select lower(btrim(coalesce(p_identifier, ''))) as value
  ), candidates as (
    select u.email, u.encrypted_password,
           case
             when lower(u.email) = n.value then 0
             when lower(p.username) = n.value then 1
             else 2
           end as match_order
      from normalized n
      join auth.users u on lower(u.email) = n.value
      left join public.profiles p on p.id = u.id
    union all
    select u.email, u.encrypted_password, 1
      from normalized n
      join public.profiles p on lower(p.username) = n.value
      join auth.users u on u.id = p.id
    union all
    select u.email, u.encrypted_password, 2
      from normalized n
      join public.auth_login_aliases a on a.alias = n.value
      join auth.users u on u.id = a.user_id
  ), selected as (
    select distinct on (email) email, encrypted_password
      from candidates
     order by email, match_order
  )
  select email
    from selected, allowed
   where allowed.ok
     and encrypted_password is not null
     and extensions.crypt(coalesce(p_password, ''), encrypted_password) = encrypted_password
   order by email
   limit 1;
$$;

revoke all on function public.resolve_login_identifier(text, text) from public, anon, authenticated;
grant execute on function public.resolve_login_identifier(text, text) to anon, authenticated;
