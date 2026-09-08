-- Keep legacy external values available for a controlled owner/admin
-- migration, but never treat them as usable profile photos.  The previous
-- compatibility migration quarantined these values and detached them from the
-- live column; restoring the reference preserves existing user data while the
-- projections and consumers continue to reject it.
do $$
begin
  if exists (
    select 1 from pg_trigger
     where tgname = 'profiles_require_verified_email'
       and tgrelid = 'public.profiles'::regclass
       and not tgisinternal
  ) then
    alter table public.profiles disable trigger profiles_require_verified_email;
  end if;
  if exists (
    select 1 from pg_trigger
     where tgname = 'profiles_avatar_path_guard'
       and tgrelid = 'public.profiles'::regclass
       and not tgisinternal
  ) then
    alter table public.profiles disable trigger profiles_avatar_path_guard;
  end if;
end;
$$;

update public.profiles p
   set avatar_path = legacy.legacy_path
  from public.profile_legacy_avatar_paths legacy
 where legacy.profile_id = p.id
   and p.avatar_path is null;

do $$
begin
  if exists (
    select 1 from pg_trigger
     where tgname = 'profiles_require_verified_email'
       and tgrelid = 'public.profiles'::regclass
       and not tgisinternal
  ) then
    alter table public.profiles enable trigger profiles_require_verified_email;
  end if;
  if exists (
    select 1 from pg_trigger
     where tgname = 'profiles_avatar_path_guard'
       and tgrelid = 'public.profiles'::regclass
       and not tgisinternal
  ) then
    alter table public.profiles enable trigger profiles_avatar_path_guard;
  end if;
end;
$$;

-- Photo requests and grants must also reject legacy/external references if a
-- profile has not yet been migrated.  This protects both the RPC paths and
-- direct table attempts without changing the existing permission model.
create or replace function public.enforce_private_photo_reference()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not exists (
    select 1 from public.profiles p
     where p.id = new.owner_id
       and public.is_private_avatar_path(p.id, p.avatar_path)
  ) then
    raise exception 'Photo access unavailable';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_private_photo_reference() from public, anon, authenticated;

drop trigger if exists profile_photo_request_private_reference on public.profile_photo_access_requests;
create trigger profile_photo_request_private_reference
before insert or update of owner_id on public.profile_photo_access_requests
for each row execute function public.enforce_private_photo_reference();

drop trigger if exists profile_photo_grant_private_reference on public.profile_photo_access_grants;
create trigger profile_photo_grant_private_reference
before insert or update of owner_id on public.profile_photo_access_grants
for each row execute function public.enforce_private_photo_reference();
