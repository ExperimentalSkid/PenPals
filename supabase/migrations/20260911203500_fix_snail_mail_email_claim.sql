-- Correct auth.users.email varchar to the RPC text return contract.

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
