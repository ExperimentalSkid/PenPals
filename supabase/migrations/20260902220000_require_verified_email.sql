-- Email confirmation is a hard boundary for normal Penpal activity.  Auth
-- owns the source of truth (auth.users.email_confirmed_at); this migration
-- adds no duplicate account field and does not change the age gate.

create or replace function public.is_email_verified()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
     and exists (
       select 1
         from auth.users u
        where u.id = auth.uid()
          and u.email_confirmed_at is not null
     );
$$;

revoke all on function public.is_email_verified() from public, anon, authenticated;
grant execute on function public.is_email_verified() to authenticated;

create or replace function public.require_verified_email_profile_write()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_email_verified() then
    raise exception 'Email verification required';
  end if;
  return new;
end;
$$;

revoke all on function public.require_verified_email_profile_write() from public, anon, authenticated;

drop trigger if exists profiles_require_verified_email on public.profiles;
create trigger profiles_require_verified_email
before insert or update on public.profiles
for each row execute function public.require_verified_email_profile_write();

-- Profiles and their selections cannot be created or changed through direct
-- PostgREST writes before confirmation.  The trigger above also protects the
-- SECURITY DEFINER save functions.
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles
for select to authenticated
using (id = auth.uid() and public.is_email_verified());

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile" on public.profiles
for insert to authenticated
with check (id = auth.uid() and public.is_email_verified());

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
for update to authenticated
using (id = auth.uid() and public.is_email_verified())
with check (id = auth.uid() and public.is_email_verified());

drop policy if exists "Users manage own profile languages" on public.profile_languages;
create policy "Users manage own profile languages" on public.profile_languages
for all to authenticated
using (profile_id = auth.uid() and public.is_email_verified())
with check (profile_id = auth.uid() and public.is_email_verified());

drop policy if exists "Users manage own profile interests" on public.profile_interests;
create policy "Users manage own profile interests" on public.profile_interests
for all to authenticated
using (profile_id = auth.uid() and public.is_email_verified())
with check (profile_id = auth.uid() and public.is_email_verified());

drop policy if exists "Users read own country exclusions" on public.profile_introduction_country_exclusions;
create policy "Users read own country exclusions" on public.profile_introduction_country_exclusions
for select to authenticated
using (profile_id = auth.uid() and public.is_email_verified());

drop policy if exists "Users insert own country exclusions" on public.profile_introduction_country_exclusions;
create policy "Users insert own country exclusions" on public.profile_introduction_country_exclusions
for insert to authenticated
with check (profile_id = auth.uid() and public.is_email_verified());

drop policy if exists "Users update own country exclusions" on public.profile_introduction_country_exclusions;
create policy "Users update own country exclusions" on public.profile_introduction_country_exclusions
for update to authenticated
using (profile_id = auth.uid() and public.is_email_verified())
with check (profile_id = auth.uid() and public.is_email_verified());

drop policy if exists "Users delete own country exclusions" on public.profile_introduction_country_exclusions;
create policy "Users delete own country exclusions" on public.profile_introduction_country_exclusions
for delete to authenticated
using (profile_id = auth.uid() and public.is_email_verified());

