-- SEO ENGINE PASS 8 follow-up
-- Keep related links out of ambiguous language/interest slugs as well as
-- non-indexable targets.  The original graph projection predates this guard;
-- replacing it here keeps the applied migration history immutable.

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
                and (select count(*) from public.languages duplicate_language
                      where public.seo_public_slug(duplicate_language.name) = value->>'slug') = 1
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
                and (select count(*) from public.interests duplicate_interest
                      where public.seo_public_slug(duplicate_interest.name) = value->>'slug') = 1
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
