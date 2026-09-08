-- Expose only the public staff marker requested by the profile view. The
-- underlying role remains protected; regular members never receive `user`.
create or replace function public.get_public_staff_role(target_user uuid)
returns text
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select case when p.role in ('admin', 'moderator') then p.role else null end
    from public.profiles p
   where p.id = target_user
     and public.viewer_can_access_profile(p.id);
$$;

revoke all on function public.get_public_staff_role(uuid) from public, anon;
grant execute on function public.get_public_staff_role(uuid) to authenticated;
