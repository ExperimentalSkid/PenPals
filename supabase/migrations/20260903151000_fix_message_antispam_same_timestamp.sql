-- Reply resets are based on insertion order.  PostgreSQL's now() is stable
-- within a transaction, so UUID ordering cannot reliably distinguish messages
-- created in the same transaction (notably an introduction reply).  Use the
-- latest other-message timestamp as the durable reset boundary; ordinary
-- client sends are separate transactions and therefore receive distinct
-- timestamps.

create or replace function public.enforce_message_consecutive_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  latest_other_created_at timestamptz;
  unanswered_count integer;
begin
  if me is null or new.sender_id is distinct from me then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('message-antispam:' || new.conversation_id::text, 0)
  );

  select m.created_at
    into latest_other_created_at
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
       latest_other_created_at is null
       or m.created_at > latest_other_created_at
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

