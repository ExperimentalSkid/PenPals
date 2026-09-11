-- Member-created, shareable invitations. Tokens are one-use bearer secrets; only hashes are persisted.
create table public.member_invites (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  opened_at timestamptz,
  invitee_user_id uuid unique references auth.users(id) on delete set null,
  registered_at timestamptz,
  completed_at timestamptz,
  revoked_at timestamptz,
  check (expires_at > created_at)
);

create index member_invites_inviter_created_idx on public.member_invites(inviter_id, created_at desc);
create index member_invites_expiry_idx on public.member_invites(expires_at) where revoked_at is null and registered_at is null;
alter table public.member_invites enable row level security;
revoke all on table public.member_invites from public, anon, authenticated;

create or replace function public.create_member_invite()
returns table(invite_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  me uuid := auth.uid();
  raw_token text;
  expiry timestamptz := now() + interval '30 days';
  new_id uuid;
begin
  if me is null or not public.is_email_verified() then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles p where p.id = me and p.deactivated_at is null) then
    raise exception 'Profile unavailable';
  end if;
  if (select count(*) from public.member_invites i where i.inviter_id = me and i.created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Invite creation rate limit reached';
  end if;
  if (select count(*) from public.member_invites i where i.inviter_id = me and i.revoked_at is null and i.registered_at is null and i.expires_at > now()) >= 10 then
    raise exception 'Too many active invitations';
  end if;
  raw_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.member_invites(inviter_id, token_hash, expires_at)
  values (me, encode(extensions.digest(raw_token, 'sha256'), 'hex'), expiry)
  returning id into new_id;
  return query select new_id, raw_token, expiry;
end;
$$;


create or replace function public.revoke_member_invite(p_invite_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid := auth.uid(); changed integer := 0;
begin
  if me is null then raise exception 'Authentication required'; end if;
  update public.member_invites
     set revoked_at = now()
   where id = p_invite_id and inviter_id = me and revoked_at is null and registered_at is null;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.open_member_invite(p_token text)
returns table(inviter_username text, inviter_display_name text, invite_expires_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare token_digest text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return; end if;
  token_digest := encode(extensions.digest(p_token, 'sha256'), 'hex');
  update public.member_invites i
     set opened_at = coalesce(i.opened_at, now())
   where i.token_hash = token_digest and i.revoked_at is null and i.registered_at is null and i.expires_at > now();
  return query
  select p.username, p.display_name, i.expires_at
    from public.member_invites i join public.profiles p on p.id = i.inviter_id
   where i.token_hash = token_digest and i.revoked_at is null and i.registered_at is null
     and i.expires_at > now() and p.deactivated_at is null;
end;
$$;

create or replace function public.claim_member_invite_for_user(target_user uuid, p_token text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare token_digest text; changed integer := 0;
begin
  if target_user is null or p_token is null or p_token !~ '^[0-9a-f]{64}$' then return false; end if;
  token_digest := encode(extensions.digest(p_token, 'sha256'), 'hex');
  if exists (select 1 from public.member_invites where token_hash = token_digest and invitee_user_id = target_user and registered_at is not null) then
    return true;
  end if;
  update public.member_invites i
     set invitee_user_id = target_user, registered_at = now(), opened_at = coalesce(i.opened_at, now())
   where i.token_hash = token_digest and i.revoked_at is null and i.registered_at is null
     and i.expires_at > now() and i.inviter_id <> target_user;
  get diagnostics changed = row_count;
  return changed = 1;
exception when unique_violation then
  return false;
end;
$$;

create or replace function public.claim_member_invite(p_token text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Authentication required'; end if;
  return public.claim_member_invite_for_user(me, p_token);
end;
$$;

create or replace function public.consume_member_invite_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare invite_token text;
begin
  if new.email_confirmed_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.email_confirmed_at is not null then return new; end if;
  invite_token := nullif(new.raw_user_meta_data ->> 'member_invite_token', '');
  if invite_token is not null then perform public.claim_member_invite_for_user(new.id, invite_token); end if;
  return new;
end;
$$;

drop trigger if exists auth_users_member_invite_claim on auth.users;
create trigger auth_users_member_invite_claim
after insert or update of email_confirmed_at on auth.users
for each row execute function public.consume_member_invite_from_auth_user();

create or replace function public.complete_my_member_invite()
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid := auth.uid(); changed integer := 0;
begin
  if me is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.profiles p where p.id = me
      and char_length(btrim(p.display_name)) >= 2 and p.birth_date is not null and char_length(btrim(p.country)) > 0
      and (select count(*) from public.profile_languages l where l.profile_id = me) >= 1
      and (select count(*) from public.profile_interests x where x.profile_id = me) >= 3
  ) then return false; end if;
  update public.member_invites set completed_at = coalesce(completed_at, now())
   where invitee_user_id = me and registered_at is not null and completed_at is null;
  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

create or replace function public.get_my_member_invites()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'sent', coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'created_at', i.created_at, 'expires_at', i.expires_at,
      'opened_at', i.opened_at, 'registered_at', i.registered_at,
      'completed_at', i.completed_at, 'revoked_at', i.revoked_at
    ) order by i.created_at desc) from public.member_invites i where i.inviter_id = auth.uid()), '[]'::jsonb),
    'received', coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'inviter_username', p.username, 'registered_at', i.registered_at, 'completed_at', i.completed_at
    )) from public.member_invites i join public.profiles p on p.id = i.inviter_id where i.invitee_user_id = auth.uid()), '[]'::jsonb)
  ) where auth.uid() is not null
$$;

revoke all on function public.create_member_invite() from public, anon;
revoke all on function public.revoke_member_invite(uuid) from public, anon;
revoke all on function public.open_member_invite(text) from public;
revoke all on function public.claim_member_invite_for_user(uuid, text) from public, anon, authenticated;
revoke all on function public.claim_member_invite(text) from public, anon;
revoke all on function public.consume_member_invite_from_auth_user() from public, anon, authenticated;
revoke all on function public.complete_my_member_invite() from public, anon;
revoke all on function public.get_my_member_invites() from public, anon;
grant execute on function public.create_member_invite() to authenticated;
grant execute on function public.revoke_member_invite(uuid) to authenticated;
grant execute on function public.open_member_invite(text) to anon, authenticated;
grant execute on function public.claim_member_invite(text) to authenticated;
grant execute on function public.complete_my_member_invite() to authenticated;
grant execute on function public.get_my_member_invites() to authenticated;
