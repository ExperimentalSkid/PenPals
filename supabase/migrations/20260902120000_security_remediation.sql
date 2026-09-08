-- Critical security remediation: project public data explicitly, close target IDORs,
-- and make client privileges least-privilege without weakening normal RLS.

-- Public profile data is an allow-list.  The profile id is returned because the
-- authenticated server loader needs it to fetch already-authorized related rows.
-- Activity is reduced to a coarse label and private photos are returned only when
-- the current authenticated viewer has access.  No privacy/role/internal fields
-- are included in this response.
create or replace function public.get_public_profile(target_username text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  profile_row public.profiles;
  response_label text;
begin
  select p.*
    into profile_row
    from public.profiles p
   where p.username = lower(btrim(target_username))
     and public.viewer_can_access_profile(p.id);

  if not found then
    return null;
  end if;

  select case
           when s.completed_opportunities >= 5 and s.response_rate is not null
             then s.response_rate::text || '%'
           else 'New member'
         end
    into response_label
    from public.get_response_stats(profile_row.id) s;

  return jsonb_build_object(
    'id', profile_row.id,
    'username', profile_row.username,
    'display_name', profile_row.display_name,
    'birth_date', profile_row.birth_date,
    'gender', profile_row.gender,
    'country', profile_row.country,
    'city', case when profile_row.show_city then profile_row.city else null end,
    'bio', profile_row.bio,
    'quote', profile_row.quote,
    'looking_for', profile_row.looking_for,
    'avatar_path', case
      when public.can_view_profile_photo(profile_row.id, auth.uid()) then profile_row.avatar_path
      else null
    end,
    'availability', case when profile_row.show_activity_status then profile_row.availability else null end,
    'activity_status', case
      when not profile_row.show_activity_status then null
      when profile_row.availability = 'away' then 'Away'
      when profile_row.last_active_at is null then 'Active more than a week ago'
      when profile_row.last_active_at >= now() - interval '5 minutes' then 'Online now'
      when profile_row.last_active_at >= now() - interval '1 hour' then 'Active recently'
      when profile_row.last_active_at >= now() - interval '1 day' then 'Active today'
      when profile_row.last_active_at >= now() - interval '7 days' then 'Active this week'
      else 'Active more than a week ago'
    end,
    'response_rate_label', response_label
  );
end;
$$;

-- Response statistics are public only when the target explicitly allows them
-- and the viewer can access that profile.  Declined-response timing remains an
-- existing follow-up correctness item; this change closes the privacy exposure.
create or replace function public.get_response_stats(target_user uuid)
returns table (completed_opportunities bigint, response_rate numeric, median_hours numeric)
language sql
security definer
set search_path = pg_catalog, public
as $$
with target as (
  select 1
    from public.profiles p
   where p.id = target_user
     and p.show_response_rate
     and public.viewer_can_access_profile(p.id)
), valid as (
  select i.*
    from public.conversation_introductions i
   where i.recipient_id = target_user
     and exists (select 1 from target)
     and i.status in ('replied','declined','expired')
     and not exists (
       select 1
         from public.profile_blocks b
        where (b.blocker_id = i.sender_id and b.blocked_id = i.recipient_id)
           or (b.blocker_id = i.recipient_id and b.blocked_id = i.sender_id)
     )
     and not exists (
       select 1
         from public.reports r
        where r.target_type = 'introduction'
          and r.target_id = i.id
          and r.status <> 'dismissed'
          and r.reason in (
            'spam','scam/fraud','harassment','sexual/inappropriate content',
            'hate/abuse','fake profile/impersonation','underage concern'
          )
     )
), stats as (
  select count(*) as completed,
         count(*) filter (where status in ('replied','declined')) as handled,
         percentile_cont(0.5) within group (
           order by extract(epoch from ((case
             when status = 'replied' then coalesce((
               select min(m.created_at)
                 from public.messages m
                where m.conversation_id = valid.conversation_id_legacy
                  and m.sender_id = valid.recipient_id
             ), created_at)
             else created_at
           end) - created_at)) / 3600.0
         ) filter (where status in ('replied','declined')) as median
    from valid
)
select completed,
       case when completed >= 5 then round(handled::numeric * 100 / completed, 0) else null end,
       median
  from stats
 where exists (select 1 from target);
$$;

-- Report target authorization: a reporter may reference only an accessible
-- profile, an introduction they participate in, or a message in their own
-- conversation.  The optional pending-introduction decline remains atomic.
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
  if me is null then
    raise exception 'Authentication required';
  end if;
  if kind not in ('profile','introduction','message') then
    raise exception 'Invalid report target';
  end if;
  if report_reason not in (
    'spam','scam/fraud','harassment','sexual/inappropriate content',
    'hate/abuse','fake profile/impersonation','underage concern','other'
  ) then
    raise exception 'Invalid report reason';
  end if;

  if kind = 'profile' then
    if target = me
       or not exists (
         select 1
           from public.profiles p
          where p.id = target
            and public.viewer_can_access_profile(p.id)
       ) then
      raise exception 'Invalid profile target';
    end if;
  elsif kind = 'introduction' then
    select * into intro
      from public.conversation_introductions
     where id = target;
    if intro.id is null or (intro.sender_id <> me and intro.recipient_id <> me) then
      raise exception 'Invalid introduction target';
    end if;
  else
    select m.conversation_id into target_conversation
      from public.messages m
     where m.id = target;
    if target_conversation is null
       or not exists (
         select 1
           from public.conversation_participants cp
          where cp.conversation_id = target_conversation
            and cp.user_id = me
       ) then
      raise exception 'Invalid message target';
    end if;
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

-- Identity membership rows may only update their read cursor.  Column grants
-- prevent moving a participant to another conversation even when RLS matches.
revoke update on table public.conversation_participants from public, anon, authenticated;
grant update (last_read_at) on table public.conversation_participants to authenticated;

create or replace function public.protect_conversation_participant_identity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.conversation_id is distinct from old.conversation_id
     or new.user_id is distinct from old.user_id then
    raise exception 'Conversation membership is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists conversation_participant_identity_guard on public.conversation_participants;
create trigger conversation_participant_identity_guard
before update on public.conversation_participants
for each row execute function public.protect_conversation_participant_identity();

revoke all on function public.protect_conversation_participant_identity() from public, anon, authenticated;

-- Restrict report writes to status and make every other report field immutable.
-- The trigger also owns updated_at when status changes and writes the existing
-- moderation audit entry.
revoke update on table public.reports from public, anon, authenticated;
grant update (status) on table public.reports to authenticated;

create or replace function public.log_report_status_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.id is distinct from old.id
     or new.reporter_id is distinct from old.reporter_id
     or new.target_type is distinct from old.target_type
     or new.target_id is distinct from old.target_id
     or new.target_profile_id is distinct from old.target_profile_id
     or new.target_introduction_id is distinct from old.target_introduction_id
     or new.target_message_id is distinct from old.target_message_id
     or new.reason is distinct from old.reason
     or new.details is distinct from old.details
     or new.created_at is distinct from old.created_at then
    raise exception 'Only report status may be changed';
  end if;

  if new.status is distinct from old.status then
    new.updated_at := now();
    insert into public.moderation_audit_log(moderator_id, report_id, action, old_status, new_status)
    values (auth.uid(), new.id, 'status_change', old.status, new.status);
  elsif new.updated_at is distinct from old.updated_at then
    raise exception 'Only report status may be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists reports_status_audit on public.reports;
create trigger reports_status_audit
before update on public.reports
for each row execute function public.log_report_status_change();

revoke all on function public.log_report_status_change() from public, anon, authenticated;

-- Keep the legacy client-facing parameter for compatibility, but never trust it.
-- Every authorization decision uses the JWT subject instead.
create or replace function public.can_view_profile_photo(owner_user uuid, viewer_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select owner_user = auth.uid()
      or (
        auth.uid() is not null
        and exists (
          select 1
            from public.profiles p
           where p.id = owner_user
             and p.deactivated_at is null
             and p.avatar_path is not null
        )
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
      );
$$;

-- Supabase's local default ACL explicitly grants execute to anon/authenticated
-- for functions created by postgres.  Remove that inherited surface from every
-- public SECURITY DEFINER routine, then restore only the functions used by the
-- authenticated app/RLS policies.  Function owners retain internal execution.
do $$
declare
  routine record;
begin
  for routine in
    select n.nspname as schema_name,
           p.proname as function_name,
           pg_get_function_identity_arguments(p.oid) as arguments
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
  loop
    execute format(
      'revoke execute on function %I.%I(%s) from public, anon, authenticated',
      routine.schema_name, routine.function_name, routine.arguments
    );
    execute format(
      'alter function %I.%I(%s) set search_path = pg_catalog, public',
      routine.schema_name, routine.function_name, routine.arguments
    );
  end loop;
end;
$$;

-- Authenticated app/RLS entry points.
grant execute on function public.get_public_profile(text) to authenticated;
grant execute on function public.get_discover_profiles(uuid) to authenticated;
grant execute on function public.get_response_stats(uuid) to authenticated;
grant execute on function public.viewer_can_access_profile(uuid) to authenticated;
grant execute on function public.can_view_profile_photo(uuid, uuid) to authenticated;
grant execute on function public.is_conversation_participant(uuid, uuid) to authenticated;
grant execute on function public.is_moderator() to authenticated;
grant execute on function public.realtime_presence_publisher(uuid) to authenticated;
grant execute on function public.realtime_presence_viewer(uuid) to authenticated;
grant execute on function public.unread_notification_count() to authenticated;
grant execute on function public.deactivate_account() to authenticated;
grant execute on function public.reactivate_account() to authenticated;
grant execute on function public.submit_introduction(uuid, text) to authenticated;
grant execute on function public.reply_to_introduction(uuid, text) to authenticated;
grant execute on function public.decline_introduction(uuid) to authenticated;
grant execute on function public.submit_report(text, uuid, text, text, boolean) to authenticated;
grant execute on function public.request_photo_access(uuid, uuid) to authenticated;
grant execute on function public.respond_photo_access(uuid, text) to authenticated;
grant execute on function public.revoke_photo_access(uuid) to authenticated;
grant execute on function public.grant_photo_access(uuid, uuid) to authenticated;
grant execute on function public.touch_activity() to authenticated;
grant execute on function public.get_report_details(uuid) to authenticated;
grant execute on function public.admin_list_users(text, text, text, text) to authenticated;
grant execute on function public.admin_get_user_detail(uuid) to authenticated;
grant execute on function public.admin_log_user_detail_access(uuid, text) to authenticated;
grant execute on function public.admin_get_user_security_context(uuid) to authenticated;
grant execute on function public.admin_get_profile_content_history(uuid) to authenticated;
grant execute on function public.admin_remove_profile_content(uuid, text, text) to authenticated;
grant execute on function public.admin_set_account_status(uuid, boolean, text) to authenticated;
grant execute on function public.set_user_role(uuid, text, text) to authenticated;
grant execute on function public.admin_list_user_conversations(uuid, text) to authenticated;
grant execute on function public.admin_get_conversation_review(uuid, uuid, uuid, text) to authenticated;

-- Internal trigger/lifecycle helpers remain owner-only.
revoke execute on function public.expire_introductions() from public, anon, authenticated;
revoke execute on function public.notify_introduction() from public, anon, authenticated;
revoke execute on function public.notify_message() from public, anon, authenticated;
revoke execute on function public.record_first_response() from public, anon, authenticated;
revoke execute on function public.revoke_photo_access_on_block() from public, anon, authenticated;
revoke execute on function public.protect_profile_role() from public, anon, authenticated;
revoke execute on function public.prevent_moderation_audit_mutation() from public, anon, authenticated;
revoke execute on function public.set_user_role_legacy(uuid, text) from public, anon, authenticated;
revoke execute on function public.admin_set_account_status_legacy(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.admin_remove_profile_content_legacy(uuid, text, text) from public, anon, authenticated;
