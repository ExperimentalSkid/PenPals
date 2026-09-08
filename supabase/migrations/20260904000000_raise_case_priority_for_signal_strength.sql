-- Keep triage ordering aligned with the strongest signal attached to a case.
-- This is only queue priority; it does not apply enforcement.
create or replace function public.flag_moderation_content(target_kind text, target_uuid uuid, content_owner uuid, content_field text, content_value text, related_conversation uuid default null)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  rule_row record;
  existing_flag public.moderation_content_flags;
  inserted_flag_id uuid;
  target_case uuid;
  hash text;
  clean_content text := left(coalesce(content_value, ''), 10000);
  signal_priority integer;
begin
  if clean_content = '' or target_kind not in ('profile','introduction','message','snail_mail') then return; end if;
  hash := md5(clean_content);
  for rule_row in select * from public.moderation_detection_rules where enabled order by id loop
    if not public.moderation_rule_matches(rule_row.term, rule_row.match_type, clean_content) then continue; end if;
    if coalesce(rule_row.requires_context, false) and not exists (
      select 1 from public.moderation_detection_rules other
       where other.enabled and other.id <> rule_row.id
         and public.moderation_rule_matches(other.term, other.match_type, clean_content)
         and (
           (not coalesce(other.requires_context, false) and other.category <> 'creator_monetization')
           or (rule_row.context_group in ('promotion','bridge') and other.context_group in ('promotion','bridge'))
         )
    ) then continue; end if;
    signal_priority := case rule_row.signal_strength when 'HIGH' then 90 when 'REVIEW' then 60 else 75 end;
    perform pg_advisory_xact_lock(hashtextextended('auto-flag:' || target_kind || ':' || target_uuid::text || ':' || content_field || ':' || rule_row.id::text || ':' || hash, 0));
    select * into existing_flag from public.moderation_content_flags f
     where f.target_type = target_kind and f.target_id = target_uuid and f.field_name = content_field and f.rule_id = rule_row.id and f.content_hash = hash
     order by f.created_at desc limit 1;
    if existing_flag.id is not null then
      if existing_flag.status = 'flagged_for_review' then perform public.refresh_moderation_content_state(target_kind, target_uuid); end if;
      continue;
    end if;
    select c.id into target_case from public.moderation_cases c join public.moderation_content_flags f on f.case_id = c.id
     where f.target_type = target_kind and f.target_id = target_uuid and c.status not in ('resolved','dismissed') order by c.updated_at desc limit 1;
    if target_case is null then
      insert into public.moderation_cases(subject_user_id, primary_target_type, primary_target_id, priority, source)
        values (content_owner, target_kind, target_uuid, signal_priority, 'automated_flag') returning id into target_case;
      insert into public.moderation_audit_log(moderator_id, case_id, target_user_id, action, metadata)
        values (null, target_case, content_owner, 'case_created', jsonb_build_object('source','automated_flag'));
    end if;
    insert into public.moderation_content_flags(rule_id, target_type, target_id, target_user_id, field_name, conversation_id, content_snapshot, content_hash, category, signal_strength, matched_value, case_id)
      values (rule_row.id, target_kind, target_uuid, content_owner, content_field, related_conversation, clean_content, hash, rule_row.category, rule_row.signal_strength, public.moderation_normalized_text(rule_row.term), target_case)
      returning id into inserted_flag_id;
    insert into public.moderation_case_flags(case_id, flag_id) values (target_case, inserted_flag_id) on conflict do nothing;
    update public.moderation_cases set automated_flag_count = automated_flag_count + 1, priority = greatest(priority, signal_priority), updated_at = now(), source = case when source = 'report' then 'mixed' else source end where id = target_case;
    perform set_config('app.allow_moderation_flag_update', '1', true);
    if target_kind = 'profile' then
      update public.profiles set moderation_flagged_fields = array(select distinct unnest(coalesce(moderation_flagged_fields, '{}') || content_field) order by 1) where id = target_uuid;
    elsif target_kind = 'message' then
      update public.messages set moderation_status = 'flagged_for_review' where id = target_uuid;
    elsif target_kind = 'introduction' then
      update public.conversation_introductions set moderation_status = 'flagged_for_review' where id = target_uuid;
    end if;
    insert into public.moderation_audit_log(moderator_id, case_id, target_user_id, action, metadata)
      values (null, target_case, content_owner, 'automated_flag_created', jsonb_build_object('source','automated_flag','rule_identifier',rule_row.rule_identifier,'category',rule_row.category,'signal_strength',rule_row.signal_strength,'field_name',content_field,'target_type',target_kind,'target_id',target_uuid,'normalized_value',public.moderation_normalized_text(rule_row.term)));
  end loop;
end;
$$;
revoke all on function public.flag_moderation_content(text, uuid, uuid, text, text, uuid) from public, anon, authenticated;

