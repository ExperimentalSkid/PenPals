-- Normalized profiles retain legacy country/city columns for compatibility.
-- Keep those values aligned when a canonical location is present so every
-- public projection describes the same selected location.
create or replace function public.validate_profile_location_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.country_code is null then
    if new.region_code is not null or new.locality_id is not null then
      raise exception 'Normalized location requires a country';
    end if;
    return new;
  end if;

  if not exists (
    select 1
      from public.country_codes c
     where c.code = new.country_code
       and lower(btrim(c.name)) = lower(btrim(new.country))
  ) then
    raise exception 'Country name does not match country code';
  end if;

  if new.location_precision not in ('country', 'region', 'locality') then
    raise exception 'Invalid location precision';
  end if;

  if new.location_precision = 'country' then
    if new.region_code is not null or new.locality_id is not null or nullif(btrim(new.city), '') is not null then
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
    if new.locality_id is not null or nullif(btrim(new.city), '') is not null then
      raise exception 'Region precision cannot include a locality';
    end if;
    return new;
  end if;

  if new.locality_id is not null then
    if not exists (
      select 1
        from public.location_localities l
       where l.id = new.locality_id
         and l.country_code = new.country_code
         and l.region_code = new.region_code
    ) then
      raise exception 'Invalid locality for region';
    end if;
    if not exists (
      select 1
        from public.location_localities l
       where l.id = new.locality_id
         and lower(btrim(l.name)) = lower(btrim(new.city))
    ) then
      raise exception 'Locality name does not match locality';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.validate_profile_location_hierarchy() from public, anon, authenticated;

drop trigger if exists profiles_location_hierarchy_guard on public.profiles;
create trigger profiles_location_hierarchy_guard
before insert or update of country, city, country_code, region_code, locality_id, location_precision
on public.profiles
for each row execute function public.validate_profile_location_hierarchy();

