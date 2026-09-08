-- SEO ENGINE PASS 3
-- Materialize only aggregates supported by real, normalized member data.
-- Individual profile rows never leave seo_profile_dimensions() and ordinary
-- client roles cannot read either the cache or its refresh/read functions.

create table if not exists public.seo_community_aggregate_state (
  id boolean primary key default true check (id),
  dirty boolean not null default true,
  dirty_at timestamptz not null default now(),
  last_refreshed_at timestamptz,
  eligible_member_count bigint not null default 0 check (eligible_member_count >= 0),
  minimum_cohort_size integer not null default 5
    check (minimum_cohort_size between 2 and 100)
);

insert into public.seo_community_aggregate_state (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.seo_community_aggregates (
  aggregate_key text primary key
    check (char_length(aggregate_key) between 1 and 320),
  dimension text not null check (dimension in (
    'country',
    'region',
    'language_spoken',
    'language_learning',
    'interest',
    'connection_goal',
    'country_language_spoken',
    'country_language_learning',
    'country_interest',
    'language_interest_spoken',
    'language_interest_learning'
  )),
  country_code text references public.country_codes(code),
  region_code text,
  language_id bigint references public.languages(id),
  interest_id bigint references public.interests(id),
  connection_goal text check (connection_goal is null or connection_goal in (
    'friendship',
    'long_term_friendship',
    'casual_conversation',
    'cultural_exchange',
    'language_exchange',
    'pen_pal',
    'international_friendship'
  )),
  member_count bigint not null check (member_count >= 0),
  -- cohort_size is the unique eligible-member cardinality represented by
  -- this row.  It is kept alongside member_count for an explicit contract to
  -- callers that consume aggregate metadata.
  cohort_size bigint not null check (cohort_size >= 0),
  calculated_at timestamptz not null,
  dimensions jsonb not null check (jsonb_typeof(dimensions) = 'object'),
  sufficient boolean not null,
  foreign key (country_code, region_code)
    references public.location_regions(country_code, region_code)
);

alter table public.seo_community_aggregate_state enable row level security;
alter table public.seo_community_aggregates enable row level security;
revoke all on table public.seo_community_aggregate_state from public, anon, authenticated;
revoke all on table public.seo_community_aggregates from public, anon, authenticated;

create index if not exists seo_community_aggregates_dimension_idx
  on public.seo_community_aggregates(dimension, sufficient, member_count desc);
create index if not exists seo_community_aggregates_country_idx
  on public.seo_community_aggregates(country_code, dimension);

create or replace function public.mark_seo_community_aggregates_dirty()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.seo_community_aggregate_state (id, dirty, dirty_at)
  values (true, true, clock_timestamp())
  on conflict (id) do update
    set dirty = true,
        dirty_at = excluded.dirty_at;
  return null;
end;
$$;

revoke all on function public.mark_seo_community_aggregates_dirty() from public, anon, authenticated;

drop trigger if exists profiles_seo_community_aggregates_dirty on public.profiles;
create trigger profiles_seo_community_aggregates_dirty
after insert or delete or update of
  username, display_name, birth_date, country, city, country_code,
  region_code, locality_id, location_precision, profile_visibility,
  deactivated_at, inactive_mode, connection_goals
on public.profiles
for each statement execute function public.mark_seo_community_aggregates_dirty();

drop trigger if exists profile_languages_seo_community_aggregates_dirty on public.profile_languages;
create trigger profile_languages_seo_community_aggregates_dirty
after insert or delete or update
on public.profile_languages
for each statement execute function public.mark_seo_community_aggregates_dirty();

drop trigger if exists profile_interests_seo_community_aggregates_dirty on public.profile_interests;
create trigger profile_interests_seo_community_aggregates_dirty
after insert or delete or update
on public.profile_interests
for each statement execute function public.mark_seo_community_aggregates_dirty();

drop trigger if exists profile_friendship_destinations_seo_community_aggregates_dirty on public.profile_friendship_destinations;
create trigger profile_friendship_destinations_seo_community_aggregates_dirty
after insert or delete or update
on public.profile_friendship_destinations
for each statement execute function public.mark_seo_community_aggregates_dirty();

drop trigger if exists country_codes_seo_community_aggregates_dirty on public.country_codes;
create trigger country_codes_seo_community_aggregates_dirty
after insert or delete or update
on public.country_codes
for each statement execute function public.mark_seo_community_aggregates_dirty();

drop trigger if exists location_regions_seo_community_aggregates_dirty on public.location_regions;
create trigger location_regions_seo_community_aggregates_dirty
after insert or delete or update
on public.location_regions
for each statement execute function public.mark_seo_community_aggregates_dirty();

drop trigger if exists location_localities_seo_community_aggregates_dirty on public.location_localities;
create trigger location_localities_seo_community_aggregates_dirty
after insert or delete or update
on public.location_localities
for each statement execute function public.mark_seo_community_aggregates_dirty();

drop trigger if exists languages_seo_community_aggregates_dirty on public.languages;
create trigger languages_seo_community_aggregates_dirty
after insert or delete or update
on public.languages
for each statement execute function public.mark_seo_community_aggregates_dirty();

drop trigger if exists interests_seo_community_aggregates_dirty on public.interests;
create trigger interests_seo_community_aggregates_dirty
after insert or delete or update
on public.interests
for each statement execute function public.mark_seo_community_aggregates_dirty();

create or replace function public.refresh_seo_community_aggregates()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  should_refresh boolean;
  threshold integer;
  eligible_count bigint;
  refreshed_at timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('service_role', 'postgres') then
    raise exception 'SEO aggregate refresh requires service authorization';
  end if;

  -- Serialize refreshes so concurrent workers never publish a partially
  -- rebuilt cache.  Profile writes can continue; their dirty marker waits on
  -- this row lock and remains true after the refresh commits.
  perform pg_advisory_xact_lock(hashtextextended('penpal-seo-community-aggregates', 0));

  insert into public.seo_community_aggregate_state (id)
  values (true)
  on conflict (id) do nothing;

  select s.dirty, s.minimum_cohort_size
    into should_refresh, threshold
    from public.seo_community_aggregate_state s
   where s.id = true
   for update;

  if not should_refresh
     and exists (select 1 from public.seo_community_aggregates) then
    return;
  end if;

  select count(*)::bigint
    into eligible_count
    from public.seo_profile_dimensions() d
   where d.is_public and d.is_active and d.is_entry_complete;

  delete from public.seo_community_aggregates;

  insert into public.seo_community_aggregates (
    aggregate_key,
    dimension,
    country_code,
    region_code,
    language_id,
    interest_id,
    connection_goal,
    member_count,
    cohort_size,
    calculated_at,
    dimensions,
    sufficient
  )
  with eligible as materialized (
    select d.*
      from public.seo_profile_dimensions() d
     where d.is_public and d.is_active and d.is_entry_complete
  ),
  dimension_rows as (
    select e.profile_id,
           'country'::text as dimension,
           format('country:%s', e.country_code) as aggregate_key,
           e.country_code,
           null::text as region_code,
           null::bigint as language_id,
           null::bigint as interest_id,
           null::text as connection_goal,
           jsonb_build_object(
             'country_code', e.country_code,
             'country_name', e.country_name
           ) as dimensions
      from eligible e
     where e.country_code is not null

    union all

    select e.profile_id,
           'region'::text,
           format('region:%s:%s', e.country_code, e.region_code),
           e.country_code,
           e.region_code,
           null::bigint,
           null::bigint,
           null::text,
           jsonb_build_object(
             'country_code', e.country_code,
             'country_name', e.country_name,
             'region_code', e.region_code,
             'region_name', e.region_name
           )
      from eligible e
     where e.country_code is not null
       and e.region_code is not null

    union all

    select e.profile_id,
           'language_spoken'::text,
           format('language_spoken:%s', l.language_id),
           null::text,
           null::text,
           l.language_id,
           null::bigint,
           null::text,
           jsonb_build_object(
             'language_id', l.language_id,
             'language_name', lang.name,
             'purpose', 'spoken'
           )
      from eligible e
      cross join lateral (
        select distinct x.language_id
          from unnest(e.languages_spoken) x(language_id)
      ) l
      join public.languages lang on lang.id = l.language_id

    union all

    select e.profile_id,
           'language_learning'::text,
           format('language_learning:%s', l.language_id),
           null::text,
           null::text,
           l.language_id,
           null::bigint,
           null::text,
           jsonb_build_object(
             'language_id', l.language_id,
             'language_name', lang.name,
             'purpose', 'learning'
           )
      from eligible e
      cross join lateral (
        select distinct x.language_id
          from unnest(e.languages_learning) x(language_id)
      ) l
      join public.languages lang on lang.id = l.language_id

    union all

    select e.profile_id,
           'interest'::text,
           format('interest:%s', i.interest_id),
           null::text,
           null::text,
           null::bigint,
           i.interest_id,
           null::text,
           jsonb_build_object(
             'interest_id', i.interest_id,
             'interest_name', interest.name
           )
      from eligible e
      cross join lateral (
        select distinct x.interest_id
          from unnest(e.interest_ids) x(interest_id)
      ) i
      join public.interests interest on interest.id = i.interest_id

    union all

    select e.profile_id,
           'connection_goal'::text,
           format('connection_goal:%s', g.goal),
           null::text,
           null::text,
           null::bigint,
           null::bigint,
           g.goal,
           jsonb_build_object('connection_goal', g.goal)
      from eligible e
      cross join lateral (
        select distinct btrim(x.goal) as goal
          from unnest(e.connection_goals) x(goal)
         where btrim(x.goal) <> ''
      ) g

    union all

    select e.profile_id,
           'country_language_spoken'::text,
           format('country_language_spoken:%s:%s', e.country_code, l.language_id),
           e.country_code,
           null::text,
           l.language_id,
           null::bigint,
           null::text,
           jsonb_build_object(
             'country_code', e.country_code,
             'country_name', e.country_name,
             'language_id', l.language_id,
             'language_name', lang.name,
             'purpose', 'spoken'
           )
      from eligible e
      cross join lateral (
        select distinct x.language_id
          from unnest(e.languages_spoken) x(language_id)
      ) l
      join public.languages lang on lang.id = l.language_id
     where e.country_code is not null

    union all

    select e.profile_id,
           'country_language_learning'::text,
           format('country_language_learning:%s:%s', e.country_code, l.language_id),
           e.country_code,
           null::text,
           l.language_id,
           null::bigint,
           null::text,
           jsonb_build_object(
             'country_code', e.country_code,
             'country_name', e.country_name,
             'language_id', l.language_id,
             'language_name', lang.name,
             'purpose', 'learning'
           )
      from eligible e
      cross join lateral (
        select distinct x.language_id
          from unnest(e.languages_learning) x(language_id)
      ) l
      join public.languages lang on lang.id = l.language_id
     where e.country_code is not null

    union all

    select e.profile_id,
           'country_interest'::text,
           format('country_interest:%s:%s', e.country_code, i.interest_id),
           e.country_code,
           null::text,
           null::bigint,
           i.interest_id,
           null::text,
           jsonb_build_object(
             'country_code', e.country_code,
             'country_name', e.country_name,
             'interest_id', i.interest_id,
             'interest_name', interest.name
           )
      from eligible e
      cross join lateral (
        select distinct x.interest_id
          from unnest(e.interest_ids) x(interest_id)
      ) i
      join public.interests interest on interest.id = i.interest_id
     where e.country_code is not null

    union all

    select e.profile_id,
           'language_interest_spoken'::text,
           format('language_interest_spoken:%s:%s', l.language_id, i.interest_id),
           null::text,
           null::text,
           l.language_id,
           i.interest_id,
           null::text,
           jsonb_build_object(
             'language_id', l.language_id,
             'language_name', lang.name,
             'interest_id', i.interest_id,
             'interest_name', interest.name,
             'purpose', 'spoken'
           )
      from eligible e
      cross join lateral (
        select distinct x.language_id
          from unnest(e.languages_spoken) x(language_id)
      ) l
      cross join lateral (
        select distinct x.interest_id
          from unnest(e.interest_ids) x(interest_id)
      ) i
      join public.languages lang on lang.id = l.language_id
      join public.interests interest on interest.id = i.interest_id

    union all

    select e.profile_id,
           'language_interest_learning'::text,
           format('language_interest_learning:%s:%s', l.language_id, i.interest_id),
           null::text,
           null::text,
           l.language_id,
           i.interest_id,
           null::text,
           jsonb_build_object(
             'language_id', l.language_id,
             'language_name', lang.name,
             'interest_id', i.interest_id,
             'interest_name', interest.name,
             'purpose', 'learning'
           )
      from eligible e
      cross join lateral (
        select distinct x.language_id
          from unnest(e.languages_learning) x(language_id)
      ) l
      cross join lateral (
        select distinct x.interest_id
          from unnest(e.interest_ids) x(interest_id)
      ) i
      join public.languages lang on lang.id = l.language_id
      join public.interests interest on interest.id = i.interest_id
  ),
  grouped as (
    select dimension,
           aggregate_key,
           country_code,
           region_code,
           language_id,
           interest_id,
           connection_goal,
           count(distinct profile_id)::bigint as member_count,
           dimensions
      from dimension_rows
     group by dimension, aggregate_key, country_code, region_code,
              language_id, interest_id, connection_goal, dimensions
  )
  select aggregate_key,
         dimension,
         country_code,
         region_code,
         language_id,
         interest_id,
         connection_goal,
         member_count,
         member_count,
         refreshed_at,
         dimensions,
         member_count >= threshold
    from grouped;

  update public.seo_community_aggregate_state
     set dirty = false,
         last_refreshed_at = refreshed_at,
         eligible_member_count = eligible_count
   where id = true;
end;
$$;

revoke all on function public.refresh_seo_community_aggregates() from public, anon, authenticated;
grant execute on function public.refresh_seo_community_aggregates() to service_role;

create or replace function public.get_seo_community_aggregates(
  p_dimension text default null
)
returns table (
  aggregate_key text,
  dimension text,
  country_code text,
  region_code text,
  language_id bigint,
  interest_id bigint,
  connection_goal text,
  member_count bigint,
  cohort_size bigint,
  calculated_at timestamptz,
  dimensions jsonb,
  sufficient boolean,
  eligible_member_count bigint,
  minimum_cohort_size integer,
  source_dirty boolean,
  source_last_refreshed_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('service_role', 'postgres') then
    raise exception 'SEO aggregate reads require service authorization';
  end if;
  if p_dimension is not null and p_dimension not in (
    'country', 'region', 'language_spoken', 'language_learning',
    'interest', 'connection_goal', 'country_language_spoken',
    'country_language_learning', 'country_interest',
    'language_interest_spoken', 'language_interest_learning'
  ) then
    raise exception 'Invalid SEO aggregate dimension';
  end if;

  perform public.refresh_seo_community_aggregates();

  return query
  select a.aggregate_key,
         a.dimension,
         a.country_code,
         a.region_code,
         a.language_id,
         a.interest_id,
         a.connection_goal,
         a.member_count,
         a.cohort_size,
         a.calculated_at,
         a.dimensions,
         a.sufficient,
         s.eligible_member_count,
         s.minimum_cohort_size,
         s.dirty,
         s.last_refreshed_at
    from public.seo_community_aggregates a
    cross join public.seo_community_aggregate_state s
   where s.id = true
     and (p_dimension is null or a.dimension = p_dimension)
   order by a.dimension, a.member_count desc, a.aggregate_key;
end;
$$;

revoke all on function public.get_seo_community_aggregates(text) from public, anon, authenticated;
grant execute on function public.get_seo_community_aggregates(text) to service_role;

-- Populate the cache once for the current database.  Future profile/catalogue
-- changes mark it dirty; a service worker can refresh it on demand or on a
-- bounded schedule without scanning on every eventual page request.
select public.refresh_seo_community_aggregates();
