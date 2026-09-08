-- Approved provider adapters persist through this service-only boundary.
-- OAuth tokens and raw provider identities never enter the database.

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
  end if;

  if policy.provider is not null
     and policy.enabled
     and policy.required_capabilities <@ established_capabilities
     and (
       policy.minimum_external_account_age is null
       or (
         p_provider_account_created_at is not null
         and (
           now() - p_provider_account_created_at >= policy.minimum_external_account_age
         )
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

  return jsonb_build_object(
    'status', resulting_status,
    'is_verified', resulting_status = 'verified'
  );
exception
  when unique_violation then
    raise exception 'External account already linked';
end;
$$;

revoke all on function public.record_external_verification(uuid, text, text, text[], timestamptz) from public, anon, authenticated;
grant execute on function public.record_external_verification(uuid, text, text, text[], timestamptz) to service_role;

-- Interactive unlinking is self-only. Provider access tokens are intentionally
-- discarded, so revocation here removes Penpal verification immediately; a
-- later re-verification starts a fresh provider authorization flow.
create or replace function public.revoke_my_external_verification(p_provider text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  provider_name text := lower(btrim(p_provider));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if provider_name not in ('facebook', 'instagram', 'tiktok', 'google') then
    raise exception 'Unsupported verification provider';
  end if;
  update public.external_account_verifications
     set revoked_at = now(), status = 'not_verified', updated_at = now()
   where penpal_user_id = auth.uid()
     and provider = provider_name
     and revoked_at is null;
end;
$$;

revoke all on function public.revoke_my_external_verification(text) from public, anon;
grant execute on function public.revoke_my_external_verification(text) to authenticated;
