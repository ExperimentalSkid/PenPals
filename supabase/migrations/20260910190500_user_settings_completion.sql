-- Complete the security side of user Settings with optional login MFA and
-- a user-owned projection of active sessions/recent authentication activity.

alter table public.profiles
  add column if not exists require_login_mfa boolean not null default false;

create or replace function public.get_my_security_settings_summary()
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public, auth
as $$
declare
  me uuid := auth.uid();
  result jsonb;
begin
  if me is null then raise exception 'Authentication required'; end if;

  select jsonb_build_object(
    'require_login_mfa', p.require_login_mfa,
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'created_at', s.created_at,
        'updated_at', s.updated_at,
        'refreshed_at', s.refreshed_at,
        'not_after', s.not_after,
        'aal', s.aal::text,
        'user_agent', s.user_agent,
        'ip_address', host(s.ip)::text
      ) order by coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at) desc)
      from auth.sessions s
      where s.user_id = me
        and (s.not_after is null or s.not_after > now())
    ), '[]'::jsonb),
    'recent_auth_events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'created_at', a.created_at,
        'ip_address', nullif(btrim(a.ip_address), ''),
        'action', coalesce(a.payload->>'action', a.payload->>'event')
      ) order by a.created_at desc)
      from (
        select * from auth.audit_log_entries
        where payload->>'actor_id' = me::text
        order by created_at desc
        limit 10
      ) a
    ), '[]'::jsonb)
  ) into result
  from public.profiles p
  where p.id = me;

  return coalesce(result, '{}'::jsonb);
end;
$$;

create or replace function public.save_my_login_mfa_requirement(p_required boolean)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  me uuid := auth.uid();
  has_factor boolean;
begin
  if me is null then raise exception 'Authentication required'; end if;
  if coalesce(p_required, false) then
    select exists(
      select 1 from auth.mfa_factors f
      where f.user_id = me
        and f.factor_type::text = 'totp'
        and f.status::text = 'verified'
    ) into has_factor;
    if not has_factor then raise exception 'Verified authenticator required'; end if;
  end if;

  update public.profiles
     set require_login_mfa = coalesce(p_required, false)
   where id = me;
  if not found then raise exception 'Profile not found'; end if;
end;
$$;

revoke all on function public.get_my_security_settings_summary() from public, anon, authenticated;
revoke all on function public.save_my_login_mfa_requirement(boolean) from public, anon, authenticated;
grant execute on function public.get_my_security_settings_summary() to authenticated;
grant execute on function public.save_my_login_mfa_requirement(boolean) to authenticated;
