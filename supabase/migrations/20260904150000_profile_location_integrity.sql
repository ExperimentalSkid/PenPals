-- Keep normalized base locations coherent for every write path.  The profile
-- save RPC performs the same checks for user-facing validation; this trigger
-- closes the direct table-update path without changing legacy free-text data.
create or replace function public.validate_profile_location_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Unresolved legacy rows may have no canonical country yet, but they must
  -- not carry child identifiers that cannot be scoped safely.
  if new.country_code is null then
    if new.region_code is not null or new.locality_id is not null then
      raise exception 'Normalized location requires a country';
    end if;
    return new;
  end if;

  if new.location_precision not in ('country', 'region', 'locality') then
    raise exception 'Invalid location precision';
  end if;

  if new.location_precision = 'country' then
    if new.region_code is not null or new.locality_id is not null then
      raise exception 'Country precision cannot include a region or locality';
    end if;
    return new;
  end if;

  if new.region_code is null or not exists (
    select 1
      from public.location_regions r
     where r.country_code = new.country_code
       and r.region_code = new.region_code
  ) then
    raise exception 'Invalid region for country';
  end if;

  if new.location_precision = 'region' then
    if new.locality_id is not null then
      raise exception 'Region precision cannot include a locality';
    end if;
    return new;
  end if;

  if new.locality_id is not null and not exists (
    select 1
      from public.location_localities l
     where l.id = new.locality_id
       and l.country_code = new.country_code
       and l.region_code = new.region_code
  ) then
    raise exception 'Invalid locality for region';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_profile_location_hierarchy() from public, anon, authenticated;

drop trigger if exists profiles_location_hierarchy_guard on public.profiles;
create trigger profiles_location_hierarchy_guard
before insert or update of country_code, region_code, locality_id, location_precision
on public.profiles
for each row execute function public.validate_profile_location_hierarchy();
