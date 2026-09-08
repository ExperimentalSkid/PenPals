-- Provider-capability contract for optional external verification.
-- This migration deliberately adds no provider, OAuth flow, scope grant, or
-- duration.  Provider adapters remain an application concern and persist only
-- the non-identifying verification result in external_account_verifications.

-- The first foundation migration had a deliberately small capability allowlist.
-- Replace those allowlists with a provider-neutral contract so a future
-- integration can add only the signals it actually supports.
alter table if exists public.external_verification_provider_policies
  add column if not exists minimum_oauth_scopes text[] not null default '{}'::text[],
  add column if not exists access_token_retention text not null default 'discard_after_verification';

alter table if exists public.external_verification_provider_policies
  drop constraint if exists external_verification_provider_pol_supported_capabilities_check,
  drop constraint if exists external_verification_provider_poli_required_capabilities_check,
  drop constraint if exists external_verification_provider_policies_check1;

alter table if exists public.external_account_verifications
  drop constraint if exists external_account_verifications_capabilities_check,
  drop constraint if exists external_account_verifications_check,
  drop constraint if exists external_account_verifications_check1;

alter table if exists public.external_verification_provider_policies
  add constraint external_verification_provider_policies_access_token_retention_check
    check (access_token_retention in ('discard_after_verification', 'retain_for_reverification')),
  add constraint external_verification_provider_policies_minimum_account_age_capability_check
    check (
      minimum_external_account_age is null
      or 'account_created_at' = any(supported_capabilities)
      or 'account_age' = any(supported_capabilities)
    );

alter table if exists public.external_account_verifications
  add constraint external_account_verifications_verified_capabilities_check
    check (
      status <> 'verified'
      or (
        'ownership' = any(capabilities)
        and verified_at is not null
      )
    ),
  add constraint external_account_verifications_account_created_at_capability_check
    check (
      provider_account_created_at is null
      or 'account_created_at' = any(capabilities)
      or 'account_age' = any(capabilities)
    );

comment on column public.external_verification_provider_policies.supported_capabilities is
  'Provider-declared signals. Canonical values include ownership, stable_account_identifier, account_created_at, token_revocation, and reverification; future minimal capabilities may be added without changing the public is_verified model.';
comment on column public.external_verification_provider_policies.required_capabilities is
  'Signals required for this provider policy. A provider must not be treated as supplying a signal it does not declare.';
comment on column public.external_verification_provider_policies.minimum_oauth_scopes is
  'Minimum provider scopes requested by a future adapter. Empty means no scopes have been selected.';
comment on column public.external_verification_provider_policies.access_token_retention is
  'Token handling contract for a future adapter. The foundation stores no OAuth token; discard_after_verification is the safe default.';
comment on column public.external_account_verifications.capabilities is
  'Signals actually established by the adapter for this identity; unavailable provider signals must be omitted, never fabricated.';

-- Normalize and validate capability names in one non-client-callable helper.
-- Keeping this generic avoids assuming that all providers expose the same set
-- of capabilities while still preventing empty or malformed declarations.
create or replace function public.normalize_external_verification_capabilities(input_capabilities text[])
returns text[]
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  item text;
  normalized text[] := '{}'::text[];
begin
  foreach item in array coalesce(input_capabilities, '{}'::text[]) loop
    item := lower(btrim(item));
    if item is null or item = '' or item !~ '^[a-z][a-z0-9_.:-]*$' then
      raise exception 'Invalid verification capability';
    end if;
    if not (item = any(normalized)) then
      normalized := array_append(normalized, item);
    end if;
  end loop;
  return normalized;
end;
$$;

revoke all on function public.normalize_external_verification_capabilities(text[]) from public, anon, authenticated;

