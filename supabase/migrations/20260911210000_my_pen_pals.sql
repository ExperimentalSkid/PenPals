create or replace function public.get_my_pen_pals()
returns table(
  conversation_id uuid,
  pen_pal_id uuid,
  username text,
  display_name text,
  age integer,
  avatar_path text,
  connected_at timestamptz,
  sent_count bigint,
  received_count bigint,
  last_contact_at timestamptz,
  unread boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with mine as (
    select cp.conversation_id, cp.last_read_at, c.created_at
    from public.conversation_participants cp
    join public.conversations c on c.id = cp.conversation_id
    where cp.user_id = auth.uid()
  ), pairs as (
    select mine.conversation_id,
           mine.last_read_at,
           mine.created_at,
           other.user_id as pen_pal_id
    from mine
    join lateral (
      select cp.user_id
      from public.conversation_participants cp
      where cp.conversation_id = mine.conversation_id
        and cp.user_id <> auth.uid()
      limit 1
    ) other on true
  )
  select pairs.conversation_id,
         pairs.pen_pal_id,
         identity.username,
         identity.display_name,
         identity.age,
         identity.avatar_path,
         pairs.created_at,
         coalesce(msg.sent_count, 0) + coalesce(mail.sent_count, 0),
         coalesce(msg.received_count, 0) + coalesce(mail.received_count, 0),
         greatest(msg.last_contact_at, mail.last_contact_at),
         coalesce(msg.unread, false) or coalesce(mail.unread, false)
  from pairs
  join lateral public.resolve_profile_identity(pairs.pen_pal_id) identity on true
  left join lateral (
    select count(*) filter (where m.sender_id = auth.uid())::bigint as sent_count,
           count(*) filter (where m.sender_id = pairs.pen_pal_id)::bigint as received_count,
           max(m.created_at) as last_contact_at,
           coalesce(bool_or(m.sender_id = pairs.pen_pal_id and (pairs.last_read_at is null or m.created_at > pairs.last_read_at)), false) as unread
    from public.messages m
    where m.conversation_id = pairs.conversation_id
  ) msg on true
  left join lateral (
    select count(*) filter (where l.sender_id = auth.uid())::bigint as sent_count,
           count(*) filter (where l.sender_id = pairs.pen_pal_id)::bigint as received_count,
           max(l.sent_at) as last_contact_at,
           coalesce(bool_or(l.recipient_id = auth.uid() and l.delivered_at is not null and l.recipient_read_at is null), false) as unread
    from public.snail_mail_letters l
    where l.conversation_id = pairs.conversation_id
      and (l.sender_id = auth.uid() or l.recipient_id = auth.uid())
  ) mail on true
  where auth.uid() is not null
    and public.is_email_verified()
    and not exists (
      select 1 from public.profile_blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = pairs.pen_pal_id)
         or (b.blocker_id = pairs.pen_pal_id and b.blocked_id = auth.uid())
    )
  order by greatest(msg.last_contact_at, mail.last_contact_at) desc nulls last, pairs.created_at desc;
$$;

revoke all on function public.get_my_pen_pals() from public, anon;
grant execute on function public.get_my_pen_pals() to authenticated;
