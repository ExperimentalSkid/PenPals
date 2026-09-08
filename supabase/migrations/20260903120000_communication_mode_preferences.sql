-- Communication modes are recipient preferences for newly established contact.
-- Existing conversations and letters are intentionally left untouched.
alter table public.profiles
  add column if not exists allow_instant_messages boolean not null default true,
  add column if not exists allow_snail_mail boolean not null default true;

do $$
begin
  alter table public.profiles
    add constraint profiles_at_least_one_communication_mode
    check (allow_instant_messages or allow_snail_mail);
exception
  when duplicate_object then null;
end;
$$;

comment on column public.profiles.allow_instant_messages is
  'Whether new instant-message conversations may be established with this profile.';
comment on column public.profiles.allow_snail_mail is
  'Whether new Snail Mail letters may be sent to this profile.';

create or replace function public.save_communication_preferences(
  p_allow_instant_messages boolean,
  p_allow_snail_mail boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not public.is_email_verified() then
    raise exception 'Email verification required';
  end if;
  if coalesce(p_allow_instant_messages, false) = false
     and coalesce(p_allow_snail_mail, false) = false then
    raise exception 'At least one communication mode must remain enabled';
  end if;
  update public.profiles
     set allow_instant_messages = coalesce(p_allow_instant_messages, false),
         allow_snail_mail = coalesce(p_allow_snail_mail, false)
   where id = me
     and deactivated_at is null;
  if not found then
    raise exception 'Profile unavailable';
  end if;
end;
$$;

revoke all on function public.save_communication_preferences(boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.save_communication_preferences(boolean, boolean)
  to authenticated;

-- Publicly show only the selected mode, never internal profile fields.
create or replace function public.get_public_communication_mode(target_user uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when p.allow_instant_messages and p.allow_snail_mail then 'both'
    when p.allow_instant_messages then 'instant'
    when p.allow_snail_mail then 'snail_mail'
    else null
  end
    from public.profiles p
   where p.id = target_user
     and public.viewer_can_access_profile(p.id);
$$;

revoke all on function public.get_public_communication_mode(uuid)
  from public, anon, authenticated;
grant execute on function public.get_public_communication_mode(uuid)
  to authenticated;

-- A direct pair is created only for a new contact. Existing pairs are not
-- changed when preferences are edited, so established conversations survive.
create or replace function public.enforce_instant_communication_mode()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
      from public.profiles p
     where p.id in (new.user_a, new.user_b)
       and not p.allow_instant_messages
  ) then
    raise exception 'Conversation unavailable';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_instant_communication_mode()
  from public, anon, authenticated;
drop trigger if exists direct_pair_communication_mode_guard
  on public.direct_conversation_pairs;
create trigger direct_pair_communication_mode_guard
before insert on public.direct_conversation_pairs
for each row execute function public.enforce_instant_communication_mode();

-- Snail Mail is a new letter action. The trigger covers the existing RPC and
-- any future server-side insert path without changing already-sent letters.
create or replace function public.enforce_snail_mail_communication_mode()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
      from public.profiles p
     where p.id in (new.sender_id, new.recipient_id)
       and not p.allow_snail_mail
  ) then
    raise exception 'Conversation unavailable';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_snail_mail_communication_mode()
  from public, anon, authenticated;
drop trigger if exists snail_mail_communication_mode_guard
  on public.snail_mail_letters;
create trigger snail_mail_communication_mode_guard
before insert on public.snail_mail_letters
for each row execute function public.enforce_snail_mail_communication_mode();
