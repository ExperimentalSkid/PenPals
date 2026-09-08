create or replace function public.request_photo_access(owner_user uuid, conversation uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  request_id uuid;
begin
  if me is null or me = owner_user then raise exception 'Photo request unavailable'; end if;
  if exists (select 1 from profiles where id in (me, owner_user) and deactivated_at is not null) then raise exception 'Photo request unavailable'; end if;
  if exists (select 1 from profile_blocks where (blocker_id = me and blocked_id = owner_user) or (blocker_id = owner_user and blocked_id = me)) then raise exception 'Photo request unavailable'; end if;
  if not exists (select 1 from conversation_participants where conversation_id = conversation and user_id = me)
     or not exists (select 1 from conversation_participants where conversation_id = conversation and user_id = owner_user)
     or not exists (select 1 from profiles where id = owner_user and avatar_path is not null) then raise exception 'Photo request unavailable'; end if;
  if exists (
    select 1 from profile_photo_access_requests
    where requester_id = me and owner_id = owner_user and conversation_id = conversation
      and status = 'declined' and updated_at > now() - interval '72 hours'
  ) then raise exception 'Photo request unavailable'; end if;
  insert into profile_photo_access_requests(requester_id, owner_id, conversation_id)
    values(me, owner_user, conversation)
    on conflict (requester_id, owner_id, conversation_id) where status = 'pending' do nothing
    returning id into request_id;
  if request_id is null then raise exception 'Photo request already pending'; end if;
  return request_id;
end; $$;
revoke execute on function public.request_photo_access(uuid, uuid) from public;
grant execute on function public.request_photo_access(uuid, uuid) to authenticated;

create or replace function public.grant_photo_access(viewer_user uuid, conversation uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null or me = viewer_user then raise exception 'Photo access unavailable'; end if;
  if exists (select 1 from profiles where id in (me, viewer_user) and deactivated_at is not null) then raise exception 'Photo access unavailable'; end if;
  if exists (select 1 from profile_blocks where (blocker_id = me and blocked_id = viewer_user) or (blocker_id = viewer_user and blocked_id = me)) then raise exception 'Photo access unavailable'; end if;
  if not exists (select 1 from profiles where id = me and avatar_path is not null)
     or not exists (select 1 from conversation_participants where conversation_id = conversation and user_id = me)
     or not exists (select 1 from conversation_participants where conversation_id = conversation and user_id = viewer_user) then raise exception 'Photo access unavailable'; end if;
  insert into profile_photo_access_grants(owner_id, viewer_id) values(me, viewer_user) on conflict do nothing;
  update profile_photo_access_requests
    set status = 'allowed', updated_at = now()
    where requester_id = viewer_user and owner_id = me and conversation_id = conversation and status = 'pending';
end; $$;
revoke execute on function public.grant_photo_access(uuid, uuid) from public;
grant execute on function public.grant_photo_access(uuid, uuid) to authenticated;
