-- Optional email alert when Snail Mail actually arrives.
-- Delivery remains authoritative in snail_mail_letters; this table is only a retryable outbound queue.

alter table public.user_notification_preferences
  add column if not exists email_snail_mail boolean not null default true;

drop function if exists public.get_my_notification_preferences();
create function public.get_my_notification_preferences()
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
    'verification_reminders', coalesce(p.verification_reminders, true),
    'email_snail_mail', coalesce(p.email_snail_mail, true)
  )
  from (select auth.uid() as uid) me
  left join public.user_notification_preferences p on p.user_id = me.uid
  where me.uid is not null
$$;

revoke all on function public.get_my_notification_preferences() from public, anon, authenticated;
grant execute on function public.get_my_notification_preferences() to authenticated;

drop function if exists public.save_my_notification_preferences(boolean, boolean, boolean, boolean);
drop function if exists public.save_my_notification_preferences(boolean, boolean, boolean, boolean, boolean);
create function public.save_my_notification_preferences(
  p_introductions boolean,
  p_photo_access boolean,
  p_support_updates boolean,
  p_verification_reminders boolean,
  p_email_snail_mail boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Authentication required'; end if;

  insert into public.user_notification_preferences(
    user_id, introductions, photo_access, support_updates, verification_reminders, email_snail_mail, updated_at
  ) values (
    me, coalesce(p_introductions,false), coalesce(p_photo_access,false), coalesce(p_support_updates,false),
    coalesce(p_verification_reminders,false), coalesce(p_email_snail_mail,false), now()
  )
  on conflict(user_id) do update set
    introductions=excluded.introductions,
    photo_access=excluded.photo_access,
    support_updates=excluded.support_updates,
    verification_reminders=excluded.verification_reminders,
    email_snail_mail=excluded.email_snail_mail,
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

revoke all on function public.save_my_notification_preferences(boolean,boolean,boolean,boolean,boolean) from public, anon, authenticated;
grant execute on function public.save_my_notification_preferences(boolean,boolean,boolean,boolean,boolean) to authenticated;

create table if not exists public.snail_mail_email_outbox (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid not null unique references public.snail_mail_letters(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  queued_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  completed_at timestamptz,
  last_error text
);

create index if not exists snail_mail_email_outbox_pending_idx
  on public.snail_mail_email_outbox(next_attempt_at, queued_at)
  where completed_at is null;

alter table public.snail_mail_email_outbox enable row level security;
revoke all on table public.snail_mail_email_outbox from public, anon, authenticated;

create or replace function public.queue_snail_mail_arrival_email()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if old.delivered_at is null and new.delivered_at is not null
     and exists (
       select 1 from public.profiles p
        where p.id = new.recipient_id
          and p.deactivated_at is null
          and not p.inactive_mode
     )
     and coalesce((
       select pref.email_snail_mail
         from public.user_notification_preferences pref
        where pref.user_id = new.recipient_id
     ), true) then
    insert into public.snail_mail_email_outbox(letter_id, recipient_id, conversation_id)
    values(new.id, new.recipient_id, new.conversation_id)
    on conflict(letter_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.queue_snail_mail_arrival_email() from public, anon, authenticated;

drop trigger if exists snail_mail_arrival_email_queue on public.snail_mail_letters;
create trigger snail_mail_arrival_email_queue
after update of delivered_at on public.snail_mail_letters
for each row execute function public.queue_snail_mail_arrival_email();

create or replace function public.claim_snail_mail_email_batch(batch_size integer default 100)
returns table (
  id uuid,
  letter_id uuid,
  conversation_id uuid,
  recipient_email text,
  locale text
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Background worker authorization required';
  end if;
  if batch_size is null or batch_size < 1 or batch_size > 500 then batch_size := 100; end if;

  update public.snail_mail_email_outbox q
     set completed_at = now(), claimed_at = null, last_error = 'suppressed'
   where q.completed_at is null
     and (
       coalesce((select not pref.email_snail_mail from public.user_notification_preferences pref where pref.user_id = q.recipient_id), false)
       or exists (select 1 from public.profiles p where p.id = q.recipient_id and (p.deactivated_at is not null or p.inactive_mode))
       or exists (select 1 from auth.users u where u.id = q.recipient_id and (u.email is null or u.email_confirmed_at is null))
     );

  return query
  with due as (
    select q.id
      from public.snail_mail_email_outbox q
      join public.profiles p on p.id = q.recipient_id
      join auth.users u on u.id = q.recipient_id
     where q.completed_at is null
       and q.next_attempt_at <= now()
       and (q.claimed_at is null or q.claimed_at < now() - interval '15 minutes')
       and p.deactivated_at is null
       and not p.inactive_mode
       and u.email is not null
       and u.email_confirmed_at is not null
       and coalesce((select pref.email_snail_mail from public.user_notification_preferences pref where pref.user_id = q.recipient_id), true)
     order by q.queued_at
     for update of q skip locked
     limit batch_size
  ), claimed as (
    update public.snail_mail_email_outbox q
       set claimed_at = now(), attempt_count = q.attempt_count + 1, last_error = null
      from due
     where q.id = due.id
    returning q.id, q.letter_id, q.conversation_id, q.recipient_id
  )
  select c.id, c.letter_id, c.conversation_id, u.email::text,
         coalesce((
           select la.locale
             from public.legal_acceptances la
            where la.user_id = c.recipient_id
            order by la.accepted_at desc
            limit 1
         ), 'en')
    from claimed c
    join auth.users u on u.id = c.recipient_id;
end;
$$;

revoke all on function public.claim_snail_mail_email_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_snail_mail_email_batch(integer) to service_role;

create or replace function public.complete_snail_mail_email_job(job_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Background worker authorization required'; end if;
  update public.snail_mail_email_outbox
     set completed_at = now(), claimed_at = null, last_error = null
   where id = job_id and completed_at is null;
end;
$$;

create or replace function public.fail_snail_mail_email_job(job_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Background worker authorization required'; end if;
  update public.snail_mail_email_outbox
     set claimed_at = null,
         next_attempt_at = now() + make_interval(mins => least(360, greatest(5, attempt_count * 5))),
         last_error = 'delivery_failed'
   where id = job_id and completed_at is null;
end;
$$;

revoke all on function public.complete_snail_mail_email_job(uuid) from public, anon, authenticated;
revoke all on function public.fail_snail_mail_email_job(uuid) from public, anon, authenticated;
grant execute on function public.complete_snail_mail_email_job(uuid) to service_role;
grant execute on function public.fail_snail_mail_email_job(uuid) to service_role;
