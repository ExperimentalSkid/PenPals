-- Public requests must never trigger the private full-cache evaluator. Keep
-- the public contract read-only and fail closed while a trusted refresh is
-- pending or its decision cache is outside the configured freshness window.
alter function public.get_public_seo_surface(text, text)
  rename to get_public_seo_surface_internal;

revoke all on function public.get_public_seo_surface_internal(text, text)
  from public, anon, authenticated;

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
  state_dirty boolean;
  evaluated_at timestamptz;
  maximum_age interval;
begin
  if p_dimension not in ('country', 'language', 'interest') then
    raise exception 'Invalid public SEO dimension';
  end if;

  -- A row lock prevents a source/catalogue writer from changing the dirty
  -- marker between this check and the internal read in the same transaction.
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
  select *
    from public.get_public_seo_surface_internal(p_dimension, p_slug);
end;
$$;

revoke all on function public.get_public_seo_surface(text, text)
  from public;
grant execute on function public.get_public_seo_surface(text, text)
  to anon, authenticated;
