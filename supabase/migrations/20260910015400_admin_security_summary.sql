-- Admin-only aggregate security posture. No identifiers, hashes, IPs, or raw
-- authentication payloads are returned by this function.
create or replace function public.admin_security_summary()
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public, auth
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;

  select jsonb_build_object(
    'login_buckets_current_window', (
      select count(*) from public.auth_login_rate_limits
       where window_started_at > now() - interval '5 minutes'
    ),
    'login_buckets_10_plus', (
      select count(*) from public.auth_login_rate_limits
       where window_started_at > now() - interval '5 minutes' and attempts >= 10
    ),
    'login_buckets_30_plus', (
      select count(*) from public.auth_login_rate_limits
       where window_started_at > now() - interval '5 minutes' and attempts >= 30
    ),
    'active_age_restrictions', (
      select count(*) from public.age_restrictions
       where blocked_until > current_date
    ),
    'pending_age_appeals', (
      select count(*) from public.age_appeals where status = 'pending'
    ),
    'deactivated_accounts', (
      select count(*) from public.profiles where deactivated_at is not null
    ),
    'sessions_created_24h', (
      select count(*) from auth.sessions where created_at > now() - interval '24 hours'
    ),
    'auth_audit_events_24h', (
      select count(*) from auth.audit_log_entries where created_at > now() - interval '24 hours'
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_security_summary() from public, anon, authenticated;
grant execute on function public.admin_security_summary() to authenticated;
