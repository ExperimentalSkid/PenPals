-- Allow up to three private image attachments on a Snail Mail letter.
-- Recipients cannot discover or retrieve attachment metadata until the letter's ETA has arrived.

create table if not exists public.snail_mail_attachments (
  id uuid primary key default gen_random_uuid(),
  letter_id uuid not null references public.snail_mail_letters(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique check (char_length(btrim(storage_path)) between 3 and 500),
  file_name text not null check (char_length(btrim(file_name)) between 1 and 200),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 5242880),
  created_at timestamptz not null default now()
);

create index if not exists snail_mail_attachments_letter_idx
  on public.snail_mail_attachments(letter_id, created_at asc);

alter table public.snail_mail_attachments enable row level security;
revoke all on table public.snail_mail_attachments from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'snail-mail-attachments',
  'snail-mail-attachments',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload Snail Mail attachments" on storage.objects;
create policy "Users upload Snail Mail attachments" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'snail-mail-attachments'
  and public.is_email_verified()
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users delete own Snail Mail attachment uploads" on storage.objects;
create policy "Users delete own Snail Mail attachment uploads" on storage.objects
for delete to authenticated
using (
  bucket_id = 'snail-mail-attachments'
  and public.is_email_verified()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.send_snail_mail_with_attachments(
  target_conversation uuid,
  letter_body text,
  idempotency_key uuid default null,
  p_attachments jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  letter_uuid uuid;
  attachment jsonb;
  attachment_path text;
  attachment_name text;
  attachment_type text;
  attachment_size bigint;
begin
  if me is null or not public.is_email_verified() then
    raise exception 'Authentication required';
  end if;
  if jsonb_typeof(coalesce(p_attachments, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) > 3 then
    raise exception 'A Snail Mail letter can include up to 3 photos';
  end if;

  for attachment in select value from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
    if jsonb_typeof(attachment) <> 'object' then
      raise exception 'Invalid Snail Mail attachment';
    end if;
    attachment_path := btrim(coalesce(attachment->>'storage_path', ''));
    attachment_name := btrim(coalesce(attachment->>'file_name', ''));
    attachment_type := lower(btrim(coalesce(attachment->>'mime_type', '')));
    begin
      attachment_size := (attachment->>'size_bytes')::bigint;
    exception when invalid_text_representation then
      raise exception 'Invalid Snail Mail attachment size';
    end;
    if split_part(attachment_path, '/', 1) <> me::text
       or not exists (
         select 1 from storage.objects
          where bucket_id = 'snail-mail-attachments' and name = attachment_path
       ) then
      raise exception 'Invalid Snail Mail attachment path';
    end if;
    if char_length(attachment_name) < 1 or char_length(attachment_name) > 200
       or attachment_type not in ('image/jpeg', 'image/png', 'image/webp')
       or attachment_size is null or attachment_size <= 0 or attachment_size > 5242880 then
      raise exception 'Invalid Snail Mail attachment';
    end if;
  end loop;

  letter_uuid := public.send_snail_mail(target_conversation, letter_body, idempotency_key);

  if (select count(*) from public.snail_mail_attachments where letter_id = letter_uuid)
       + jsonb_array_length(coalesce(p_attachments, '[]'::jsonb)) > 3 then
    raise exception 'A Snail Mail letter can include up to 3 photos';
  end if;

  for attachment in select value from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
    insert into public.snail_mail_attachments(letter_id, uploaded_by, storage_path, file_name, mime_type, size_bytes)
    values (
      letter_uuid,
      me,
      btrim(attachment->>'storage_path'),
      btrim(attachment->>'file_name'),
      lower(btrim(attachment->>'mime_type')),
      (attachment->>'size_bytes')::bigint
    );
  end loop;

  return letter_uuid;
end;
$$;

revoke all on function public.send_snail_mail_with_attachments(uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.send_snail_mail_with_attachments(uuid, text, uuid, jsonb) to authenticated;

create or replace function public.list_snail_mail_attachments(target_conversation uuid)
returns table (
  id uuid,
  letter_id uuid,
  file_name text,
  mime_type text,
  size_bytes bigint
)
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  other_user uuid;
begin
  if me is null or not public.is_email_verified()
     or not exists (
       select 1 from public.conversation_participants
        where conversation_id = target_conversation and user_id = me
     )
     or exists (select 1 from public.profiles p where p.id = me and p.deactivated_at is not null) then
    raise exception 'Conversation unavailable';
  end if;

  select cp.user_id into other_user
    from public.conversation_participants cp
   where cp.conversation_id = target_conversation and cp.user_id <> me
   limit 1;

  if other_user is null
     or exists (select 1 from public.profiles p where p.id = other_user and p.deactivated_at is not null)
     or exists (
       select 1 from public.profile_blocks b
        where (b.blocker_id = me and b.blocked_id = other_user)
           or (b.blocker_id = other_user and b.blocked_id = me)
     ) then
    return;
  end if;

  return query
  select a.id, a.letter_id, a.file_name, a.mime_type, a.size_bytes
    from public.snail_mail_attachments a
    join public.snail_mail_letters l on l.id = a.letter_id
   where l.conversation_id = target_conversation
     and (
       l.sender_id = me
       or (l.recipient_id = me and l.cancelled_at is null and l.deliver_at <= now())
     )
   order by a.created_at asc;
end;
$$;

revoke all on function public.list_snail_mail_attachments(uuid) from public, anon;
grant execute on function public.list_snail_mail_attachments(uuid) to authenticated;

create or replace function public.get_snail_mail_attachment_path(attachment_uuid uuid)
returns text
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  attachment_path text;
begin
  if me is null or not public.is_email_verified() then
    return null;
  end if;

  select a.storage_path into attachment_path
    from public.snail_mail_attachments a
    join public.snail_mail_letters l on l.id = a.letter_id
   where a.id = attachment_uuid
     and exists (
       select 1 from public.conversation_participants cp
        where cp.conversation_id = l.conversation_id and cp.user_id = me
     )
     and not exists (select 1 from public.profiles p where p.id = me and p.deactivated_at is not null)
     and not exists (
       select 1 from public.profile_blocks b
        where (b.blocker_id = l.sender_id and b.blocked_id = l.recipient_id)
           or (b.blocker_id = l.recipient_id and b.blocked_id = l.sender_id)
     )
     and (
       l.sender_id = me
       or (l.recipient_id = me and l.cancelled_at is null and l.deliver_at <= now())
     )
   limit 1;

  return attachment_path;
end;
$$;

revoke all on function public.get_snail_mail_attachment_path(uuid) from public, anon;
grant execute on function public.get_snail_mail_attachment_path(uuid) to authenticated;
