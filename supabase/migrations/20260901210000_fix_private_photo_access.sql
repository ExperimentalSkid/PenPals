-- Enforce storage RLS for every avatar request; public buckets bypass object policies.
update storage.buckets set public = false where id = 'avatars';

alter table public.profile_photo_access_requests
  drop constraint if exists profile_photo_access_requests_requester_id_owner_id_conversation_id_key;

drop index if exists public.profile_photo_pending_unique;
create unique index if not exists profile_photo_pending_unique
  on public.profile_photo_access_requests(requester_id, owner_id, conversation_id)
  where status = 'pending';
