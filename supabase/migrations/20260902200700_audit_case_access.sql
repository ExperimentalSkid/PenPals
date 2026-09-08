create or replace function public.admin_get_moderation_case(case_uuid uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare result jsonb; subject uuid;
begin
  if not public.is_moderator() then raise exception 'Moderator authorization required'; end if;
  select jsonb_build_object(
    'case', jsonb_build_object('id', c.id, 'subject_user_id', c.subject_user_id, 'primary_target_type', c.primary_target_type, 'primary_target_id', c.primary_target_id, 'status', c.status, 'priority', c.priority, 'assigned_staff_id', c.assigned_staff_id, 'claimed_at', c.claimed_at, 'claim_expires_at', c.claim_expires_at, 'created_at', c.created_at, 'updated_at', c.updated_at, 'resolved_at', c.resolved_at, 'resolution_category', c.resolution_category, 'report_count', c.report_count, 'independent_reporter_count', c.independent_reporter_count),
    'reports', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'reporter_id', r.reporter_id, 'target_type', r.target_type, 'target_id', r.target_id, 'reason', r.reason, 'details', r.details, 'status', r.status, 'created_at', r.created_at) order by r.created_at desc) from public.moderation_case_reports cr join public.reports r on r.id = cr.report_id where cr.case_id = c.id), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'author_id', n.author_id, 'note', n.note, 'created_at', n.created_at) order by n.created_at desc) from public.moderation_case_notes n where n.case_id = c.id), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'action', a.action, 'old_status', a.old_status, 'new_status', a.new_status, 'metadata', a.metadata, 'created_at', a.created_at) order by a.created_at desc) from public.moderation_audit_log a where a.case_id = c.id), '[]'::jsonb)
  ), c.subject_user_id into result, subject from public.moderation_cases c where c.id = case_uuid;
  if result is null then return null; end if;
  insert into public.moderation_audit_log(moderator_id, case_id, target_user_id, action, metadata) values (auth.uid(), case_uuid, subject, 'case_view', jsonb_build_object('context', 'admin_case_detail'));
  return result;
end;
$$;
revoke all on function public.admin_get_moderation_case(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_moderation_case(uuid) to authenticated;

drop policy if exists "Staff read scoped audit log" on public.moderation_audit_log;
create policy "Staff read scoped audit log" on public.moderation_audit_log
for select to authenticated
using (public.is_admin() or (public.is_moderator() and action in ('status_change','case_created','case_view','case_status_change','case_claim','case_release','case_reassign','case_note_added','conversation_review')));
