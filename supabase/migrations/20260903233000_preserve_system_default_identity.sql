-- Administrator edits (including disabling a rule) must not relabel a seeded
-- SYSTEM DEFAULT as an admin-created rule.
create or replace function public.admin_upsert_moderation_detection_rule(rule_identifier text, rule_term text, rule_category text, rule_match_type text, rule_enabled boolean, change_reason text)
returns public.moderation_detection_rules
language plpgsql security definer set search_path = pg_catalog, public as $$
declare result public.moderation_detection_rules; clean_id text := lower(btrim(rule_identifier)); clean_term text := btrim(rule_term); clean_reason text := nullif(btrim(change_reason), '');
begin
  if not public.is_admin() then raise exception 'Administrator authorization required'; end if;
  if clean_reason is null or char_length(clean_reason) > 500 then raise exception 'A change reason is required'; end if;
  if clean_id !~ '^[a-z0-9][a-z0-9._-]{0,79}$' or char_length(clean_term) not between 1 and 160 then raise exception 'Invalid detection rule'; end if;
  if rule_category not in ('paid_adult_content','pornography_service','cam_service','escort_or_prostitution','sexual_service','commercial_fetish_service','adult_service_other','commercial_solicitation','creator_monetization','bridge_link','obfuscated_link') then raise exception 'Invalid detection category'; end if;
  if rule_match_type not in ('contains','word','domain') then raise exception 'Invalid detection match type'; end if;
  insert into public.moderation_detection_rules(rule_identifier,term,category,match_type,enabled,updated_by,is_system_default)
    values (clean_id,clean_term,rule_category,rule_match_type,coalesce(rule_enabled,true),auth.uid(),false)
    on conflict on constraint moderation_detection_rules_rule_identifier_key do update
      set term = excluded.term, category = excluded.category, match_type = excluded.match_type,
          enabled = excluded.enabled, updated_by = auth.uid(), updated_at = now()
    returning * into result;
  insert into public.moderation_audit_log(moderator_id, action, metadata)
    values (auth.uid(), 'detection_rule_updated', jsonb_build_object('rule_identifier',result.rule_identifier,'category',result.category,'match_type',result.match_type,'enabled',result.enabled,'reason',clean_reason));
  return result;
end;
$$;
revoke all on function public.admin_upsert_moderation_detection_rule(text, text, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_upsert_moderation_detection_rule(text, text, text, text, boolean, text) to authenticated;

