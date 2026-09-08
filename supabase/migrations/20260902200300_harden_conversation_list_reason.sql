create or replace function public.admin_list_user_conversations(
  target_user_id uuid,
  access_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  result jsonb := '[]'::jsonb;
  conversation_row record;
  participants jsonb;
  last_message_at timestamptz;
  clean_reason text := nullif(btrim(access_reason), '');
begin
  if not public.is_admin() then raise exception 'Administrator authorization required'; end if;
  if clean_reason is null or char_length(clean_reason) < 10 or char_length(clean_reason) > 200 then
    raise exception 'A meaningful review reason is required';
  end if;
  if not exists (select 1 from public.profiles where id = target_user_id) then return result; end if;
  for conversation_row in
    select c.id, c.created_at, c.updated_at from public.conversations c
    where exists (select 1 from public.conversation_participants cp where cp.conversation_id = c.id and cp.user_id = target_user_id)
    order by c.updated_at desc nulls last, c.created_at desc
  loop
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'display_name', p.display_name, 'birth_date', p.birth_date) order by p.display_name), '[]'::jsonb)
      into participants
      from public.conversation_participants cp join public.profiles p on p.id = cp.user_id where cp.conversation_id = conversation_row.id;
    select max(m.created_at) into last_message_at from public.messages m where m.conversation_id = conversation_row.id;
    insert into public.moderation_audit_log(moderator_id, target_user_id, action, metadata)
      values (auth.uid(), target_user_id, 'conversation_list', jsonb_build_object('conversation_id', conversation_row.id, 'reason', clean_reason, 'context', 'admin_user_detail_conversation_list'));
    result := result || jsonb_build_array(jsonb_build_object('id', conversation_row.id, 'created_at', conversation_row.created_at, 'updated_at', conversation_row.updated_at, 'last_message_at', last_message_at, 'participants', participants));
  end loop;
  return result;
end;
$$;
revoke all on function public.admin_list_user_conversations(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_list_user_conversations(uuid, text) to authenticated;
