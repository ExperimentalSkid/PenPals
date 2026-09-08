-- Photo-access requests are actionable notifications. Message notifications
-- remain disabled; conversations own their unread state.
alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (type in (
    'new_introduction',
    'introduction_replied',
    'introduction_declined',
    'new_message',
    'photo_access_request',
    'photo_access_granted',
    'photo_access_revoked'
  ));

create or replace function public.notify_photo_access()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    insert into public.notifications(user_id, type, related_id)
    values (new.owner_id, 'photo_access_request', new.id)
    on conflict do nothing;
  elsif tg_op = 'UPDATE'
    and old.status = 'pending'
    and new.status = 'allowed' then
    insert into public.notifications(user_id, type, related_id)
    values (new.requester_id, 'photo_access_granted', new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists photo_access_notifications on public.profile_photo_access_requests;
create trigger photo_access_notifications
  after insert or update of status on public.profile_photo_access_requests
  for each row execute function public.notify_photo_access();

revoke all on function public.notify_photo_access() from public, anon, authenticated;
