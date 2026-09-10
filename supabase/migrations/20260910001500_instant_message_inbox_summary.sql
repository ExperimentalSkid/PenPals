create or replace function public.get_instant_message_inbox()
returns table(
  conversation_id uuid,
  other_user_id uuid,
  other_username text,
  other_display_name text,
  other_age integer,
  other_avatar_path text,
  latest_body text,
  latest_created_at timestamptz,
  latest_sender_id uuid,
  unread boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select mine.conversation_id,
         other_participant.user_id,
         identity.username,
         identity.display_name,
         identity.age,
         identity.avatar_path,
         latest.body,
         latest.created_at,
         latest.sender_id,
         coalesce(latest.sender_id <> auth.uid() and (mine.last_read_at is null or latest.created_at > mine.last_read_at), false)
  from public.conversation_participants mine
  join public.conversations c on c.id = mine.conversation_id
  left join lateral (
    select cp.user_id
    from public.conversation_participants cp
    where cp.conversation_id = mine.conversation_id
      and cp.user_id <> auth.uid()
    limit 1
  ) other_participant on true
  left join lateral public.resolve_profile_identity(other_participant.user_id) identity on true
  left join lateral (
    select m.body, m.created_at, m.sender_id
    from public.messages m
    where m.conversation_id = mine.conversation_id
    order by m.created_at desc
    limit 1
  ) latest on true
  where mine.user_id = auth.uid()
    and public.is_email_verified()
    and coalesce(c.communication_mode, 'instant') <> 'snail_mail'
  order by latest.created_at desc nulls last;
$$;

revoke all on function public.get_instant_message_inbox() from public, anon;
grant execute on function public.get_instant_message_inbox() to authenticated;
