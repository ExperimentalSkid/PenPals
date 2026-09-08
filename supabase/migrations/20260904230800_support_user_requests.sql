-- Owner-scoped support request projections for the user-facing request history.
-- Support tables remain inaccessible directly; these functions expose only the
-- authenticated requester's own ticket metadata and never message contents.

create or replace function public.get_my_support_tickets()
returns table (
  id uuid,
  ticket_number bigint,
  ticket_code text,
  subject text,
  category text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or not public.is_email_verified() then
    raise exception 'Verified account required';
  end if;

  return query
  select t.id,
         t.ticket_number,
         ('SUP-' || t.ticket_number)::text,
         t.subject,
         t.category,
         t.status,
         t.created_at,
         t.updated_at
    from public.support_tickets t
   where t.requester_id = me
   order by t.updated_at desc, t.id desc;
end;
$$;

revoke all on function public.get_my_support_tickets() from public, anon, authenticated;
grant execute on function public.get_my_support_tickets() to authenticated;

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
    'updated_at', t.updated_at
  ) into result
    from public.support_tickets t
   where t.id = ticket_uuid
     and t.requester_id = me;

  return result;
end;
$$;

revoke all on function public.get_my_support_ticket(uuid) from public, anon, authenticated;
grant execute on function public.get_my_support_ticket(uuid) to authenticated;
