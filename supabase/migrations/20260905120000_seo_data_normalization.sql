-- SEO data foundation: normalize existing structured profile dimensions without
-- copying profile data into a second SEO table.  The private catalogue aliases
-- below are reference metadata; all future public SEO reads must go through a
-- separately authorized aggregate function.

create or replace function public.seo_normalize_key(value text)
returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog, public
as $$
  select lower(regexp_replace(btrim(value), '\s+', ' ', 'g'));
$$;

revoke all on function public.seo_normalize_key(text) from public, anon, authenticated;

create table if not exists public.country_aliases (
  alias_key text primary key
    check (alias_key = public.seo_normalize_key(alias_key))
    check (char_length(alias_key) between 1 and 160),
  country_code text not null references public.country_codes(code) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.country_aliases enable row level security;
revoke all on table public.country_aliases from public, anon, authenticated;

-- Every canonical country name is also an alias.  Explicit aliases cover the
-- common localized/abbreviated values most likely to arrive from legacy data
-- or future imports.  Profile rows still retain the canonical country name.
insert into public.country_aliases (alias_key, country_code)
select public.seo_normalize_key(c.name), c.code
  from public.country_codes c
 where public.seo_normalize_key(c.name) <> ''
on conflict (alias_key) do update set country_code = excluded.country_code;

insert into public.country_aliases (alias_key, country_code) values
  ('spain', 'ES'),
  ('españa', 'ES'),
  ('espana', 'ES'),
  ('united states', 'US'),
  ('usa', 'US'),
  ('united kingdom', 'GB'),
  ('uk', 'GB'),
  ('great britain', 'GB'),
  ('south korea', 'KR'),
  ('republic of korea', 'KR'),
  ('czechia', 'CZ'),
  ('russian federation', 'RU'),
  ('vietnam', 'VN'),
  ('iran', 'IR'),
  ('turkiye', 'TR'),
  ('türkiye', 'TR')
on conflict (alias_key) do update set country_code = excluded.country_code;

create index if not exists country_aliases_country_idx
  on public.country_aliases(country_code);

create or replace function public.resolve_country_code(
  input_code text default null,
  input_name text default null
)
returns table (code text, name text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  requested_code text := nullif(upper(btrim(coalesce(input_code, ''))), '');
begin
  if requested_code is not null then
    select c.code, c.name into code, name
      from public.country_codes c
     where c.code = requested_code;
    if found then
      return next;
      return;
    end if;
  end if;

  select c.code, c.name into code, name
    from public.country_aliases a
    join public.country_codes c on c.code = a.country_code
   where a.alias_key = public.seo_normalize_key(input_name)
   limit 1;
  if found then
    return next;
  end if;
end;
$$;

revoke all on function public.resolve_country_code(text, text) from public, anon, authenticated;

-- Keep every write path coherent.  The profile-save RPC already performs the
-- same validation; this trigger additionally canonicalizes aliases and can
-- infer a unique catalogue locality from legacy/free-text city input.  If an
-- alias cannot be represented at the selected precision, it remains a safe
-- legacy name with no normalized child identifiers rather than changing the
-- existing free-text behavior or discarding the city.
create or replace function public.validate_profile_location_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  requested_code text := nullif(upper(btrim(coalesce(new.country_code, ''))), '');
  canonical_name text;
  alias_resolved boolean := false;
  inferred_locality_id bigint;
  inferred_region_code text;
  inferred_locality_name text;
  inferred_locality_count integer;
begin
  if requested_code is not null then
    select c.name into canonical_name
      from public.country_codes c
     where c.code = requested_code;
    if canonical_name is null then
      raise exception 'Invalid country';
    end if;
    new.country_code := requested_code;
    new.country := canonical_name;
  elsif nullif(btrim(coalesce(new.country, '')), '') is not null then
    select r.code, r.name into new.country_code, canonical_name
      from public.resolve_country_code(null, new.country) r;
    if canonical_name is not null then
      alias_resolved := true;
      new.country := canonical_name;
    end if;
  end if;

  if new.country_code is null then
    if new.region_code is not null or new.locality_id is not null then
      raise exception 'Normalized location requires a country';
    end if;
    return new;
  end if;

  select c.name into canonical_name
    from public.country_codes c
   where c.code = upper(btrim(new.country_code));
  if canonical_name is null then
    raise exception 'Invalid country';
  end if;
  new.country_code := upper(btrim(new.country_code));
  new.country := canonical_name;

  if new.location_precision not in ('country', 'region', 'locality') then
    raise exception 'Invalid location precision';
  end if;

  if new.location_precision = 'country' then
    if new.region_code is not null or new.locality_id is not null
       or nullif(btrim(coalesce(new.city, '')), '') is not null then
      raise exception 'Country precision cannot include a region or locality';
    end if;
    return new;
  end if;

  -- A unique city in the location catalogue supplies both canonical region
  -- and locality IDs.  Ambiguous or unknown free text is not used as an SEO
  -- dimension, so it remains editable legacy text.
  if new.region_code is null
     and new.locality_id is null
     and nullif(btrim(coalesce(new.city, '')), '') is not null
     and new.location_precision = 'locality' then
    select min(l.id), min(l.region_code), min(l.name), count(*)::integer
      into inferred_locality_id, inferred_region_code,
           inferred_locality_name, inferred_locality_count
      from public.location_localities l
     where l.country_code = new.country_code
       and public.seo_normalize_key(l.name) = public.seo_normalize_key(new.city);
    if inferred_locality_count = 1 then
      new.locality_id := inferred_locality_id;
      new.region_code := inferred_region_code;
      new.city := inferred_locality_name;
    end if;
  end if;

  if new.region_code is null then
    -- Preserve the old unresolved free-text path when the country was inferred
    -- from an alias but the selected precision cannot yet be represented.
    if alias_resolved then
      new.country_code := null;
      new.region_code := null;
      new.locality_id := null;
      return new;
    end if;
    raise exception 'Invalid region for country';
  end if;

  new.region_code := upper(btrim(new.region_code));
  if not exists (
    select 1
      from public.location_regions r
     where r.country_code = new.country_code
       and r.region_code = new.region_code
  ) then
    raise exception 'Invalid region for country';
  end if;

  if new.location_precision = 'region' then
    if new.locality_id is not null
       or nullif(btrim(coalesce(new.city, '')), '') is not null then
      raise exception 'Region precision cannot include a locality';
    end if;
    return new;
  end if;

  if new.locality_id is not null then
    select l.name into inferred_locality_name
      from public.location_localities l
     where l.id = new.locality_id
       and l.country_code = new.country_code
       and l.region_code = new.region_code;
    if inferred_locality_name is null then
      raise exception 'Invalid locality for region';
    end if;
    new.city := inferred_locality_name;
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

-- Backfill only unambiguous existing rows.  No profile is deleted and an
-- unresolved legacy city remains in the original text columns for the owner.
with matches as (
  select p.id,
         c.code,
         c.name,
         min(l.region_code) as region_code,
         min(l.id) as locality_id,
         min(l.name) as locality_name
    from public.profiles p
    join public.country_aliases a
      on a.alias_key = public.seo_normalize_key(p.country)
    join public.country_codes c on c.code = a.country_code
    join public.location_localities l
      on l.country_code = c.code
     and public.seo_normalize_key(l.name) = public.seo_normalize_key(p.city)
   where p.country_code is null
     and p.location_precision = 'locality'
     and nullif(btrim(coalesce(p.city, '')), '') is not null
   group by p.id, c.code, c.name
  having count(*) = 1
)
update public.profiles p
   set country_code = m.code,
       country = m.name,
       region_code = m.region_code,
       locality_id = m.locality_id,
       city = m.locality_name
  from matches m
 where p.id = m.id;

update public.profiles p
   set country_code = c.code,
       country = c.name
  from public.country_aliases a
  join public.country_codes c on c.code = a.country_code
 where p.country_code is null
   and a.alias_key = public.seo_normalize_key(p.country)
   and p.location_precision = 'country'
   and nullif(btrim(coalesce(p.city, '')), '') is null
   and p.region_code is null
   and p.locality_id is null;

-- Canonicalize names for rows that already have a country code, and for
-- unresolved legacy rows whose alias is known.  The latter retain a null code
-- only when their existing location precision cannot be represented safely.
update public.profiles p
   set country = c.name
  from public.country_codes c
 where p.country_code = c.code
   and p.country is distinct from c.name;

update public.profiles p
   set country = c.name
  from public.country_aliases a
  join public.country_codes c on c.code = a.country_code
 where p.country_code is null
   and a.alias_key = public.seo_normalize_key(p.country)
   and p.country is distinct from c.name;

create index if not exists profiles_public_location_idx
  on public.profiles(country_code, region_code)
  where profile_visibility = 'public'
    and deactivated_at is null
    and inactive_mode = false;

create index if not exists profile_languages_dimension_idx
  on public.profile_languages(language_id, purpose, profile_id);

create index if not exists profile_interests_dimension_idx
  on public.profile_interests(interest_id, profile_id);

create index if not exists profile_friendship_destinations_dimension_idx
  on public.profile_friendship_destinations(country_code, region_code, profile_id);

create index if not exists profiles_connection_goals_dimension_idx
  on public.profiles using gin(connection_goals);

-- Private, normalized read source for the later aggregate RPC.  It returns
-- stable dimension IDs/keys and eligibility flags only; it is intentionally not
-- executable by anon/authenticated clients.
create or replace function public.seo_profile_dimensions()
returns table (
  profile_id uuid,
  country_code text,
  region_code text,
  locality_id bigint,
  location_precision text,
  country_name text,
  region_name text,
  locality_name text,
  languages_spoken bigint[],
  languages_learning bigint[],
  interest_ids bigint[],
  connection_goals text[],
  is_public boolean,
  is_active boolean,
  is_entry_complete boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with base as (
    select p.*,
           coalesce(
             nullif(upper(btrim(p.country_code)), ''),
             alias.country_code,
             by_name.code
           ) as canonical_country_code
      from public.profiles p
      left join public.country_aliases alias
        on alias.alias_key = public.seo_normalize_key(p.country)
      left join public.country_codes by_name
        on public.seo_normalize_key(by_name.name) = public.seo_normalize_key(p.country)
  ),
  location_rows as (
    select b.*,
           c.name as canonical_country_name,
           r.name as canonical_region_name,
           coalesce(
             case when b.locality_id is not null
                    and exists (
                      select 1 from public.location_localities existing
                       where existing.id = b.locality_id
                         and existing.country_code = b.canonical_country_code
                         and existing.region_code = b.region_code
                    )
                  then b.locality_id end,
             inferred.locality_id
           ) as canonical_locality_id,
           coalesce(b.region_code, inferred.region_code) as inferred_region_code,
           inferred.locality_name as inferred_locality_name
      from base b
      left join public.country_codes c on c.code = b.canonical_country_code
      left join public.location_regions r
        on r.country_code = b.canonical_country_code
       and r.region_code = b.region_code
      left join lateral (
        select min(l.id) as locality_id,
               min(l.region_code) as region_code,
               min(l.name) as locality_name,
               count(*)::integer as locality_count
          from public.location_localities l
         where l.country_code = b.canonical_country_code
           and public.seo_normalize_key(l.name) = public.seo_normalize_key(b.city)
      ) inferred on inferred.locality_count = 1
  )
  select l.id,
         l.canonical_country_code,
         case when l.location_precision in ('region', 'locality')
              then l.inferred_region_code end,
         l.canonical_locality_id,
         l.location_precision,
         l.canonical_country_name,
         case when l.location_precision in ('region', 'locality')
              then coalesce(l.canonical_region_name, l.inferred_region_code) end,
         case when l.location_precision = 'locality'
              then coalesce((select loc.name from public.location_localities loc where loc.id = l.canonical_locality_id), l.inferred_locality_name) end,
         coalesce((select array_agg(pl.language_id order by pl.language_id)
                     from public.profile_languages pl
                    where pl.profile_id = l.id and pl.purpose = 'speaks'), '{}'::bigint[]),
         coalesce((select array_agg(pl.language_id order by pl.language_id)
                     from public.profile_languages pl
                    where pl.profile_id = l.id and pl.purpose = 'learning'), '{}'::bigint[]),
         coalesce((select array_agg(pi.interest_id order by pi.interest_id)
                     from public.profile_interests pi
                    where pi.profile_id = l.id), '{}'::bigint[]),
         coalesce(l.connection_goals, '{}'::text[]),
         l.profile_visibility = 'public',
         l.deactivated_at is null and l.inactive_mode = false,
         (
           nullif(btrim(l.username), '') is not null
           and nullif(btrim(l.display_name), '') is not null
           and l.birth_date is not null
           and l.canonical_country_code is not null
           and exists (select 1 from public.profile_languages pl where pl.profile_id = l.id)
           and (select count(*) from public.profile_interests pi where pi.profile_id = l.id) >= 3
         )
    from location_rows l;
$$;

revoke all on function public.seo_profile_dimensions() from public, anon, authenticated;
