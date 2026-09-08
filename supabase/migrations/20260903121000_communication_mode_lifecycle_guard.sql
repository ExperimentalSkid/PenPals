-- Stronger lifecycle restrictions continue to override communication mode
-- preferences when a new direct pair is being established.
create or replace function public.enforce_instant_communication_mode()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
      from public.profiles p
     where p.id in (new.user_a, new.user_b)
       and (not p.allow_instant_messages or p.deactivated_at is not null or p.inactive_mode)
  ) then
    raise exception 'Conversation unavailable';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_instant_communication_mode()
  from public, anon, authenticated;