-- The RPCs below are the contact/photo mutation paths.  Each keeps its
-- existing validation and authorization and adds only the confirmation gate.
create or replace function public.submit_introduction(other_user uuid, introduction text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  intro_id uuid;
  me uuid := auth.uid();
  recipient_accepts boolean;
  recipient_scope text;
  sender_country text;
  body text := trim(coalesce(introduction, ''));
  body_hash text := md5(regexp_replace(lower(body), '\s+', ' ', 'g'));
begin
  if not public.is_email_verified() then raise exception 'Email verification required'; end if;
  perform public.expire_introductions();
  if me is null or me = other_user
     or not public.is_adult_birth_date((select birth_date from public.profiles where id = me))
     or exists (select 1 from public.profiles where id = me and deactivated_at is not null) then
    raise exception 'Invalid participant';
  end if;
  if char_length(body) < 50 or char_length(body) > 500
     or (select count(*) from regexp_split_to_table(body, '[[:space:]]+') as words where words ~ '[[:alnum:]]') < 8 then
    raise exception 'Icebreaker must be 50 to 500 characters and at least 8 words';
  end if;
  select country into sender_country from public.profiles where id = me;
  select accepting_new_conversations, introduction_scope into recipient_accepts, recipient_scope
    from public.profiles where id = other_user and deactivated_at is null
      and public.is_adult_birth_date(birth_date);
  if recipient_accepts is null or not recipient_accepts or recipient_scope = 'nobody' then raise exception 'Conversation unavailable'; end if;
  if exists (select 1 from public.profile_introduction_country_exclusions e where e.profile_id = other_user and public.country_code_matches_name(e.country_code, sender_country)) then raise exception 'Conversation unavailable'; end if;
  if exists (select 1 from public.profile_blocks where (blocker_id = me and blocked_id = other_user) or (blocker_id = other_user and blocked_id = me)) then raise exception 'Conversation unavailable'; end if;
  if exists (select 1 from public.direct_conversation_pairs where user_a = least(me, other_user) and user_b = greatest(me, other_user))
     or exists (select 1 from public.conversation_participants cp join public.conversation_participants cp2 on cp2.conversation_id = cp.conversation_id where cp.user_id = me and cp2.user_id = other_user) then raise exception 'Conversation already exists'; end if;
  if exists (select 1 from public.conversation_introductions where sender_id = me and recipient_id = other_user and status = 'pending') then raise exception 'Introduction already pending'; end if;
  if (select count(*) from public.conversation_introductions where sender_id = me and created_at > now() - interval '1 hour') >= 10 then raise exception 'Introduction rate limit reached'; end if;
  if (select count(distinct recipient_id) from public.conversation_introductions where sender_id = me and normalized_hash = body_hash and created_at > now() - interval '24 hours') >= 3 then raise exception 'Repeated introduction blocked'; end if;
  insert into public.conversation_introductions(sender_id, recipient_id, body, normalized_hash, icebreaker, expires_at, status)
    values (me, other_user, body, body_hash, body, now() + interval '7 days', 'pending') returning id into intro_id;
  return intro_id;
end;
$$;

revoke all on function public.submit_introduction(uuid, text) from public, anon;
grant execute on function public.submit_introduction(uuid, text) to authenticated;

create or replace function public.reply_to_introduction(introduction_id uuid, reply text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  intro public.conversation_introductions;
  existing_conversation_id uuid;
  me uuid := auth.uid();
  body text := trim(coalesce(reply, ''));
  a uuid;
  b uuid;
begin
  if not public.is_email_verified() then raise exception 'Email verification required'; end if;
  perform public.expire_introductions();
  if me is null
     or not public.is_adult_birth_date((select birth_date from public.profiles where id = me))
     or char_length(body) = 0
     or char_length(body) > 2000
     or exists (select 1 from public.profiles where id = me and deactivated_at is not null) then
    raise exception 'Invalid reply';
  end if;
  select * into intro from public.conversation_introductions where id = introduction_id for update;
  if intro.id is null or intro.recipient_id <> me or intro.status <> 'pending' or intro.expires_at <= now() then raise exception 'Introduction is no longer available'; end if;
  if not public.is_adult_birth_date((select birth_date from public.profiles where id = intro.sender_id)) then raise exception 'Conversation unavailable'; end if;
  if exists (select 1 from public.profiles where id in (intro.sender_id, intro.recipient_id) and deactivated_at is not null) then raise exception 'Conversation unavailable'; end if;
  if exists (select 1 from public.profile_blocks where (blocker_id = me and blocked_id = intro.sender_id) or (blocker_id = intro.sender_id and blocked_id = me)) then raise exception 'Conversation unavailable'; end if;
  a := least(me, intro.sender_id);
  b := greatest(me, intro.sender_id);
  perform pg_advisory_xact_lock(hashtextextended(a::text || b::text, 0));
  select d.conversation_id into existing_conversation_id from public.direct_conversation_pairs d where d.user_a = a and d.user_b = b;
  if existing_conversation_id is null then
    insert into public.conversations default values returning id into existing_conversation_id;
    insert into public.direct_conversation_pairs(user_a, user_b, conversation_id) values (a, b, existing_conversation_id) on conflict (user_a, user_b) do nothing;
    select d.conversation_id into existing_conversation_id from public.direct_conversation_pairs d where d.user_a = a and d.user_b = b;
  end if;
  if not exists (select 1 from public.conversation_participants cp where cp.conversation_id = existing_conversation_id and cp.user_id = me) then
    insert into public.conversation_participants(conversation_id, user_id, last_read_at)
      values (existing_conversation_id, intro.sender_id, null), (existing_conversation_id, intro.recipient_id, now()) on conflict do nothing;
  end if;
  insert into public.messages(conversation_id, sender_id, body)
    values (existing_conversation_id, intro.sender_id, intro.icebreaker), (existing_conversation_id, me, body);
  update public.conversation_introductions set status = 'replied', conversation_id_legacy = existing_conversation_id where id = introduction_id;
  return existing_conversation_id;
end;
$$;

revoke all on function public.reply_to_introduction(uuid, text) from public, anon;
grant execute on function public.reply_to_introduction(uuid, text) to authenticated;

create or replace function public.decline_introduction(introduction_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_email_verified() then raise exception 'Email verification required'; end if;
  perform public.expire_introductions();
  update public.conversation_introductions
     set status = 'declined'
   where id = introduction_id and recipient_id = auth.uid() and status = 'pending';
  if not found then raise exception 'Introduction is no longer available'; end if;
end;
$$;

revoke all on function public.decline_introduction(uuid) from public, anon;
grant execute on function public.decline_introduction(uuid) to authenticated;

create or replace function public.request_photo_access(owner_user uuid, conversation uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  request_id uuid;
begin
  if not public.is_email_verified() then raise exception 'Email verification required'; end if;
  if me is null or me = owner_user then raise exception 'Photo request unavailable'; end if;
  if exists (select 1 from public.profiles where id in (me, owner_user) and deactivated_at is not null) then raise exception 'Photo request unavailable'; end if;
  if exists (select 1 from public.profile_blocks where (blocker_id = me and blocked_id = owner_user) or (blocker_id = owner_user and blocked_id = me)) then raise exception 'Photo request unavailable'; end if;
  if not exists (select 1 from public.conversation_participants where conversation_id = conversation and user_id = me)
     or not exists (select 1 from public.conversation_participants where conversation_id = conversation and user_id = owner_user)
     or not exists (select 1 from public.profiles where id = owner_user and avatar_path is not null) then raise exception 'Photo request unavailable'; end if;
  if exists (select 1 from public.profile_photo_access_requests where requester_id = me and owner_id = owner_user and conversation_id = conversation and status = 'declined' and updated_at > now() - interval '72 hours') then raise exception 'Photo request unavailable'; end if;
  insert into public.profile_photo_access_requests(requester_id, owner_id, conversation_id)
    values(me, owner_user, conversation)
    on conflict (requester_id, owner_id, conversation_id) where status = 'pending' do nothing
    returning id into request_id;
  if request_id is null then raise exception 'Photo request already pending'; end if;
  return request_id;
end;
$$;

revoke all on function public.request_photo_access(uuid, uuid) from public, anon;
grant execute on function public.request_photo_access(uuid, uuid) to authenticated;

create or replace function public.grant_photo_access(viewer_user uuid, conversation uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid := auth.uid();
begin
  if not public.is_email_verified() then raise exception 'Email verification required'; end if;
  if me is null or me = viewer_user then raise exception 'Photo access unavailable'; end if;
  if exists (select 1 from public.profiles where id in (me, viewer_user) and deactivated_at is not null) then raise exception 'Photo access unavailable'; end if;
  if exists (select 1 from public.profile_blocks where (blocker_id = me and blocked_id = viewer_user) or (blocker_id = viewer_user and blocked_id = me)) then raise exception 'Photo access unavailable'; end if;
  if not exists (select 1 from public.profiles where id = me and avatar_path is not null)
     or not exists (select 1 from public.conversation_participants where conversation_id = conversation and user_id = me)
     or not exists (select 1 from public.conversation_participants where conversation_id = conversation and user_id = viewer_user) then raise exception 'Photo access unavailable'; end if;
  insert into public.profile_photo_access_grants(owner_id, viewer_id) values(me, viewer_user) on conflict do nothing;
  update public.profile_photo_access_requests set status = 'allowed', updated_at = now()
   where requester_id = viewer_user and owner_id = me and conversation_id = conversation and status = 'pending';
end;
$$;

revoke all on function public.grant_photo_access(uuid, uuid) from public, anon;
grant execute on function public.grant_photo_access(uuid, uuid) to authenticated;

create or replace function public.respond_photo_access(request_id uuid, decision text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare r public.profile_photo_access_requests;
begin
  if not public.is_email_verified() then raise exception 'Email verification required'; end if;
  select * into r from public.profile_photo_access_requests where id = request_id for update;
  if r.id is null or r.owner_id <> auth.uid() or r.status <> 'pending' or decision not in ('allowed','declined') then raise exception 'Photo request unavailable'; end if;
  if decision = 'allowed' then
    if exists (select 1 from public.profile_blocks where (blocker_id = r.owner_id and blocked_id = r.requester_id) or (blocker_id = r.requester_id and blocked_id = r.owner_id)) then raise exception 'Photo request unavailable'; end if;
    insert into public.profile_photo_access_grants(owner_id, viewer_id) values(r.owner_id, r.requester_id) on conflict do nothing;
  end if;
  update public.profile_photo_access_requests set status = decision, updated_at = now() where id = r.id;
end;
$$;

revoke all on function public.respond_photo_access(uuid, text) from public, anon;
grant execute on function public.respond_photo_access(uuid, text) to authenticated;

create or replace function public.revoke_photo_access(viewer_user uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_email_verified() then raise exception 'Email verification required'; end if;
  delete from public.profile_photo_access_grants where owner_id = auth.uid() and viewer_id = viewer_user;
end;
$$;

revoke all on function public.revoke_photo_access(uuid) from public, anon;
grant execute on function public.revoke_photo_access(uuid) to authenticated;

-- Direct message inserts and avatar uploads must be blocked even when a
-- caller bypasses the Next.js app routes.
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

drop policy if exists "Users upload own avatar" on storage.objects;
create policy "Users upload own avatar" on storage.objects
for insert to authenticated
with check (
  public.is_email_verified()
  and bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users update own avatar" on storage.objects;
create policy "Users update own avatar" on storage.objects
for update to authenticated
using (public.is_email_verified() and bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (public.is_email_verified() and bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete own avatar" on storage.objects;
create policy "Users delete own avatar" on storage.objects
for delete to authenticated
using (public.is_email_verified() and bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "View permitted avatars" on storage.objects;
create policy "View permitted avatars" on storage.objects
for select to authenticated
using (bucket_id = 'avatars' and public.is_email_verified() and public.can_view_profile_photo((storage.foldername(name))[1]::uuid));

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

-- Keep unconfirmed accounts out of the realtime presence boundary too.
create or replace function public.realtime_presence_publisher(target uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_email_verified()
     and target = auth.uid()
     and exists (select 1 from public.profiles p where p.id = auth.uid() and p.deactivated_at is null);
$$;

create or replace function public.realtime_presence_viewer(target uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_email_verified()
     and auth.uid() is not null
     and exists (select 1 from public.profiles p where p.id = target and p.deactivated_at is null and (target = auth.uid() or p.show_activity_status = true))
     and not exists (select 1 from public.profile_blocks b where (b.blocker_id = auth.uid() and b.blocked_id = target) or (b.blocked_id = auth.uid() and b.blocker_id = target));
$$;

revoke all on function public.realtime_presence_publisher(uuid) from public, anon;
revoke all on function public.realtime_presence_viewer(uuid) from public, anon;
grant execute on function public.realtime_presence_publisher(uuid) to authenticated;
grant execute on function public.realtime_presence_viewer(uuid) to authenticated;

create or replace function public.viewer_can_access_profile(target uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_email_verified()
     and (
       target = auth.uid()
       or (
         exists (select 1 from public.profiles viewer where viewer.id = auth.uid() and viewer.deactivated_at is null and public.is_adult_birth_date(viewer.birth_date))
         and exists (select 1 from public.profiles p where p.id = target and p.deactivated_at is null and public.is_adult_birth_date(p.birth_date) and (p.profile_visibility = 'public' or auth.uid() is not null))
         and not exists (select 1 from public.profile_blocks b where (b.blocker_id = auth.uid() and b.blocked_id = target) or (b.blocker_id = target and b.blocked_id = auth.uid()))
       )
     );
$$;

revoke all on function public.viewer_can_access_profile(uuid) from public, anon;
grant execute on function public.viewer_can_access_profile(uuid) to authenticated;

create or replace function public.can_view_profile_photo(owner_user uuid, viewer_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_email_verified()
     and (
       owner_user = auth.uid()
       or (
         auth.uid() is not null
         and exists (select 1 from public.profiles p where p.id = owner_user and p.deactivated_at is null and p.avatar_path is not null)
         and exists (select 1 from public.profile_photo_access_grants g where g.owner_id = owner_user and g.viewer_id = auth.uid())
         and not exists (select 1 from public.profile_blocks b where (b.blocker_id = owner_user and b.blocked_id = auth.uid()) or (b.blocker_id = auth.uid() and b.blocked_id = owner_user))
       )
     );
$$;

revoke all on function public.can_view_profile_photo(uuid, uuid) from public, anon;
grant execute on function public.can_view_profile_photo(uuid, uuid) to authenticated;

-- Middleware pings activity before the app shell can redirect an unconfirmed
-- session.  Treat that ping as a harmless no-op rather than a usable write.
create or replace function public.touch_activity()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_email_verified() then return; end if;
  update public.profiles set last_active_at = now()
   where id = auth.uid() and (last_active_at is null or last_active_at < now() - interval '5 minutes');
end;
$$;

revoke all on function public.touch_activity() from public, anon;
grant execute on function public.touch_activity() to authenticated;
