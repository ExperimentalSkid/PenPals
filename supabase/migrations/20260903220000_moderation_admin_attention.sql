-- Give moderators a durable, auditable way to ask an administrator to take
-- over a case. This is separate from case priority: priority continues to
-- represent the existing triage score, while admin attention is a workflow
-- marker that changes queue ordering for open cases.
alter table public.moderation_cases
  add column if not exists needs_admin_review boolean not null default false,
  add column if not exists admin_review_requested_at timestamptz,
  add column if not exists admin_review_requested_by uuid references public.profiles(id) on delete set null;

create index if not exists moderation_cases_admin_attention_idx
  on public.moderation_cases (needs_admin_review desc, status, priority desc, updated_at asc);

create or replace function public.request_admin_moderation_review(case_uuid uuid, request_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  clean_reason text := nullif(btrim(request_reason), '');
  item public.moderation_cases;
begin
  if not public.is_moderator() then
    raise exception 'Moderator authorization required';
  end if;
  if clean_reason is null or char_length(clean_reason) > 500 then
    raise exception 'An escalation reason is required (1–500 characters)';
  end if;

  select * into item
    from public.moderation_cases
   where id = case_uuid
   for update;
  if item.id is null then
    raise exception 'Case not found';
  end if;
  if item.status in ('resolved', 'dismissed') then
    raise exception 'Closed cases cannot be escalated';
  end if;

  -- Repeated clicks/retries are intentionally idempotent and do not create
  -- duplicate audit entries for the same open escalation.
  if item.needs_admin_review then
    return;
  end if;

  update public.moderation_cases
     set needs_admin_review = true,
         admin_review_requested_at = now(),
         admin_review_requested_by = auth.uid(),
         updated_at = now()
   where id = case_uuid;

  insert into public.moderation_audit_log (moderator_id, case_id, target_user_id, action, metadata)
  values (
    auth.uid(),
    item.id,
    item.subject_user_id,
    'case_admin_attention_requested',
    jsonb_build_object('reason', clean_reason)
  );
end;
$$;

revoke all on function public.request_admin_moderation_review(uuid, text) from public, anon, authenticated;
grant execute on function public.request_admin_moderation_review(uuid, text) to authenticated;

-- Keep the existing case projection intact while exposing only the marker
-- needed by the staff queue and case detail views.
drop function if exists public.admin_list_moderation_cases(text, uuid, integer, integer);
create function public.admin_list_moderation_cases(status_filter text default null, assigned_filter uuid default null, page_size integer default 30, page_offset integer default 0)
returns table (id uuid, subject_user_id uuid, subject_username text, subject_display_name text, primary_target_type text, primary_target_id uuid, status text, priority integer, assigned_staff_id uuid, assigned_staff_name text, claimed_at timestamptz, claim_expires_at timestamptz, created_at timestamptz, updated_at timestamptz, resolved_at timestamptz, resolution_category text, report_count bigint, independent_reporter_count bigint, source text, automated_flag_count bigint, needs_admin_review boolean, admin_review_requested_at timestamptz, total_count bigint)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_moderator() then
    raise exception 'Moderator authorization required';
  end if;
  page_size := least(greatest(coalesce(page_size, 30), 1), 100);
  page_offset := greatest(coalesce(page_offset, 0), 0);
  return query
  select c.id, c.subject_user_id, s.username, s.display_name,
         c.primary_target_type, c.primary_target_id, c.status, c.priority,
         c.assigned_staff_id, a.display_name, c.claimed_at, c.claim_expires_at,
         c.created_at, c.updated_at, c.resolved_at, c.resolution_category,
         c.report_count, c.independent_reporter_count, c.source,
         c.automated_flag_count, c.needs_admin_review,
         c.admin_review_requested_at, count(*) over()
    from public.moderation_cases c
    left join public.profiles s on s.id = c.subject_user_id
    left join public.profiles a on a.id = c.assigned_staff_id
   where (status_filter is null or status_filter = '' or c.status = status_filter)
     and (assigned_filter is null or c.assigned_staff_id = assigned_filter)
   order by
     case when c.needs_admin_review and c.status not in ('resolved', 'dismissed') then 0 else 1 end,
     c.priority desc,
     c.updated_at asc
   limit page_size offset page_offset;
end;
$$;
revoke all on function public.admin_list_moderation_cases(text, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_list_moderation_cases(text, uuid, integer, integer) to authenticated;

create or replace function public.admin_get_moderation_case(case_uuid uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  result jsonb;
  subject uuid;
begin
  if not public.is_moderator() then
    raise exception 'Moderator authorization required';
  end if;
  select jsonb_build_object(
    'case', jsonb_build_object(
      'id', c.id,
      'subject_user_id', c.subject_user_id,
      'primary_target_type', c.primary_target_type,
      'primary_target_id', c.primary_target_id,
      'status', c.status,
      'priority', c.priority,
      'assigned_staff_id', c.assigned_staff_id,
      'claimed_at', c.claimed_at,
      'claim_expires_at', c.claim_expires_at,
      'created_at', c.created_at,
      'updated_at', c.updated_at,
      'resolved_at', c.resolved_at,
      'resolution_category', c.resolution_category,
      'report_count', c.report_count,
      'independent_reporter_count', c.independent_reporter_count,
      'source', c.source,
      'automated_flag_count', c.automated_flag_count,
      'needs_admin_review', c.needs_admin_review,
      'admin_review_requested_at', c.admin_review_requested_at
    ),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'reporter_id', r.reporter_id, 'target_type', r.target_type,
        'target_id', r.target_id, 'reason', r.reason, 'details', r.details,
        'status', r.status, 'created_at', r.created_at
      ) order by r.created_at desc)
      from public.moderation_case_reports cr
      join public.reports r on r.id = cr.report_id
      where cr.case_id = c.id
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id, 'author_id', n.author_id, 'note', n.note, 'created_at', n.created_at
      ) order by n.created_at desc)
      from public.moderation_case_notes n
      where n.case_id = c.id
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'action', a.action, 'old_status', a.old_status,
        'new_status', a.new_status, 'metadata', a.metadata, 'created_at', a.created_at
      ) order by a.created_at desc)
      from public.moderation_audit_log a
      where a.case_id = c.id
    ), '[]'::jsonb)
  ), c.subject_user_id into result, subject
  from public.moderation_cases c
  where c.id = case_uuid;
  if result is null then
    return null;
  end if;
  insert into public.moderation_audit_log (moderator_id, case_id, target_user_id, action, metadata)
  values (auth.uid(), case_uuid, subject, 'case_view', jsonb_build_object('context', 'admin_case_detail'));
  return result;
end;
$$;
revoke all on function public.admin_get_moderation_case(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_moderation_case(uuid) to authenticated;

drop policy if exists "Staff read scoped audit log" on public.moderation_audit_log;
create policy "Staff read scoped audit log" on public.moderation_audit_log
for select to authenticated
using (
  public.is_admin()
  or (
    public.is_moderator()
    and action in (
      'status_change', 'case_created', 'case_view', 'case_status_change',
      'case_claim', 'case_release', 'case_reassign', 'case_note_added',
      'conversation_review', 'automated_flag_created', 'automated_flag_cleared',
      'automated_flag_confirmed', 'automated_flag_context_view',
      'case_admin_attention_requested'
    )
  )
);

-- The legacy four-argument audit-listing RPC is intentionally left removed
-- by the compatibility audit migration. The current audit page uses its
-- date-filtered replacement; do not recreate the obsolete surface here.
