-- SEO ENGINE PASS 6
-- Keep the sitemap as a read-only projection of the currently eligible,
-- canonical route families.  It must never expose private aggregate tables or
-- turn the catalogue into an automatically indexable URL set.

create or replace function public.get_public_seo_sitemap()
returns table (
  route_dimension text,
  canonical_slug text,
  last_modified timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  state_dirty boolean;
  eligibility_dirty boolean;
  evaluated_at timestamptz;
  maximum_age interval;
  indexing_enabled boolean;
begin
  select s.dirty, s.eligibility_dirty, s.eligibility_evaluated_at,
         c.maximum_aggregate_age, c.public_indexing_enabled
    into state_dirty, eligibility_dirty, evaluated_at, maximum_age,
         indexing_enabled
    from public.seo_community_aggregate_state s
    cross join public.seo_aggregate_eligibility_config c
   where s.id = true and c.id = true
   for share of s;

  -- Fails closed when either the source aggregate or its eligibility
  -- decision is awaiting a trusted refresh.  This also keeps an old sitemap
  -- from outliving the freshness policy.
  if not coalesce(indexing_enabled, false)
     or coalesce(state_dirty, true)
     or coalesce(eligibility_dirty, true)
     or evaluated_at is null
     or evaluated_at < clock_timestamp() - maximum_age then
    return;
  end if;

  return query
  with candidates as (
    select
      'country'::text as route_dimension,
      lower(a.country_code) as canonical_slug,
      a.calculated_at as last_modified
    from public.seo_community_aggregates a
    join public.seo_community_aggregate_eligibility e
      on e.aggregate_key = a.aggregate_key
    where a.dimension = 'country'
      and a.country_code is not null
      and e.eligibility_state = 'eligible_indexable'
      and e.is_indexable = true

    union all

    select
      'language'::text,
      public.seo_public_slug(l.name),
      a.calculated_at
    from public.seo_community_aggregates a
    join public.seo_community_aggregate_eligibility e
      on e.aggregate_key = a.aggregate_key
    join public.languages l on l.id = a.language_id
    where a.dimension = 'language_spoken'
      and e.eligibility_state = 'eligible_indexable'
      and e.is_indexable = true

    union all

    select
      'interest'::text,
      public.seo_public_slug(i.name),
      a.calculated_at
    from public.seo_community_aggregates a
    join public.seo_community_aggregate_eligibility e
      on e.aggregate_key = a.aggregate_key
    join public.interests i on i.id = a.interest_id
    where a.dimension = 'interest'
      and e.eligibility_state = 'eligible_indexable'
      and e.is_indexable = true
  ),
  unique_candidates as (
    select c.*,
           count(*) over (partition by c.route_dimension, c.canonical_slug) as slug_count
      from candidates c
     where c.canonical_slug is not null
       and c.canonical_slug <> ''
  )
  select u.route_dimension, u.canonical_slug, u.last_modified
    from unique_candidates u
   where u.slug_count = 1
   order by u.route_dimension, u.canonical_slug;
end;
$$;

revoke all on function public.get_public_seo_sitemap() from public;
grant execute on function public.get_public_seo_sitemap() to anon, authenticated;

-- A slug collision (for example two catalogue names normalizing to the same
-- ASCII slug) has no safe canonical URL.  Reject it instead of letting the
-- internal resolver's deterministic first-row choice publish an ambiguous
-- page.
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

  -- Never resolve a non-unique catalogue slug.  Country pages use the
  -- two-letter code as their canonical slug; a name alias is accepted only
  -- when its slug is unambiguous.
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
  select * from public.get_public_seo_surface_internal(p_dimension, requested_slug);
end;
$$;

revoke all on function public.get_public_seo_surface(text, text) from public;
grant execute on function public.get_public_seo_surface(text, text) to anon, authenticated;
