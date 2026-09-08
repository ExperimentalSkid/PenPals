-- The service-only retention worker uses the same protected audit mutation
-- path as account erasure. Ordinary callers remain blocked by the trigger.
create or replace function public.prevent_moderation_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if coalesce(current_setting('app.allow_moderation_audit_mutation', true), '') = '1'
     and (auth.role() in ('authenticated', 'service_role') or current_user = 'service_role') then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception 'Moderation audit log is immutable';
end;
$$;

revoke all on function public.prevent_moderation_audit_mutation() from public, anon, authenticated;
grant execute on function public.prevent_moderation_audit_mutation() to service_role;
