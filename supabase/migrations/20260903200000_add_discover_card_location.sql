-- Add the already-public, precision-aware location label to the paginated
-- Discover projection.  This is display data only; eligibility, ordering,
-- filters and privacy checks remain unchanged.
create or replace function public.get_discover_profiles_page(
  p_viewer uuid default auth.uid(),
  p_country text default null,
  p_region text default null,
  p_gender text default null,
  p_min_age integer default null,
  p_max_age integer default null,
  p_language_spoken text default null,
  p_language_learning text default null,
  p_interest text default null,
  p_recent boolean default false,
  p_page_size integer default 6,
  p_page_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  me uuid := auth.uid();
  country_filter text := nullif(upper(btrim(coalesce(p_country, ''))), '');
  region_filter text := nullif(upper(btrim(coalesce(p_region, ''))), '');
  gender_filter text := nullif(btrim(coalesce(p_gender, '')), '');
  spoken_filter text := nullif(btrim(coalesce(p_language_spoken, '')), '');
  learning_filter text := nullif(btrim(coalesce(p_language_learning, '')), '');
  interest_filter text := nullif(btrim(coalesce(p_interest, '')), '');
  v_page_size integer := least(greatest(coalesce(p_page_size, 6), 1), 100);
  v_page_offset integer := greatest(coalesce(p_page_offset, 0), 0);
begin
  -- The viewer is derived from the authenticated session.  A caller cannot
  -- ask this privacy-aware RPC to evaluate discovery as another user.
  if me is null or p_viewer is distinct from me then
    raise exception 'Authentication required';
  end if;

  return (
    with eligible as (
      select
        p.id,
        p.username,
        p.display_name,
        case when p.birth_date is null then null else extract(year from age(current_date, p.birth_date))::integer end as age,
        p.gender,
        coalesce(p.country_code, c.code) as country_code,
        case when p.location_precision in ('region', 'locality') then p.region_code end as region_code,
        case
          when p.location_precision = 'country' or coalesce(p.country_code, c.code) is null then p.country
          when p.location_precision = 'region' then concat_ws(', ', coalesce(r.name, p.region_code), p.country)
          when p.show_city and p.location_precision = 'locality' then concat_ws(', ',
            coalesce(l.name, nullif(p.city, ''), coalesce(r.name, p.region_code)),
            nullif(r.name, coalesce(l.name, nullif(p.city, ''))),
            p.country)
          else concat_ws(', ', coalesce(r.name, p.region_code), p.country)
        end as location_label,
        case when p.show_activity_status then p.last_active_at >= now() - interval '24 hours' else null end as recently_active,
        p.last_active_at,
        p.created_at,
        p.quote,
        array(
          select i.name
            from public.profile_interests pi
            join public.interests i on i.id = pi.interest_id
           where pi.profile_id = p.id
           order by i.name
        )::text[] as interests
      from public.profiles p
      left join public.country_codes c on lower(c.name) = lower(p.country)
      left join public.location_regions r
        on r.country_code = coalesce(p.country_code, c.code)
       and r.region_code = p.region_code
      left join public.location_localities l on l.id = p.locality_id
      where p.id <> me
        and p.deactivated_at is null
        and p.inactive_mode = false
        and p.last_active_at >= now() - interval '7 days'
        and nullif(btrim(p.display_name), '') is not null
        and p.birth_date is not null
        and nullif(btrim(p.gender), '') is not null
        and nullif(btrim(p.country), '') is not null
        and (p.location_precision in ('country', 'region') or nullif(btrim(p.city), '') is not null)
        and nullif(btrim(p.bio), '') is not null
        and nullif(btrim(p.quote), '') is not null
        and nullif(btrim(p.looking_for), '') is not null
        and nullif(btrim(p.avatar_path), '') is not null
        and exists (
          select 1
            from public.profile_languages pl
           where pl.profile_id = p.id
        )
        and (
          select count(*)
            from public.profile_interests pi_count
           where pi_count.profile_id = p.id
        ) >= 3
        and public.viewer_can_access_profile(p.id)
    ),
    filtered as (
      select e.*
        from eligible e
       where (country_filter is null or upper(e.country_code) = country_filter)
         and (region_filter is null or upper(e.region_code) = region_filter)
         and (gender_filter is null or e.gender = gender_filter)
         and (p_min_age is null or (e.age is not null and e.age >= p_min_age))
         and (p_max_age is null or (e.age is not null and e.age <= p_max_age))
         and (
           spoken_filter is null
           or exists (
             select 1
               from public.profile_languages pl
               join public.languages l on l.id = pl.language_id
              where pl.profile_id = e.id
                and pl.purpose = 'speaks'
                and l.name = spoken_filter
           )
         )
         and (
           learning_filter is null
           or exists (
             select 1
               from public.profile_languages pl
               join public.languages l on l.id = pl.language_id
              where pl.profile_id = e.id
                and pl.purpose = 'learning'
                and l.name = learning_filter
           )
         )
         and (
           interest_filter is null
           or exists (
             select 1
               from public.profile_interests pi
               join public.interests i on i.id = pi.interest_id
              where pi.profile_id = e.id
                and i.name = interest_filter
           )
         )
         and (
           coalesce(p_recent, false) = false
           or e.recently_active = true
         )
    ),
    paged as (
      select f.*
        from filtered f
       order by f.last_active_at desc nulls last, f.created_at desc
      limit v_page_size
      offset v_page_offset
    )
    select jsonb_build_object(
      'profiles', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', pg.id,
              'username', pg.username,
              'display_name', pg.display_name,
              'age', pg.age,
              'gender', pg.gender,
              'country_code', pg.country_code,
              'region_code', pg.region_code,
              'location_label', pg.location_label,
              'recently_active', pg.recently_active,
              'quote', pg.quote,
              'interests', pg.interests
            )
            order by pg.last_active_at desc nulls last, pg.created_at desc
          )
            from paged pg
        ),
        '[]'::jsonb
      ),
      'total_count', (select count(*) from filtered),
      'gender_options', coalesce(
        (
          select jsonb_agg(g.gender order by g.gender)
            from (select distinct e.gender from eligible e where e.gender is not null) g
        ),
        '[]'::jsonb
      )
    )
  );
end;
$function$;

revoke all on function public.get_discover_profiles_page(uuid, text, text, text, integer, integer, text, text, text, boolean, integer, integer) from public, anon, authenticated;
grant execute on function public.get_discover_profiles_page(uuid, text, text, text, integer, integer, text, text, text, boolean, integer, integer) to authenticated;
