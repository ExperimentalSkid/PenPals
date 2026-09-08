-- Mystery Profile Pick keeps candidate identities and relevance calculations
-- server-side.  The client receives only opaque card tokens and can resolve
-- exactly one token into the normal public profile route.

create table if not exists public.mystery_pick_sessions (
  id uuid primary key default gen_random_uuid(),
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  selected_card_id uuid
);

create table if not exists public.mystery_pick_cards (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.mystery_pick_sessions(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  candidate_id uuid not null references public.profiles(id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  created_at timestamptz not null default now(),
  selected_at timestamptz,
  unique (session_id, position),
  unique (session_id, candidate_id)
);

create table if not exists public.mystery_pick_exposures (
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  candidate_id uuid not null references public.profiles(id) on delete cascade,
  last_exposed_at timestamptz not null default now(),
  last_selected_at timestamptz,
  exposure_count integer not null default 1 check (exposure_count > 0),
  primary key (viewer_id, candidate_id)
);

alter table public.mystery_pick_sessions enable row level security;
alter table public.mystery_pick_cards enable row level security;
alter table public.mystery_pick_exposures enable row level security;
revoke all on table public.mystery_pick_sessions, public.mystery_pick_cards, public.mystery_pick_exposures from public, anon, authenticated;

create index if not exists mystery_pick_sessions_viewer_idx
  on public.mystery_pick_sessions(viewer_id, created_at desc);
create index if not exists mystery_pick_cards_viewer_idx
  on public.mystery_pick_cards(viewer_id, created_at desc);
create index if not exists mystery_pick_exposures_recent_idx
  on public.mystery_pick_exposures(viewer_id, last_exposed_at desc);

-- This helper deliberately mirrors the current Discover eligibility boundary.
-- It adds the additional new-contact checks required for a useful pick while
-- leaving normal Discover filtering and ordering untouched.
create or replace function public.mystery_pick_eligible(viewer uuid, candidate uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select viewer is not null
     and candidate is not null
     and viewer = auth.uid()
     and viewer <> candidate
     and public.is_email_verified()
     and exists (
       select 1
         from public.profiles v
         join public.profiles p on p.id = candidate
        where v.id = viewer
          and v.deactivated_at is null
          and v.inactive_mode = false
          and public.is_adult_birth_date(v.birth_date)
          and p.deactivated_at is null
          and p.inactive_mode = false
          and public.is_adult_birth_date(p.birth_date)
          and p.last_active_at >= now() - interval '7 days'
          and nullif(btrim(p.display_name), '') is not null
          and nullif(btrim(p.gender), '') is not null
          and nullif(btrim(p.country), '') is not null
          and (p.location_precision in ('country', 'region') or nullif(btrim(p.city), '') is not null)
          and nullif(btrim(p.bio), '') is not null
          and nullif(btrim(p.quote), '') is not null
          and nullif(btrim(p.looking_for), '') is not null
          and nullif(btrim(p.avatar_path), '') is not null
          and p.accepting_new_conversations = true
          and p.introduction_scope <> 'nobody'
          and exists (select 1 from public.profile_languages pl where pl.profile_id = p.id)
          and (select count(*) from public.profile_interests pi where pi.profile_id = p.id) >= 3
          and public.viewer_can_access_profile(p.id)
          and not exists (
            select 1
              from public.profile_blocks b
             where (b.blocker_id = viewer and b.blocked_id = candidate)
                or (b.blocker_id = candidate and b.blocked_id = viewer)
          )
          and not exists (
            select 1
              from public.profile_introduction_country_exclusions e
             where e.profile_id = candidate
               and public.country_code_matches_name(e.country_code, v.country)
          )
          and (
            (coalesce(v.allow_instant_messages, false) and coalesce(p.allow_instant_messages, false))
            or (coalesce(v.allow_snail_mail, false) and coalesce(p.allow_snail_mail, false))
          )
     );
$$;

revoke all on function public.mystery_pick_eligible(uuid, uuid) from public, anon, authenticated;

-- Deterministic, friendship-only relevance.  The score is an internal
-- selection aid and is never returned by either public RPC.
create or replace function public.mystery_pick_relevance_score(viewer uuid, candidate uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case when public.mystery_pick_eligible(viewer, candidate) then
      5
      + least(5, (select count(*) from public.profile_interests a join public.profile_interests b on b.interest_id = a.interest_id where a.profile_id = viewer and b.profile_id = candidate))::integer * 4
      + case when exists (
          select 1
            from public.profile_languages a
            join public.profile_languages b on b.language_id = a.language_id
           where a.profile_id = viewer
             and b.profile_id = candidate
             and (
               (a.purpose = 'speaks' and b.purpose = 'speaks')
               or (a.purpose = 'learning' and b.purpose = 'speaks')
               or (a.purpose = 'speaks' and b.purpose = 'learning')
             )
        ) then 4 else 0 end
      + least(3, (select count(*) from unnest(coalesce((select connection_goals from public.profiles where id = viewer), '{}'::text[])) g where g = any(coalesce((select connection_goals from public.profiles where id = candidate), '{}'::text[]))))::integer * 2
      + case when exists (
          select 1
            from public.profile_friendship_destinations d
            join public.profiles p on p.id = candidate
           where d.profile_id = viewer
             and d.country_code = p.country_code
             and (d.region_code is null or d.region_code = p.region_code)
        ) then 3 else 0 end
      + case when exists (
          select 1
            from public.profile_friendship_destinations d
            join public.profiles p on p.id = viewer
           where d.profile_id = candidate
             and d.country_code = p.country_code
             and (d.region_code is null or d.region_code = p.region_code)
        ) then 3 else 0 end
      + case when (
          (select allow_instant_messages from public.profiles where id = viewer)
          and (select allow_instant_messages from public.profiles where id = candidate)
        ) then 2 else 0 end
      + case when (
          (select allow_snail_mail from public.profiles where id = viewer)
          and (select allow_snail_mail from public.profiles where id = candidate)
        ) then 2 else 0 end
    else -1 end;
$$;

revoke all on function public.mystery_pick_relevance_score(uuid, uuid) from public, anon, authenticated;

create or replace function public.create_mystery_pick()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  me uuid := auth.uid();
  selected_ids uuid[];
  session_id uuid;
begin
  if me is null or not public.is_email_verified() then
    raise exception 'Email verification required';
  end if;
  if not exists (
    select 1 from public.profiles p
     where p.id = me
       and p.deactivated_at is null
       and p.inactive_mode = false
       and public.is_adult_birth_date(p.birth_date)
  ) then
    raise exception 'Profile unavailable';
  end if;

  -- Keep expired temporary sessions from accumulating. Exposure history is
  -- intentionally retained for a short freshness window instead.
  delete from public.mystery_pick_sessions
   where viewer_id = me and expires_at < now() - interval '1 day';

  with eligible as (
    select p.id
      from public.profiles p
     where p.id <> me
       and public.mystery_pick_eligible(me, p.id)
  ), scored as (
    select e.id, public.mystery_pick_relevance_score(me, e.id) as score,
           exists (
             select 1 from public.mystery_pick_exposures x
              where x.viewer_id = me
                and x.candidate_id = e.id
                and x.last_exposed_at > now() - interval '7 days'
           ) as recently_exposed
      from eligible e
  ), available as (
    select s.* from scored s where not s.recently_exposed
  ), pool as (
    select s.*
      from scored s
     where not s.recently_exposed
        or (select count(*) from available) < 3
  ), strong as (
    select p.id, p.score from pool p order by p.score desc, random() limit 1
  ), balanced as (
    select p.id, p.score
      from pool p cross join strong h
     where p.id <> h.id
     order by abs(p.score - (select avg(score) from pool)), random()
     limit 1
  ), wildcard as (
    select p.id, p.score
      from pool p cross join strong h cross join balanced b
     where p.id <> h.id and p.id <> b.id
     order by p.score asc, random()
     limit 1
  )
  select array_agg(chosen.id order by random())
    into selected_ids
    from (
      select id from strong
      union all select id from balanced
      union all select id from wildcard
    ) chosen;

  if coalesce(array_length(selected_ids, 1), 0) <> 3 then
    return jsonb_build_object('status', 'empty', 'cards', '[]'::jsonb);
  end if;

  insert into public.mystery_pick_sessions(viewer_id)
  values (me)
  returning id into session_id;

  insert into public.mystery_pick_cards(session_id, viewer_id, candidate_id, position)
  select session_id, me, candidate_id, position::smallint
    from unnest(selected_ids) with ordinality as picked(candidate_id, position);

  insert into public.mystery_pick_exposures(viewer_id, candidate_id, last_exposed_at, exposure_count)
  select me, candidate_id, now(), 1
    from unnest(selected_ids) as picked(candidate_id)
  on conflict (viewer_id, candidate_id) do update
    set last_exposed_at = excluded.last_exposed_at,
        exposure_count = public.mystery_pick_exposures.exposure_count + 1;

  return jsonb_build_object(
    'status', 'ready',
    'cards', (
      select jsonb_agg(jsonb_build_object('token', c.id, 'position', c.position) order by c.position)
        from public.mystery_pick_cards c
       where c.session_id = session_id
    )
  );
end;
$function$;

revoke all on function public.create_mystery_pick() from public, anon, authenticated;
grant execute on function public.create_mystery_pick() to authenticated;

create or replace function public.resolve_mystery_pick(card_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  me uuid := auth.uid();
  card public.mystery_pick_cards;
  selected_card uuid;
  profile_username text;
begin
  if me is null or not public.is_email_verified() then
    raise exception 'Email verification required';
  end if;

  select c.*
    into card
    from public.mystery_pick_cards c
   where c.id = card_token
     and c.viewer_id = me
   for update;
  if card.id is null then
    raise exception 'Mystery card unavailable';
  end if;

  select s.selected_card_id
    into selected_card
    from public.mystery_pick_sessions s
   where s.id = card.session_id
     and s.viewer_id = me
     and s.expires_at > now()
   for update;
  if not found or selected_card is not null then
    raise exception 'Mystery card unavailable';
  end if;

  -- Re-check every eligibility boundary at selection time.  If the person
  -- became unavailable, consume the choice without disclosing why.
  if not public.mystery_pick_eligible(me, card.candidate_id) then
    update public.mystery_pick_sessions
       set selected_card_id = card.id
     where id = card.session_id;
    update public.mystery_pick_cards
       set selected_at = now()
     where id = card.id;
    return jsonb_build_object('status', 'unavailable');
  end if;

  select p.username into profile_username
    from public.profiles p
   where p.id = card.candidate_id
     and public.mystery_pick_eligible(me, p.id);
  if profile_username is null then
    update public.mystery_pick_sessions set selected_card_id = card.id where id = card.session_id;
    update public.mystery_pick_cards set selected_at = now() where id = card.id;
    return jsonb_build_object('status', 'unavailable');
  end if;

  update public.mystery_pick_sessions
     set selected_card_id = card.id
   where id = card.session_id;
  update public.mystery_pick_cards
     set selected_at = now()
   where id = card.id;
  update public.mystery_pick_exposures
     set last_selected_at = now()
   where viewer_id = me and candidate_id = card.candidate_id;

  return jsonb_build_object('status', 'resolved', 'username', profile_username);
end;
$function$;

revoke all on function public.resolve_mystery_pick(uuid) from public, anon, authenticated;
grant execute on function public.resolve_mystery_pick(uuid) to authenticated;



