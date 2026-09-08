-- Authenticated users can submit a support request without gaining direct
-- access to the staff-owned support tables. Attachments stay in a private
-- bucket and are linked atomically with the ticket record.

create table if not exists public.support_ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  uploaded_by uuid references public.profiles(id) on delete set null,
  storage_path text not null unique check (char_length(btrim(storage_path)) between 3 and 500),
  file_name text not null check (char_length(btrim(file_name)) between 1 and 200),
  mime_type text not null check (char_length(btrim(mime_type)) between 1 and 120),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at timestamptz not null default now()
);

create index if not exists support_ticket_attachments_ticket_idx
  on public.support_ticket_attachments(ticket_id, created_at asc);

alter table public.support_ticket_attachments enable row level security;
revoke all on table public.support_ticket_attachments from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain']::text[]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload support attachments" on storage.objects;
create policy "Users upload support attachments" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'support-attachments'
  and public.is_email_verified()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users delete support attachments" on storage.objects;
create policy "Users delete support attachments" on storage.objects
for delete to authenticated
using (
  bucket_id = 'support-attachments'
  and public.is_email_verified()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Staff inspect support attachments" on storage.objects;
create policy "Staff inspect support attachments" on storage.objects
for select to authenticated
using (
  bucket_id = 'support-attachments'
  and public.is_moderator()
);

create or replace function public.submit_support_ticket(
  p_category text,
  p_subject text,
  p_description text,
  p_attachments jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  clean_category text := lower(btrim(coalesce(p_category, '')));
  clean_subject text := btrim(coalesce(p_subject, ''));
  clean_description text := btrim(coalesce(p_description, ''));
  ticket_id uuid;
  attachment jsonb;
  attachment_path text;
  attachment_name text;
  attachment_type text;
  attachment_size bigint;
begin
  if me is null or not public.is_email_verified() then
    raise exception 'Verified account required';
  end if;

  if exists (select 1 from public.profiles where id = me and deactivated_at is not null) then
    raise exception 'Account unavailable';
  end if;

  if clean_category not in ('account_access', 'profile', 'communication', 'snail_mail', 'privacy_safety', 'bug_report', 'feedback', 'other') then
    raise exception 'Invalid support category';
  end if;
  if char_length(clean_subject) < 3 or char_length(clean_subject) > 200 then
    raise exception 'Support subject must be 3 to 200 characters';
  end if;
  if char_length(clean_description) < 10 or char_length(clean_description) > 4000 then
    raise exception 'Support description must be 10 to 4000 characters';
  end if;
  if jsonb_typeof(coalesce(p_attachments, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) > 3 then
    raise exception 'You can attach up to 3 files';
  end if;

  for attachment in select value from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
    if jsonb_typeof(attachment) <> 'object' then
      raise exception 'Invalid support attachment';
    end if;
    attachment_path := btrim(coalesce(attachment->>'storage_path', ''));
    attachment_name := btrim(coalesce(attachment->>'file_name', ''));
    attachment_type := lower(btrim(coalesce(attachment->>'mime_type', '')));
    begin
      attachment_size := (attachment->>'size_bytes')::bigint;
    exception when invalid_text_representation then
      raise exception 'Invalid support attachment size';
    end;
    if split_part(attachment_path, '/', 1) <> me::text
       or not exists (select 1 from storage.objects where bucket_id = 'support-attachments' and name = attachment_path) then
      raise exception 'Invalid support attachment path';
    end if;
    if char_length(attachment_name) < 1 or char_length(attachment_name) > 200
       or attachment_type not in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain')
       or attachment_size is null or attachment_size <= 0 or attachment_size > 10485760 then
      raise exception 'Invalid support attachment';
    end if;
  end loop;

  insert into public.support_tickets (subject, requester_id, category, status, priority)
  values (clean_subject, me, clean_category, 'open', 'normal')
  returning id into ticket_id;

  insert into public.support_ticket_messages (ticket_id, author_id, body, is_internal)
  values (ticket_id, me, clean_description, false);

  for attachment in select value from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
    insert into public.support_ticket_attachments (ticket_id, uploaded_by, storage_path, file_name, mime_type, size_bytes)
    values (
      ticket_id,
      me,
      btrim(attachment->>'storage_path'),
      btrim(attachment->>'file_name'),
      lower(btrim(attachment->>'mime_type')),
      (attachment->>'size_bytes')::bigint
    );
  end loop;

  return ticket_id;
end;
$$;

revoke all on function public.submit_support_ticket(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_support_ticket(text, text, text, jsonb) to authenticated;
