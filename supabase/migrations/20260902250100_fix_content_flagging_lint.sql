-- Correct composite-variable assignment and the rule identifier ambiguity in
-- the initial triage migration. Behaviour and security boundaries are kept.
create or replace function public.flag_moderation_content(target_kind text, target_uuid uuid, content_owner uuid, content_field text, content_value text, related_conversation uuid default null)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  rule_row record;
  existing_flag public.moderation_content_flags;
  inserted_flag_id uuid;
  target_case uuid;
  hash text;
  clean_content text := left(coalesce(content_value, ''), 10000);
begin
  if clean_content = '' or target_kind not in ('profile','introduction','message') then return; end if;
  hash := md5(clean_content);
  for rule_row in select * from public.moderation_detection_rules where enabled order by id loop
    if not public.moderation_rule_matches(rule_row.term, rule_row.match_type, clean_content) then continue; end if;
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
        values (content_owner, target_kind, target_uuid, 75, 'automated_flag') returning id into target_case;
      insert into public.moderation_audit_log(moderator_id, case_id, target_user_id, action, metadata)
        values (null, target_case, content_owner, 'case_created', jsonb_build_object('source','automated_flag'));
    end if;
    insert into public.moderation_content_flags(rule_id, target_type, target_id, target_user_id, field_name, conversation_id, content_snapshot, content_hash, category, case_id)
      values (rule_row.id, target_kind, target_uuid, content_owner, content_field, related_conversation, clean_content, hash, rule_row.category, target_case)
      returning id into inserted_flag_id;
    insert into public.moderation_case_flags(case_id, flag_id) values (target_case, inserted_flag_id) on conflict do nothing;
    update public.moderation_cases set automated_flag_count = automated_flag_count + 1, updated_at = now(), source = case when source = 'report' then 'mixed' else source end where id = target_case;
    perform set_config('app.allow_moderation_flag_update', '1', true);
    if target_kind = 'profile' then
      update public.profiles set moderation_flagged_fields = array(select distinct unnest(coalesce(moderation_flagged_fields, '{}') || content_field) order by 1) where id = target_uuid;
    elsif target_kind = 'message' then update public.messages set moderation_status = 'flagged_for_review' where id = target_uuid;
    elsif target_kind = 'introduction' then update public.conversation_introductions set moderation_status = 'flagged_for_review' where id = target_uuid;
    end if;
    insert into public.moderation_audit_log(moderator_id, case_id, target_user_id, action, metadata)
      values (null, target_case, content_owner, 'automated_flag_created', jsonb_build_object('source','automated_flag','rule_identifier',rule_row.rule_identifier,'category',rule_row.category,'field_name',content_field,'target_type',target_kind,'target_id',target_uuid));
  end loop;
end;
$$;

create or replace function public.admin_upsert_moderation_detection_rule(rule_identifier text, rule_term text, rule_category text, rule_match_type text, rule_enabled boolean, change_reason text)
returns public.moderation_detection_rules language plpgsql security definer set search_path = pg_catalog, public as $$
declare result public.moderation_detection_rules; clean_id text := lower(btrim(rule_identifier)); clean_term text := btrim(rule_term); clean_reason text := nullif(btrim(change_reason), '');
begin
  if not public.is_admin() then raise exception 'Administrator authorization required'; end if;
  if clean_reason is null or char_length(clean_reason) > 500 then raise exception 'A change reason is required'; end if;
  if clean_id !~ '^[a-z0-9][a-z0-9._-]{0,79}$' or char_length(clean_term) not between 1 and 160 then raise exception 'Invalid detection rule'; end if;
  if rule_category not in ('paid_adult_content','pornography_service','cam_service','escort_or_prostitution','sexual_service','commercial_fetish_service','adult_service_other') then raise exception 'Invalid detection category'; end if;
  if rule_match_type not in ('contains','word','domain') then raise exception 'Invalid detection match type'; end if;
  insert into public.moderation_detection_rules(rule_identifier,term,category,match_type,enabled,updated_by) values (clean_id,clean_term,rule_category,rule_match_type,coalesce(rule_enabled,true),auth.uid())
    on conflict on constraint moderation_detection_rules_rule_identifier_key do update set term = excluded.term, category = excluded.category, match_type = excluded.match_type, enabled = excluded.enabled, updated_by = auth.uid(), updated_at = now()
    returning * into result;
  insert into public.moderation_audit_log(moderator_id, action, metadata) values (auth.uid(), 'detection_rule_updated', jsonb_build_object('rule_identifier',result.rule_identifier,'category',result.category,'match_type',result.match_type,'enabled',result.enabled,'reason',clean_reason));
  return result;
end;
$$;
