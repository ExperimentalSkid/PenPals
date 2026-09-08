-- Apply the verification boundary to read-state and relationship tables too.
-- This closes stale-token/API paths without changing confirmed-user behavior.

drop policy if exists "Participants send active adult unblocked messages" on public.messages;
drop policy if exists "Participants send active verified adult unblocked messages" on public.messages;
create policy "Participants send active adult unblocked messages" on public.messages
for insert to authenticated
with check (
  public.is_email_verified()
  and sender_id = auth.uid()
  and public.is_conversation_participant(conversation_id)
  and public.is_adult_birth_date((select birth_date from public.profiles where id = auth.uid()))
  and not exists (select 1 from public.profiles where id = auth.uid() and deactivated_at is not null)
  and not exists (
    select 1 from public.conversation_participants p
    where p.conversation_id = messages.conversation_id
      and p.user_id <> auth.uid()
      and public.users_are_blocked(auth.uid(), p.user_id)
  )
);

drop policy if exists "Participants read conversations" on public.conversations;
create policy "Participants read conversations" on public.conversations
for select to authenticated
using (public.is_email_verified() and public.is_conversation_participant(id));

drop policy if exists "Participants read participants" on public.conversation_participants;
create policy "Participants read participants" on public.conversation_participants
for select to authenticated
using (public.is_email_verified() and public.is_conversation_participant(conversation_id));

drop policy if exists "Participants read messages" on public.messages;
create policy "Participants read messages" on public.messages
for select to authenticated
using (public.is_email_verified() and public.is_conversation_participant(conversation_id));

drop policy if exists "Participants update own read state" on public.conversation_participants;
create policy "Participants update own read state" on public.conversation_participants
for update to authenticated
using (public.is_email_verified() and user_id = auth.uid())
with check (public.is_email_verified() and user_id = auth.uid());

drop policy if exists "Participants read introductions" on public.conversation_introductions;
create policy "Participants read introductions" on public.conversation_introductions
for select to authenticated
using (public.is_email_verified() and (sender_id = auth.uid() or recipient_id = auth.uid()));

drop policy if exists "Users can read own blocks" on public.profile_blocks;
create policy "Users can read own blocks" on public.profile_blocks
for select to authenticated
using (public.is_email_verified() and blocker_id = auth.uid());

drop policy if exists "Users can manage own blocks" on public.profile_blocks;
create policy "Users can manage own blocks" on public.profile_blocks
for all to authenticated
using (public.is_email_verified() and blocker_id = auth.uid())
with check (public.is_email_verified() and blocker_id = auth.uid());

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications" on public.notifications
for select to authenticated
using (public.is_email_verified() and user_id = auth.uid());

drop policy if exists "Users update own notifications" on public.notifications;
create policy "Users update own notifications" on public.notifications
for update to authenticated
using (public.is_email_verified() and user_id = auth.uid())
with check (public.is_email_verified() and user_id = auth.uid());

drop policy if exists "Photo request participants can read" on public.profile_photo_access_requests;
create policy "Photo request participants can read" on public.profile_photo_access_requests
for select to authenticated
using (public.is_email_verified() and (requester_id = auth.uid() or owner_id = auth.uid()));

drop policy if exists "Users request photos in own conversations" on public.profile_photo_access_requests;
create policy "Users request photos in own conversations" on public.profile_photo_access_requests
for insert to authenticated
with check (
  public.is_email_verified()
  and requester_id = auth.uid()
  and exists (select 1 from public.conversation_participants cp where cp.conversation_id = profile_photo_access_requests.conversation_id and cp.user_id = auth.uid())
  and exists (select 1 from public.conversation_participants cp where cp.conversation_id = profile_photo_access_requests.conversation_id and cp.user_id = profile_photo_access_requests.owner_id)
);

drop policy if exists "Photo owners respond" on public.profile_photo_access_requests;
create policy "Photo owners respond" on public.profile_photo_access_requests
for update to authenticated
using (public.is_email_verified() and owner_id = auth.uid())
with check (public.is_email_verified() and owner_id = auth.uid());

drop policy if exists "Photo grant participants can read" on public.profile_photo_access_grants;
create policy "Photo grant participants can read" on public.profile_photo_access_grants
for select to authenticated
using (public.is_email_verified() and (owner_id = auth.uid() or viewer_id = auth.uid()));

drop policy if exists "Owners manage photo grants" on public.profile_photo_access_grants;
create policy "Owners manage photo grants" on public.profile_photo_access_grants
for insert to authenticated
with check (public.is_email_verified() and owner_id = auth.uid());

drop policy if exists "Owners revoke photo grants" on public.profile_photo_access_grants;
create policy "Owners revoke photo grants" on public.profile_photo_access_grants
for delete to authenticated
using (public.is_email_verified() and owner_id = auth.uid());

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_email_verified()
     and exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and deactivated_at is null);
$$;

create or replace function public.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_email_verified()
     and exists (select 1 from public.profiles where id = auth.uid() and role in ('moderator','admin') and deactivated_at is null);
$$;

create or replace function public.staff_account_is_active()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_email_verified()
     and exists (select 1 from public.profiles where id = auth.uid() and role in ('moderator','admin') and deactivated_at is null);
$$;

create or replace function public.unread_notification_count()
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case when public.is_email_verified() then count(*) else 0 end
    from public.notifications
   where user_id = auth.uid() and read_at is null and type <> 'new_message';
$$;
