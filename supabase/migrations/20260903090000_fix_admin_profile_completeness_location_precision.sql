-- Profile completeness must follow the user's selected location precision.
-- Country- and region-precision profiles are complete without a locality.

create or replace function public.admin_list_users(
  search_query text default null,
  status_filter text default 'all',
  role_filter text default 'all',
  completeness_filter text default 'all'
)
returns table (
  id uuid,
  username text,
  display_name text,
  birth_date date,
  gender text,
  country text,
  city text,
  role text,
  deactivated_at timestamptz,
  last_active_at timestamptz,
  created_at timestamptz,
  availability text,
  profile_visibility text,
  show_activity_status boolean,
  show_response_rate boolean,
  accepting_new_conversations boolean,
  profile_complete boolean,
  has_photo boolean
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  with profile_rows as (
    select
      p.id,
      p.username,
      p.display_name,
      p.birth_date,
      p.gender,
      p.country,
      p.city,
      p.role,
      p.deactivated_at,
      p.last_active_at,
      p.created_at,
      p.availability,
      p.profile_visibility,
      p.show_activity_status,
      p.show_response_rate,
      p.accepting_new_conversations,
      (
        nullif(trim(p.display_name), '') is not null
        and p.birth_date is not null
        and nullif(trim(p.gender), '') is not null
        and nullif(trim(p.country), '') is not null
        and (p.location_precision in ('country', 'region') or nullif(trim(p.city), '') is not null)
        and nullif(trim(p.bio), '') is not null
        and nullif(trim(p.quote), '') is not null
        and nullif(trim(p.looking_for), '') is not null
        and p.avatar_path is not null
        and exists (select 1 from public.profile_languages pl where pl.profile_id = p.id)
        and (select count(*) from public.profile_interests pi where pi.profile_id = p.id) >= 3
      ) as profile_complete,
      p.avatar_path is not null as has_photo
    from public.profiles p
  )
  select
    r.id,
    r.username,
    r.display_name,
    r.birth_date,
    r.gender,
    r.country,
    r.city,
    r.role,
    r.deactivated_at,
    r.last_active_at,
    r.created_at,
    r.availability,
    r.profile_visibility,
    r.show_activity_status,
    r.show_response_rate,
    r.accepting_new_conversations,
    r.profile_complete,
    r.has_photo
  from profile_rows r
  where public.is_admin()
    and (
      nullif(trim(search_query), '') is null
      or r.username ilike '%' || trim(search_query) || '%'
      or r.display_name ilike '%' || trim(search_query) || '%'
    )
    and (
      status_filter = 'all'
      or (status_filter = 'active' and r.deactivated_at is null)
      or (status_filter = 'deactivated' and r.deactivated_at is not null)
    )
    and (role_filter = 'all' or r.role = role_filter)
    and (
      completeness_filter = 'all'
      or (completeness_filter = 'complete' and r.profile_complete)
      or (completeness_filter = 'incomplete' and not r.profile_complete)
    )
  order by (r.deactivated_at is null) desc, r.last_active_at desc nulls last, r.created_at desc
$$;

revoke all on function public.admin_list_users(text, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_list_users(text, text, text, text) to authenticated;

create or replace function public.admin_list_users_page(
  search_query text default null,
  status_filter text default 'all',
  role_filter text default 'all',
  completeness_filter text default 'all',
  page_size integer default 50,
  page_offset integer default 0
)
returns table (
  id uuid,
  username text,
  display_name text,
  birth_date date,
  gender text,
  country text,
  city text,
  role text,
  deactivated_at timestamptz,
  last_active_at timestamptz,
  created_at timestamptz,
  availability text,
  profile_visibility text,
  show_activity_status boolean,
  show_response_rate boolean,
  accepting_new_conversations boolean,
  profile_complete boolean,
  has_photo boolean,
  total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_admin() then raise exception 'Administrator authorization required'; end if;
  page_size := least(greatest(coalesce(page_size, 50), 1), 100);
  page_offset := greatest(coalesce(page_offset, 0), 0);
  return query
  with profile_rows as (
    select
      p.*,
      (
        nullif(trim(p.display_name), '') is not null
        and p.birth_date is not null
        and nullif(trim(p.gender), '') is not null
        and nullif(trim(p.country), '') is not null
        and (p.location_precision in ('country', 'region') or nullif(trim(p.city), '') is not null)
        and nullif(trim(p.bio), '') is not null
        and nullif(trim(p.quote), '') is not null
        and nullif(trim(p.looking_for), '') is not null
        and nullif(trim(p.avatar_path), '') is not null
        and exists (select 1 from public.profile_languages pl where pl.profile_id = p.id)
        and (select count(*) from public.profile_interests pi where pi.profile_id = p.id) >= 3
      ) as profile_complete
    from public.profiles p
  )
  select
    r.id,
    r.username,
    r.display_name,
    r.birth_date,
    r.gender,
    r.country,
    r.city,
    r.role,
    r.deactivated_at,
    r.last_active_at,
    r.created_at,
    r.availability,
    r.profile_visibility,
    r.show_activity_status,
    r.show_response_rate,
    r.accepting_new_conversations,
    r.profile_complete,
    (r.avatar_path is not null),
    count(*) over ()
  from profile_rows r
  where (nullif(trim(search_query), '') is null or r.username ilike '%' || trim(search_query) || '%' or r.display_name ilike '%' || trim(search_query) || '%')
    and (status_filter = 'all' or (status_filter = 'active' and r.deactivated_at is null) or (status_filter = 'deactivated' and r.deactivated_at is not null))
    and (role_filter = 'all' or r.role = role_filter)
    and (completeness_filter = 'all' or (completeness_filter = 'complete' and r.profile_complete) or (completeness_filter = 'incomplete' and not r.profile_complete))
  order by (r.deactivated_at is null) desc, r.last_active_at desc nulls last, r.created_at desc
  limit page_size offset page_offset;
end;
$$;

revoke all on function public.admin_list_users_page(text, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_list_users_page(text, text, text, text, integer, integer) to authenticated;

-- Keep the established detail payload and authorization while correcting only
-- its derived completeness value. The legacy implementation remains an
-- internal helper and is no longer directly executable by clients.
alter function public.admin_get_user_detail(uuid) rename to admin_get_user_detail_legacy;
revoke all on function public.admin_get_user_detail_legacy(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_user_detail_legacy(uuid) to authenticated;

create or replace function public.admin_get_user_detail(target_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  result jsonb;
  complete boolean;
begin
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;

  result := public.admin_get_user_detail_legacy(target_user);
  if result is null then
    return null;
  end if;

  select (
    nullif(trim(p.display_name), '') is not null
    and p.birth_date is not null
    and nullif(trim(p.gender), '') is not null
    and nullif(trim(p.country), '') is not null
    and (p.location_precision in ('country', 'region') or nullif(trim(p.city), '') is not null)
    and nullif(trim(p.bio), '') is not null
    and nullif(trim(p.quote), '') is not null
    and nullif(trim(p.looking_for), '') is not null
    and p.avatar_path is not null
    and exists (select 1 from public.profile_languages pl where pl.profile_id = p.id)
    and (select count(*) from public.profile_interests pi where pi.profile_id = p.id) >= 3
  )
    into complete
    from public.profiles p
   where p.id = target_user;

  return jsonb_set(result, '{profile,profile_complete}', to_jsonb(coalesce(complete, false)), true);
end;
$$;

revoke all on function public.admin_get_user_detail(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_user_detail(uuid) to authenticated;
