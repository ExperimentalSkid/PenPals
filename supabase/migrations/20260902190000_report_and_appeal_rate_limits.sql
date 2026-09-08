-- Keep report throttling and duplicate detection in the database.  Direct
-- table writes are not an alternate path around the submit_report RPC.
drop index if exists public.reports_one_per_target;
create index if not exists reports_submit_rate_idx
  on public.reports (reporter_id, created_at desc);
create index if not exists reports_duplicate_window_idx
  on public.reports (reporter_id, target_type, target_id, reason, created_at desc);
revoke insert on table public.reports from public, anon, authenticated;

create or replace function public.submit_report(
  kind text,
  target uuid,
  report_reason text,
  report_details text default null,
  decline_pending boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  report_id uuid;
  me uuid := auth.uid();
  intro public.conversation_introductions;
  target_conversation uuid;
begin
  if me is null then
    raise exception 'Authentication required';
  end if;
  if kind not in ('profile', 'introduction', 'message') then
    raise exception 'Invalid report target';
  end if;
  if report_reason not in (
    'spam', 'scam/fraud', 'harassment', 'sexual/inappropriate content',
    'hate/abuse', 'fake profile/impersonation', 'underage concern', 'other'
  ) then
    raise exception 'Invalid report reason';
  end if;

  -- Preserve the existing target authorization rules before applying any
  -- counters.  Invalid references must not consume a report allowance.
  if kind = 'profile' then
    if target = me
       or not exists (
         select 1 from public.profiles p
          where p.id = target and public.viewer_can_access_profile(p.id)
       ) then
      raise exception 'Invalid profile target';
    end if;
  elsif kind = 'introduction' then
    select * into intro
      from public.conversation_introductions
     where id = target
     for update;
    if intro.id is null or (intro.sender_id <> me and intro.recipient_id <> me) then
      raise exception 'Invalid introduction target';
    end if;
  else
    select m.conversation_id into target_conversation
      from public.messages m
     where m.id = target;
    if target_conversation is null
       or not exists (
         select 1 from public.conversation_participants cp
          where cp.conversation_id = target_conversation and cp.user_id = me
       ) then
      raise exception 'Invalid message target';
    end if;
  end if;

  -- Serialize all submissions from one account so multiple tabs and direct
  -- RPC calls cannot race the one-minute and rolling-day limits.
  perform pg_advisory_xact_lock(hashtextextended(me::text, 0));
  if (select max(created_at) from public.reports where reporter_id = me)
       > now() - interval '60 seconds'
     or (select count(*) from public.reports
          where reporter_id = me and created_at > now() - interval '24 hours') >= 10
     or exists (
         select 1 from public.reports
          where reporter_id = me
            and target_type = kind
            and target_id = target
            and reason = report_reason
            and created_at > now() - interval '24 hours'
       ) then
    raise exception 'Please wait before submitting another report.';
  end if;

  insert into public.reports (
    reporter_id, target_type, target_id, target_profile_id,
    target_introduction_id, target_message_id, reason, details
  ) values (
    me, kind, target,
    case when kind = 'profile' then target end,
    case when kind = 'introduction' then target end,
    case when kind = 'message' then target end,
    report_reason, nullif(btrim(report_details), '')
  ) returning id into report_id;

  if kind = 'introduction' and decline_pending
     and intro.recipient_id = me and intro.status = 'pending' then
    update public.conversation_introductions
       set status = 'declined'
     where id = target;
  end if;

  return report_id;
end;
$$;

revoke all on function public.submit_report(text, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.submit_report(text, uuid, text, text, boolean)
  to authenticated;

-- Appeal failures have their own protected limiter.  It is intentionally
-- separate from signup cooldowns and stores only an email hash.
create table if not exists public.age_appeal_cooldowns (
  id uuid primary key default gen_random_uuid(),
  normalized_email_hash text not null unique,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists age_appeal_cooldowns_blocked_idx
  on public.age_appeal_cooldowns (blocked_until);
alter table public.age_appeal_cooldowns enable row level security;
revoke all on table public.age_appeal_cooldowns from public, anon, authenticated;

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
  appeal public.age_appeals;
  cooldown public.age_appeal_cooldowns;
  appeal_id uuid;
  next_attempts integer;
  clean_explanation text := nullif(btrim(coalesce(appeal_explanation, '')), '');
begin
  if me is null then raise exception 'Authentication required'; end if;
  select lower(u.email), u.email_confirmed_at is not null
    into email_value, email_verified
    from auth.users u where u.id = me;
  if not email_verified or email_value is null then raise exception 'Correction unavailable'; end if;
  normalized_hash := encode(extensions.digest(email_value, 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(('age-appeal:' || normalized_hash), 0));
  select * into cooldown
    from public.age_appeal_cooldowns
   where normalized_email_hash = normalized_hash
   for update;
  if cooldown.id is not null and cooldown.blocked_until is not null
     and cooldown.blocked_until > now() then
    raise exception 'Correction requests are temporarily limited';
  end if;
  if cooldown.id is null then
    insert into public.age_appeal_cooldowns (normalized_email_hash, attempt_count, updated_at)
      values (normalized_hash, 1, now());
    next_attempts := 1;
  else
    next_attempts := cooldown.attempt_count + 1;
    update public.age_appeal_cooldowns
       set attempt_count = next_attempts,
           blocked_until = case when next_attempts >= 3 then now() + interval '48 hours' else blocked_until end,
           updated_at = now()
     where id = cooldown.id;
  end if;
  if next_attempts >= 3 then
    raise exception 'Correction requests are temporarily limited';
  end if;

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
  delete from public.age_appeal_cooldowns where id = cooldown.id;
  return appeal_id;
end;
$$;

revoke all on function public.submit_age_appeal(date, text)
  from public, anon, authenticated;
grant execute on function public.submit_age_appeal(date, text) to authenticated;

-- Keep approval cleanup complete if a failed-appeal limiter row exists.
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
    delete from public.age_appeal_cooldowns where normalized_email_hash = appeal.normalized_email_hash;
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
