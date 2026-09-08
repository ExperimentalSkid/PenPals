-- Profile edits are not signup attempts.  Avoid incrementing the signup
-- abuse counter every time an adult user saves an otherwise valid profile.
create or replace function public.age_gate_validate_current_user(p_birth_date date)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  email_value text;
  email_verified boolean;
  normalized_hash text;
begin
  if me is null then raise exception 'Authentication required'; end if;
  if public.is_adult_birth_date(p_birth_date) then return 'ok'; end if;

  select lower(u.email), u.email_confirmed_at is not null
    into email_value, email_verified
    from auth.users u where u.id = me;
  if email_verified and email_value is not null and p_birth_date < current_date then
    normalized_hash := encode(extensions.digest(email_value, 'sha256'), 'hex');
    insert into public.age_restrictions (
      normalized_email_hash, restricted_user_id, blocked_until, reason, source, appeal_status
    ) values (
      normalized_hash, me, (p_birth_date + interval '18 years')::date,
      'underage', 'verified_signup', 'none'
    )
    on conflict (normalized_email_hash) do update set
      restricted_user_id = coalesce(excluded.restricted_user_id, public.age_restrictions.restricted_user_id),
      blocked_until = greatest(public.age_restrictions.blocked_until, excluded.blocked_until),
      updated_at = now();
    delete from public.profiles where id = me;
    return 'restricted';
  end if;
  return 'underage';
end;
$$;

revoke all on function public.age_gate_validate_current_user(date) from public, anon, authenticated;
grant execute on function public.age_gate_validate_current_user(date) to authenticated;
