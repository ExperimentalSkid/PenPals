-- First-class investigations for serious Contact Inbox matters.
-- Ordinary contact tickets remain outside moderation unless an administrator explicitly escalates them.

create table if not exists public.contact_investigations (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references public.support_tickets(id) on delete cascade,
  status text not null default 'open' check (status in ('open','investigating','resolved')),
  reason text not null check (char_length(btrim(reason)) between 1 and 2000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.contact_investigations enable row level security;
revoke all on table public.contact_investigations from public, anon, authenticated;

create index if not exists contact_investigations_status_idx
  on public.contact_investigations(status, updated_at desc);

drop trigger if exists contact_investigations_updated_at on public.contact_investigations;
create trigger contact_investigations_updated_at
before update on public.contact_investigations
for each row execute function public.set_updated_at();

create or replace function public.admin_escalate_contact_investigation(
  ticket_uuid uuid,
  escalation_reason text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  clean_reason text := nullif(btrim(escalation_reason), '');
  investigation_id uuid;
  hold_id uuid;
  evidence_hash text;
begin
  if not public.is_admin() then raise exception 'Administrator authorization required'; end if;
  if clean_reason is null or char_length(clean_reason) > 2000 then raise exception 'An escalation reason is required'; end if;
  if not exists (select 1 from public.support_tickets t where t.id = ticket_uuid and t.ticket_type = 'public_contact') then
    raise exception 'Contact ticket not found';
  end if;

  select i.id into investigation_id from public.contact_investigations i where i.ticket_id = ticket_uuid;
  if investigation_id is not null then return investigation_id; end if;

  insert into public.contact_investigations(ticket_id, reason, created_by)
  values(ticket_uuid, clean_reason, auth.uid()) returning id into investigation_id;

  select h.id into hold_id
    from public.data_retention_holds h
   where h.category = 'contact_evidence' and h.record_id = ticket_uuid and h.released_at is null
   order by h.started_at desc limit 1;
  if hold_id is null then
    insert into public.data_retention_holds(category, record_id, reason, authorized_by)
    values('contact_evidence', ticket_uuid, 'Active Contact investigation: ' || clean_reason, auth.uid())
    returning id into hold_id;
  end if;

  select e.sha256 into evidence_hash from public.contact_submission_evidence e where e.ticket_id = ticket_uuid;

  insert into public.moderation_audit_log(moderator_id, action, metadata)
  values(auth.uid(), 'contact_investigation_escalated', jsonb_build_object(
    'ticket_id', ticket_uuid,
    'investigation_id', investigation_id,
    'hold_id', hold_id,
    'sha256', evidence_hash,
    'reason', clean_reason
  ));

  return investigation_id;
end;
$$;

revoke all on function public.admin_escalate_contact_investigation(uuid,text) from public, anon, authenticated;
grant execute on function public.admin_escalate_contact_investigation(uuid,text) to authenticated;

create or replace function public.admin_get_contact_investigation(ticket_uuid uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'Administrator authorization required'; end if;
  select jsonb_build_object(
    'id', i.id,
    'ticket_id', i.ticket_id,
    'status', i.status,
    'reason', i.reason,
    'created_by', i.created_by,
    'created_at', i.created_at,
    'updated_at', i.updated_at,
    'resolved_at', i.resolved_at
  ) into result from public.contact_investigations i where i.ticket_id = ticket_uuid;
  return result;
end;
$$;

revoke all on function public.admin_get_contact_investigation(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_contact_investigation(uuid) to authenticated;
