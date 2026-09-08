-- Profile photos are private Supabase Storage objects.  A legacy profile may
-- still contain an absolute/external value in avatar_path, but that value must
-- never become a public photo URL or a bypass of the Storage permission model.

create or replace function public.is_private_avatar_path(owner_user uuid, candidate text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select owner_user is not null
     and candidate is not null
     and candidate = btrim(candidate)
     and candidate like owner_user::text || '/%'
     and split_part(candidate, '/', 1) = owner_user::text
     and candidate !~* '^[a-z][a-z0-9+.-]*:'
     and candidate !~ '[[:space:]]'
     and candidate !~ '[?#]'
     and candidate !~ '(^|/)\.\.?(/|$)'
     and candidate !~ '//';
$$;

revoke all on function public.is_private_avatar_path(uuid, text) from public, anon, authenticated;

-- Preserve invalid legacy values privately so they can be migrated manually
-- (for example, by asking the owner to re-upload into the private bucket).
-- They are never exposed to ordinary clients and are not usable as photo URLs.
create table if not exists public.profile_legacy_avatar_paths (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  legacy_path text not null,
  captured_at timestamptz not null default now(),
  migration_note text not null default 'legacy value requires private Storage re-upload'
);
alter table public.profile_legacy_avatar_paths enable row level security;
revoke all on table public.profile_legacy_avatar_paths from public, anon, authenticated;

insert into public.profile_legacy_avatar_paths(profile_id, legacy_path)
select p.id, p.avatar_path
  from public.profiles p
 where p.avatar_path is not null
   and not public.is_private_avatar_path(p.id, p.avatar_path)
on conflict (profile_id) do nothing;

-- Invalid legacy values are detached from the live profile projection.  Valid
-- owner-scoped Storage paths are left untouched.
do $$
begin
  -- The normal profile-write trigger requires an authenticated, verified
  -- caller.  This trusted migration is the one-time compatibility rewrite.
  if exists (
    select 1 from pg_trigger
     where tgname = 'profiles_require_verified_email'
       and tgrelid = 'public.profiles'::regclass
       and not tgisinternal
  ) then
    alter table public.profiles disable trigger profiles_require_verified_email;
  end if;
end;
$$;

update public.profiles p
   set avatar_path = null
 where p.avatar_path is not null
   and not public.is_private_avatar_path(p.id, p.avatar_path);

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
end;
$$;

create or replace function public.enforce_private_avatar_path()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.avatar_path is not null and not public.is_private_avatar_path(new.id, new.avatar_path) then
    raise exception 'Invalid avatar path';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_private_avatar_path() from public, anon, authenticated;

drop trigger if exists profiles_avatar_path_guard on public.profiles;
create trigger profiles_avatar_path_guard
before insert or update of avatar_path on public.profiles
for each row execute function public.enforce_private_avatar_path();

-- Keep the existing photo-permission boundary, while making a legacy/external
-- profile value behave like no private photo at all.
create or replace function public.can_view_profile_photo(owner_user uuid, viewer_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_email_verified()
     and (
       owner_user = auth.uid()
       or (
         auth.uid() is not null
         and exists (
           select 1 from public.profiles p
            where p.id = owner_user
              and p.deactivated_at is null
              and public.is_private_avatar_path(p.id, p.avatar_path)
         )
         and exists (select 1 from public.profile_photo_access_grants g where g.owner_id = owner_user and g.viewer_id = auth.uid())
         and not exists (
           select 1 from public.profile_blocks b
            where (b.blocker_id = owner_user and b.blocked_id = auth.uid())
               or (b.blocker_id = auth.uid() and b.blocked_id = owner_user)
         )
       )
     );
$$;

revoke all on function public.can_view_profile_photo(uuid, uuid) from public, anon;
grant execute on function public.can_view_profile_photo(uuid, uuid) to authenticated;

-- Public profile and identity projections return only owner-scoped Storage
-- paths after the existing viewer permission check.
create or replace function public.get_public_profile(target_username text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  p public.profiles;
  response_label text;
  rank_json jsonb;
  region_name text;
  locality_name text;
  location_label text;
begin
  select p0.* into p from public.profiles p0
   where p0.username = lower(btrim(target_username)) and public.viewer_can_access_profile(p0.id);
  if not found then return null; end if;
  select r.name into region_name from public.location_regions r where r.country_code=p.country_code and r.region_code=p.region_code;
  select l.name into locality_name from public.location_localities l where l.id=p.locality_id;
  location_label := case
    when p.location_precision='country' or p.country_code is null then p.country
    when p.location_precision='region' then concat_ws(', ', coalesce(region_name,p.region_code), p.country)
    when p.show_city then concat_ws(', ',
      coalesce(locality_name,nullif(p.city,''),coalesce(region_name,p.region_code)),
      nullif(region_name, coalesce(locality_name,nullif(p.city,''))),
      p.country)
    else concat_ws(', ', coalesce(region_name,p.region_code), p.country)
  end;
  select case when s.completed_opportunities >= 5 and s.response_rate is not null then s.response_rate::text || '%' else 'New member' end into response_label from public.get_response_stats(p.id) s;
  rank_json := public.get_public_activity_rank(p.id);
  return jsonb_build_object(
    'id',p.id,'username',p.username,'display_name',p.display_name,
    'age',case when p.birth_date is null then null else extract(year from age(current_date,p.birth_date))::integer end,
    'gender',p.gender,
    'country',p.country,'city',case when p.show_city and p.location_precision='locality' then coalesce(locality_name,p.city) else null end,
    'country_code',p.country_code,'region_code',case when p.location_precision in ('region','locality') then p.region_code else null end,
    'location_precision',p.location_precision,'region_name',case when p.location_precision in ('region','locality') then region_name else null end,
    'locality_name',case when p.show_city and p.location_precision='locality' then locality_name else null end,'location_label',location_label,
    'bio',p.bio,'quote',p.quote,'looking_for',p.looking_for,
    'avatar_path',case when public.can_view_profile_photo(p.id,auth.uid()) and public.is_private_avatar_path(p.id,p.avatar_path) then p.avatar_path else null end,
    'availability',case when p.show_activity_status and not p.inactive_mode then p.availability else null end,
    'activity_status',case when not p.show_activity_status or p.inactive_mode then null when p.availability='away' then 'Away' when p.last_active_at is null then 'Active more than a week ago' when p.last_active_at >= now()-interval '5 minutes' then 'Online now' when p.last_active_at >= now()-interval '1 hour' then 'Active recently' when p.last_active_at >= now()-interval '1 day' then 'Active today' when p.last_active_at >= now()-interval '7 days' then 'Active this week' else 'Active more than a week ago' end,
    'response_rate_label',response_label,'is_verified',public.is_profile_verified(p.id),'activity_rank',coalesce(rank_json->>'name','Passing Notes'),'activity_rank_flavor',rank_json->>'flavor'
  );
end;
$$;
revoke all on function public.get_public_profile(text) from public, anon;
grant execute on function public.get_public_profile(text) to authenticated;

create or replace function public.resolve_profile_identity(target_user uuid)
returns table(id uuid, username text, display_name text, age integer, avatar_path text, activity_status text, availability text)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select p.id,
         p.username,
         p.display_name,
         case when p.birth_date is null then null else extract(year from age(current_date,p.birth_date))::integer end,
         case when public.can_view_profile_photo(p.id, auth.uid()) and public.is_private_avatar_path(p.id,p.avatar_path) then p.avatar_path end,
         case
           when p.inactive_mode or not p.show_activity_status then null
           when p.availability = 'away' then 'Away'
           when p.last_active_at is null then 'Active more than a week ago'
           when p.last_active_at >= now() - interval '5 minutes' then 'Online now'
           when p.last_active_at >= now() - interval '1 hour' then 'Active recently'
           when p.last_active_at >= now() - interval '1 day' then 'Active today'
           when p.last_active_at >= now() - interval '7 days' then 'Active this week'
           else 'Active more than a week ago'
         end,
         case when p.inactive_mode or not p.show_activity_status then null else p.availability end
   from public.profiles p
   where p.id = target_user
     and public.viewer_can_access_profile(p.id);
$$;
revoke all on function public.resolve_profile_identity(uuid) from public, anon;
grant execute on function public.resolve_profile_identity(uuid) to authenticated;
