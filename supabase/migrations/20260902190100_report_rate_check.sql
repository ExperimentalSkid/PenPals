-- Keep the one-minute check explicit so a recent report cannot be missed by
-- an aggregate-only predicate under concurrent submissions.
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
  if me is null then raise exception 'Authentication required'; end if;
  if kind not in ('profile', 'introduction', 'message') then raise exception 'Invalid report target'; end if;
  if report_reason not in (
    'spam', 'scam/fraud', 'harassment', 'sexual/inappropriate content',
    'hate/abuse', 'fake profile/impersonation', 'underage concern', 'other'
  ) then raise exception 'Invalid report reason'; end if;

  if kind = 'profile' then
    if target = me or not exists (
      select 1 from public.profiles p
       where p.id = target and public.viewer_can_access_profile(p.id)
    ) then raise exception 'Invalid profile target'; end if;
  elsif kind = 'introduction' then
    select * into intro from public.conversation_introductions where id = target for update;
    if intro.id is null or (intro.sender_id <> me and intro.recipient_id <> me) then
      raise exception 'Invalid introduction target';
    end if;
  else
    select m.conversation_id into target_conversation from public.messages m where m.id = target;
    if target_conversation is null or not exists (
      select 1 from public.conversation_participants cp
       where cp.conversation_id = target_conversation and cp.user_id = me
    ) then raise exception 'Invalid message target'; end if;
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
    update public.conversation_introductions set status = 'declined' where id = target;
  end if;
  return report_id;
end;
$$;

revoke all on function public.submit_report(text, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.submit_report(text, uuid, text, text, boolean)
  to authenticated;
