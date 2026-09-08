-- Communication anti-spam guards.
--
-- These guards live at the database boundary so retries, multiple tabs and
-- direct RPC/table attempts cannot bypass the limits.  They do not count
-- failed writes: only rows that have successfully been inserted are visible
-- to the checks below.

create or replace function public.enforce_message_consecutive_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  latest_other_created_at timestamptz;
  latest_other_id uuid;
  unanswered_count integer;
begin
  -- Database-owned maintenance writes do not have an end-user JWT.  Normal
  -- client writes are authenticated by RLS and therefore always take this
  -- path with me populated.
  if me is null or new.sender_id is distinct from me then
    return new;
  end if;

  -- Serialize sends in one conversation.  Without this lock two tabs could
  -- both observe a streak of two and insert a fourth message concurrently.
  perform pg_advisory_xact_lock(
    hashtextextended('message-antispam:' || new.conversation_id::text, 0)
  );

  select m.created_at, m.id
    into latest_other_created_at, latest_other_id
    from public.messages m
   where m.conversation_id = new.conversation_id
     and m.sender_id <> me
   order by m.created_at desc, m.id desc
   limit 1;

  select count(*)::integer
    into unanswered_count
    from public.messages m
   where m.conversation_id = new.conversation_id
     and m.sender_id = me
     and (
       latest_other_id is null
       or (m.created_at, m.id) > (latest_other_created_at, latest_other_id)
     );

  if unanswered_count >= 3 then
    raise exception using
      errcode = 'check_violation',
      message = 'Wait for a reply before sending another message.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_message_consecutive_limit() from public, anon, authenticated;

drop trigger if exists messages_consecutive_limit_guard on public.messages;
create trigger messages_consecutive_limit_guard
before insert on public.messages
for each row execute function public.enforce_message_consecutive_limit();

create index if not exists snail_mail_sender_recipient_state_idx
  on public.snail_mail_letters(sender_id, recipient_id, delivered_at, recipient_read_at, deliver_at);

create or replace function public.enforce_snail_mail_pair_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Pair-scoped locking makes the rule safe across concurrent tabs and does
  -- not impose a global one-letter limit.
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

  -- Once delivered, keep the pair from stacking unanswered letters until the
  -- recipient opens the previous letter.  The existing recipient_read_at
  -- state is the durable acknowledgement already used by Snail Mail.
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

drop trigger if exists snail_mail_pair_limit_guard on public.snail_mail_letters;
create trigger snail_mail_pair_limit_guard
before insert on public.snail_mail_letters
for each row execute function public.enforce_snail_mail_pair_limit();
