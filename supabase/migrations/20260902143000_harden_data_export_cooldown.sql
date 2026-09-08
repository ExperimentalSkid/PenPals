-- Serialize export requests per account so the 48-hour cooldown cannot be
-- bypassed by two concurrent requests racing through the pre-insert check.
create or replace function public.enforce_data_export_cooldown()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));
  if exists (
    select 1
      from public.data_export_requests r
     where r.user_id = new.user_id
       and r.requested_at > now() - interval '48 hours'
  ) then
    raise exception 'Data export can be requested once every 48 hours';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_data_export_cooldown() from public, anon, authenticated;

drop trigger if exists data_export_requests_cooldown on public.data_export_requests;
create trigger data_export_requests_cooldown
  before insert on public.data_export_requests
  for each row execute function public.enforce_data_export_cooldown();
