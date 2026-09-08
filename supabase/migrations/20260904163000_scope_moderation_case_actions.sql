-- Case ownership is the concurrency boundary for moderator actions. A
-- moderator may act only on their own live lease; administrators retain the
-- existing case-wide operational capability.
create or replace function public.set_moderation_case_status(case_uuid uuid, new_status text, resolution text default null, status_reason text default null)
returns public.moderation_cases
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  updated_case public.moderation_cases;
  clean_reason text := nullif(btrim(status_reason), '');
begin
  if not public.is_moderator() then raise exception 'Moderator authorization required'; end if;
  if new_status not in ('new','triage','investigating','waiting','resolved','dismissed') then raise exception 'Invalid case status'; end if;
  if clean_reason is null or char_length(clean_reason) > 500 then raise exception 'A status reason is required'; end if;
  if not public.is_admin() and not exists (
    select 1
      from public.moderation_cases c
     where c.id = case_uuid
       and c.assigned_staff_id = auth.uid()
       and c.claim_expires_at is not null
       and c.claim_expires_at > now()
       and c.status not in ('resolved', 'dismissed')
  ) then
    raise exception 'An active moderation case assignment is required';
  end if;
  update public.moderation_cases
     set status = new_status,
         resolution_category = nullif(btrim(resolution), ''),
         resolved_at = case when new_status in ('resolved','dismissed') then coalesce(resolved_at, now()) else null end,
         updated_at = now()
   where id = case_uuid
   returning * into updated_case;
  if updated_case.id is null then raise exception 'Case not found'; end if;
  insert into public.moderation_audit_log(moderator_id, case_id, target_user_id, action, old_status, new_status, metadata)
    values (auth.uid(), case_uuid, updated_case.subject_user_id, 'case_status_change', null, new_status, jsonb_build_object('reason', clean_reason, 'assignment_required', not public.is_admin()));
  return updated_case;
end;
$$;

revoke all on function public.set_moderation_case_status(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.set_moderation_case_status(uuid, text, text, text) to authenticated;

-- Detection terms are administrator-only protected configuration. Moderators
-- still receive the category, rule identifier and exact preserved evidence
-- needed for triage, but cannot use this RPC to enumerate configured terms.
create or replace function public.admin_get_moderation_case_flags(case_uuid uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  result jsonb;
begin
  if not public.is_moderator() then raise exception 'Moderator authorization required'; end if;
  if not exists (select 1 from public.moderation_cases where id = case_uuid) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id,
    'target_type', f.target_type,
    'target_id', f.target_id,
    'target_user_id', f.target_user_id,
    'field_name', f.field_name,
    'category', f.category,
    'signal_strength', f.signal_strength,
    'rule_identifier', r.rule_identifier,
    'matched_term', case when public.is_admin() then r.term else null end,
    'matched_value', case when public.is_admin() then f.matched_value else null end,
    'content_snapshot', f.content_snapshot,
    'conversation_id', f.conversation_id,
    'status', f.status,
    'created_at', f.created_at,
    'cleared_at', f.cleared_at,
    'resolution_reason', f.resolution_reason,
    'context', case when f.target_type = 'message' then coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'sender_id', x.sender_id, 'body', x.body, 'created_at', x.created_at) order by x.created_at, x.id)
        from (
          select m.id, m.sender_id, m.body, m.created_at
            from public.messages m
           where m.conversation_id = f.conversation_id
           order by abs(extract(epoch from (m.created_at - f.created_at))), m.created_at
           limit 11
        ) x
    ), '[]'::jsonb) else '[]'::jsonb end
  ) order by f.created_at desc), '[]'::jsonb) into result
    from public.moderation_content_flags f
    join public.moderation_detection_rules r on r.id = f.rule_id
   where f.case_id = case_uuid;
  insert into public.moderation_audit_log(moderator_id, case_id, action, metadata)
    values (auth.uid(), case_uuid, 'automated_flag_context_view', jsonb_build_object('context','admin_case_detail'));
  return result;
end;
$$;

revoke all on function public.admin_get_moderation_case_flags(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_moderation_case_flags(uuid) to authenticated;
