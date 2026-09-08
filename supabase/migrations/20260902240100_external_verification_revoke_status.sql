-- Preserve the actual verification status in self-service revocation audit
-- entries (including linked_not_eligible records).

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
