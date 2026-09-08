-- Staff-only support attachment projection. The ticket detail page receives
-- metadata server-side and turns each path into a short-lived signed URL.

create or replace function public.staff_get_support_ticket(ticket_uuid uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  result jsonb;
begin
  if not public.is_moderator() then
    raise exception 'Moderator authorization required';
  end if;

  select jsonb_build_object(
    'ticket', jsonb_build_object(
      'id', t.id,
      'ticket_number', t.ticket_number,
      'ticket_code', 'SUP-' || t.ticket_number,
      'ticket_type', t.ticket_type,
      'subject', t.subject,
      'category', t.category,
      'status', t.status,
      'priority', t.priority,
      'created_at', t.created_at,
      'updated_at', t.updated_at,
      'resolved_at', t.resolved_at,
      'requester', case when t.requester_id is null then null else jsonb_build_object(
        'id', t.requester_id, 'username', requester.username, 'display_name', requester.display_name
      ) end,
      'assigned_staff', case when t.assigned_staff_id is null then null else jsonb_build_object(
        'id', t.assigned_staff_id, 'display_name', assigned.display_name
      ) end
    ),
    'messages', coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id,
      'author_id', m.author_id,
      'author_name', coalesce(author.display_name, author.username, 'Former account'),
      'body', m.body,
      'is_internal', m.is_internal,
      'created_at', m.created_at
    ) order by m.created_at asc)
      from public.support_ticket_messages m
      left join public.profiles author on author.id = m.author_id
     where m.ticket_id = t.id), '[]'::jsonb),
    'attachments', coalesce((select jsonb_agg(jsonb_build_object(
      'id', a.id,
      'storage_path', a.storage_path,
      'file_name', a.file_name,
      'mime_type', a.mime_type,
      'size_bytes', a.size_bytes,
      'created_at', a.created_at
    ) order by a.created_at asc)
      from public.support_ticket_attachments a
     where a.ticket_id = t.id), '[]'::jsonb)
  ) into result
    from public.support_tickets t
    left join public.profiles requester on requester.id = t.requester_id
    left join public.profiles assigned on assigned.id = t.assigned_staff_id
   where t.id = ticket_uuid;

  return result;
end;
$$;

revoke all on function public.staff_get_support_ticket(uuid) from public, anon, authenticated;
grant execute on function public.staff_get_support_ticket(uuid) to authenticated;
