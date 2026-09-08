-- Follow-up correctness fixes for the adult/commercial detection pack.
-- Domain rules must match host/path forms such as www.example.com/path while
-- avoiding a substring match inside an unrelated hostname.

create or replace function public.moderation_rule_matches(rule_term text, rule_match_type text, content text)
returns boolean language sql immutable strict set search_path = pg_catalog, public as $$
  with normalized as (
    select public.moderation_normalized_text(rule_term) as term,
           public.moderation_normalized_text(content) as body
  )
  select case
    when rule_match_type = 'domain' then
      body = term
      or position('.' || term in body) > 0
      or position('://' || term in body) > 0
      or position(term || '/' in body) > 0
      or position(term || '?' in body) > 0
      or position(term || '#' in body) > 0
      or position(term || ' ' in body) > 0
    when rule_match_type = 'contains' then
      position(lower(btrim(rule_term)) in lower(content)) > 0
      or position(term in body) > 0
    else position(' ' || term || ' ' in ' ' || body || ' ') > 0
  end from normalized
$$;
revoke all on function public.moderation_rule_matches(text, text, text) from public, anon, authenticated;

-- Keep the same detector implementation while avoiding an unused normalized
-- content local that made schema lint noisy.
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
        values (content_owner, target_kind, target_uuid, case when rule_row.signal_strength = 'HIGH' then 90 when rule_row.signal_strength = 'REVIEW' then 60 else 75 end, 'automated_flag') returning id into target_case;
      insert into public.moderation_audit_log(moderator_id, case_id, target_user_id, action, metadata)
        values (null, target_case, content_owner, 'case_created', jsonb_build_object('source','automated_flag'));
    end if;
    insert into public.moderation_content_flags(rule_id, target_type, target_id, target_user_id, field_name, conversation_id, content_snapshot, content_hash, category, signal_strength, matched_value, case_id)
      values (rule_row.id, target_kind, target_uuid, content_owner, content_field, related_conversation, clean_content, hash, rule_row.category, rule_row.signal_strength, public.moderation_normalized_text(rule_row.term), target_case)
      returning id into inserted_flag_id;
    insert into public.moderation_case_flags(case_id, flag_id) values (target_case, inserted_flag_id) on conflict do nothing;
    update public.moderation_cases set automated_flag_count = automated_flag_count + 1, updated_at = now(), source = case when source = 'report' then 'mixed' else source end where id = target_case;
    insert into public.moderation_audit_log(moderator_id, case_id, target_user_id, action, metadata)
      values (null, target_case, content_owner, 'automated_flag_created', jsonb_build_object('source','automated_flag','rule_identifier',rule_row.rule_identifier,'category',rule_row.category,'signal_strength',rule_row.signal_strength,'field_name',content_field,'target_type',target_kind,'target_id',target_uuid,'normalized_value',public.moderation_normalized_text(rule_row.term)));
  end loop;
end;
$$;
revoke all on function public.flag_moderation_content(text, uuid, uuid, text, text, uuid) from public, anon, authenticated;

