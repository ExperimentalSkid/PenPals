-- Owner-scoped support conversation projection. Internal staff notes are
-- filtered in the security-definer function and never reach user routes.

drop policy if exists "Users read support attachments" on storage.objects;
create policy "Users read support attachments" on storage.objects
for select to authenticated
using (
  bucket_id = 'support-attachments'
  and public.is_email_verified()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.get_my_support_ticket(ticket_uuid uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  result jsonb;
begin
  if me is null or not public.is_email_verified() then
    raise exception 'Verified account required';
  end if;

  select jsonb_build_object(
    'id', t.id,
    'ticket_number', t.ticket_number,
    'ticket_code', 'SUP-' || t.ticket_number,
    'subject', t.subject,
    'category', t.category,
    'status', t.status,
    'created_at', t.created_at,
    'updated_at', t.updated_at,
    'messages', coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id,
      'author_name', case when m.author_id = me then 'You' else 'Support team' end,
      'body', m.body,
      'created_at', m.created_at
    ) order by m.created_at asc)
      from public.support_ticket_messages m
     where m.ticket_id = t.id
       and not m.is_internal), '[]'::jsonb),
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
   where t.id = ticket_uuid
     and t.requester_id = me;

  return result;
end;
$$;

revoke all on function public.get_my_support_ticket(uuid) from public, anon, authenticated;
grant execute on function public.get_my_support_ticket(uuid) to authenticated;
