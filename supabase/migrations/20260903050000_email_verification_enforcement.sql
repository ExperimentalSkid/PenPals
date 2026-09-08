-- Close the remaining mandatory-email-verification gaps.
-- `public.is_email_verified()` is the single server-authoritative rule for
-- normal authenticated Penpal activity.  No duplicate client-side state is
-- introduced here.

-- Reports are a protected user mutation.  Keep all existing target,
-- authorization, rate-limit, and decline behavior and add only the
-- confirmation boundary.
create or replace function public.submit_report(
  kind text,
  target uuid,
  report_reason text,
  report_details text default null,
  decline_pending boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  report_id uuid;
  me uuid := auth.uid();
  intro public.conversation_introductions;
  target_conversation uuid;
begin
  if me is null or not public.is_email_verified() then
    raise exception 'Email verification required';
  end if;
  if kind not in ('profile', 'introduction', 'message') then
    raise exception 'Invalid report target';
  end if;
  if report_reason not in (
    'spam', 'scam/fraud', 'harassment', 'sexual/inappropriate content',
    'hate/abuse', 'fake profile/impersonation', 'underage concern', 'other'
  ) then
    raise exception 'Invalid report reason';
  end if;

  if kind = 'profile' then
    if target = me or not exists (
      select 1 from public.profiles p
       where p.id = target and public.viewer_can_access_profile(p.id)
    ) then
      raise exception 'Invalid profile target';
    end if;
  elsif kind = 'introduction' then
    select * into intro
      from public.conversation_introductions
     where id = target
     for update;
    if intro.id is null or (intro.sender_id <> me and intro.recipient_id <> me) then
      raise exception 'Invalid introduction target';
    end if;
  else
    select m.conversation_id into target_conversation
      from public.messages m
     where m.id = target;
    if target_conversation is null or not exists (
      select 1 from public.conversation_participants cp
       where cp.conversation_id = target_conversation and cp.user_id = me
    ) then
      raise exception 'Invalid message target';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(me::text, 0));
  if exists (
    select 1 from public.reports
     where reporter_id = me and created_at > now() - interval '60 seconds'
  ) or (select count(*) from public.reports
          where reporter_id = me and created_at > now() - interval '24 hours') >= 10
     or exists (
       select 1 from public.reports
        where reporter_id = me and target_type = kind and target_id = target
          and reason = report_reason and created_at > now() - interval '24 hours'
     ) then
    raise exception 'Please wait before submitting another report.';
  end if;

  insert into public.reports (
    reporter_id, target_type, target_id, target_profile_id,
    target_introduction_id, target_message_id, reason, details
  ) values (
    me, kind, target,
    case when kind = 'profile' then target end,
    case when kind = 'introduction' then target end,
    case when kind = 'message' then target end,
    report_reason, nullif(btrim(report_details), '')
  ) returning id into report_id;

  if kind = 'introduction' and decline_pending
     and intro.recipient_id = me and intro.status = 'pending' then
    update public.conversation_introductions
       set status = 'declined'
     where id = target;
  end if;
  return report_id;
end;
$$;

revoke all on function public.submit_report(text, uuid, text, text, boolean) from public, anon;
grant execute on function public.submit_report(text, uuid, text, text, boolean) to authenticated;

-- Keep direct report inserts closed and require the same confirmation gate if
-- the authenticated role attempts the table API directly.
drop policy if exists "Users submit own reports" on public.reports;
create policy "Users submit own reports"
  on public.reports for insert to authenticated
  with check (public.is_email_verified() and reporter_id = auth.uid());

-- Data-rights export requests and their audit rows are private reads.  The
-- SECURITY DEFINER export functions are wrapped below; these policies close
-- direct table reads as well.
drop policy if exists "Users read own export requests" on public.data_export_requests;
create policy "Users read own export requests"
  on public.data_export_requests for select to authenticated
  using (public.is_email_verified() and user_id = auth.uid());

drop policy if exists "Users read own data rights audit" on public.data_rights_audit_log;
create policy "Users read own data rights audit"
  on public.data_rights_audit_log for select to authenticated
  using (public.is_email_verified() and user_id = auth.uid());

