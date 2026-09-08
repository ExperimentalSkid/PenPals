-- Optional external-account verification foundation.
-- This migration stores only a provider name and a one-way subject fingerprint;
-- OAuth tokens and public provider identity details are intentionally absent.
-- No providers, durations, or requirements are seeded; operators configure them
-- explicitly when a provider integration is approved.

create table if not exists public.external_verification_provider_policies (
  provider text primary key
    check (provider = lower(btrim(provider)))
    check (char_length(provider) between 1 and 64)
    check (provider ~ '^[a-z0-9][a-z0-9._-]*$'),
  enabled boolean not null default false,
  supported_capabilities text[] not null default '{}'::text[]
    check (supported_capabilities <@ array['ownership', 'account_age']::text[]),
  required_capabilities text[] not null default '{}'::text[]
    check (required_capabilities <@ array['ownership', 'account_age']::text[])
    check (required_capabilities <@ supported_capabilities),
  minimum_external_account_age interval,
  reverification_period interval,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (minimum_external_account_age is null or minimum_external_account_age > interval '0 seconds'),
  check (reverification_period is null or reverification_period > interval '0 seconds'),
  check (minimum_external_account_age is null or 'account_age' = any(supported_capabilities))
);

alter table public.external_verification_provider_policies enable row level security;
revoke all on table public.external_verification_provider_policies from public, anon, authenticated;

create table if not exists public.external_account_verifications (
  id uuid primary key default gen_random_uuid(),
  penpal_user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null
    check (provider = lower(btrim(provider)))
    check (char_length(provider) between 1 and 64)
    check (provider ~ '^[a-z0-9][a-z0-9._-]*$'),
  provider_subject_fingerprint text not null
    check (provider_subject_fingerprint ~ '^[0-9a-f]{64}$'),
  status text not null default 'not_verified'
    check (status in ('not_verified', 'linked_not_eligible', 'verified')),
  capabilities text[] not null default '{}'::text[]
    check (capabilities <@ array['ownership', 'account_age']::text[]),
  provider_account_created_at timestamptz,
  verified_at timestamptz,
  reverify_after timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'verified' or ('ownership' = any(capabilities) and verified_at is not null)),
  check (provider_account_created_at is null or 'account_age' = any(capabilities))
);

comment on table public.external_account_verifications is
  'Private provider-link records. Never expose provider, subject fingerprint, or provider account metadata in public profile responses.';
comment on column public.external_account_verifications.provider_subject_fingerprint is
  'One-way stable provider subject fingerprint; raw provider identifiers and OAuth tokens are not stored.';

create unique index if not exists external_account_verifications_active_subject_idx
  on public.external_account_verifications(provider, provider_subject_fingerprint)
  where revoked_at is null;

create unique index if not exists external_account_verifications_active_user_provider_idx
  on public.external_account_verifications(penpal_user_id, provider)
  where revoked_at is null;

alter table public.external_account_verifications enable row level security;
revoke all on table public.external_account_verifications from public, anon, authenticated;

drop trigger if exists external_account_verifications_updated_at on public.external_account_verifications;
create trigger external_account_verifications_updated_at
before update on public.external_account_verifications
for each row execute function public.set_updated_at();

-- Public callers receive only this boolean through the public profile projection.
-- The underlying provider, subject fingerprint, capabilities, and timestamps stay
-- behind a non-client-callable helper.
create or replace function public.is_profile_verified(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from public.external_account_verifications v
     where v.penpal_user_id = target_user
       and v.status = 'verified'
       and v.revoked_at is null
       and (v.reverify_after is null or v.reverify_after > now())
  );
$$;

revoke all on function public.is_profile_verified(uuid) from public, anon, authenticated;

