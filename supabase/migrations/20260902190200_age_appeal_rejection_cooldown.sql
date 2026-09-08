-- Appeal cooldowns are based on durable moderator decisions.  Do not keep a
-- second counter table whose writes would roll back with a rejected RPC.
create or replace function public.submit_age_appeal(
  corrected_birth_date date,
  appeal_explanation text default null
)
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
  select lower(u.email), u.email_confirmed_at is not null
    into email_value, email_verified
    from auth.users u where u.id = me;
  if not email_verified or email_value is null then raise exception 'Correction unavailable'; end if;
  normalized_hash := encode(extensions.digest(email_value, 'sha256'), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(('age-appeal:' || normalized_hash), 0));

  select * into restriction
    from public.age_restrictions
   where normalized_email_hash = normalized_hash and blocked_until > current_date
   for update;
  if restriction.id is null then raise exception 'Correction unavailable'; end if;
  if exists (
    select 1 from public.age_appeals
     where normalized_email_hash = normalized_hash and status = 'pending'
  ) then
    raise exception 'A correction request is already under review';
  end if;
  if exists (
    select 1 from public.age_appeals
     where normalized_email_hash = normalized_hash
       and status = 'rejected'
       and reviewed_at is not null
       and reviewed_at > now() - interval '24 hours'
  ) then
    raise exception 'Correction requests are temporarily limited';
  end if;
  if not public.is_adult_birth_date(corrected_birth_date) then
    raise exception 'Corrected date must show you are at least 18';
  end if;
  if char_length(coalesce(clean_explanation, '')) > 500 then
    raise exception 'Explanation is too long';
  end if;

  insert into public.age_appeals (
    restriction_id, restricted_user_id, normalized_email_hash,
    corrected_birth_date, explanation
  ) values (
    restriction.id, me, normalized_hash, corrected_birth_date, clean_explanation
  ) returning id into appeal_id;
  update public.age_restrictions
     set appeal_status = 'pending', updated_at = now()
   where id = restriction.id;
  return appeal_id;
end;
$$;

revoke all on function public.submit_age_appeal(date, text)
  from public, anon, authenticated;
grant execute on function public.submit_age_appeal(date, text) to authenticated;

-- Recreate the admin decision function without the discarded limiter table.
create or replace function public.admin_review_age_appeal(
  appeal_id uuid,
  decision text,
  decision_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  appeal public.age_appeals;
  restriction public.age_restrictions;
  target_user uuid;
  old_status text;
  audit_target uuid;
begin
  if not public.is_admin() then raise exception 'Administrator authorization required'; end if;
  if decision not in ('approved', 'rejected')
     or char_length(btrim(coalesce(decision_reason, ''))) not between 1 and 500 then
    raise exception 'A decision and moderation reason are required';
  end if;
  select * into appeal from public.age_appeals where id = appeal_id for update;
  if appeal.id is null or appeal.status <> 'pending' then raise exception 'Appeal is no longer pending'; end if;
  if decision = 'approved' and not public.is_adult_birth_date(appeal.corrected_birth_date) then
    raise exception 'Corrected date must show the requester is at least 18';
  end if;
  select * into restriction from public.age_restrictions where id = appeal.restriction_id for update;
  target_user := coalesce(appeal.restricted_user_id, restriction.restricted_user_id);
  old_status := appeal.status;
  select p.id into audit_target from public.profiles p where p.id = target_user;

  update public.age_appeals
     set status = decision, reviewed_at = now(), reviewed_by = me,
         review_reason = btrim(decision_reason)
   where id = appeal.id;
  insert into public.moderation_audit_log (
    moderator_id, report_id, target_user_id, action, old_status, new_status, metadata
  ) values (
    me, null, audit_target,
    case when decision = 'approved' then 'age_appeal_approved' else 'age_appeal_rejected' end,
    old_status, decision,
    jsonb_build_object('appeal_id', appeal.id, 'reason', btrim(decision_reason))
  );

  if decision = 'approved' then
    delete from public.age_gate_cooldowns where normalized_email_hash = appeal.normalized_email_hash;
    delete from public.age_restrictions where id = appeal.restriction_id;
    if target_user is not null then
      delete from public.profiles where id = target_user;
      delete from auth.users where id = target_user;
    end if;
  else
    update public.age_restrictions
       set appeal_status = 'rejected', updated_at = now()
     where id = appeal.restriction_id;
  end if;
end;
$$;

revoke all on function public.admin_review_age_appeal(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_review_age_appeal(uuid, text, text) to authenticated;

drop table if exists public.age_appeal_cooldowns;
