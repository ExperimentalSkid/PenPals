-- Allow only the protected erasure/purge paths to mutate immutable audit rows.
-- Ordinary clients and direct service-key table writes remain blocked.
create or replace function public.prevent_moderation_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if coalesce(current_setting('app.allow_moderation_audit_mutation', true), '') = '1'
     and auth.role() = 'authenticated' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'Moderation audit log is immutable';
end;
$$;

revoke all on function public.prevent_moderation_audit_mutation() from public, anon, authenticated;

-- PostgREST exposes the service JWT role through auth.role(), which handles
-- both request.jwt.claim.role and the JSON request.jwt.claims setting.
create or replace function public.claim_avatar_deletion_batch(batch_size integer default 100)
returns table (id uuid, path text, attempts integer)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'service_role' then
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

create or replace function public.complete_avatar_deletion_batch(completed_ids uuid[])
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'service_role' then
    raise exception 'Storage cleanup worker authorization required';
  end if;
  delete from public.account_storage_deletion_outbox
   where id = any(coalesce(completed_ids, array[]::uuid[]));
end;
$$;

create or replace function public.fail_avatar_deletion_batch(failed_ids uuid[], cleanup_error text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user <> 'service_role' then
    raise exception 'Storage cleanup worker authorization required';
  end if;
  update public.account_storage_deletion_outbox
     set last_error = left(nullif(btrim(cleanup_error), 'Storage cleanup failed'), 1000)
   where id = any(coalesce(failed_ids, array[]::uuid[]));
end;
$$;

revoke all on function public.claim_avatar_deletion_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_avatar_deletion_batch(integer) to service_role;
revoke all on function public.complete_avatar_deletion_batch(uuid[]) from public, anon, authenticated;
grant execute on function public.complete_avatar_deletion_batch(uuid[]) to service_role;
revoke all on function public.fail_avatar_deletion_batch(uuid[], text) from public, anon, authenticated;
grant execute on function public.fail_avatar_deletion_batch(uuid[], text) to service_role;

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
  report_ids uuid[];
  audit_ids uuid[];
  evidence_ids uuid[];
  retain_all_evidence boolean;
  retain_all_audit boolean;
begin
  if me is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('penpal-account-delete:' || me::text, 0));
  select u.last_sign_in_at into recent_sign_in from auth.users u where u.id = me for update;
  if not found then raise exception 'Authentication required'; end if;
  if recent_sign_in is null or recent_sign_in < now() - interval '15 minutes' then
    raise exception 'Please sign in again before deleting your account';
  end if;
  perform set_config('app.allow_moderation_audit_mutation', '1', true);

  for conversation_id in select distinct cp.conversation_id from public.conversation_participants cp where cp.user_id = me loop
    perform 1 from public.conversations c where c.id = conversation_id for update;
  end loop;

  select coalesce(array_agg(r.id), array[]::uuid[]) into report_ids from public.reports r
   where r.target_profile_id = me
      or r.target_introduction_id in (select i.id from public.conversation_introductions i where i.sender_id = me or i.recipient_id = me)
      or r.target_message_id in (select m.id from public.messages m where m.sender_id = me);
  select coalesce(array_agg(a.id), array[]::uuid[]) into audit_ids from public.moderation_audit_log a
   where a.moderator_id = me or a.target_user_id = me or a.report_id = any(report_ids);
  select coalesce(array_agg(e.id), array[]::uuid[]) into evidence_ids from public.profile_moderation_evidence e
   where e.target_user_id = me or e.moderator_id = me;

  insert into public.account_storage_deletion_outbox(path)
  select o.name from storage.objects o where o.bucket_id = 'avatars' and (storage.foldername(o.name))[1] = me::text
  on conflict (path) do nothing;

  retain_all_evidence := public.retention_policy_enabled('moderation_evidence') or exists (
    select 1 from public.data_retention_holds h where h.category = 'moderation_evidence' and h.record_id is null
      and h.released_at is null and h.started_at <= now());
  retain_all_audit := public.retention_policy_enabled('moderation_audit') or exists (
    select 1 from public.data_retention_holds h where h.category = 'moderation_audit' and h.record_id is null
      and h.released_at is null and h.started_at <= now());

  update public.moderation_audit_log a set moderator_id = null, target_user_id = null,
    metadata = jsonb_build_object('redacted_after_account_deletion', true)
   where a.id = any(audit_ids) and (retain_all_audit or exists (
     select 1 from public.data_retention_holds h where h.category = 'moderation_audit' and h.record_id = a.id
       and h.released_at is null and h.started_at <= now()));
  delete from public.moderation_audit_log a where a.id = any(audit_ids) and not (retain_all_audit or exists (
    select 1 from public.data_retention_holds h where h.category = 'moderation_audit' and h.record_id = a.id
      and h.released_at is null and h.started_at <= now()));

  update public.reports r set target_id = null, target_profile_id = null, target_introduction_id = null,
    target_message_id = null, details = case when r.details is null then null else '[redacted after account deletion]' end,
    redacted_at = now(), updated_at = now()
   where r.id = any(report_ids) and (retain_all_evidence or exists (
     select 1 from public.data_retention_holds h where h.category = 'moderation_evidence' and h.record_id = r.id
       and h.released_at is null and h.started_at <= now()));
  delete from public.reports r where r.reporter_id = me or (r.id = any(report_ids) and not (retain_all_evidence or exists (
    select 1 from public.data_retention_holds h where h.category = 'moderation_evidence' and h.record_id = r.id
      and h.released_at is null and h.started_at <= now())));

  update public.profile_moderation_evidence e set moderator_id = null, target_user_id = null,
    previous_value = null, reason = 'Redacted after account deletion'
   where e.id = any(evidence_ids) and (retain_all_evidence or exists (
     select 1 from public.data_retention_holds h where h.category = 'moderation_evidence' and h.record_id = e.id
       and h.released_at is null and h.started_at <= now()));
  delete from public.profile_moderation_evidence e where e.id = any(evidence_ids) and not (retain_all_evidence or exists (
    select 1 from public.data_retention_holds h where h.category = 'moderation_evidence' and h.record_id = e.id
      and h.released_at is null and h.started_at <= now()));

  delete from public.conversation_introductions where sender_id = me or recipient_id = me;
  delete from public.direct_conversation_pairs where user_a = me or user_b = me;
  delete from public.profile_photo_access_requests where requester_id = me or owner_id = me;
  delete from public.profile_photo_access_grants where owner_id = me or viewer_id = me;
  delete from public.conversation_participants where user_id = me;
  delete from public.conversations c where not exists (select 1 from public.conversation_participants cp where cp.conversation_id = c.id);
  delete from public.profiles where id = me;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
