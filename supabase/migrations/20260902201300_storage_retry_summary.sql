create or replace function public.admin_dashboard_summary()
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  admin_view boolean := public.is_admin();
begin
  if not public.is_moderator() then
    raise exception 'Moderator authorization required';
  end if;
  return jsonb_build_object(
    'new_cases', (select count(*) from public.moderation_cases where status='new'),
    'triage_cases', (select count(*) from public.moderation_cases where status='triage'),
    'investigating_cases', (select count(*) from public.moderation_cases where status='investigating'),
    'waiting_cases', (select count(*) from public.moderation_cases where status='waiting'),
    'high_priority_unassigned', (select count(*) from public.moderation_cases where assigned_staff_id is null and status not in ('resolved','dismissed') and priority >= 70),
    'multi_reporter_cases', (select count(*) from public.moderation_cases where independent_reporter_count >= 2 and status not in ('resolved','dismissed')),
    'stale_cases', (select count(*) from public.moderation_cases where status not in ('resolved','dismissed') and updated_at < now() - interval '7 days'),
    'pending_age_appeals', case when admin_view then (select count(*) from public.age_appeals where status='pending') else 0 end,
    'storage_pending', case when admin_view then (select count(*) from public.account_storage_deletion_outbox where completed_at is null and next_attempt_at <= now()) else 0 end,
    'storage_failed', case when admin_view then (select count(*) from public.account_storage_deletion_outbox where completed_at is null and last_error is not null) else 0 end,
    'storage_retrying', case when admin_view then (select count(*) from public.account_storage_deletion_outbox where completed_at is null and attempts > 0) else 0 end,
    'storage_max_attempts', case when admin_view then (select coalesce(max(attempts), 0) from public.account_storage_deletion_outbox where completed_at is null) else 0 end,
    'storage_oldest_pending', case when admin_view then (select min(requested_at) from public.account_storage_deletion_outbox where completed_at is null) else null end,
    'storage_last_error', case when admin_view then (select left(last_error, 200) from public.account_storage_deletion_outbox where completed_at is null and last_error is not null order by requested_at desc limit 1) else null end,
    'retention_unconfigured', case when admin_view then (select count(*) from public.data_retention_policies where enabled=false or retention_period is null) else 0 end,
    'active_holds', case when admin_view then (select count(*) from public.data_retention_holds where released_at is null) else 0 end,
    'active_users', case when admin_view then (select count(*) from public.profiles where deactivated_at is null) else 0 end,
    'deactivated_users', case when admin_view then (select count(*) from public.profiles where deactivated_at is not null) else 0 end
  );
end;
$$;

revoke all on function public.admin_dashboard_summary() from public, anon, authenticated;
grant execute on function public.admin_dashboard_summary() to authenticated;
