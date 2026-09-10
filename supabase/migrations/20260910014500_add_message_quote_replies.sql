alter table public.messages
  add column if not exists reply_to_message_id uuid
  references public.messages(id) on delete set null;

create index if not exists messages_reply_to_message_id_idx
  on public.messages (reply_to_message_id)
  where reply_to_message_id is not null;

create or replace function public.validate_message_reply_target()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.reply_to_message_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.messages original
    where original.id = new.reply_to_message_id
      and original.conversation_id = new.conversation_id
  ) then
    raise exception 'Reply target must belong to the same conversation';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_message_reply_target on public.messages;
create trigger validate_message_reply_target
before insert or update of conversation_id, reply_to_message_id
on public.messages
for each row execute function public.validate_message_reply_target();
