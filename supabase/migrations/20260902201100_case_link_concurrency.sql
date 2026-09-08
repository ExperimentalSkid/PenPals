-- Serialize case association for an exact report target. Without this lock,
-- two simultaneous reports for the same message/introduction could each see
-- no existing case and create duplicate cases.
create or replace function public.link_report_to_moderation_case()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  target_case uuid;
  subject uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(
    'penpal-report-case:' || coalesce(new.target_type, '') || ':' || coalesce(new.target_id::text, ''),
    0
  ));

  if new.target_type = 'message' then
    select m.sender_id into subject from public.messages m where m.id = new.target_message_id;
    select cr.case_id into target_case
      from public.moderation_case_reports cr
      join public.reports prior on prior.id = cr.report_id
     where prior.target_type = new.target_type and prior.target_id = new.target_id
     order by cr.linked_at limit 1;
  elsif new.target_type = 'introduction' then
    select i.sender_id into subject from public.conversation_introductions i where i.id = new.target_introduction_id;
    select cr.case_id into target_case
      from public.moderation_case_reports cr
      join public.reports prior on prior.id = cr.report_id
     where prior.target_type = new.target_type and prior.target_id = new.target_id
     order by cr.linked_at limit 1;
  elsif new.target_type = 'profile' then
    subject := new.target_profile_id;
  end if;

  if target_case is null then
    insert into public.moderation_cases(subject_user_id, primary_target_type, primary_target_id, priority, created_by)
      values (subject, new.target_type, new.target_id, public.moderation_reason_priority(new.reason, new.target_type), new.reporter_id)
      returning id into target_case;
    insert into public.moderation_audit_log(moderator_id, case_id, report_id, target_user_id, action, metadata)
      values (null, target_case, new.id, subject, 'case_created', jsonb_build_object('source', 'report'));
  end if;
  insert into public.moderation_case_reports(case_id, report_id) values (target_case, new.id)
    on conflict (report_id) do nothing;
  perform public.refresh_moderation_case_metrics(target_case);
  return new;
end;
$$;

revoke all on function public.link_report_to_moderation_case() from public, anon, authenticated;
