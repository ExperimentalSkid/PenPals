-- SEO ENGINE PASS 8
-- Keep related links grounded in real, independently qualified page targets.
-- Pair aggregates may be useful internally, but they must never link to a
-- country/language/interest route that is itself non-indexable or ambiguous.

create or replace function public.get_public_seo_surface_graph(
  p_dimension text,
  p_slug text
)
returns table (
  surface_dimension text,
  canonical_slug text,
  canonical_name text,
  aggregate_key text,
  member_count bigint,
  cohort_size bigint,
  calculated_at timestamptz,
  related jsonb
)
language sql
security definer
set search_path = pg_catalog, public
as $$
with source as (
  select *
    from public.get_public_seo_surface_internal(p_dimension, p_slug)
), filtered as (
  select s.*,
    (
      select coalesce(jsonb_agg(item.value order by (item.value->>'member_count')::bigint desc, item.value->>'name'), '[]'::jsonb)
        from (
          select value
            from jsonb_array_elements(coalesce(s.related->'countries', '[]'::jsonb))
           where exists (
             select 1
               from public.country_codes c
               join public.seo_community_aggregates target
                 on target.aggregate_key = format('country:%s', c.code)
                and target.dimension = 'country'
               join public.seo_community_aggregate_eligibility target_eligibility
                 on target_eligibility.aggregate_key = target.aggregate_key
              where lower(c.code) = lower(value->>'slug')
                and target_eligibility.eligibility_state = 'eligible_indexable'
                and target_eligibility.is_indexable = true
           )
           order by (value->>'member_count')::bigint desc, value->>'name'
           limit 12
        ) item
    ) as countries,
    (
      select coalesce(jsonb_agg(item.value order by (item.value->>'member_count')::bigint desc, item.value->>'name'), '[]'::jsonb)
        from (
          select value
            from jsonb_array_elements(coalesce(s.related->'languages', '[]'::jsonb))
           where exists (
             select 1
               from public.languages l
               join public.seo_community_aggregates target
                 on target.aggregate_key = format('language_spoken:%s', l.id)
                and target.dimension = 'language_spoken'
               join public.seo_community_aggregate_eligibility target_eligibility
                 on target_eligibility.aggregate_key = target.aggregate_key
              where public.seo_public_slug(l.name) = value->>'slug'
                and target_eligibility.eligibility_state = 'eligible_indexable'
                and target_eligibility.is_indexable = true
           )
           order by (value->>'member_count')::bigint desc, value->>'name'
           limit 12
        ) item
    ) as languages,
    (
      select coalesce(jsonb_agg(item.value order by (item.value->>'member_count')::bigint desc, item.value->>'name'), '[]'::jsonb)
        from (
          select value
            from jsonb_array_elements(coalesce(s.related->'interests', '[]'::jsonb))
           where exists (
             select 1
               from public.interests i
               join public.seo_community_aggregates target
                 on target.aggregate_key = format('interest:%s', i.id)
                and target.dimension = 'interest'
               join public.seo_community_aggregate_eligibility target_eligibility
                 on target_eligibility.aggregate_key = target.aggregate_key
              where public.seo_public_slug(i.name) = value->>'slug'
                and target_eligibility.eligibility_state = 'eligible_indexable'
                and target_eligibility.is_indexable = true
           )
           order by (value->>'member_count')::bigint desc, value->>'name'
           limit 12
        ) item
    ) as interests
  from source s
)
select f.surface_dimension,
       f.canonical_slug,
       f.canonical_name,
       f.aggregate_key,
       f.member_count,
       f.cohort_size,
       f.calculated_at,
       jsonb_build_object(
         'countries', f.countries,
         'languages', f.languages,
         'interests', f.interests,
         'connection_goals', coalesce(f.related->'connection_goals', '[]'::jsonb)
       )
  from filtered f;
$$;

revoke all on function public.get_public_seo_surface_graph(text, text) from public, anon, authenticated;

-- Keep the existing public contract and its freshness/ambiguity guard, but
-- serve the target-qualified graph projection instead of raw pair relations.
create or replace function public.get_public_seo_surface(
  p_dimension text,
  p_slug text
)
returns table (
  surface_dimension text,
  canonical_slug text,
  canonical_name text,
  aggregate_key text,
  member_count bigint,
  cohort_size bigint,
  calculated_at timestamptz,
  related jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  requested_slug text := public.seo_public_slug(nullif(p_slug, ''));
  state_dirty boolean;
  evaluated_at timestamptz;
  maximum_age interval;
begin
  if p_dimension not in ('country', 'language', 'interest') then
    raise exception 'Invalid public SEO dimension';
  end if;
  if requested_slug is null then
    return;
  end if;

  if p_dimension = 'country' then
    if not exists (
      select 1 from public.country_codes c where lower(c.code) = requested_slug
    ) and (
      select count(*) from public.country_codes c
       where public.seo_public_slug(c.name) = requested_slug
    ) <> 1 then
      return;
    end if;
  elsif p_dimension = 'language' then
    if (select count(*) from public.languages l
         where public.seo_public_slug(l.name) = requested_slug) <> 1 then
      return;
    end if;
  elsif (select count(*) from public.interests i
         where public.seo_public_slug(i.name) = requested_slug) <> 1 then
    return;
  end if;

  select s.eligibility_dirty, s.eligibility_evaluated_at,
         c.maximum_aggregate_age
    into state_dirty, evaluated_at, maximum_age
    from public.seo_community_aggregate_state s
    cross join public.seo_aggregate_eligibility_config c
   where s.id = true and c.id = true
   for share of s;
  if coalesce(state_dirty, true)
     or evaluated_at is null
     or evaluated_at < clock_timestamp() - maximum_age then
    return;
  end if;

  return query
  select * from public.get_public_seo_surface_graph(p_dimension, requested_slug);
end;
$$;

revoke all on function public.get_public_seo_surface(text, text) from public;
grant execute on function public.get_public_seo_surface(text, text) to anon, authenticated;