-- Preserve the existing privacy-aware profile projection and add only the public
-- verification boolean. Provider-specific details are never returned.
create or replace function public.get_public_profile(target_username text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  profile_row public.profiles;
  response_label text;
begin
  select p.*
    into profile_row
    from public.profiles p
   where p.username = lower(btrim(target_username))
     and public.viewer_can_access_profile(p.id);

  if not found then
    return null;
  end if;

  select case
           when s.completed_opportunities >= 5 and s.response_rate is not null
             then s.response_rate::text || '%'
           else 'New member'
         end
    into response_label
    from public.get_response_stats(profile_row.id) s;

  return jsonb_build_object(
    'id', profile_row.id,
    'username', profile_row.username,
    'display_name', profile_row.display_name,
    'birth_date', profile_row.birth_date,
    'gender', profile_row.gender,
    'country', profile_row.country,
    'city', case when profile_row.show_city then profile_row.city else null end,
    'bio', profile_row.bio,
    'quote', profile_row.quote,
    'looking_for', profile_row.looking_for,
    'avatar_path', case
      when public.can_view_profile_photo(profile_row.id, auth.uid()) then profile_row.avatar_path
      else null
    end,
    'availability', case when profile_row.show_activity_status then profile_row.availability else null end,
    'activity_status', case
      when not profile_row.show_activity_status then null
      when profile_row.availability = 'away' then 'Away'
      when profile_row.last_active_at is null then 'Active more than a week ago'
      when profile_row.last_active_at >= now() - interval '5 minutes' then 'Online now'
      when profile_row.last_active_at >= now() - interval '1 hour' then 'Active recently'
      when profile_row.last_active_at >= now() - interval '1 day' then 'Active today'
      when profile_row.last_active_at >= now() - interval '7 days' then 'Active this week'
      else 'Active more than a week ago'
    end,
    'response_rate_label', response_label,
    'is_verified', public.is_profile_verified(profile_row.id)
  );
end;
$$;

revoke all on function public.get_public_profile(text) from public, anon;
grant execute on function public.get_public_profile(text) to authenticated;

-- Include the requesting user's own private verification records in the GDPR
-- export. This function remains self-only; public profile callers cannot reach
-- these fields through get_public_profile.
create or replace function public.get_my_data_export_supplement()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  result jsonb;
begin
  if me is null then
    raise exception 'Authentication required';
  end if;

  select jsonb_build_object(
    'account', jsonb_build_object(
      'role', p.role,
      'status', case when p.deactivated_at is null then 'active' else 'deactivated' end,
      'deactivated_at', p.deactivated_at
    ),
    'settings', jsonb_build_object(
      'country_exclusion_codes', coalesce((
        select jsonb_agg(e.country_code order by e.country_code)
          from public.profile_introduction_country_exclusions e
         where e.profile_id = p.id
      ), '[]'::jsonb)
    ),
    'external_verification', coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider', v.provider,
        'provider_subject_fingerprint', v.provider_subject_fingerprint,
        'status', v.status,
        'capabilities', v.capabilities,
        'provider_account_created_at', v.provider_account_created_at,
        'verified_at', v.verified_at,
        'reverify_after', v.reverify_after,
        'revoked_at', v.revoked_at,
        'created_at', v.created_at,
        'updated_at', v.updated_at
      ) order by v.created_at)
        from public.external_account_verifications v
       where v.penpal_user_id = me
    ), '[]'::jsonb),
    'reports_about', coalesce((
      select jsonb_agg(jsonb_build_object(
        'target_type', r.target_type,
        'reason', r.reason,
        'status', r.status,
        'created_at', r.created_at,
        'updated_at', r.updated_at,
        'details', case when r.details is null then null else '[redacted to protect reporter and third-party rights]' end,
        'details_redacted', r.details is not null
      ) order by r.created_at)
        from public.reports r
       where r.target_profile_id = me
          or r.target_introduction_id in (
            select i.id
              from public.conversation_introductions i
             where i.sender_id = me or i.recipient_id = me
          )
          or r.target_message_id in (
            select m.id
              from public.messages m
             where m.sender_id = me
          )
    ), '[]'::jsonb),
    'moderation', jsonb_build_object(
      'actions_about_account', coalesce((
        select jsonb_agg(jsonb_build_object(
          'action', a.action,
          'old_status', a.old_status,
          'new_status', a.new_status,
          'created_at', a.created_at,
          'metadata', '[redacted protected moderation context]'
        ) order by a.created_at)
          from public.moderation_audit_log a
         where a.target_user_id = me
      ), '[]'::jsonb),
      'profile_content_evidence', coalesce((
        select jsonb_agg(jsonb_build_object(
          'content_type', e.content_type,
          'created_at', e.created_at,
          'previous_value', '[redacted protected moderation evidence]',
          'reason', '[redacted protected moderation evidence]'
        ) order by e.created_at)
          from public.profile_moderation_evidence e
         where e.target_user_id = me
      ), '[]'::jsonb)
    )
  )
    into result
    from public.profiles p
   where p.id = me;

  return coalesce(result, '{}'::jsonb);
end;
$$;

revoke all on function public.get_my_data_export_supplement() from public, anon, authenticated;
grant execute on function public.get_my_data_export_supplement() to authenticated;

-- Provider policy configuration is deliberately admin-only and has no seeded
-- values. Durations and required capabilities remain explicit operator choices.
create or replace function public.admin_list_external_verification_policies()
returns table (
  provider text,
  enabled boolean,
  supported_capabilities text[],
  required_capabilities text[],
  minimum_external_account_age interval,
  reverification_period interval,
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
           p.reverification_period, p.updated_at
      from public.external_verification_provider_policies p
     order by p.provider;
end;
$$;

revoke all on function public.admin_list_external_verification_policies() from public, anon, authenticated;
grant execute on function public.admin_list_external_verification_policies() to authenticated;

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
  supported text[] := coalesce(policy_supported_capabilities, '{}'::text[]);
  required text[] := coalesce(policy_required_capabilities, '{}'::text[]);
  clean_reason text := nullif(btrim(change_reason), '');
begin
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;
  if provider_name !~ '^[a-z0-9][a-z0-9._-]*$' or char_length(provider_name) > 64 then
    raise exception 'Invalid verification provider';
  end if;
  if supported <@ array['ownership', 'account_age']::text[] is not true
     or required <@ array['ownership', 'account_age']::text[] is not true
     or required <@ supported is not true then
    raise exception 'Invalid verification capabilities';
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
     and not ('account_age' = any(supported)) then
    raise exception 'Account age is not supported by this provider';
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

  insert into public.moderation_audit_log (
    moderator_id, action, metadata
  ) values (
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
