-- Add public Contact Inbox records to the existing configurable retention system.
-- No period is seeded: administrators must explicitly configure and enable the policy.

alter table public.data_retention_policies
  drop constraint if exists data_retention_policies_category_check;
alter table public.data_retention_policies
  add constraint data_retention_policies_category_check
  check (category in ('auth_security', 'moderation_audit', 'moderation_evidence', 'contact_evidence'));

alter table public.data_retention_holds
  drop constraint if exists data_retention_holds_category_check;
alter table public.data_retention_holds
  add constraint data_retention_holds_category_check
  check (category in ('auth_security', 'moderation_audit', 'moderation_evidence', 'contact_evidence'));

create or replace function public.set_data_retention_policy(
  policy_category text,
  policy_period interval,
  policy_purpose text,
  policy_legal_basis text,
  policy_enabled boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  clean_purpose text := nullif(btrim(policy_purpose), '');
  clean_basis text := nullif(btrim(policy_legal_basis), '');
begin
  if not public.is_admin() then raise exception 'Administrator authorization required'; end if;
  if policy_category not in ('auth_security', 'moderation_audit', 'moderation_evidence', 'contact_evidence') then
    raise exception 'Invalid retention category';
  end if;
  if policy_period is not null and policy_period <= interval '0 seconds' then raise exception 'Retention period must be positive'; end if;
  if clean_purpose is null or char_length(clean_purpose) > 2000 or clean_basis is null or char_length(clean_basis) > 2000 then
    raise exception 'Retention purpose and legal basis are required';
  end if;

  insert into public.data_retention_policies(category, retention_period, purpose, legal_basis, enabled, updated_by, updated_at)
  values (policy_category, policy_period, clean_purpose, clean_basis, coalesce(policy_enabled, false), auth.uid(), now())
  on conflict (category) do update set
    retention_period = excluded.retention_period,
    purpose = excluded.purpose,
    legal_basis = excluded.legal_basis,
    enabled = excluded.enabled,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  insert into public.moderation_audit_log(moderator_id, action, metadata)
  values (auth.uid(), 'retention_policy_changed', jsonb_build_object(
    'category', policy_category, 'retention_period', policy_period::text, 'enabled', coalesce(policy_enabled, false)
  ));
end;
$$;

create or replace function public.set_data_retention_hold(
  hold_category text,
  held_record_id uuid,
  hold_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  hold_id uuid;
  clean_reason text := nullif(btrim(hold_reason), '');
begin
  if not public.is_admin() then raise exception 'Administrator authorization required'; end if;
  if hold_category not in ('auth_security', 'moderation_audit', 'moderation_evidence', 'contact_evidence') then
    raise exception 'Invalid retention category';
  end if;
  if clean_reason is null or char_length(clean_reason) > 2000 then raise exception 'A retention hold reason is required'; end if;
  if hold_category = 'contact_evidence' and held_record_id is not null and not exists (
    select 1 from public.support_tickets where id = held_record_id and ticket_type = 'public_contact'
  ) then
    raise exception 'Contact ticket not found';
  end if;

  insert into public.data_retention_holds(category, record_id, reason, authorized_by)
  values (hold_category, held_record_id, clean_reason, auth.uid()) returning id into hold_id;

  insert into public.moderation_audit_log(moderator_id, action, metadata)
  values (auth.uid(), 'retention_hold_created', jsonb_build_object(
    'category', hold_category, 'record_id', held_record_id, 'reason', clean_reason
  ));
  return hold_id;
end;
$$;

create or replace function public.purge_retained_data()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  policy_row record;
  cutoff timestamptz;
  affected integer;
  removed_audit integer := 0;
  removed_evidence integer := 0;
  removed_reports integer := 0;
  removed_auth integer := 0;
  removed_contacts integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'service_role' and not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;
  perform set_config('app.allow_moderation_audit_mutation', '1', true);

  for policy_row in select category, retention_period from public.data_retention_policies where enabled and retention_period is not null
  loop
    cutoff := now() - policy_row.retention_period;
    if policy_row.category = 'moderation_audit' then
      delete from public.moderation_audit_log a where a.created_at < cutoff and not exists (
        select 1 from public.data_retention_holds h where h.category = policy_row.category and h.released_at is null
          and h.started_at <= now() and (h.record_id is null or h.record_id = a.id)
      );
      get diagnostics affected = row_count; removed_audit := removed_audit + affected;
    elsif policy_row.category = 'moderation_evidence' then
      delete from public.profile_moderation_evidence e where e.created_at < cutoff and not exists (
        select 1 from public.data_retention_holds h where h.category = policy_row.category and h.released_at is null
          and h.started_at <= now() and (h.record_id is null or h.record_id = e.id)
      );
      get diagnostics affected = row_count; removed_evidence := removed_evidence + affected;
      delete from public.reports r where r.redacted_at is not null and r.created_at < cutoff and not exists (
        select 1 from public.data_retention_holds h where h.category = policy_row.category and h.released_at is null
          and h.started_at <= now() and (h.record_id is null or h.record_id = r.id)
      );
      get diagnostics affected = row_count; removed_reports := removed_reports + affected;
    elsif policy_row.category = 'contact_evidence' then
      delete from public.support_tickets t
       where t.ticket_type = 'public_contact'
         and t.status = 'resolved'
         and coalesce(t.resolved_at, t.updated_at) < cutoff
         and not exists (
           select 1 from public.data_retention_holds h
            where h.category = 'contact_evidence' and h.released_at is null and h.started_at <= now()
              and (h.record_id is null or h.record_id = t.id)
         );
      get diagnostics affected = row_count; removed_contacts := removed_contacts + affected;
    elsif policy_row.category = 'auth_security' then
      removed_auth := removed_auth;
    end if;
  end loop;

  return jsonb_build_object(
    'moderation_audit', removed_audit,
    'moderation_evidence', removed_evidence,
    'redacted_reports', removed_reports,
    'auth_security', removed_auth,
    'contact_evidence', removed_contacts,
    'auth_security_note', 'Provider-managed auth audit entries were not modified.'
  );
end;
$$;

create or replace function public.admin_dashboard_summary()
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  admin_view boolean := public.is_admin();
  expected_retention_categories text[] := array['auth_security','moderation_audit','moderation_evidence','contact_evidence'];
begin
  if not public.is_moderator() then raise exception 'Moderator authorization required'; end if;
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
    'retention_unconfigured', case when admin_view then (
      select count(*) from unnest(expected_retention_categories) c(category)
      left join public.data_retention_policies p on p.category = c.category
      where p.category is null or not p.enabled or p.retention_period is null
    ) else 0 end,
    'active_holds', case when admin_view then (select count(*) from public.data_retention_holds where released_at is null) else 0 end,
    'active_users', case when admin_view then (select count(*) from public.profiles where deactivated_at is null) else 0 end,
    'deactivated_users', case when admin_view then (select count(*) from public.profiles where deactivated_at is not null) else 0 end
  );
end;
$$;

revoke all on function public.set_data_retention_policy(text, interval, text, text, boolean) from public, anon, authenticated;
grant execute on function public.set_data_retention_policy(text, interval, text, text, boolean) to authenticated;
revoke all on function public.set_data_retention_hold(text, uuid, text) from public, anon, authenticated;
grant execute on function public.set_data_retention_hold(text, uuid, text) to authenticated;
revoke all on function public.purge_retained_data() from public, anon, authenticated;
grant execute on function public.purge_retained_data() to service_role;
grant execute on function public.purge_retained_data() to authenticated;
revoke all on function public.admin_dashboard_summary() from public, anon, authenticated;
grant execute on function public.admin_dashboard_summary() to authenticated;
