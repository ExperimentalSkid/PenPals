-- Start the unread-photo lifecycle from the letter ETA snapshot itself so
-- retention does not depend on the delivery worker having already stamped delivered_at.

drop function if exists public.send_snail_mail_with_attachments(uuid,text,uuid,jsonb,boolean);
create function public.send_snail_mail_with_attachments(
  target_conversation uuid, letter_body text, idempotency_key uuid default null,
  p_attachments jsonb default '[]'::jsonb, p_sensitive_content boolean default false
) returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare me uuid:=auth.uid(); letter_uuid uuid; attachment jsonb; attachment_path text; attachment_name text; attachment_type text; attachment_size bigint; letter_expiry timestamptz;
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
  select l.deliver_at + interval '30 days' into letter_expiry from public.snail_mail_letters l where l.id=letter_uuid;
  if (select count(*) from public.snail_mail_attachments where letter_id=letter_uuid)+jsonb_array_length(coalesce(p_attachments,'[]'::jsonb))>3 then raise exception 'A Snail Mail letter can include up to 3 photos'; end if;
  for attachment in select value from jsonb_array_elements(coalesce(p_attachments,'[]'::jsonb)) loop
    insert into public.snail_mail_attachments(letter_id,uploaded_by,storage_path,file_name,mime_type,size_bytes,sensitive_content,expires_at)
    values(letter_uuid,me,btrim(attachment->>'storage_path'),btrim(attachment->>'file_name'),lower(btrim(attachment->>'mime_type')),(attachment->>'size_bytes')::bigint,coalesce(p_sensitive_content,false),letter_expiry);
  end loop;
  return letter_uuid;
end;
$$;
revoke all on function public.send_snail_mail_with_attachments(uuid,text,uuid,jsonb,boolean) from public, anon;
grant execute on function public.send_snail_mail_with_attachments(uuid,text,uuid,jsonb,boolean) to authenticated;

-- Repair any attachment that somehow still lacks a clock once its ETA exists.
update public.snail_mail_attachments a
   set expires_at = l.deliver_at + interval '30 days'
  from public.snail_mail_letters l
 where a.letter_id = l.id and a.expires_at is null;
