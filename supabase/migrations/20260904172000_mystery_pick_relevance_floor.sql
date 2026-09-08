-- Add an explicit minimum internal relevance floor for all three cards.

create or replace function public.create_mystery_pick()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  me uuid := auth.uid();
  selected_ids uuid[];
  new_session_id uuid;
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
  ), qualified as (
    -- A shared communication mode is the minimum relevance floor.  This
    -- keeps the wildcard conversationally plausible rather than arbitrary.
    select s.* from scored s where s.score >= 5
  ), available as (
    select s.* from qualified s where not s.recently_exposed
  ), pool as (
    select s.*
      from qualified s
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
  returning id into new_session_id;

  insert into public.mystery_pick_cards(session_id, viewer_id, candidate_id, position)
  select new_session_id, me, candidate_id, position::smallint
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
       where c.session_id = new_session_id
    )
  );
end;
$function$;

revoke all on function public.create_mystery_pick() from public, anon, authenticated;
grant execute on function public.create_mystery_pick() to authenticated;

