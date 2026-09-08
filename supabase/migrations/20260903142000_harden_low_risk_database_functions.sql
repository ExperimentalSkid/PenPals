-- Keep the timestamp trigger internal to database writes.  Authenticated
-- clients do not need to call it directly, while existing table triggers may
-- continue invoking it for authorized updates.
revoke execute on function public.set_updated_at() from anon;

-- Keep the public-profile response unchanged while avoiding a fragile
-- whole-row projection that would silently pull newly added internal columns
-- into the function's working record.
create or replace function public.get_public_profile(target_username text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  p record;
  response_label text;
  rank_json jsonb;
  region_name text;
  locality_name text;
  location_label text;
begin
  select
    p0.id,
    p0.username,
    p0.display_name,
    p0.birth_date,
    p0.gender,
    p0.country,
    p0.city,
    p0.country_code,
    p0.region_code,
    p0.locality_id,
    p0.location_precision,
    p0.show_city,
    p0.show_activity_status,
    p0.inactive_mode,
    p0.availability,
    p0.last_active_at,
    p0.bio,
    p0.quote,
    p0.looking_for,
    p0.avatar_path
    into p
    from public.profiles p0
   where p0.username = lower(btrim(target_username))
     and public.viewer_can_access_profile(p0.id);
  if not found then
    return null;
  end if;

  select r.name
    into region_name
    from public.location_regions r
   where r.country_code = p.country_code
     and r.region_code = p.region_code;
  select l.name
    into locality_name
    from public.location_localities l
   where l.id = p.locality_id;
  location_label := case
    when p.location_precision = 'country' or p.country_code is null then p.country
    when p.location_precision = 'region' then concat_ws(', ', coalesce(region_name, p.region_code), p.country)
    when p.show_city then concat_ws(', ',
      coalesce(locality_name, nullif(p.city, ''), coalesce(region_name, p.region_code)),
      nullif(region_name, coalesce(locality_name, nullif(p.city, ''))),
      p.country)
    else concat_ws(', ', coalesce(region_name, p.region_code), p.country)
  end;
  select case
    when s.completed_opportunities >= 5 and s.response_rate is not null then s.response_rate::text || '%'
    else 'New member'
  end
    into response_label
    from public.get_response_stats(p.id) s;
  rank_json := public.get_public_activity_rank(p.id);
  return jsonb_build_object(
    'id', p.id,
    'username', p.username,
    'display_name', p.display_name,
    'age', case when p.birth_date is null then null else extract(year from age(current_date, p.birth_date))::integer end,
    'gender', p.gender,
    'country', p.country,
    'city', case when p.show_city and p.location_precision = 'locality' then coalesce(locality_name, p.city) else null end,
    'country_code', p.country_code,
    'region_code', case when p.location_precision in ('region', 'locality') then p.region_code else null end,
    'location_precision', p.location_precision,
    'region_name', case when p.location_precision in ('region', 'locality') then region_name else null end,
    'locality_name', case when p.show_city and p.location_precision = 'locality' then locality_name else null end,
    'location_label', location_label,
    'bio', p.bio,
    'quote', p.quote,
    'looking_for', p.looking_for,
    'avatar_path', case when public.can_view_profile_photo(p.id, auth.uid()) and public.is_private_avatar_path(p.id, p.avatar_path) then p.avatar_path else null end,
    'availability', case when p.show_activity_status and not p.inactive_mode then p.availability else null end,
    'activity_status', case
      when not p.show_activity_status or p.inactive_mode then null
      when p.availability = 'away' then 'Away'
      when p.last_active_at is null then 'Active more than a week ago'
      when p.last_active_at >= now() - interval '5 minutes' then 'Online now'
      when p.last_active_at >= now() - interval '1 hour' then 'Active recently'
      when p.last_active_at >= now() - interval '1 day' then 'Active today'
      when p.last_active_at >= now() - interval '7 days' then 'Active this week'
      else 'Active more than a week ago'
    end,
    'response_rate_label', response_label,
    'is_verified', public.is_profile_verified(p.id),
    'activity_rank', coalesce(rank_json ->> 'name', 'Passing Notes'),
    'activity_rank_flavor', rank_json ->> 'flavor'
  );
end;
$$;

revoke all on function public.get_public_profile(text) from public, anon;
grant execute on function public.get_public_profile(text) to authenticated;
