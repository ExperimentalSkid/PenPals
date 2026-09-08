-- SEO ENGINE PASS 7
-- Keep a compact, private history of useful aggregate values only.  No
-- individual profile identifiers or copied profile rows are stored here.

create table if not exists public.seo_aggregate_history_config (
  id boolean primary key default true check (id),
  capture_interval interval not null default interval '1 day'
    check (capture_interval >= interval '1 hour'),
  retention_period interval not null default interval '730 days'
    check (retention_period >= interval '30 days'),
  last_captured_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.seo_aggregate_history_config (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.seo_community_aggregate_snapshots (
  aggregate_key text not null
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
  captured_at timestamptz not null,
  source_calculated_at timestamptz not null,
  member_count bigint not null check (member_count > 0),
  cohort_size bigint not null check (cohort_size > 0),
  sufficient boolean not null default true,
  dimensions jsonb not null check (jsonb_typeof(dimensions) = 'object'),
  primary key (aggregate_key, captured_at)
);

alter table public.seo_aggregate_history_config enable row level security;
alter table public.seo_community_aggregate_snapshots enable row level security;
revoke all on table public.seo_aggregate_history_config from public, anon, authenticated;
revoke all on table public.seo_community_aggregate_snapshots from public, anon, authenticated;

create index if not exists seo_community_aggregate_snapshots_dimension_idx
  on public.seo_community_aggregate_snapshots(dimension, captured_at desc);
create index if not exists seo_community_aggregate_snapshots_key_idx
  on public.seo_community_aggregate_snapshots(aggregate_key, captured_at desc);

create or replace function public.capture_seo_community_aggregate_snapshots()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  configured_interval interval;
  configured_retention interval;
  previous_capture timestamptz;
  source_dirty boolean;
  snapshot_at timestamptz := clock_timestamp();
  inserted_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('service_role', 'postgres') then
    raise exception 'SEO aggregate history capture requires service authorization';
  end if;

  -- Serialize cadence checks and writes so overlapping workers cannot create
  -- duplicate daily snapshots or race retention cleanup.
  perform pg_advisory_xact_lock(hashtextextended('penpal-seo-community-history', 0));

  select c.capture_interval, c.retention_period, c.last_captured_at
    into configured_interval, configured_retention, previous_capture
    from public.seo_aggregate_history_config c
   where c.id = true
   for update;

  if previous_capture is not null
     and snapshot_at < previous_capture + configured_interval then
    return 0;
  end if;

  select s.dirty into source_dirty
    from public.seo_community_aggregate_state s
   where s.id = true
   for share;
  if coalesce(source_dirty, true) then
    perform public.refresh_seo_community_aggregates();
  end if;

  insert into public.seo_community_aggregate_snapshots (
    aggregate_key,
    dimension,
    captured_at,
    source_calculated_at,
    member_count,
    cohort_size,
    sufficient,
    dimensions
  )
  select a.aggregate_key,
         a.dimension,
         snapshot_at,
         a.calculated_at,
         a.member_count,
         a.cohort_size,
         a.sufficient,
         a.dimensions
    from public.seo_community_aggregates a
   where a.member_count > 0
     and a.cohort_size > 0
     and a.sufficient = true
  on conflict (aggregate_key, captured_at) do nothing;

  get diagnostics inserted_count = row_count;

  delete from public.seo_community_aggregate_snapshots
   where captured_at < snapshot_at - configured_retention;

  update public.seo_aggregate_history_config
     set last_captured_at = snapshot_at,
         updated_at = snapshot_at
   where id = true;

  return inserted_count;
end;
$$;

revoke all on function public.capture_seo_community_aggregate_snapshots() from public, anon, authenticated;
grant execute on function public.capture_seo_community_aggregate_snapshots() to service_role;

create or replace function public.get_seo_community_aggregate_history(
  p_aggregate_key text,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  aggregate_key text,
  dimension text,
  captured_at timestamptz,
  source_calculated_at timestamptz,
  member_count bigint,
  cohort_size bigint,
  sufficient boolean,
  dimensions jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('service_role', 'postgres') then
    raise exception 'SEO aggregate history reads require service authorization';
  end if;
  if nullif(btrim(p_aggregate_key), '') is null then
    raise exception 'Aggregate key is required';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception 'History range is invalid';
  end if;

  return query
  select h.aggregate_key,
         h.dimension,
         h.captured_at,
         h.source_calculated_at,
         h.member_count,
         h.cohort_size,
         h.sufficient,
         h.dimensions
    from public.seo_community_aggregate_snapshots h
   where h.aggregate_key = btrim(p_aggregate_key)
     and (p_from is null or h.captured_at >= p_from)
     and (p_to is null or h.captured_at <= p_to)
   order by h.captured_at;
end;
$$;

revoke all on function public.get_seo_community_aggregate_history(text, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.get_seo_community_aggregate_history(text, timestamptz, timestamptz) to service_role;

