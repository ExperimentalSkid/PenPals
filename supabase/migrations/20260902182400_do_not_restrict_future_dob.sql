-- Future DOBs are invalid input, not evidence of underage status.  They must
-- never create the long-lived verified-email restriction.
create or replace function public.age_gate_signup(p_email text, p_birth_date date)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  normalized_hash text := encode(extensions.digest(lower(btrim(coalesce(p_email, ''))), 'sha256'), 'hex');
  clean_email text := lower(btrim(coalesce(p_email, '')));
  restriction public.age_restrictions;
  cooldown public.age_gate_cooldowns;
  existing_user uuid;
  email_verified boolean := false;
  next_attempts integer;
begin
  if clean_email = '' or p_birth_date is null then return 'underage'; end if;
  select * into restriction from public.age_restrictions where normalized_email_hash = normalized_hash limit 1;
  if restriction.id is not null and restriction.blocked_until > current_date then return 'restricted'; end if;
  select * into cooldown from public.age_gate_cooldowns where normalized_email_hash = normalized_hash for update;
  if cooldown.id is not null and cooldown.blocked_until is not null and cooldown.blocked_until > now() then return 'cooldown'; end if;
  if cooldown.id is null or cooldown.updated_at <= now() - interval '48 hours' then
    insert into public.age_gate_cooldowns (normalized_email_hash, attempt_count, blocked_until, created_at, updated_at)
      values (normalized_hash, 1, null, now(), now())
    on conflict (normalized_email_hash) do update set attempt_count = 1, blocked_until = null, created_at = now(), updated_at = now();
    next_attempts := 1;
  else
    next_attempts := cooldown.attempt_count + 1;
    update public.age_gate_cooldowns set attempt_count = next_attempts, blocked_until = case when next_attempts >= 3 then now() + interval '48 hours' else blocked_until end, updated_at = now() where id = cooldown.id;
    if next_attempts >= 3 then return 'cooldown'; end if;
  end if;
  select u.id, u.email_confirmed_at is not null into existing_user, email_verified from auth.users u where lower(u.email) = clean_email order by u.created_at desc limit 1;
  if p_birth_date >= current_date then return 'underage'; end if;
  if not public.is_adult_birth_date(p_birth_date) then
    if email_verified then
      insert into public.age_restrictions (normalized_email_hash, restricted_user_id, blocked_until, reason, source, appeal_status)
      values (normalized_hash, existing_user, (p_birth_date + interval '18 years')::date, 'underage', 'verified_signup', 'none')
      on conflict (normalized_email_hash) do update set restricted_user_id = coalesce(excluded.restricted_user_id, public.age_restrictions.restricted_user_id), blocked_until = greatest(public.age_restrictions.blocked_until, excluded.blocked_until), updated_at = now();
      if existing_user is not null then delete from public.profiles where id = existing_user; end if;
      return 'restricted';
    end if;
    return 'underage';
  end if;
  return 'ok';
end;
$$;

revoke all on function public.age_gate_signup(text, date) from public, anon, authenticated;
grant execute on function public.age_gate_signup(text, date) to anon, authenticated;
