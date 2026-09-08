-- Friendship destinations are selected through the protected profile-save RPC.
-- Keep the owner-only table readable for setup, but do not allow direct table
-- writes to bypass the RPC's duplicate and configured-limit validation.
revoke insert, update, delete on table public.profile_friendship_destinations from authenticated;
grant select on table public.profile_friendship_destinations to authenticated;

-- Public profiles may show the user's selected countries/regions. Resolve
-- names inside this protected function so the public table remains private and
-- callers cannot infer destination rows for blocked/ineligible profiles.
create or replace function public.get_public_friendship_destinations(target_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when public.viewer_can_access_profile(p.id) then coalesce(
      (
        select jsonb_agg(
          jsonb_strip_nulls(jsonb_build_object(
            'country_code', d.country_code,
            'country_name', c.name,
            'region_code', d.region_code,
            'region_name', r.name
          ))
          order by d.created_at, d.id
        )
        from public.profile_friendship_destinations d
        join public.country_codes c on c.code = d.country_code
        left join public.location_regions r
          on r.country_code = d.country_code
         and r.region_code = d.region_code
        where d.profile_id = p.id
      ),
      '[]'::jsonb
    )
    else null
  end
  from public.profiles p
  where p.id = target_user;
$$;

revoke all on function public.get_public_friendship_destinations(uuid) from public, anon;
grant execute on function public.get_public_friendship_destinations(uuid) to authenticated;

-- The limit is operational configuration, not private profile data. Expose it
-- read-only to the setup UI while retaining the table's deny-by-default ACL.
create or replace function public.get_friendship_destination_limit()
returns smallint
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select max_friendship_destinations
    from public.location_configuration
   where id = true
     and public.is_email_verified()
     and auth.uid() is not null;
$$;

revoke all on function public.get_friendship_destination_limit() from public, anon;
grant execute on function public.get_friendship_destination_limit() to authenticated;
