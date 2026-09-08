-- An invalid legacy reference is not a usable avatar even for the owner.
-- Keep can_view_profile_photo aligned with the same private Storage path
-- predicate used by public projections and access-request triggers.
create or replace function public.can_view_profile_photo(owner_user uuid, viewer_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_email_verified()
     and exists (
       select 1 from public.profiles owner_profile
        where owner_profile.id = owner_user
          and public.is_private_avatar_path(owner_profile.id, owner_profile.avatar_path)
          and (
            owner_user = auth.uid()
            or (
              owner_profile.deactivated_at is null
              and exists (select 1 from public.profile_photo_access_grants g where g.owner_id = owner_user and g.viewer_id = auth.uid())
              and not exists (
                select 1 from public.profile_blocks b
                 where (b.blocker_id = owner_user and b.blocked_id = auth.uid())
                    or (b.blocker_id = auth.uid() and b.blocked_id = owner_user)
              )
            )
          )
     );
$$;

revoke all on function public.can_view_profile_photo(uuid, uuid) from public, anon;
grant execute on function public.can_view_profile_photo(uuid, uuid) to authenticated;
