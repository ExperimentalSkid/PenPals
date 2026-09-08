-- SEO ENGINE PASS 5
-- Public pages read only an allow-listed projection of explicitly indexable
-- aggregate rows.  Private aggregate/config tables remain inaccessible.

create or replace function public.seo_public_slug(value text)
returns text
language sql
immutable
parallel safe
strict
set search_path = pg_catalog, public
as $$
  select nullif(
    trim(both '-' from regexp_replace(
      regexp_replace(lower(btrim(value)), '[^a-z0-9]+', '-', 'g'),
      '(^-+|-+$)', '', 'g'
    )),
    ''
  );
$$;

revoke all on function public.seo_public_slug(text) from public, anon, authenticated;

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
  aggregate_dimension text;
  resolved_key text;
  resolved_slug text;
  resolved_name text;
  resolved_country_code text;
  resolved_language_id bigint;
  resolved_interest_id bigint;
  primary_row record;
  related_countries jsonb := '[]'::jsonb;
  related_languages jsonb := '[]'::jsonb;
  related_interests jsonb := '[]'::jsonb;
  related_goals jsonb := '[]'::jsonb;
  state_dirty boolean;
begin
  if p_dimension not in ('country', 'language', 'interest') then
    raise exception 'Invalid public SEO dimension';
  end if;
  if requested_slug is null then
    return;
  end if;

  -- Re-evaluate only when source/policy invalidation requires it.  The
  -- evaluator is locked and atomic; this keeps the public read path current
  -- without exposing the private cache or requiring a service key in the app.
  select s.eligibility_dirty into state_dirty
    from public.seo_community_aggregate_state s
   where s.id = true;
  if coalesce(state_dirty, true) then
    perform public.evaluate_seo_community_eligibility();
  end if;

  if p_dimension = 'country' then
    select c.code, c.name
      into resolved_country_code, resolved_name
      from public.country_codes c
     where lower(c.code) = requested_slug
        or public.seo_public_slug(c.name) = requested_slug
     order by case when lower(c.code) = requested_slug then 0 else 1 end
     limit 1;
    if resolved_country_code is null then
      return;
    end if;
    aggregate_dimension := 'country';
    resolved_key := format('country:%s', resolved_country_code);
    resolved_slug := lower(resolved_country_code);
  elsif p_dimension = 'language' then
    select l.id, l.name
      into resolved_language_id, resolved_name
      from public.languages l
     where public.seo_public_slug(l.name) = requested_slug
     order by l.id
     limit 1;
    if resolved_language_id is null then
      return;
    end if;
    aggregate_dimension := 'language_spoken';
    resolved_key := format('language_spoken:%s', resolved_language_id);
    resolved_slug := public.seo_public_slug(resolved_name);
  else
    select i.id, i.name
      into resolved_interest_id, resolved_name
      from public.interests i
     where public.seo_public_slug(i.name) = requested_slug
     order by i.id
     limit 1;
    if resolved_interest_id is null then
      return;
    end if;
    aggregate_dimension := 'interest';
    resolved_key := format('interest:%s', resolved_interest_id);
    resolved_slug := public.seo_public_slug(resolved_name);
  end if;

  select a.aggregate_key, a.member_count, a.cohort_size, a.calculated_at
    into primary_row
    from public.seo_community_aggregates a
    join public.seo_community_aggregate_eligibility e
      on e.aggregate_key = a.aggregate_key
   where a.aggregate_key = resolved_key
     and a.dimension = aggregate_dimension
     and e.eligibility_state = 'eligible_indexable'
     and e.is_indexable = true;
  if not found then
    return;
  end if;

  if p_dimension = 'country' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', l.name,
      'slug', public.seo_public_slug(l.name),
      'member_count', a.member_count
    ) order by a.member_count desc, l.name), '[]'::jsonb)
      into related_languages
      from public.seo_community_aggregates a
      join public.seo_community_aggregate_eligibility e
        on e.aggregate_key = a.aggregate_key
      join public.languages l on l.id = a.language_id
     where a.dimension = 'country_language_spoken'
       and a.country_code = resolved_country_code
       and e.eligibility_state = 'eligible_indexable'
       and e.is_indexable = true;
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', i.name,
      'slug', public.seo_public_slug(i.name),
      'member_count', a.member_count
    ) order by a.member_count desc, i.name), '[]'::jsonb)
      into related_interests
      from public.seo_community_aggregates a
      join public.seo_community_aggregate_eligibility e
        on e.aggregate_key = a.aggregate_key
      join public.interests i on i.id = a.interest_id
     where a.dimension = 'country_interest'
       and a.country_code = resolved_country_code
       and e.eligibility_state = 'eligible_indexable'
       and e.is_indexable = true;
  elsif p_dimension = 'language' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', c.name,
      'slug', lower(c.code),
      'member_count', a.member_count
    ) order by a.member_count desc, c.name), '[]'::jsonb)
      into related_countries
      from public.seo_community_aggregates a
      join public.seo_community_aggregate_eligibility e
        on e.aggregate_key = a.aggregate_key
      join public.country_codes c on c.code = a.country_code
     where a.dimension = 'country_language_spoken'
       and a.language_id = resolved_language_id
       and e.eligibility_state = 'eligible_indexable'
       and e.is_indexable = true;
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', i.name,
      'slug', public.seo_public_slug(i.name),
      'member_count', a.member_count
    ) order by a.member_count desc, i.name), '[]'::jsonb)
      into related_interests
      from public.seo_community_aggregates a
      join public.seo_community_aggregate_eligibility e
        on e.aggregate_key = a.aggregate_key
      join public.interests i on i.id = a.interest_id
     where a.dimension = 'language_interest_spoken'
       and a.language_id = resolved_language_id
       and e.eligibility_state = 'eligible_indexable'
       and e.is_indexable = true;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', c.name,
      'slug', lower(c.code),
      'member_count', a.member_count
    ) order by a.member_count desc, c.name), '[]'::jsonb)
      into related_countries
      from public.seo_community_aggregates a
      join public.seo_community_aggregate_eligibility e
        on e.aggregate_key = a.aggregate_key
      join public.country_codes c on c.code = a.country_code
     where a.dimension = 'country_interest'
       and a.interest_id = resolved_interest_id
       and e.eligibility_state = 'eligible_indexable'
       and e.is_indexable = true;
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', l.name,
      'slug', public.seo_public_slug(l.name),
      'member_count', a.member_count
    ) order by a.member_count desc, l.name), '[]'::jsonb)
      into related_languages
      from public.seo_community_aggregates a
      join public.seo_community_aggregate_eligibility e
        on e.aggregate_key = a.aggregate_key
      join public.languages l on l.id = a.language_id
     where a.dimension = 'language_interest_spoken'
       and a.interest_id = resolved_interest_id
       and e.eligibility_state = 'eligible_indexable'
       and e.is_indexable = true;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'name', initcap(replace(a.connection_goal, '_', ' ')),
    'slug', public.seo_public_slug(a.connection_goal),
    'member_count', a.member_count
  ) order by a.member_count desc, a.connection_goal), '[]'::jsonb)
    into related_goals
    from public.seo_community_aggregates a
    join public.seo_community_aggregate_eligibility e
      on e.aggregate_key = a.aggregate_key
   where a.dimension = 'connection_goal'
     and e.eligibility_state = 'eligible_indexable'
     and e.is_indexable = true;

  return query
  select p_dimension,
         resolved_slug,
         resolved_name,
         primary_row.aggregate_key,
         primary_row.member_count,
         primary_row.cohort_size,
         primary_row.calculated_at,
         jsonb_build_object(
           'countries', related_countries,
           'languages', related_languages,
           'interests', related_interests,
           'connection_goals', related_goals
         );
end;
$$;

revoke all on function public.get_public_seo_surface(text, text) from public;
grant execute on function public.get_public_seo_surface(text, text) to anon, authenticated;
