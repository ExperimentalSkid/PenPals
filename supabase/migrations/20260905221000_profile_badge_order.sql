-- Keep public badge projections in the curated definition order rather than
-- relying on the lexical order of their keys.
create or replace function public.get_profile_badges(target_user uuid)
returns table (
  badge_key text,
  label text,
  icon text,
  tone text,
  is_derived boolean,
  assigned_at timestamptz
)
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
begin
  if target_user is null or not public.viewer_can_access_profile(target_user) then
    return;
  end if;

  return query
  with available as (
    select d.badge_key, d.label, d.icon, d.tone, true as is_derived,
           null::timestamptz as assigned_at, d.sort_order
      from public.profile_badge_definitions d
     where d.badge_key = 'verified'
       and public.is_profile_verified(target_user)
    union all
    select d.badge_key, d.label, d.icon, d.tone, false,
           b.assigned_at, d.sort_order
      from public.profile_badges b
      join public.profile_badge_definitions d on d.badge_key = b.badge_key
     where b.user_id = target_user
       and not d.is_system_derived
  )
  select a.badge_key, a.label, a.icon, a.tone, a.is_derived, a.assigned_at
    from available a
   order by a.sort_order, a.badge_key;
end;
$$;

revoke all on function public.get_profile_badges(uuid) from public, anon;
grant execute on function public.get_profile_badges(uuid) to authenticated;
