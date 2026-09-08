-- Use the same current-field completion rule as Profile Builder and the
-- profile editor. This changes neither the smaller onboarding-entry rule nor
-- any profile data. CREATE OR REPLACE preserves the existing function ACLs,
-- including the service-only compatibility directory.

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
      public.profile_completion_percent(p.id) = 100 as profile_complete,
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
      public.profile_completion_percent(p.id) = 100 as profile_complete
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

-- Retain the established payload helper and the public wrapper's guard.
-- The helper's historical payload is unchanged; only its derived flag is
-- replaced before the guarded wrapper returns it to the existing UI.
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

  complete := public.profile_completion_percent(target_user) = 100;
  return jsonb_set(result, '{profile,profile_complete}', to_jsonb(coalesce(complete, false)), true);
end;
$$;
