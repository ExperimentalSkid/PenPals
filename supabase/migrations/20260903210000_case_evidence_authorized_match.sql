-- Case evidence may expose the matched term only to administrators. Moderators
-- continue to receive the rule identifier and preserved content without the
-- protected detection-list value.
create or replace function public.admin_get_moderation_case_flags(case_uuid uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  if not public.is_moderator() then raise exception 'Moderator authorization required'; end if;
  if not exists (select 1 from public.moderation_cases where id = case_uuid) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id, 'target_type', f.target_type, 'target_id', f.target_id,
    'target_user_id', f.target_user_id, 'field_name', f.field_name,
    'category', f.category, 'rule_identifier', r.rule_identifier,
    'matched_term', case when public.is_admin() then r.term else null end,
    'content_snapshot', f.content_snapshot, 'conversation_id', f.conversation_id,
    'status', f.status, 'created_at', f.created_at, 'cleared_at', f.cleared_at,
    'resolution_reason', f.resolution_reason,
    'context', case when f.target_type = 'message' then coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'sender_id', x.sender_id, 'body', x.body, 'created_at', x.created_at) order by x.created_at, x.id) from (select m.id,m.sender_id,m.body,m.created_at from public.messages m where m.conversation_id = f.conversation_id order by abs(extract(epoch from (m.created_at - f.created_at))), m.created_at limit 11) x), '[]'::jsonb) else '[]'::jsonb end
  ) order by f.created_at desc), '[]'::jsonb) into result
    from public.moderation_content_flags f join public.moderation_detection_rules r on r.id = f.rule_id where f.case_id = case_uuid;
  insert into public.moderation_audit_log(moderator_id, case_id, action, metadata) values (auth.uid(), case_uuid, 'automated_flag_context_view', jsonb_build_object('context','admin_case_detail'));
  return result;
end;
$$;
revoke all on function public.admin_get_moderation_case_flags(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_moderation_case_flags(uuid) to authenticated;
