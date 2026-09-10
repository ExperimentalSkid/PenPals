create table if not exists public.user_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  introductions boolean not null default true,
  photo_access boolean not null default true,
  support_updates boolean not null default true,
  verification_reminders boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.user_notification_preferences enable row level security;
revoke all on table public.user_notification_preferences from public, anon, authenticated;

create or replace function public.get_my_notification_preferences()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'introductions', coalesce(p.introductions, true),
    'photo_access', coalesce(p.photo_access, true),
    'support_updates', coalesce(p.support_updates, true),
    'verification_reminders', coalesce(p.verification_reminders, true)
  )
  from (select auth.uid() as uid) me
  left join public.user_notification_preferences p on p.user_id = me.uid
  where me.uid is not null
$$;

create or replace function public.save_my_notification_preferences(
  p_introductions boolean,
  p_photo_access boolean,
  p_support_updates boolean,
  p_verification_reminders boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Authentication required'; end if;
  insert into public.user_notification_preferences(user_id,introductions,photo_access,support_updates,verification_reminders,updated_at)
  values(me,coalesce(p_introductions,false),coalesce(p_photo_access,false),coalesce(p_support_updates,false),coalesce(p_verification_reminders,false),now())
  on conflict(user_id) do update set
    introductions=excluded.introductions,
    photo_access=excluded.photo_access,
    support_updates=excluded.support_updates,
    verification_reminders=excluded.verification_reminders,
    updated_at=now();

  update public.notifications
     set read_at = coalesce(read_at, now())
   where user_id = me and read_at is null and (
     (not coalesce(p_introductions,false) and type in ('new_introduction','introduction_replied','introduction_declined')) or
     (not coalesce(p_photo_access,false) and type in ('photo_access_request','photo_access_granted','photo_access_revoked')) or
     (not coalesce(p_support_updates,false) and type in ('support_ticket_public_reply','support_ticket_waiting_user','support_ticket_resolved','support_ticket_reopened')) or
     (not coalesce(p_verification_reminders,false) and type = 'profile_verification_reverify')
   );
end;
$$;

create or replace function public.filter_notification_by_preference()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare prefs public.user_notification_preferences%rowtype;
begin
  select * into prefs from public.user_notification_preferences where user_id = new.user_id;
  if not found then return new; end if;
  if new.type in ('new_introduction','introduction_replied','introduction_declined') and not prefs.introductions then return null; end if;
  if new.type in ('photo_access_request','photo_access_granted','photo_access_revoked') and not prefs.photo_access then return null; end if;
  if new.type in ('support_ticket_public_reply','support_ticket_waiting_user','support_ticket_resolved','support_ticket_reopened') and not prefs.support_updates then return null; end if;
  if new.type = 'profile_verification_reverify' and not prefs.verification_reminders then return null; end if;
  return new;
end;
$$;

drop trigger if exists notifications_preferences_filter on public.notifications;
create trigger notifications_preferences_filter before insert on public.notifications
for each row execute function public.filter_notification_by_preference();

revoke all on function public.get_my_notification_preferences() from public, anon, authenticated;
revoke all on function public.save_my_notification_preferences(boolean,boolean,boolean,boolean) from public, anon, authenticated;
grant execute on function public.get_my_notification_preferences() to authenticated;
grant execute on function public.save_my_notification_preferences(boolean,boolean,boolean,boolean) to authenticated;
