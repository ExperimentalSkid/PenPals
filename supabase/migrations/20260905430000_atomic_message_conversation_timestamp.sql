-- Keep conversation activity metadata in the same transaction as the message.
-- Ordinary members may insert authorized messages, but cannot update arbitrary
-- conversation columns. A second client UPDATE therefore cannot maintain this.
create or replace function public.touch_message_conversation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.conversations c
     set updated_at = greatest(c.updated_at, new.created_at)
   where c.id = new.conversation_id
     and c.updated_at < new.created_at;
  return new;
end;
$$;

revoke all on function public.touch_message_conversation() from public, anon, authenticated;

create trigger messages_touch_conversation
after insert on public.messages
for each row execute function public.touch_message_conversation();

-- Repair previously stale metadata without changing messages or moving any
-- timestamp backwards. Other conversation activity timestamps remain intact.
update public.conversations c
   set updated_at = latest.created_at
  from (
    select conversation_id, max(created_at) as created_at
      from public.messages
     group by conversation_id
  ) latest
 where c.id = latest.conversation_id
   and c.updated_at < latest.created_at;
