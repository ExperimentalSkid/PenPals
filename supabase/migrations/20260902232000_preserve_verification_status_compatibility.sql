-- Keep existing verified records valid while retaining the capability model.
-- A provider may prove ownership without exposing every optional signal; policy
-- configuration decides which capabilities are required for a given provider.
-- The stable subject fingerprint remains the uniqueness key for active links.

alter table if exists public.external_account_verifications
  drop constraint if exists external_account_verifications_verified_capabilities_check;

alter table if exists public.external_account_verifications
  add constraint external_account_verifications_verified_capabilities_check
    check (
      status <> 'verified'
      or ('ownership' = any(capabilities) and verified_at is not null)
    );

