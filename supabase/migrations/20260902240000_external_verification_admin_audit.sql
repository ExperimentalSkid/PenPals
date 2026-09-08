-- Admin-only verification visibility and lifecycle audit integration.
-- Provider identity details remain private to this narrowly scoped admin path;
-- raw provider subjects, capabilities, account-age metadata, and tokens are
-- intentionally never returned here.

create or replace function public.admin_get_user_verification(target_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;

  if target_user is null or not exists (
    select 1 from public.profiles p where p.id = target_user
  ) then
    return null;
  end if;

  -- Reading private verification metadata is itself an auditable admin action.
  insert into public.moderation_audit_log (
    moderator_id, target_user_id, action, metadata
  ) values (
    auth.uid(), target_user, 'verification_metadata_view',
    jsonb_build_object('context', 'admin_user_detail')
  );

  select jsonb_build_object(
    'records', coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider', v.provider,
        'status', v.status,
        'verified_at', v.verified_at,
        'reverify_after', v.reverify_after,
        'revoked_at', v.revoked_at,
        'created_at', v.created_at,
        'updated_at', v.updated_at
      ) order by v.created_at desc)
        from public.external_account_verifications v
       where v.penpal_user_id = target_user
    ), '[]'::jsonb),
    'conflicts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider', a.metadata ->> 'provider',
        'created_at', a.created_at,
        'conflict_role', coalesce(a.metadata ->> 'conflict_role', 'requester')
      ) order by a.created_at desc)
        from public.moderation_audit_log a
       where a.target_user_id = target_user
         and a.action = 'external_verification_conflict'
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_get_user_verification(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_get_user_verification(uuid) to authenticated;

-- Verification success, self-service revocation, and identity reuse attempts
-- are written to the existing immutable moderation audit stream. Only the
-- provider name and lifecycle status are recorded; no raw external identity
-- is retained in audit metadata.
create or replace function public.record_external_verification(
  p_penpal_user_id uuid,
  p_provider text,
  p_provider_subject_fingerprint text,
  p_capabilities text[] default '{}'::text[],
  p_provider_account_created_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  provider_name text := lower(btrim(p_provider));
  fingerprint text := lower(btrim(p_provider_subject_fingerprint));
  established_capabilities text[] := public.normalize_external_verification_capabilities(p_capabilities);
  policy public.external_verification_provider_policies%rowtype;
  existing public.external_account_verifications%rowtype;
  current_link public.external_account_verifications%rowtype;
  resulting_status text := 'linked_not_eligible';
  resulting_verified_at timestamptz := null;
  resulting_reverify_after timestamptz := null;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Verification service authorization required';
  end if;
  if p_penpal_user_id is null then raise exception 'Verification user is required'; end if;
  if provider_name not in ('facebook', 'instagram', 'tiktok', 'google') then
    raise exception 'Unsupported verification provider';
  end if;
  if fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'Invalid verification subject'; end if;
  if not ('ownership' = any(established_capabilities))
     or not ('stable_account_identifier' = any(established_capabilities)) then
    raise exception 'Provider did not establish the required identity signals';
  end if;
  if p_provider_account_created_at is not null
     and p_provider_account_created_at > now() then
    raise exception 'Invalid provider account creation time';
  end if;
  if not exists (
    select 1 from auth.users u
     where u.id = p_penpal_user_id
       and u.email_confirmed_at is not null
  ) then
    raise exception 'Verified email required';
  end if;
  if exists (
    select 1 from public.profiles p
     where p.id = p_penpal_user_id
       and p.deactivated_at is not null
  ) then
    raise exception 'Deactivated account';
  end if;

  select * into policy
    from public.external_verification_provider_policies p
   where p.provider = provider_name
   for share;

  -- Lock the active subject first so concurrent callbacks cannot link the same
  -- external account to two Penpal accounts.
  select * into existing
    from public.external_account_verifications v
   where v.provider = provider_name
     and v.provider_subject_fingerprint = fingerprint
     and v.revoked_at is null
   for update;
  if found and existing.penpal_user_id <> p_penpal_user_id then
    -- The rejected call is rolled back by the exception. The callback records
    -- this event through the separate service-only helper below, which runs in
    -- its own transaction and therefore remains durable.
    raise exception 'External account already linked';
  end if;

  -- A reconnect replaces this user's active link for the provider. The old
  -- record remains revoked for the account's own export and cannot claim the
  -- subject uniqueness slot.
  select * into current_link
    from public.external_account_verifications v
   where v.penpal_user_id = p_penpal_user_id
     and v.provider = provider_name
     and v.revoked_at is null
   for update;
  if found and current_link.id <> coalesce(existing.id, gen_random_uuid()) then
    update public.external_account_verifications
       set revoked_at = now(), status = 'not_verified', updated_at = now()
     where id = current_link.id;
    insert into public.moderation_audit_log (
      moderator_id, target_user_id, action, metadata
    ) values (
      null, p_penpal_user_id, 'external_verification_revoked',
      jsonb_build_object('provider', provider_name, 'reason', 'replaced_by_reverification')
    );
  end if;

  if policy.provider is not null
     and policy.enabled
     and policy.required_capabilities <@ established_capabilities
     and (
       policy.minimum_external_account_age is null
       or (
         p_provider_account_created_at is not null
         and now() - p_provider_account_created_at >= policy.minimum_external_account_age
       )
     ) then
    resulting_status := 'verified';
    resulting_verified_at := now();
    if policy.reverification_period is not null then
      resulting_reverify_after := now() + policy.reverification_period;
    end if;
  end if;

  if existing.id is not null then
    update public.external_account_verifications
       set status = resulting_status,
           capabilities = established_capabilities,
           provider_account_created_at = p_provider_account_created_at,
           verified_at = resulting_verified_at,
           reverify_after = resulting_reverify_after,
           revoked_at = null,
           updated_at = now()
     where id = existing.id;
  else
    insert into public.external_account_verifications (
      penpal_user_id, provider, provider_subject_fingerprint,
      status, capabilities, provider_account_created_at,
      verified_at, reverify_after
    ) values (
      p_penpal_user_id, provider_name, fingerprint,
      resulting_status, established_capabilities, p_provider_account_created_at,
      resulting_verified_at, resulting_reverify_after
    );
  end if;

  insert into public.moderation_audit_log (
    moderator_id, target_user_id, action, old_status, new_status, metadata
  ) values (
    null, p_penpal_user_id, 'external_verification_recorded', null,
    resulting_status, jsonb_build_object('provider', provider_name, 'status', resulting_status)
  );

  return jsonb_build_object(
    'status', resulting_status,
    'is_verified', resulting_status = 'verified'
  );
exception
  when unique_violation then
    raise exception 'External account already linked';
end;
$$;

revoke all on function public.record_external_verification(uuid, text, text, text[], timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_external_verification(uuid, text, text, text[], timestamptz)
  to service_role;

create or replace function public.record_external_verification_conflict(
  p_penpal_user_id uuid,
  p_provider text,
  p_provider_subject_fingerprint text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  provider_name text := lower(btrim(p_provider));
  fingerprint text := lower(btrim(p_provider_subject_fingerprint));
  existing_user uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Verification service authorization required';
  end if;
  if p_penpal_user_id is null or provider_name not in ('facebook', 'instagram', 'tiktok', 'google')
     or fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid verification conflict';
  end if;

  select v.penpal_user_id
    into existing_user
    from public.external_account_verifications v
   where v.provider = provider_name
     and v.provider_subject_fingerprint = fingerprint
     and v.revoked_at is null
   limit 1;
  if existing_user is null or existing_user = p_penpal_user_id then
    return;
  end if;

  insert into public.moderation_audit_log (
    moderator_id, target_user_id, action, metadata
  ) values (
    null, p_penpal_user_id, 'external_verification_conflict',
    jsonb_build_object('provider', provider_name, 'conflict_role', 'requester')
  ), (
    null, existing_user, 'external_verification_conflict',
    jsonb_build_object('provider', provider_name, 'conflict_role', 'existing_account')
  );
end;
$$;

revoke all on function public.record_external_verification_conflict(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.record_external_verification_conflict(uuid, text, text)
  to service_role;

create or replace function public.revoke_my_external_verification(p_provider text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  provider_name text := lower(btrim(p_provider));
  revoked_count integer;
  old_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if provider_name not in ('facebook', 'instagram', 'tiktok', 'google') then
    raise exception 'Unsupported verification provider';
  end if;

  select v.status into old_status
    from public.external_account_verifications v
   where v.penpal_user_id = auth.uid()
     and v.provider = provider_name
     and v.revoked_at is null
   for update;

  update public.external_account_verifications
     set revoked_at = now(), status = 'not_verified', updated_at = now()
   where penpal_user_id = auth.uid()
     and provider = provider_name
     and revoked_at is null;
  get diagnostics revoked_count = row_count;

  if revoked_count > 0 then
    insert into public.moderation_audit_log (
      moderator_id, target_user_id, action, old_status, new_status, metadata
    ) values (
      auth.uid(), auth.uid(), 'external_verification_revoked', old_status,
      'not_verified', jsonb_build_object('provider', provider_name, 'context', 'self_service')
    );
  end if;
end;
$$;

revoke all on function public.revoke_my_external_verification(text) from public, anon;
grant execute on function public.revoke_my_external_verification(text) to authenticated;
