-- Allow the server-only background worker to run configured retention purges.
-- Interactive callers still need an active administrator account.
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
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user <> 'service_role'
     and not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;
  perform set_config('app.allow_moderation_audit_mutation', '1', true);

  for policy_row in
    select category, retention_period
      from public.data_retention_policies
     where enabled and retention_period is not null
  loop
    cutoff := now() - policy_row.retention_period;

    if policy_row.category = 'moderation_audit' then
      delete from public.moderation_audit_log a
       where a.created_at < cutoff
         and not exists (
           select 1 from public.data_retention_holds h
            where h.category = policy_row.category
              and h.released_at is null
              and h.started_at <= now()
              and (h.record_id is null or h.record_id = a.id)
         );
      get diagnostics affected = row_count;
      removed_audit := removed_audit + affected;
    elsif policy_row.category = 'moderation_evidence' then
      delete from public.profile_moderation_evidence e
       where e.created_at < cutoff
         and not exists (
           select 1 from public.data_retention_holds h
            where h.category = policy_row.category
              and h.released_at is null
              and h.started_at <= now()
              and (h.record_id is null or h.record_id = e.id)
         );
      get diagnostics affected = row_count;
      removed_evidence := removed_evidence + affected;

      delete from public.reports r
       where r.redacted_at is not null
         and r.created_at < cutoff
         and not exists (
           select 1 from public.data_retention_holds h
            where h.category = policy_row.category
              and h.released_at is null
              and h.started_at <= now()
              and (h.record_id is null or h.record_id = r.id)
         );
      get diagnostics affected = row_count;
      removed_reports := removed_reports + affected;
    elsif policy_row.category = 'auth_security' then
      -- Supabase owns auth.audit_log_entries retention and lifecycle.
      removed_auth := removed_auth;
    end if;
  end loop;

  return jsonb_build_object(
    'moderation_audit', removed_audit,
    'moderation_evidence', removed_evidence,
    'redacted_reports', removed_reports,
    'auth_security', removed_auth,
    'auth_security_note', 'Provider-managed auth audit entries were not modified.'
  );
end;
$$;

revoke all on function public.purge_retained_data() from public, anon, authenticated;
grant execute on function public.purge_retained_data() to service_role;
grant execute on function public.purge_retained_data() to authenticated;
