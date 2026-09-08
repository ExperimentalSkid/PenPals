-- The declared 18th birthday is the first eligible day.  Restriction rows
-- therefore block strictly before blocked_until, not on the birthday itself.
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

create or replace function public.submit_age_appeal(corrected_birth_date date, appeal_explanation text default null)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  email_value text;
  email_verified boolean;
  normalized_hash text;
  restriction public.age_restrictions;
  appeal_id uuid;
  clean_explanation text := nullif(btrim(coalesce(appeal_explanation, '')), '');
begin
  if me is null then raise exception 'Authentication required'; end if;
  select lower(u.email), u.email_confirmed_at is not null into email_value, email_verified from auth.users u where u.id = me;
  if not email_verified or email_value is null then raise exception 'Correction unavailable'; end if;
  if not public.is_adult_birth_date(corrected_birth_date) then raise exception 'Corrected date must show you are at least 18'; end if;
  if char_length(coalesce(clean_explanation, '')) > 500 then raise exception 'Explanation is too long'; end if;
  normalized_hash := encode(extensions.digest(email_value, 'sha256'), 'hex');
  select * into restriction from public.age_restrictions where normalized_email_hash = normalized_hash and blocked_until > current_date;
  if restriction.id is null then raise exception 'Correction unavailable'; end if;
  if exists (select 1 from public.age_appeals where normalized_email_hash = normalized_hash and status = 'pending') then raise exception 'A correction request is already under review'; end if;
  if exists (select 1 from public.age_appeals where normalized_email_hash = normalized_hash and submitted_at > now() - interval '48 hours') then raise exception 'Correction requests are temporarily limited'; end if;
  insert into public.age_appeals (restriction_id, restricted_user_id, normalized_email_hash, corrected_birth_date, explanation) values (restriction.id, me, normalized_hash, corrected_birth_date, clean_explanation) returning id into appeal_id;
  update public.age_restrictions set appeal_status = 'pending', updated_at = now() where id = restriction.id;
  return appeal_id;
end;
$$;

create or replace function public.viewer_can_access_profile(target uuid)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select target = auth.uid()
      or (
        exists (select 1 from public.profiles viewer where viewer.id = auth.uid() and viewer.deactivated_at is null and public.is_adult_birth_date(viewer.birth_date))
        and exists (
          select 1 from public.profiles p where p.id = target and p.deactivated_at is null and public.is_adult_birth_date(p.birth_date) and (p.profile_visibility = 'public' or auth.uid() is not null)
        )
        and not exists (select 1 from public.profile_blocks b where (b.blocker_id = auth.uid() and b.blocked_id = target) or (b.blocker_id = target and b.blocked_id = auth.uid()))
      );
$$;

revoke all on function public.age_gate_signup(text, date) from public, anon, authenticated;
grant execute on function public.age_gate_signup(text, date) to anon, authenticated;
revoke all on function public.submit_age_appeal(date, text) from public, anon, authenticated;
grant execute on function public.submit_age_appeal(date, text) to authenticated;
revoke all on function public.viewer_can_access_profile(uuid) from public, anon, authenticated;
grant execute on function public.viewer_can_access_profile(uuid) to authenticated;
