-- Allow the sign-in entry point to accept the existing profile username and
-- explicitly configured email aliases without creating a second auth account.
-- The alias table is intentionally private; the resolver only returns the
-- canonical auth email after the supplied password has been verified.

create table if not exists public.auth_login_aliases (
  alias text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint auth_login_aliases_alias_normalized
    check (alias = lower(btrim(alias)) and char_length(alias) > 0),
  constraint auth_login_aliases_user_alias_unique unique (user_id, alias)
);

alter table public.auth_login_aliases enable row level security;
revoke all on table public.auth_login_aliases from public, anon, authenticated;

create or replace function public.resolve_login_identifier(p_identifier text, p_password text)
returns text
language sql
security definer
stable
set search_path = pg_catalog, public, extensions
as $$
  with normalized as (
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
    from selected
   where encrypted_password is not null
     and extensions.crypt(coalesce(p_password, ''), encrypted_password) = encrypted_password
   order by email
   limit 1;
$$;

revoke all on function public.resolve_login_identifier(text, text) from public, anon, authenticated;
grant execute on function public.resolve_login_identifier(text, text) to anon, authenticated;
