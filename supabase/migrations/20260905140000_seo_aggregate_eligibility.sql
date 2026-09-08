-- SEO ENGINE PASS 4
-- Eligibility is a separate decision layer.  Aggregates are available to a
-- trusted service, but nothing is indexable until the policy switch and all
-- privacy/usefulness/freshness checks pass.

alter table public.seo_community_aggregate_state
  add column if not exists eligibility_dirty boolean not null default true,
  add column if not exists eligibility_evaluated_at timestamptz;

create table if not exists public.seo_aggregate_eligibility_config (
  id boolean primary key default true check (id),
  public_indexing_enabled boolean not null default false,
  minimum_privacy_cohort integer not null default 5
    check (minimum_privacy_cohort between 2 and 100),
  minimum_useful_information integer not null default 2
    check (minimum_useful_information between 1 and 100),
  minimum_parent_delta bigint not null default 1
    check (minimum_parent_delta between 1 and 1000000),
  maximum_aggregate_age interval not null default interval '7 days'
    check (maximum_aggregate_age > interval '0'),
  updated_at timestamptz not null default now()
);

insert into public.seo_aggregate_eligibility_config (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.seo_community_aggregate_eligibility (
  aggregate_key text primary key
    references public.seo_community_aggregates(aggregate_key) on delete cascade,
  eligibility_state text not null check (eligibility_state in (
    'eligible_indexable',
    'available_non_indexable',
    'insufficient_data',
    'suppressed_for_privacy',
    'duplicate_redundant',
    'stale'
  )),
  reason text not null,
  is_indexable boolean not null default false,
  cohort_size bigint not null check (cohort_size >= 0),
  parent_aggregate_key text,
  parent_cohort_size bigint check (parent_cohort_size is null or parent_cohort_size >= 0),
  useful_information_count integer not null check (useful_information_count >= 0),
  unique_against_parent boolean not null,
  aggregate_calculated_at timestamptz not null,
  evaluated_at timestamptz not null
);

alter table public.seo_aggregate_eligibility_config enable row level security;
alter table public.seo_community_aggregate_eligibility enable row level security;
revoke all on table public.seo_aggregate_eligibility_config from public, anon, authenticated;
revoke all on table public.seo_community_aggregate_eligibility from public, anon, authenticated;

create index if not exists seo_community_aggregate_eligibility_state_idx
  on public.seo_community_aggregate_eligibility(eligibility_state, is_indexable);
create index if not exists seo_community_aggregate_eligibility_parent_idx
  on public.seo_community_aggregate_eligibility(parent_aggregate_key);

-- All existing aggregate invalidation triggers call this function.  Keep the
-- cache and its eligibility decisions dirty in the same transaction as the
-- profile/catalogue change.
create or replace function public.mark_seo_community_aggregates_dirty()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.seo_community_aggregate_state
    (id, dirty, dirty_at, eligibility_dirty)
  values (true, true, clock_timestamp(), true)
  on conflict (id) do update
    set dirty = true,
        dirty_at = excluded.dirty_at,
        eligibility_dirty = true;
  return null;
end;
$$;

revoke all on function public.mark_seo_community_aggregates_dirty() from public, anon, authenticated;

create or replace function public.mark_seo_community_eligibility_dirty()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.seo_community_aggregate_state
     set eligibility_dirty = true
   where id = true;
  return null;
end;
$$;

revoke all on function public.mark_seo_community_eligibility_dirty() from public, anon, authenticated;

drop trigger if exists seo_aggregate_eligibility_config_dirty on public.seo_aggregate_eligibility_config;
create trigger seo_aggregate_eligibility_config_dirty
after update of public_indexing_enabled, minimum_privacy_cohort,
  minimum_useful_information, minimum_parent_delta, maximum_aggregate_age
on public.seo_aggregate_eligibility_config
for each row execute function public.mark_seo_community_eligibility_dirty();

create or replace function public.evaluate_seo_community_eligibility()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  evaluated_at timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('service_role', 'postgres') then
    raise exception 'SEO eligibility evaluation requires service authorization';
  end if;

  perform public.refresh_seo_community_aggregates();
  perform pg_advisory_xact_lock(hashtextextended('penpal-seo-community-eligibility', 0));

  delete from public.seo_community_aggregate_eligibility;

  insert into public.seo_community_aggregate_eligibility (
    aggregate_key,
    eligibility_state,
    reason,
    is_indexable,
    cohort_size,
    parent_aggregate_key,
    parent_cohort_size,
    useful_information_count,
    unique_against_parent,
    aggregate_calculated_at,
    evaluated_at
  )
  with config as (
    select c.*
      from public.seo_aggregate_eligibility_config c
     where c.id = true
  ),
  parents as (
    select a.aggregate_key,
           a.dimension,
           a.member_count,
           a.sufficient,
           a.calculated_at,
           a.country_code,
           a.region_code,
           a.language_id,
           a.interest_id,
           a.connection_goal,
           case
             when a.dimension = 'region'
               then format('country:%s', a.country_code)
             when a.dimension in (
               'country_language_spoken', 'country_language_learning',
               'country_interest'
             ) then format('country:%s', a.country_code)
             when a.dimension = 'language_interest_spoken'
               then format('language_spoken:%s', a.language_id)
             when a.dimension = 'language_interest_learning'
               then format('language_learning:%s', a.language_id)
           end as parent_aggregate_key
      from public.seo_community_aggregates a
  ),
  enriched as (
    select p.*,
           parent.member_count as parent_cohort_size,
           parent.sufficient as parent_sufficient,
           coalesce(parent.aggregate_key, p.parent_aggregate_key) as resolved_parent_key,
           c.*,
           case
             when p.dimension = 'country' then 1 + (
               select count(*)::integer
                 from public.seo_community_aggregates child
                where child.country_code = p.country_code
                  and child.sufficient
                  and child.dimension in (
                    'region', 'country_language_spoken',
                    'country_language_learning', 'country_interest'
                  )
                  and child.aggregate_key <> p.aggregate_key
             )
             when p.dimension = 'region' then 1 + (
               select count(*)::integer
                 from public.seo_community_aggregates sibling
                where sibling.dimension = 'region'
                  and sibling.country_code = p.country_code
                  and sibling.sufficient
                  and sibling.aggregate_key <> p.aggregate_key
             )
             when p.dimension = 'language_spoken' then 1 + (
               select count(*)::integer
                 from public.seo_community_aggregates related
                where related.language_id = p.language_id
                  and related.sufficient
                  and related.dimension in (
                    'country_language_spoken', 'language_interest_spoken'
                  )
                  and related.aggregate_key <> p.aggregate_key
             )
             when p.dimension = 'language_learning' then 1 + (
               select count(*)::integer
                 from public.seo_community_aggregates related
                where related.language_id = p.language_id
                  and related.sufficient
                  and related.dimension in (
                    'country_language_learning', 'language_interest_learning'
                  )
                  and related.aggregate_key <> p.aggregate_key
             )
             when p.dimension = 'interest' then 1 + (
               select count(*)::integer
                 from public.seo_community_aggregates related
                where related.interest_id = p.interest_id
                  and related.sufficient
                  and related.dimension in (
                    'country_interest', 'language_interest_spoken',
                    'language_interest_learning'
                  )
                  and related.aggregate_key <> p.aggregate_key
             )
             when p.dimension in (
               'country_language_spoken', 'country_language_learning',
               'country_interest', 'language_interest_spoken',
               'language_interest_learning'
             ) then 1 + case when parent.sufficient then 1 else 0 end
             else 1
           end as useful_information_count
      from parents p
      cross join config c
      left join parents parent
        on parent.aggregate_key = p.parent_aggregate_key
  ),
  decided as (
    select e.*,
           (
             e.parent_aggregate_key is null
             or (
               e.parent_cohort_size is not null
               and e.parent_cohort_size - e.member_count >= e.minimum_parent_delta
             )
           ) as unique_against_parent
      from enriched e
  )
  select d.aggregate_key,
         case
           when d.member_count <= 0 or d.aggregate_key is null
             then 'insufficient_data'
           when d.member_count < d.minimum_privacy_cohort
                or not d.sufficient
             then 'suppressed_for_privacy'
           when d.calculated_at < evaluated_at - d.maximum_aggregate_age
             then 'stale'
           when not d.unique_against_parent
             then 'duplicate_redundant'
           when d.useful_information_count < d.minimum_useful_information
             then 'available_non_indexable'
           when not d.public_indexing_enabled
             then 'available_non_indexable'
           else 'eligible_indexable'
         end,
         case
           when d.member_count <= 0 or d.aggregate_key is null
             then 'No usable aggregate data.'
           when d.member_count < d.minimum_privacy_cohort
                or not d.sufficient
             then format('Cohort has %s members; minimum privacy cohort is %s.', d.member_count, d.minimum_privacy_cohort)
           when d.calculated_at < evaluated_at - d.maximum_aggregate_age
             then 'Aggregate data is older than the configured freshness window.'
           when not d.unique_against_parent
             then 'This dataset does not add enough distinction over its broader parent aggregate.'
           when d.useful_information_count < d.minimum_useful_information
             then 'Not enough related aggregate information is available for a useful page.'
           when not d.public_indexing_enabled
             then 'Public indexing is disabled by default until explicitly enabled.'
           else 'Meets the configured privacy, usefulness, freshness, and uniqueness checks.'
         end,
         case
           when d.member_count <= 0 or d.aggregate_key is null then false
           when d.member_count < d.minimum_privacy_cohort or not d.sufficient then false
           when d.calculated_at < evaluated_at - d.maximum_aggregate_age then false
           when not d.unique_against_parent then false
           when d.useful_information_count < d.minimum_useful_information then false
           when not d.public_indexing_enabled then false
           else true
         end,
         d.member_count,
         d.resolved_parent_key,
         d.parent_cohort_size,
         d.useful_information_count,
         d.unique_against_parent,
         d.calculated_at,
         evaluated_at
    from decided d;

  update public.seo_community_aggregate_state
     set eligibility_dirty = false,
         eligibility_evaluated_at = evaluated_at
   where id = true;
end;
$$;

revoke all on function public.evaluate_seo_community_eligibility() from public, anon, authenticated;
grant execute on function public.evaluate_seo_community_eligibility() to service_role;

create or replace function public.get_seo_community_eligibility(
  p_dimension text default null,
  p_indexable_only boolean default false
)
returns table (
  aggregate_key text,
  dimension text,
  member_count bigint,
  cohort_size bigint,
  calculated_at timestamptz,
  sufficient boolean,
  eligibility_state text,
  reason text,
  is_indexable boolean,
  parent_aggregate_key text,
  parent_cohort_size bigint,
  useful_information_count integer,
  unique_against_parent boolean,
  evaluated_at timestamptz,
  public_indexing_enabled boolean,
  minimum_privacy_cohort integer,
  maximum_aggregate_age interval
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  needs_evaluation boolean;
  last_evaluation timestamptz;
  max_age interval;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('service_role', 'postgres') then
    raise exception 'SEO eligibility reads require service authorization';
  end if;
  if p_dimension is not null and p_dimension not in (
    'country', 'region', 'language_spoken', 'language_learning',
    'interest', 'connection_goal', 'country_language_spoken',
    'country_language_learning', 'country_interest',
    'language_interest_spoken', 'language_interest_learning'
  ) then
    raise exception 'Invalid SEO aggregate dimension';
  end if;

  select s.eligibility_dirty, s.eligibility_evaluated_at,
         c.maximum_aggregate_age
    into needs_evaluation, last_evaluation, max_age
    from public.seo_community_aggregate_state s
    cross join public.seo_aggregate_eligibility_config c
   where s.id = true and c.id = true;
  if needs_evaluation or last_evaluation is null
     or last_evaluation < clock_timestamp() - max_age then
    perform public.evaluate_seo_community_eligibility();
  end if;

  return query
  select a.aggregate_key,
         a.dimension,
         a.member_count,
         e.cohort_size,
         a.calculated_at,
         a.sufficient,
         e.eligibility_state,
         e.reason,
         e.is_indexable,
         e.parent_aggregate_key,
         e.parent_cohort_size,
         e.useful_information_count,
         e.unique_against_parent,
         e.evaluated_at,
         c.public_indexing_enabled,
         c.minimum_privacy_cohort,
         c.maximum_aggregate_age
    from public.seo_community_aggregates a
    join public.seo_community_aggregate_eligibility e
      on e.aggregate_key = a.aggregate_key
    cross join public.seo_aggregate_eligibility_config c
   where c.id = true
     and (p_dimension is null or a.dimension = p_dimension)
     and (not p_indexable_only or e.is_indexable)
   order by a.dimension, a.member_count desc, a.aggregate_key;
end;
$$;

revoke all on function public.get_seo_community_eligibility(text, boolean) from public, anon, authenticated;
grant execute on function public.get_seo_community_eligibility(text, boolean) to service_role;

-- Seed the decision cache in its safe default state.  The config switch keeps
-- every row non-indexable until an operator explicitly enables public SEO.
select public.evaluate_seo_community_eligibility();
