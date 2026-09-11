-- Snail Mail attachment lifecycle and sensitive-content consent.
-- Photos expire after active recipient time: 30 days after delivery if unread,
-- or 14 days after reading. Voluntary inactive mode freezes the clock.

alter table public.snail_mail_attachments
  add column if not exists sensitive_content boolean not null default false,
  add column if not exists expires_at timestamptz,
  add column if not exists retention_paused_at timestamptz;

-- Backfill any attachments created before this lifecycle migration.
update public.snail_mail_attachments a
   set expires_at = case
         when l.recipient_read_at is not null then l.recipient_read_at + interval '14 days'
         when l.delivered_at is not null then l.delivered_at + interval '30 days'
         else null
       end,
       retention_paused_at = case
         when p.inactive_mode and (l.recipient_read_at is not null or l.delivered_at is not null) then now()
         else null
       end
  from public.snail_mail_letters l
  join public.profiles p on p.id = l.recipient_id
 where a.letter_id = l.id and a.expires_at is null;

create table if not exists public.snail_mail_attachment_reveals (
  letter_id uuid not null references public.snail_mail_letters(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  revealed_at timestamptz not null default now(),
  primary key (letter_id, viewer_id)
);
alter table public.snail_mail_attachment_reveals enable row level security;
revoke all on table public.snail_mail_attachment_reveals from public, anon, authenticated;

create table if not exists public.snail_mail_attachment_deletion_outbox (
  id uuid primary key default gen_random_uuid(),
  attachment_id uuid,
  storage_path text not null unique,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
alter table public.snail_mail_attachment_deletion_outbox enable row level security;
revoke all on table public.snail_mail_attachment_deletion_outbox from public, anon, authenticated;

create or replace function public.set_snail_mail_attachment_retention()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if old.delivered_at is null and new.delivered_at is not null then
    update public.snail_mail_attachments a
       set expires_at = new.delivered_at + interval '30 days',
           retention_paused_at = case when p.inactive_mode then new.delivered_at else null end
      from public.profiles p
     where a.letter_id = new.id and p.id = new.recipient_id;
  end if;
  if old.recipient_read_at is null and new.recipient_read_at is not null then
    update public.snail_mail_attachments
       set expires_at = new.recipient_read_at + interval '14 days'
     where letter_id = new.id;
  end if;
  if old.cancelled_at is null and new.cancelled_at is not null then
    insert into public.snail_mail_attachment_deletion_outbox(attachment_id, storage_path)
    select a.id, a.storage_path from public.snail_mail_attachments a where a.letter_id = new.id
    on conflict (storage_path) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.set_snail_mail_attachment_retention() from public, anon, authenticated;
drop trigger if exists snail_mail_attachment_retention_lifecycle on public.snail_mail_letters;
create trigger snail_mail_attachment_retention_lifecycle after update of delivered_at, recipient_read_at, cancelled_at on public.snail_mail_letters
for each row execute function public.set_snail_mail_attachment_retention();

create or replace function public.freeze_snail_mail_attachment_retention()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if new.inactive_mode is distinct from old.inactive_mode then
    if new.inactive_mode then
      update public.snail_mail_attachments a set retention_paused_at = now()
       from public.snail_mail_letters l
       where a.letter_id = l.id and l.recipient_id = new.id
         and a.expires_at is not null and a.retention_paused_at is null;
    else
      update public.snail_mail_attachments a
         set expires_at = a.expires_at + (now() - a.retention_paused_at), retention_paused_at = null
        from public.snail_mail_letters l
       where a.letter_id = l.id and l.recipient_id = new.id and a.retention_paused_at is not null;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.freeze_snail_mail_attachment_retention() from public, anon, authenticated;
drop trigger if exists snail_mail_attachment_retention_pause on public.profiles;
create trigger snail_mail_attachment_retention_pause after update of inactive_mode on public.profiles
for each row execute function public.freeze_snail_mail_attachment_retention();

create or replace function public.enqueue_deleted_snail_mail_attachment()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  insert into public.snail_mail_attachment_deletion_outbox(attachment_id, storage_path)
  values (old.id, old.storage_path) on conflict (storage_path) do nothing;
  return old;
end;
$$;
revoke all on function public.enqueue_deleted_snail_mail_attachment() from public, anon, authenticated;
drop trigger if exists snail_mail_attachment_delete_enqueue on public.snail_mail_attachments;
create trigger snail_mail_attachment_delete_enqueue before delete on public.snail_mail_attachments
for each row execute function public.enqueue_deleted_snail_mail_attachment();

create or replace function public.enqueue_expired_snail_mail_attachments(batch_size integer default 100)
returns integer language plpgsql security definer set search_path = pg_catalog, public as $$
declare inserted_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  insert into public.snail_mail_attachment_deletion_outbox(attachment_id, storage_path)
  select a.id, a.storage_path
    from public.snail_mail_attachments a
    join public.snail_mail_letters l on l.id = a.letter_id
    join public.profiles p on p.id = l.recipient_id
   where a.expires_at is not null and a.expires_at <= now()
     and a.retention_paused_at is null and not p.inactive_mode
   order by a.expires_at asc limit greatest(1, least(coalesce(batch_size,100),500))
  on conflict (storage_path) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
revoke all on function public.enqueue_expired_snail_mail_attachments(integer) from public, anon, authenticated;
grant execute on function public.enqueue_expired_snail_mail_attachments(integer) to service_role;

create or replace function public.claim_snail_mail_attachment_deletion_batch(batch_size integer default 100)
returns table(id uuid, attachment_id uuid, path text) language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  return query
  with picked as (
    select o.id from public.snail_mail_attachment_deletion_outbox o
     where o.next_attempt_at <= now() and (o.claimed_at is null or o.claimed_at < now() - interval '10 minutes')
     order by o.created_at asc for update skip locked limit greatest(1, least(coalesce(batch_size,100),500))
  ), updated as (
    update public.snail_mail_attachment_deletion_outbox o set claimed_at = now()
     from picked where o.id = picked.id returning o.id, o.attachment_id, o.storage_path
  ) select updated.id, updated.attachment_id, updated.storage_path from updated;
end;
$$;
revoke all on function public.claim_snail_mail_attachment_deletion_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_snail_mail_attachment_deletion_batch(integer) to service_role;

create or replace function public.complete_snail_mail_attachment_deletion_batch(completed_ids uuid[])
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  delete from public.snail_mail_attachments a using public.snail_mail_attachment_deletion_outbox o
   where o.id = any(coalesce(completed_ids, array[]::uuid[])) and a.id = o.attachment_id;
  delete from public.snail_mail_attachment_deletion_outbox where id = any(coalesce(completed_ids, array[]::uuid[]));
end;
$$;
revoke all on function public.complete_snail_mail_attachment_deletion_batch(uuid[]) from public, anon, authenticated;
grant execute on function public.complete_snail_mail_attachment_deletion_batch(uuid[]) to service_role;

create or replace function public.fail_snail_mail_attachment_deletion_batch(failed_ids uuid[], cleanup_error text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required'; end if;
  update public.snail_mail_attachment_deletion_outbox
     set claimed_at=null, attempts=attempts+1, last_error=left(coalesce(cleanup_error,'cleanup failed'),500),
         next_attempt_at=now() + make_interval(mins => least(60, greatest(1, attempts + 1) * 5))
   where id = any(coalesce(failed_ids, array[]::uuid[]));
end;
$$;
revoke all on function public.fail_snail_mail_attachment_deletion_batch(uuid[], text) from public, anon, authenticated;
grant execute on function public.fail_snail_mail_attachment_deletion_batch(uuid[], text) to service_role;

create or replace function public.reveal_snail_mail_attachments(letter_uuid uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare me uuid := auth.uid();
begin
  if me is null or not public.is_email_verified() then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.snail_mail_letters l
     where l.id = letter_uuid and l.recipient_id = me and l.cancelled_at is null and l.deliver_at <= now()
  ) then raise exception 'Letter unavailable'; end if;
  insert into public.snail_mail_attachment_reveals(letter_id, viewer_id) values(letter_uuid, me)
  on conflict(letter_id,viewer_id) do nothing;
end;
$$;
revoke all on function public.reveal_snail_mail_attachments(uuid) from public, anon;
grant execute on function public.reveal_snail_mail_attachments(uuid) to authenticated;

-- Replace attachment projections to expose sensitivity state while hiding expired files.
drop function if exists public.list_snail_mail_attachments(uuid);
create function public.list_snail_mail_attachments(target_conversation uuid)
returns table (id uuid, letter_id uuid, file_name text, mime_type text, size_bytes bigint, sensitive_content boolean, revealed boolean)
language plpgsql security definer stable set search_path = pg_catalog, public as $$
declare me uuid := auth.uid(); other_user uuid;
begin
  if me is null or not public.is_email_verified()
     or not exists(select 1 from public.conversation_participants where conversation_id=target_conversation and user_id=me)
     or exists(select 1 from public.profiles p where p.id=me and p.deactivated_at is not null) then raise exception 'Conversation unavailable'; end if;
  select cp.user_id into other_user from public.conversation_participants cp where cp.conversation_id=target_conversation and cp.user_id<>me limit 1;
  if other_user is null or exists(select 1 from public.profile_blocks b where (b.blocker_id=me and b.blocked_id=other_user) or (b.blocker_id=other_user and b.blocked_id=me)) then return; end if;
  return query select a.id,a.letter_id,a.file_name,a.mime_type,a.size_bytes,a.sensitive_content,
    (not a.sensitive_content or l.sender_id=me or exists(select 1 from public.snail_mail_attachment_reveals r where r.letter_id=l.id and r.viewer_id=me))
    from public.snail_mail_attachments a join public.snail_mail_letters l on l.id=a.letter_id
   where l.conversation_id=target_conversation
     and (a.expires_at is null or a.retention_paused_at is not null or a.expires_at>now())
     and (l.sender_id=me or (l.recipient_id=me and l.cancelled_at is null and l.deliver_at<=now()))
   order by a.created_at asc;
end;
$$;
revoke all on function public.list_snail_mail_attachments(uuid) from public, anon;
grant execute on function public.list_snail_mail_attachments(uuid) to authenticated;

create or replace function public.get_snail_mail_attachment_path(attachment_uuid uuid)
returns text language plpgsql security definer stable set search_path = pg_catalog, public as $$
declare me uuid := auth.uid(); attachment_path text;
begin
  if me is null or not public.is_email_verified() then return null; end if;
  select a.storage_path into attachment_path from public.snail_mail_attachments a
  join public.snail_mail_letters l on l.id=a.letter_id
  where a.id=attachment_uuid
    and (a.expires_at is null or a.retention_paused_at is not null or a.expires_at>now())
    and exists(select 1 from public.conversation_participants cp where cp.conversation_id=l.conversation_id and cp.user_id=me)
    and not exists(select 1 from public.profiles p where p.id=me and p.deactivated_at is not null)
    and not exists(select 1 from public.profile_blocks b where (b.blocker_id=l.sender_id and b.blocked_id=l.recipient_id) or (b.blocker_id=l.recipient_id and b.blocked_id=l.sender_id))
    and (l.sender_id=me or (l.recipient_id=me and l.cancelled_at is null and l.deliver_at<=now()
      and (not a.sensitive_content or exists(select 1 from public.snail_mail_attachment_reveals r where r.letter_id=l.id and r.viewer_id=me))));
  return attachment_path;
end;
$$;
revoke all on function public.get_snail_mail_attachment_path(uuid) from public, anon;
grant execute on function public.get_snail_mail_attachment_path(uuid) to authenticated;

drop function if exists public.send_snail_mail_with_attachments(uuid, text, uuid, jsonb);
create function public.send_snail_mail_with_attachments(
  target_conversation uuid, letter_body text, idempotency_key uuid default null,
  p_attachments jsonb default '[]'::jsonb, p_sensitive_content boolean default false
) returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare me uuid:=auth.uid(); letter_uuid uuid; attachment jsonb; attachment_path text; attachment_name text; attachment_type text; attachment_size bigint;
begin
  if me is null or not public.is_email_verified() then raise exception 'Authentication required'; end if;
  if jsonb_typeof(coalesce(p_attachments,'[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_attachments,'[]'::jsonb))>3 then raise exception 'A Snail Mail letter can include up to 3 photos'; end if;
  for attachment in select value from jsonb_array_elements(coalesce(p_attachments,'[]'::jsonb)) loop
    if jsonb_typeof(attachment)<>'object' then raise exception 'Invalid Snail Mail attachment'; end if;
    attachment_path:=btrim(coalesce(attachment->>'storage_path','')); attachment_name:=btrim(coalesce(attachment->>'file_name','')); attachment_type:=lower(btrim(coalesce(attachment->>'mime_type','')));
    begin attachment_size:=(attachment->>'size_bytes')::bigint; exception when invalid_text_representation then raise exception 'Invalid Snail Mail attachment size'; end;
    if split_part(attachment_path,'/',1)<>me::text or not exists(select 1 from storage.objects where bucket_id='snail-mail-attachments' and name=attachment_path) then raise exception 'Invalid Snail Mail attachment path'; end if;
    if char_length(attachment_name)<1 or char_length(attachment_name)>200 or attachment_type not in('image/jpeg','image/png','image/webp') or attachment_size is null or attachment_size<=0 or attachment_size>5242880 then raise exception 'Invalid Snail Mail attachment'; end if;
  end loop;
  letter_uuid:=public.send_snail_mail(target_conversation,letter_body,idempotency_key);
  if (select count(*) from public.snail_mail_attachments where letter_id=letter_uuid)+jsonb_array_length(coalesce(p_attachments,'[]'::jsonb))>3 then raise exception 'A Snail Mail letter can include up to 3 photos'; end if;
  for attachment in select value from jsonb_array_elements(coalesce(p_attachments,'[]'::jsonb)) loop
    insert into public.snail_mail_attachments(letter_id,uploaded_by,storage_path,file_name,mime_type,size_bytes,sensitive_content)
    values(letter_uuid,me,btrim(attachment->>'storage_path'),btrim(attachment->>'file_name'),lower(btrim(attachment->>'mime_type')),(attachment->>'size_bytes')::bigint,coalesce(p_sensitive_content,false));
  end loop;
  return letter_uuid;
end;
$$;
revoke all on function public.send_snail_mail_with_attachments(uuid,text,uuid,jsonb,boolean) from public, anon;
grant execute on function public.send_snail_mail_with_attachments(uuid,text,uuid,jsonb,boolean) to authenticated;
