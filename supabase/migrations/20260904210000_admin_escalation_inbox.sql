-- Give administrators a dedicated, server-filtered inbox for moderator
-- escalations. The existing moderation case and audit records remain the
-- source of truth; this is only a read projection for the admin workspace.
create or replace function public.admin_list_escalated_moderation_cases(
  status_filter text default null,
  page_size integer default 30,
  page_offset integer default 0
)
returns table (
  id uuid,
  subject_user_id uuid,
  subject_username text,
  subject_display_name text,
  primary_target_type text,
  primary_target_id uuid,
  status text,
  priority integer,
  assigned_staff_id uuid,
  assigned_staff_name text,
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz,
  resolution_category text,
  report_count bigint,
  independent_reporter_count bigint,
  source text,
  automated_flag_count bigint,
  needs_admin_review boolean,
  admin_review_requested_at timestamptz,
  admin_review_requested_by uuid,
  escalation_reason text,
  escalated_by_id uuid,
  escalated_by_name text,
  escalated_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;

  page_size := least(greatest(coalesce(page_size, 30), 1), 100);
  page_offset := greatest(coalesce(page_offset, 0), 0);

  return query
  select c.id,
         c.subject_user_id,
         subject.username,
         subject.display_name,
         c.primary_target_type,
         c.primary_target_id,
         c.status,
         c.priority,
         c.assigned_staff_id,
         assigned.display_name,
         c.claimed_at,
         c.claim_expires_at,
         c.created_at,
         c.updated_at,
         c.resolved_at,
         c.resolution_category,
         c.report_count,
         c.independent_reporter_count,
         c.source,
         c.automated_flag_count,
         c.needs_admin_review,
         c.admin_review_requested_at,
         c.admin_review_requested_by,
         coalesce(escalation_audit.metadata ->> 'reason', 'Reason not recorded'),
         coalesce(c.admin_review_requested_by, escalation_audit.moderator_id),
         coalesce(requester.display_name, escalation_author.display_name),
         coalesce(c.admin_review_requested_at, escalation_audit.created_at),
         count(*) over ()
    from public.moderation_cases c
    left join public.profiles subject on subject.id = c.subject_user_id
    left join public.profiles assigned on assigned.id = c.assigned_staff_id
    left join public.profiles requester on requester.id = c.admin_review_requested_by
    left join lateral (
      select a.moderator_id, a.metadata, a.created_at
        from public.moderation_audit_log a
       where a.case_id = c.id
         and a.action = 'case_admin_attention_requested'
       order by a.created_at desc
       limit 1
    ) escalation_audit on true
    left join public.profiles escalation_author on escalation_author.id = escalation_audit.moderator_id
   where c.needs_admin_review
     and (
       status_filter is null
       or status_filter = ''
       or (status_filter = 'open' and c.status not in ('resolved', 'dismissed'))
       or c.status = status_filter
     )
   order by case when c.status in ('resolved', 'dismissed') then 1 else 0 end,
            c.priority desc,
            coalesce(c.admin_review_requested_at, escalation_audit.created_at) asc nulls last,
            c.updated_at asc
   limit page_size offset page_offset;
end;
$$;

revoke all on function public.admin_list_escalated_moderation_cases(text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_list_escalated_moderation_cases(text, integer, integer) to authenticated;

-- Add a small staff-safe subject summary to the existing case projection
-- without exposing the broader administrator user-detail RPC to moderators.
alter function public.admin_get_moderation_case(uuid) rename to admin_get_moderation_case_legacy;
revoke all on function public.admin_get_moderation_case_legacy(uuid) from public, anon, authenticated;

create or replace function public.admin_get_moderation_case(case_uuid uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  result jsonb;
  subject jsonb;
begin
  if not public.is_moderator() then
    raise exception 'Moderator authorization required';
  end if;

  result := public.admin_get_moderation_case_legacy(case_uuid);
  if result is null then
    return null;
  end if;

  select jsonb_build_object(
    'username', p.username,
    'display_name', p.display_name,
    'created_at', p.created_at,
    'is_deactivated', p.deactivated_at is not null
  )
    into subject
    from public.profiles p
   where p.id = (result -> 'case' ->> 'subject_user_id')::uuid;

  return jsonb_set(result, '{case,subject_summary}', coalesce(subject, '{}'::jsonb), true);
end;
$$;

revoke all on function public.admin_get_moderation_case(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_moderation_case(uuid) to authenticated;
