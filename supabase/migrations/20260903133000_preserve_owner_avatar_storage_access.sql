-- Owners must retain access to their own private avatar objects even while a
-- legacy/external profile reference is quarantined. External references are
-- still rejected by projections and by photo grants; this branch only serves
-- the owner-scoped Storage RLS path.
create or replace function public.can_view_profile_photo(
  owner_user uuid,
  viewer_user uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_email_verified()
     and (
       owner_user = auth.uid()
       or exists (
         select 1
           from public.profiles owner_profile
          where owner_profile.id = owner_user
            and public.is_private_avatar_path(owner_profile.id, owner_profile.avatar_path)
            and owner_profile.deactivated_at is null
            and exists (
              select 1
                from public.profile_photo_access_grants g
               where g.owner_id = owner_user
                 and g.viewer_id = auth.uid()
            )
            and not exists (
              select 1
                from public.profile_blocks b
               where (b.blocker_id = owner_user and b.blocked_id = auth.uid())
                  or (b.blocker_id = auth.uid() and b.blocked_id = owner_user)
            )
       )
     );
$$;

revoke all on function public.can_view_profile_photo(uuid, uuid) from public;
grant execute on function public.can_view_profile_photo(uuid, uuid) to authenticated;
