alter table public.profiles add column profile_visibility text not null default 'public' check (profile_visibility in ('public','authenticated_only'));
alter table public.profiles add column show_city boolean not null default true;
alter table public.profiles add column show_activity_status boolean not null default true;
alter table public.profiles add column show_response_rate boolean not null default true;
alter table public.profiles add column deactivated_at timestamptz;
drop policy if exists "Authenticated users can read profiles" on public.profiles;
create policy "Users can read own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));

create or replace function public.viewer_can_access_profile(target uuid) returns boolean language sql security definer set search_path = public stable as $$ select target = auth.uid() or (exists (select 1 from public.profiles p where p.id = target and p.deactivated_at is null and (p.profile_visibility = 'public' or auth.uid() is not null)) and not exists (select 1 from public.profile_blocks b where (b.blocker_id = auth.uid() and b.blocked_id = target) or (b.blocker_id = target and b.blocked_id = auth.uid()))) $$;
revoke all on function public.viewer_can_access_profile(uuid) from public; grant execute on function public.viewer_can_access_profile(uuid) to authenticated;
create or replace function public.get_public_profile(target_username text) returns jsonb language sql security definer set search_path = public as $$ select to_jsonb(p) - 'id' - case when p.show_city then '{}'::text else '{city}'::text end - case when p.show_activity_status then '{}'::text else '{last_active_at}'::text end - case when p.show_response_rate then '{}'::text else '{response_rate}'::text end from public.profiles p where p.username = lower(target_username) and public.viewer_can_access_profile(p.id) $$;
revoke all on function public.get_public_profile(text) from public; grant execute on function public.get_public_profile(text) to authenticated;
drop policy if exists "Authenticated users can read profile languages" on public.profile_languages;
drop policy if exists "Authenticated users can read profile interests" on public.profile_interests;
create policy "View permitted profile languages" on public.profile_languages for select to authenticated using (public.viewer_can_access_profile(profile_id));
create policy "View permitted profile interests" on public.profile_interests for select to authenticated using (public.viewer_can_access_profile(profile_id));
drop policy if exists "Authenticated users read response metrics" on public.response_opportunities;

drop policy if exists "Participants read conversations" on public.conversations;
create policy "Participants read conversations" on public.conversations for select to authenticated using (public.is_conversation_participant(id));
drop policy if exists "Participants read messages" on public.messages;
create policy "Participants read messages" on public.messages for select to authenticated using (public.is_conversation_participant(conversation_id));
drop policy if exists "Authenticated users can view avatars" on storage.objects;
create policy "View permitted avatars" on storage.objects for select to authenticated using (bucket_id = 'avatars' and public.viewer_can_access_profile(((storage.foldername(name))[1])::uuid));

create table public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('new_introduction','introduction_replied','introduction_declined','new_message')),
  related_id uuid not null, created_at timestamptz not null default now(), read_at timestamptz,
  unique (user_id, type, related_id)
);
create index notifications_user_unread_idx on public.notifications (user_id, read_at, created_at desc);
alter table public.notifications enable row level security;
create policy "Users read own notifications" on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy "Users update own notifications" on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create or replace function public.notify_introduction() returns trigger language plpgsql security definer set search_path = public as $$ begin if tg_op = 'INSERT' then insert into public.notifications(user_id,type,related_id) values (new.recipient_id,'new_introduction',new.id) on conflict do nothing; elsif new.status = 'replied' then insert into public.notifications(user_id,type,related_id) values (new.sender_id,'introduction_replied',new.id) on conflict do nothing; elsif new.status = 'declined' then insert into public.notifications(user_id,type,related_id) values (new.sender_id,'introduction_declined',new.id) on conflict do nothing; end if; return new; end; $$;
create trigger introductions_notifications after insert or update of status on public.conversation_introductions for each row execute function public.notify_introduction();
create or replace function public.notify_message() returns trigger language plpgsql security definer set search_path = public as $$ declare recipient uuid; begin select user_id into recipient from public.conversation_participants where conversation_id = new.conversation_id and user_id <> new.sender_id limit 1; if recipient is not null then insert into public.notifications(user_id,type,related_id) values (recipient,'new_message',new.id) on conflict do nothing; end if; return new; end; $$;
create trigger messages_notifications after insert on public.messages for each row execute function public.notify_message();
revoke all on function public.notify_introduction() from public;
revoke all on function public.notify_message() from public;
revoke all on function public.record_first_response() from public;
revoke all on function public.set_updated_at() from public;
create or replace function public.unread_notification_count() returns bigint language sql security definer set search_path = public as $$ select count(*) from public.notifications where user_id = auth.uid() and read_at is null $$;
revoke all on function public.unread_notification_count() from public; grant execute on function public.unread_notification_count() to authenticated;

create or replace function public.deactivate_account() returns void language sql security definer set search_path = public as $$ update public.profiles set deactivated_at = now(), accepting_new_conversations = false where id = auth.uid() $$;
create or replace function public.reactivate_account() returns void language sql security definer set search_path = public as $$ update public.profiles set deactivated_at = null, accepting_new_conversations = true where id = auth.uid() $$;
revoke all on function public.deactivate_account() from public; revoke all on function public.reactivate_account() from public; grant execute on function public.deactivate_account() to authenticated; grant execute on function public.reactivate_account() to authenticated;
