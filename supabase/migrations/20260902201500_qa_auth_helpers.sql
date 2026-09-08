-- RLS policies call is_admin() as the invoker.  Granting this boolean helper
-- to authenticated users makes ordinary table reads resolve to an empty set
-- instead of failing on function permission, while the policy still returns
-- no moderation rows for non-staff users.
grant execute on function public.is_admin() to authenticated;

-- Avoid a PostgREST overload ambiguity between the legacy four-argument audit
-- reader and the date-filtered reader. Date filters are required whenever the
-- six-argument variant is selected; the existing four-argument compatibility
-- function remains unchanged.
drop function if exists public.admin_list_audit_entries(text, uuid, integer, integer, date, date);
create function public.admin_list_audit_entries(
  action_filter text,
  actor_filter uuid,
  page_size integer,
  page_offset integer,
  from_date date,
  to_date date
)
returns table (id uuid, moderator_id uuid, report_id uuid, target_user_id uuid, case_id uuid, action text, old_status text, new_status text, metadata jsonb, created_at timestamptz, total_count bigint)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_moderator() then
    raise exception 'Moderator authorization required';
  end if;
  page_size := least(greatest(coalesce(page_size, 50), 1), 100);
  page_offset := greatest(coalesce(page_offset, 0), 0);
  return query
  select a.id, a.moderator_id, a.report_id, a.target_user_id, a.case_id,
         a.action, a.old_status, a.new_status, a.metadata, a.created_at,
         count(*) over ()
    from public.moderation_audit_log a
   where (public.is_admin() or a.action in (
     'status_change','case_created','case_view','case_status_change',
     'case_claim','case_release','case_reassign','case_note_added',
     'conversation_review'
   ))
     and (nullif(trim(action_filter), '') is null or a.action = action_filter)
     and (actor_filter is null or a.moderator_id = actor_filter)
     and (from_date is null or a.created_at >= from_date::timestamptz)
     and (to_date is null or a.created_at < (to_date + 1)::timestamptz)
   order by a.created_at desc
   limit page_size offset page_offset;
end;
$$;

revoke all on function public.admin_list_audit_entries(text, uuid, integer, integer, date, date) from public, anon, authenticated;
grant execute on function public.admin_list_audit_entries(text, uuid, integer, integer, date, date) to authenticated;