-- Keep the existing admin entry point stable, but allow it to accept the
-- provider's complete declared capability set. Existing callers continue to
-- work and no provider is enabled by this migration.
create or replace function public.set_external_verification_policy(
  policy_provider text,
  policy_enabled boolean,
  policy_supported_capabilities text[] default '{}'::text[],
  policy_required_capabilities text[] default '{}'::text[],
  policy_minimum_external_account_age interval default null,
  policy_reverification_period interval default null,
  change_reason text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  provider_name text := lower(btrim(policy_provider));
  supported text[] := public.normalize_external_verification_capabilities(policy_supported_capabilities);
  required text[] := public.normalize_external_verification_capabilities(policy_required_capabilities);
  clean_reason text := nullif(btrim(change_reason), '');
begin
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;
  if provider_name !~ '^[a-z0-9][a-z0-9._-]*$' or char_length(provider_name) > 64 then
    raise exception 'Invalid verification provider';
  end if;
  if required <@ supported is not true then
    raise exception 'Required capabilities must be supported by this provider';
  end if;
  if policy_minimum_external_account_age is not null
     and policy_minimum_external_account_age <= interval '0 seconds' then
    raise exception 'Invalid minimum account age';
  end if;
  if policy_reverification_period is not null
     and policy_reverification_period <= interval '0 seconds' then
    raise exception 'Invalid reverification period';
  end if;
  if policy_minimum_external_account_age is not null
     and not (
       'account_created_at' = any(supported)
       or 'account_age' = any(supported)
     ) then
    raise exception 'Account creation date is not supported by this provider';
  end if;
  if clean_reason is null or char_length(clean_reason) > 500 then
    raise exception 'A policy change reason is required';
  end if;

  insert into public.external_verification_provider_policies (
    provider, enabled, supported_capabilities, required_capabilities,
    minimum_external_account_age, reverification_period, updated_by, updated_at
  ) values (
    provider_name, policy_enabled, supported, required,
    policy_minimum_external_account_age, policy_reverification_period,
    auth.uid(), now()
  )
  on conflict (provider) do update set
    enabled = excluded.enabled,
    supported_capabilities = excluded.supported_capabilities,
    required_capabilities = excluded.required_capabilities,
    minimum_external_account_age = excluded.minimum_external_account_age,
    reverification_period = excluded.reverification_period,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  insert into public.moderation_audit_log (moderator_id, action, metadata)
  values (
    auth.uid(), 'external_verification_policy_changed', jsonb_build_object(
      'provider', provider_name,
      'enabled', policy_enabled,
      'supported_capabilities', supported,
      'required_capabilities', required,
      'minimum_external_account_age', policy_minimum_external_account_age,
      'reverification_period', policy_reverification_period,
      'reason', clean_reason
    )
  );
end;
$$;

revoke all on function public.set_external_verification_policy(text, boolean, text[], text[], interval, interval, text) from public, anon, authenticated;
grant execute on function public.set_external_verification_policy(text, boolean, text[], text[], interval, interval, text) to authenticated;

-- Full contract configuration is separate so existing callers do not need to
-- change signature. It is still admin-only and emits its own immutable audit
-- record. No OAuth token is accepted or persisted here.
create or replace function public.set_external_verification_provider_contract(
  policy_provider text,
  policy_enabled boolean,
  policy_supported_capabilities text[] default '{}'::text[],
  policy_required_capabilities text[] default '{}'::text[],
  policy_minimum_external_account_age interval default null,
  policy_reverification_period interval default null,
  policy_minimum_oauth_scopes text[] default '{}'::text[],
  policy_access_token_retention text default 'discard_after_verification',
  change_reason text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  provider_name text := lower(btrim(policy_provider));
  supported text[] := public.normalize_external_verification_capabilities(policy_supported_capabilities);
  required text[] := public.normalize_external_verification_capabilities(policy_required_capabilities);
  scopes text[] := '{}'::text[];
  clean_reason text := nullif(btrim(change_reason), '');
  scope_item text;
begin
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;
  if provider_name !~ '^[a-z0-9][a-z0-9._-]*$' or char_length(provider_name) > 64 then
    raise exception 'Invalid verification provider';
  end if;
  if required <@ supported is not true then
    raise exception 'Required capabilities must be supported by this provider';
  end if;
  if policy_minimum_external_account_age is not null
     and policy_minimum_external_account_age <= interval '0 seconds' then
    raise exception 'Invalid minimum account age';
  end if;
  if policy_reverification_period is not null
     and policy_reverification_period <= interval '0 seconds' then
    raise exception 'Invalid reverification period';
  end if;
  if policy_minimum_external_account_age is not null
     and not (
       'account_created_at' = any(supported)
       or 'account_age' = any(supported)
     ) then
    raise exception 'Account creation date is not supported by this provider';
  end if;
  if policy_access_token_retention not in ('discard_after_verification', 'retain_for_reverification') then
    raise exception 'Invalid access-token retention policy';
  end if;
  foreach scope_item in array coalesce(policy_minimum_oauth_scopes, '{}'::text[]) loop
    scope_item := btrim(scope_item);
    if scope_item is null or scope_item = '' or char_length(scope_item) > 128 then
      raise exception 'Invalid OAuth scope';
    end if;
    if not (scope_item = any(scopes)) then
      scopes := array_append(scopes, scope_item);
    end if;
  end loop;
  if clean_reason is null or char_length(clean_reason) > 500 then
    raise exception 'A policy change reason is required';
  end if;

  perform public.set_external_verification_policy(
    provider_name, policy_enabled, supported, required,
    policy_minimum_external_account_age, policy_reverification_period, clean_reason
  );

  update public.external_verification_provider_policies
     set minimum_oauth_scopes = scopes,
         access_token_retention = policy_access_token_retention,
         updated_by = auth.uid(),
         updated_at = now()
   where provider = provider_name;

  insert into public.moderation_audit_log (moderator_id, action, metadata)
  values (
    auth.uid(), 'external_verification_provider_contract_changed', jsonb_build_object(
      'provider', provider_name,
      'minimum_oauth_scopes', scopes,
      'access_token_retention', policy_access_token_retention,
      'reason', clean_reason
    )
  );
end;
$$;

revoke all on function public.set_external_verification_provider_contract(text, boolean, text[], text[], interval, interval, text[], text, text) from public, anon, authenticated;
grant execute on function public.set_external_verification_provider_contract(text, boolean, text[], text[], interval, interval, text[], text, text) to authenticated;

create or replace function public.admin_list_external_verification_provider_contracts()
returns table (
  provider text,
  enabled boolean,
  supported_capabilities text[],
  required_capabilities text[],
  minimum_external_account_age interval,
  reverification_period interval,
  minimum_oauth_scopes text[],
  access_token_retention text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;
  return query
    select p.provider, p.enabled, p.supported_capabilities,
           p.required_capabilities, p.minimum_external_account_age,
           p.reverification_period, p.minimum_oauth_scopes,
           p.access_token_retention, p.updated_at
      from public.external_verification_provider_policies p
     order by p.provider;
end;
$$;

revoke all on function public.admin_list_external_verification_provider_contracts() from public, anon, authenticated;
grant execute on function public.admin_list_external_verification_provider_contracts() to authenticated;
