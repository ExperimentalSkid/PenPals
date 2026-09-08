-- Keep exact birth dates private to self/admin flows.  Public profile,
-- discovery, and identity projections expose only the derived age needed by
-- the product.  The date is still read internally by these SECURITY DEFINER
-- functions to calculate age, but is never returned to ordinary viewers.

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
    'avatar_path',case when public.can_view_profile_photo(p.id,auth.uid()) then p.avatar_path else null end,
    'availability',case when p.show_activity_status and not p.inactive_mode then p.availability else null end,
    'activity_status',case when not p.show_activity_status or p.inactive_mode then null when p.availability='away' then 'Away' when p.last_active_at is null then 'Active more than a week ago' when p.last_active_at >= now()-interval '5 minutes' then 'Online now' when p.last_active_at >= now()-interval '1 hour' then 'Active recently' when p.last_active_at >= now()-interval '1 day' then 'Active today' when p.last_active_at >= now()-interval '7 days' then 'Active this week' else 'Active more than a week ago' end,
    'response_rate_label',response_label,'is_verified',public.is_profile_verified(p.id),'activity_rank',coalesce(rank_json->>'name','Passing Notes'),'activity_rank_flavor',rank_json->>'flavor'
  );
end;
$$;
revoke all on function public.get_public_profile(text) from public, anon;
grant execute on function public.get_public_profile(text) to authenticated;

-- Return age instead of birth_date.  This return-type change is intentional,
-- so drop/recreate the record-returning function rather than leaving a date
-- column in the PostgREST result shape.
drop function if exists public.get_discover_profiles(uuid);
create function public.get_discover_profiles(viewer uuid default auth.uid())
returns table (id uuid, username text, display_name text, age integer, gender text, country text, city text, country_code text, region_code text, avatar_path text, last_active_at timestamptz, recently_active boolean, quote text)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select p.id,p.username,p.display_name,
         case when p.birth_date is null then null else extract(year from age(current_date,p.birth_date))::integer end,
         p.gender,p.country,
         case when p.show_city and p.location_precision='locality' then p.city end,
         coalesce(p.country_code,c.code),
         case when p.location_precision in ('region','locality') then p.region_code end,
         null::text,null::timestamptz,
         case when p.show_activity_status then p.last_active_at >= now()-interval '24 hours' else null end,
         p.quote
    from public.profiles p left join public.country_codes c on lower(c.name)=lower(p.country)
   where p.id<>auth.uid() and p.deactivated_at is null and p.inactive_mode=false and p.last_active_at >= now()-interval '7 days'
     and nullif(btrim(p.display_name),'') is not null and p.birth_date is not null and nullif(btrim(p.gender),'') is not null
     and nullif(btrim(p.country),'') is not null and (p.location_precision in ('country','region') or nullif(btrim(p.city),'') is not null) and nullif(btrim(p.bio),'') is not null
     and nullif(btrim(p.quote),'') is not null and nullif(btrim(p.looking_for),'') is not null and nullif(btrim(p.avatar_path),'') is not null
     and exists (select 1 from public.profile_languages pl where pl.profile_id=p.id)
     and (select count(*) from public.profile_interests pi where pi.profile_id=p.id) >= 3
     and public.viewer_can_access_profile(p.id)
   order by p.last_active_at desc nulls last,p.created_at desc;
$$;
revoke all on function public.get_discover_profiles(uuid) from public, anon, authenticated;
grant execute on function public.get_discover_profiles(uuid) to authenticated;

-- Identity resolution is used by introductions and conversations, so it must
-- not reintroduce an exact DOB through a non-discovery path.
drop function if exists public.resolve_profile_identity(uuid);
create function public.resolve_profile_identity(target_user uuid)
returns table(id uuid, username text, display_name text, age integer, avatar_path text, activity_status text, availability text)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select p.id,
         p.username,
         p.display_name,
         case when p.birth_date is null then null else extract(year from age(current_date,p.birth_date))::integer end,
         case when public.can_view_profile_photo(p.id, auth.uid()) then p.avatar_path end,
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