-- The original export implementations are kept intact as private helpers;
-- public entrypoints add the canonical verification gate before delegating.
alter function public.create_data_export() rename to create_data_export_unchecked;
create or replace function public.create_data_export()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_email_verified() then
    raise exception 'Email verification required';
  end if;
  return public.create_data_export_unchecked();
end;
$$;
revoke all on function public.create_data_export_unchecked() from public, anon, authenticated;
revoke all on function public.create_data_export() from public, anon, authenticated;
grant execute on function public.create_data_export() to authenticated;

alter function public.get_my_data_export_supplement() rename to get_my_data_export_supplement_unchecked;
create or replace function public.get_my_data_export_supplement()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_email_verified() then
    raise exception 'Email verification required';
  end if;
  return public.get_my_data_export_supplement_unchecked();
end;
$$;
revoke all on function public.get_my_data_export_supplement_unchecked() from public, anon, authenticated;
revoke all on function public.get_my_data_export_supplement() from public, anon, authenticated;
grant execute on function public.get_my_data_export_supplement() to authenticated;

create or replace function public.record_data_export_download(export_request uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not public.is_email_verified() then
    raise exception 'Email verification required';
  end if;
  update public.data_export_requests
     set downloaded_at = now()
   where id = export_request and user_id = me and expires_at > now();
  if not found then
    raise exception 'Data export is unavailable';
  end if;
  insert into public.data_rights_audit_log (user_id, export_request_id, action)
  values (me, export_request, 'export_downloaded');
end;
$$;
revoke all on function public.record_data_export_download(uuid) from public, anon, authenticated;
grant execute on function public.record_data_export_download(uuid) to authenticated;

-- Friendship destinations are private user-owned rows, not public profile
-- data.  Add the confirmation gate to every direct table operation.
drop policy if exists "Users read own friendship destinations" on public.profile_friendship_destinations;
create policy "Users read own friendship destinations"
  on public.profile_friendship_destinations for select to authenticated
  using (public.is_email_verified() and profile_id = auth.uid());

drop policy if exists "Users insert own friendship destinations" on public.profile_friendship_destinations;
create policy "Users insert own friendship destinations"
  on public.profile_friendship_destinations for insert to authenticated
  with check (public.is_email_verified() and profile_id = auth.uid());

drop policy if exists "Users update own friendship destinations" on public.profile_friendship_destinations;
create policy "Users update own friendship destinations"
  on public.profile_friendship_destinations for update to authenticated
  using (public.is_email_verified() and profile_id = auth.uid())
  with check (public.is_email_verified() and profile_id = auth.uid());

drop policy if exists "Users delete own friendship destinations" on public.profile_friendship_destinations;
create policy "Users delete own friendship destinations"
  on public.profile_friendship_destinations for delete to authenticated
  using (public.is_email_verified() and profile_id = auth.uid());

-- Direct pair metadata is private conversation data.  A participant must be
-- confirmed before the pair row (or helper result) is visible.
drop policy if exists "Participants read direct pair" on public.direct_conversation_pairs;
create policy "Participants read direct pair"
  on public.direct_conversation_pairs for select to authenticated
  using (public.is_email_verified() and (user_a = auth.uid() or user_b = auth.uid()));

create or replace function public.is_conversation_participant(
  target_conversation uuid,
  target_user uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_email_verified()
     and exists (
       select 1 from public.conversation_participants
        where conversation_id = target_conversation and user_id = target_user
     );
$$;
revoke all on function public.is_conversation_participant(uuid, uuid) from public, anon;
grant execute on function public.is_conversation_participant(uuid, uuid) to authenticated;

-- Do not let an unconfirmed client probe arbitrary block relationships through
-- the helper used by message RLS.
create or replace function public.users_are_blocked(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select public.is_email_verified()
     and first_user is not null
     and second_user is not null
     and exists (
       select 1 from public.profile_blocks b
        where (b.blocker_id = first_user and b.blocked_id = second_user)
           or (b.blocker_id = second_user and b.blocked_id = first_user)
     );
$$;
revoke all on function public.users_are_blocked(uuid, uuid) from public, anon;
grant execute on function public.users_are_blocked(uuid, uuid) to authenticated;

-- Avatar path listing and acknowledgement are protected data-rights helpers;
-- retain their existing behavior for confirmed users.
create or replace function public.list_my_avatar_paths()
returns text[]
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_email_verified() then
    raise exception 'Email verification required';
  end if;
  return (
    select coalesce(array_agg(o.name order by o.created_at), array[]::text[])
      from storage.objects o
     where o.bucket_id = 'avatars'
       and (storage.foldername(o.name))[1] = auth.uid()::text
  );
end;
$$;
revoke all on function public.list_my_avatar_paths() from public, anon, authenticated;
grant execute on function public.list_my_avatar_paths() to authenticated;

create or replace function public.ack_my_avatar_deletions(deletion_paths text[])
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_email_verified() then
    raise exception 'Email verification required';
  end if;
  delete from public.account_storage_deletion_outbox o
   where o.path = any(coalesce(deletion_paths, array[]::text[]))
     and split_part(o.path, '/', 1) = auth.uid()::text;
end;
$$;
revoke all on function public.ack_my_avatar_deletions(text[]) from public, anon, authenticated;
grant execute on function public.ack_my_avatar_deletions(text[]) to authenticated;

-- The legacy eight-argument overload must enforce the same gate before it
-- delegates to the current inactive-mode-aware overload.
create or replace function public.save_privacy_settings(
  p_profile_visibility text,
  p_show_city boolean,
  p_show_activity_status boolean,
  p_show_response_rate boolean,
  p_accepting_new_conversations boolean,
  p_introduction_scope text,
  p_availability text,
  p_country_codes text[] default '{}'::text[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_email_verified() then
    raise exception 'Authentication required';
  end if;
  perform public.save_privacy_settings(
    p_profile_visibility,
    p_show_city,
    p_show_activity_status,
    p_show_response_rate,
    p_accepting_new_conversations,
    p_introduction_scope,
    p_availability,
    p_country_codes,
    false
  );
end;
$$;
revoke all on function public.save_privacy_settings(text, boolean, boolean, boolean, boolean, text, text, text[]) from public, anon, authenticated;
grant execute on function public.save_privacy_settings(text, boolean, boolean, boolean, boolean, text, text, text[]) to authenticated;

-- Account lifecycle actions are also normal authenticated app mutations.  A
-- confirmed user keeps the exact existing admin-marker behavior.
create or replace function public.deactivate_account()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_email_verified() then
    raise exception 'Email verification required';
  end if;
  if exists (
    select 1 from public.profiles
     where id = auth.uid() and admin_deactivated_at is not null
  ) then
    raise exception 'Account status is controlled by an administrator';
  end if;
  perform set_config('app.allow_account_status_change', '1', true);
  update public.profiles
     set accepting_new_conversations_before_deactivation = accepting_new_conversations,
         deactivated_at = now(),
         accepting_new_conversations = false
   where id = auth.uid() and deactivated_at is null and admin_deactivated_at is null;
end;
$$;

create or replace function public.reactivate_account()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.is_email_verified() then
    raise exception 'Email verification required';
  end if;
  if exists (
    select 1 from public.profiles
     where id = auth.uid() and admin_deactivated_at is not null
  ) then
    raise exception 'Account status is controlled by an administrator';
  end if;
  perform set_config('app.allow_account_status_change', '1', true);
  update public.profiles
     set deactivated_at = null,
         accepting_new_conversations = coalesce(accepting_new_conversations_before_deactivation, accepting_new_conversations),
         accepting_new_conversations_before_deactivation = null
   where id = auth.uid() and deactivated_at is not null and admin_deactivated_at is null;
end;
$$;
revoke all on function public.deactivate_account() from public, anon, authenticated;
revoke all on function public.reactivate_account() from public, anon, authenticated;
grant execute on function public.deactivate_account() to authenticated;
grant execute on function public.reactivate_account() to authenticated;

