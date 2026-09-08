-- Let the existing idempotency unique index handle concurrent retries.  The
-- send RPC catches that unique violation and returns the original letter;
-- the pair anti-spam rule must not turn a same-key retry into a false
-- "wait" response before the unique check can run.

create or replace function public.enforce_snail_mail_pair_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.client_idempotency_key is not null
     and exists (
       select 1
         from public.snail_mail_letters l
        where l.sender_id = new.sender_id
          and l.client_idempotency_key = new.client_idempotency_key
     ) then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'snail-mail-antispam:' || new.sender_id::text || ':' || new.recipient_id::text,
      0
    )
  );

  if exists (
    select 1
      from public.snail_mail_letters l
     where l.sender_id = new.sender_id
       and l.recipient_id = new.recipient_id
       and l.delivered_at is null
  ) then
    raise exception using
      errcode = 'check_violation',
      message = 'Please wait before sending another letter.';
  end if;

  if exists (
    select 1
      from public.snail_mail_letters l
     where l.sender_id = new.sender_id
       and l.recipient_id = new.recipient_id
       and l.delivered_at is not null
       and l.recipient_read_at is null
  ) then
    raise exception using
      errcode = 'check_violation',
      message = 'Please wait before sending another letter.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_snail_mail_pair_limit() from public, anon, authenticated;

