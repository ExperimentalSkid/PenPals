-- Account erasure preserves the surviving participant's shared conversation
-- while severing the deleted account's live identity.  Storage cleanup is
-- intentionally asynchronous: database erasure commits before any object is
-- removed from the private avatars bucket.

alter table public.messages
  alter column sender_id drop not null;

alter table public.messages
  drop constraint if exists messages_sender_id_fkey;

alter table public.messages
  add constraint messages_sender_id_fkey
  foreign key (sender_id) references public.profiles(id) on delete set null;

-- Retained safety evidence must not keep a live profile FK that can block
-- account deletion.  Its content is redacted by delete_my_account when the
-- configured retention policy permits retaining the case record.
alter table public.profile_moderation_evidence
  alter column target_user_id drop not null;

alter table public.profile_moderation_evidence
  drop constraint if exists profile_moderation_evidence_target_user_id_fkey;

alter table public.profile_moderation_evidence
  add constraint profile_moderation_evidence_target_user_id_fkey
  foreign key (target_user_id) references public.profiles(id) on delete set null;

alter table public.moderation_audit_log
  drop constraint if exists moderation_audit_log_report_id_fkey;

alter table public.moderation_audit_log
  add constraint moderation_audit_log_report_id_fkey
  foreign key (report_id) references public.reports(id) on delete set null;

-- Redacted reports retain only their case type/status after the live target is
-- removed.  A null target_id is valid only for such a redacted case.
alter table public.reports
  alter column target_id drop not null;

alter table public.reports
  drop constraint if exists reports_check;

alter table public.reports
  drop constraint if exists reports_target_reference_check;

alter table public.reports
  add constraint reports_target_reference_check check (
    target_id is null
    or (target_type = 'profile' and target_profile_id = target_id)
    or (target_type = 'introduction' and target_introduction_id = target_id)
    or (target_type = 'message' and target_message_id = target_id)
  );

alter table public.reports
  add column if not exists redacted_at timestamptz;

create table if not exists public.account_storage_deletion_outbox (
  id uuid primary key default gen_random_uuid(),
  path text not null unique,
  requested_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  completed_at timestamptz
);

create index if not exists account_storage_deletion_pending_idx
  on public.account_storage_deletion_outbox (next_attempt_at, requested_at)
  where completed_at is null;

alter table public.account_storage_deletion_outbox enable row level security;
-- No client policies: only the server cleanup worker and protected functions
-- can read or mutate this queue.

create table if not exists public.data_retention_policies (
  category text primary key check (category in ('auth_security', 'moderation_audit', 'moderation_evidence')),
  retention_period interval,
  purpose text not null check (char_length(btrim(purpose)) between 1 and 2000),
  legal_basis text not null check (char_length(btrim(legal_basis)) between 1 and 2000),
  enabled boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (retention_period is null or retention_period > interval '0 seconds')
);

create table if not exists public.data_retention_holds (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('auth_security', 'moderation_audit', 'moderation_evidence')),
  record_id uuid,
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  started_at timestamptz not null default now(),
  released_at timestamptz,
  authorized_by uuid references public.profiles(id) on delete set null,
  check (released_at is null or released_at >= started_at)
);

create index if not exists data_retention_holds_active_idx
  on public.data_retention_holds (category, record_id)
  where released_at is null;

alter table public.data_retention_policies enable row level security;
alter table public.data_retention_holds enable row level security;
-- Retention configuration is never directly readable or writable by ordinary
-- clients; the narrowly scoped admin functions below are the only entry point.
-- No retention periods are seeded; policy decisions remain explicit.

create or replace function public.retention_policy_enabled(target_category text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.data_retention_policies p
     where p.category = target_category
       and p.enabled
       and p.retention_period is not null
  )
$$;

revoke all on function public.retention_policy_enabled(text) from public, anon, authenticated;

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
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;
  if policy_category not in ('auth_security', 'moderation_audit', 'moderation_evidence') then
    raise exception 'Invalid retention category';
  end if;
  if policy_period is not null and policy_period <= interval '0 seconds' then
    raise exception 'Retention period must be positive';
  end if;
  if clean_purpose is null or char_length(clean_purpose) > 2000
     or clean_basis is null or char_length(clean_basis) > 2000 then
    raise exception 'Retention purpose and legal basis are required';
  end if;

  insert into public.data_retention_policies(
    category, retention_period, purpose, legal_basis, enabled, updated_by, updated_at
  ) values (
    policy_category, policy_period, clean_purpose, clean_basis,
    coalesce(policy_enabled, false), auth.uid(), now()
  )
  on conflict (category) do update set
    retention_period = excluded.retention_period,
    purpose = excluded.purpose,
    legal_basis = excluded.legal_basis,
    enabled = excluded.enabled,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  insert into public.moderation_audit_log(
    moderator_id, action, metadata
  ) values (
    auth.uid(), 'retention_policy_changed', jsonb_build_object(
      'category', policy_category,
      'retention_period', policy_period::text,
      'enabled', coalesce(policy_enabled, false)
    )
  );
