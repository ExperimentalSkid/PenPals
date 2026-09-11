-- Keep full-cache refreshes compatible with PostgREST safe-update protections.
CREATE OR REPLACE FUNCTION public.refresh_seo_community_aggregates()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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

  delete from public.seo_community_aggregates where true;

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
$function$;


CREATE OR REPLACE FUNCTION public.evaluate_seo_community_eligibility()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  evaluated_at timestamptz := clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('service_role', 'postgres') then
    raise exception 'SEO eligibility evaluation requires service authorization';
  end if;

  perform public.refresh_seo_community_aggregates();
  perform pg_advisory_xact_lock(hashtextextended('penpal-seo-community-eligibility', 0));

  delete from public.seo_community_aggregate_eligibility where true;

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
$function$;


revoke all on function public.refresh_seo_community_aggregates() from public, anon, authenticated;
grant execute on function public.refresh_seo_community_aggregates() to service_role;
revoke all on function public.evaluate_seo_community_eligibility() from public, anon, authenticated;
grant execute on function public.evaluate_seo_community_eligibility() to service_role;