end;
$$;

revoke all on function public.set_data_retention_policy(text, interval, text, text, boolean) from public, anon, authenticated;
grant execute on function public.set_data_retention_policy(text, interval, text, text, boolean) to authenticated;

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
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;
  if hold_category not in ('auth_security', 'moderation_audit', 'moderation_evidence') then
    raise exception 'Invalid retention category';
  end if;
  if clean_reason is null or char_length(clean_reason) > 2000 then
    raise exception 'A retention hold reason is required';
  end if;

  insert into public.data_retention_holds(category, record_id, reason, authorized_by)
  values (hold_category, held_record_id, clean_reason, auth.uid())
  returning id into hold_id;

  insert into public.moderation_audit_log(
    moderator_id, action, metadata
  ) values (
    auth.uid(), 'retention_hold_created', jsonb_build_object(
      'category', hold_category,
      'record_id', held_record_id,
      'reason', clean_reason
    )
  );
  return hold_id;
end;
$$;

revoke all on function public.set_data_retention_hold(text, uuid, text) from public, anon, authenticated;
grant execute on function public.set_data_retention_hold(text, uuid, text) to authenticated;

create or replace function public.release_data_retention_hold(hold_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;
  update public.data_retention_holds
     set released_at = coalesce(released_at, now())
   where id = hold_id;
  if not found then
    raise exception 'Retention hold not found';
  end if;
  insert into public.moderation_audit_log(
    moderator_id, action, metadata
  ) values (
    auth.uid(), 'retention_hold_released', jsonb_build_object('hold_id', hold_id)
  );
end;
$$;

revoke all on function public.release_data_retention_hold(uuid) from public, anon, authenticated;
grant execute on function public.release_data_retention_hold(uuid) to authenticated;

-- Authenticated fallback acknowledgement for a server action that has removed
-- its own paths.  It is safe after the account row is deleted because the path
-- prefix is still checked against the JWT subject.
create or replace function public.ack_my_avatar_deletions(deletion_paths text[])
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  delete from public.account_storage_deletion_outbox o
   where o.path = any(coalesce(deletion_paths, array[]::text[]))
     and split_part(o.path, '/', 1) = auth.uid()::text
$$;

revoke all on function public.ack_my_avatar_deletions(text[]) from public, anon, authenticated;
grant execute on function public.ack_my_avatar_deletions(text[]) to authenticated;

-- These worker functions are callable only with a service-role JWT.  The
-- service key is used exclusively in server code, never sent to the browser.
create or replace function public.claim_avatar_deletion_batch(batch_size integer default 100)
returns table (id uuid, path text, attempts integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and current_user <> 'service_role' then
    raise exception 'Storage cleanup worker authorization required';
  end if;

  return query
  update public.account_storage_deletion_outbox o
     set attempts = o.attempts + 1,
         next_attempt_at = now() + make_interval(mins => least(1440, greatest(5, power(2, least(o.attempts, 8))::integer))),
         last_error = null
   where o.id in (
     select candidate.id
       from public.account_storage_deletion_outbox candidate
      where candidate.completed_at is null
        and candidate.next_attempt_at <= now()
      order by candidate.requested_at
      for update skip locked
      limit greatest(1, coalesce(batch_size, 100))
   )
  returning o.id, o.path, o.attempts;
end;
$$;

revoke all on function public.claim_avatar_deletion_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_avatar_deletion_batch(integer) to service_role;

create or replace function public.complete_avatar_deletion_batch(completed_ids uuid[])
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and current_user <> 'service_role' then
    raise exception 'Storage cleanup worker authorization required';
  end if;
  delete from public.account_storage_deletion_outbox
   where id = any(coalesce(completed_ids, array[]::uuid[]));
end;
$$;

revoke all on function public.complete_avatar_deletion_batch(uuid[]) from public, anon, authenticated;
grant execute on function public.complete_avatar_deletion_batch(uuid[]) to service_role;

create or replace function public.fail_avatar_deletion_batch(failed_ids uuid[], cleanup_error text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and current_user <> 'service_role' then
    raise exception 'Storage cleanup worker authorization required';
  end if;
  update public.account_storage_deletion_outbox
     set last_error = left(nullif(btrim(cleanup_error), 'Storage cleanup failed'), 1000)
   where id = any(coalesce(failed_ids, array[]::uuid[]));
end;
$$;

revoke all on function public.fail_avatar_deletion_batch(uuid[], text) from public, anon, authenticated;
grant execute on function public.fail_avatar_deletion_batch(uuid[], text) to service_role;

-- Purge only categories with an explicitly configured enabled period.  Auth
-- audit entries are provider-managed and therefore intentionally a no-op here.
create or replace function public.purge_retained_data()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
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
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;

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
grant execute on function public.purge_retained_data() to authenticated;

-- Permanent account deletion is transactional and idempotent.  A second call
-- fails authentication because the account no longer exists, while repeated
-- outbox cleanup is safe due to its unique path and delete-on-success behavior.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  recent_sign_in timestamptz;
  conversation_id uuid;
  keep_evidence boolean;
  keep_audit boolean;
begin
  if me is null then
    raise exception 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('penpal-account-delete:' || me::text, 0));

  select u.last_sign_in_at
    into recent_sign_in
    from auth.users u
   where u.id = me
   for update;
  if not found then
    raise exception 'Authentication required';
  end if;
  if recent_sign_in is null or recent_sign_in < now() - interval '15 minutes' then
    raise exception 'Please sign in again before deleting your account';
  end if;

  -- Lock every affected conversation before membership or shared content is
  -- changed.  Message inserts that race this lock are either included in the
  -- transaction or observe the deleted account after commit.
  for conversation_id in
    select distinct cp.conversation_id
      from public.conversation_participants cp
     where cp.user_id = me
  loop
    perform 1 from public.conversations c where c.id = conversation_id for update;
  end loop;

  -- Keep the report IDs that point at this account's content before any
  -- redaction/deletion so linked moderation audit rows can be handled by the
  -- same retention decision.
  drop table if exists pg_temp.account_deletion_report_ids;
  create temporary table account_deletion_report_ids (
    id uuid primary key
  ) on commit drop;
  insert into pg_temp.account_deletion_report_ids(id)
  select r.id
    from public.reports r
   where r.target_profile_id = me
      or r.target_introduction_id in (
        select i.id from public.conversation_introductions i
         where i.sender_id = me or i.recipient_id = me
      )
      or r.target_message_id in (
        select m.id from public.messages m where m.sender_id = me
      );

  -- Queue paths before profile deletion, but never delete physical objects in
  -- this transaction.  A unique path makes retries and duplicate calls safe.
  insert into public.account_storage_deletion_outbox(path)
  select o.name
    from storage.objects o
   where o.bucket_id = 'avatars'
     and (storage.foldername(o.name))[1] = me::text
  on conflict (path) do nothing;

  keep_evidence := public.retention_policy_enabled('moderation_evidence')
    or exists (
      select 1 from public.data_retention_holds h
       where h.category = 'moderation_evidence'
         and h.released_at is null
         and h.started_at <= now()
    );
  keep_audit := public.retention_policy_enabled('moderation_audit')
    or exists (
      select 1 from public.data_retention_holds h
       where h.category = 'moderation_audit'
         and h.released_at is null
         and h.started_at <= now()
    );

  if keep_evidence then
    update public.reports r
       set target_id = null,
           target_profile_id = null,
           target_introduction_id = null,
           target_message_id = null,
           details = case when r.details is null then null else '[redacted after account deletion]' end,
           redacted_at = now(),
           updated_at = now()
     where r.id in (select id from pg_temp.account_deletion_report_ids);
    -- Reports submitted by the deleted person remain personal data owned by
    -- that account and are removed regardless of the safety-retention policy.
    delete from public.reports where reporter_id = me;
  else
    delete from public.reports r
     where r.reporter_id = me
        or r.id in (select id from pg_temp.account_deletion_report_ids);
  end if;

  if keep_evidence then
    update public.profile_moderation_evidence
       set target_user_id = null,
           previous_value = null,
           reason = 'Redacted after account deletion'
     where target_user_id = me;
  else
    delete from public.profile_moderation_evidence where target_user_id = me;
  end if;

  if keep_audit then
     update public.moderation_audit_log
       set moderator_id = null,
           target_user_id = null,
           metadata = jsonb_build_object('redacted_after_account_deletion', true)
     where moderator_id = me
        or target_user_id = me
        or report_id in (select id from pg_temp.account_deletion_report_ids);
  else
    delete from public.moderation_audit_log
     where moderator_id = me
        or target_user_id = me
        or report_id in (select id from pg_temp.account_deletion_report_ids);
  end if;

  -- Introductions are user-owned interaction records.  Replied introductions
  -- have already been copied into messages, so deleting this row preserves the
  -- opener text without preserving the deleted participant identity.
  delete from public.conversation_introductions
   where sender_id = me or recipient_id = me;

  delete from public.direct_conversation_pairs
   where user_a = me or user_b = me;

  delete from public.profile_photo_access_requests
   where requester_id = me or owner_id = me;
  delete from public.profile_photo_access_grants
   where owner_id = me or viewer_id = me;

  -- Remove only this participant.  A surviving participant keeps their
  -- conversation and all message bodies/timestamps; orphaned conversations
  -- are the only conversations deleted.
  delete from public.conversation_participants where user_id = me;
  delete from public.conversations c
   where not exists (
     select 1 from public.conversation_participants cp
      where cp.conversation_id = c.id
   );

  -- Blocks, notifications, profile selections, exports, and user-owned
  -- records cascade from profile/auth deletion.  sender_id becomes NULL via
  -- the FK above, leaving surviving shared messages anonymized as intended.
  delete from public.profiles where id = me;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
