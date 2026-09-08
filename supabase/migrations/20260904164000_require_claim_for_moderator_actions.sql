-- Keep moderator mutations aligned with the case lease. Administrators retain
-- their existing ability to work a case without claiming it.
create or replace function public.request_admin_moderation_review(case_uuid uuid, request_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  clean_reason text := nullif(btrim(request_reason), '');
  item public.moderation_cases;
begin
  if not public.is_moderator() then raise exception 'Moderator authorization required'; end if;
  if clean_reason is null or char_length(clean_reason) > 500 then
    raise exception 'An escalation reason is required (1–500 characters)';
  end if;
  select * into item from public.moderation_cases where id = case_uuid for update;
  if item.id is null then raise exception 'Case not found'; end if;
  if item.status in ('resolved', 'dismissed') then raise exception 'Closed cases cannot be escalated'; end if;
  if not public.is_admin() and not exists (
    select 1 from public.moderation_cases c
     where c.id = case_uuid
       and c.assigned_staff_id = auth.uid()
       and c.claim_expires_at is not null
       and c.claim_expires_at > now()
       and c.status not in ('resolved', 'dismissed')
  ) then
    raise exception 'An active moderation case assignment is required';
  end if;
  if item.needs_admin_review then return; end if;
  update public.moderation_cases
     set needs_admin_review = true,
         admin_review_requested_at = now(),
         admin_review_requested_by = auth.uid(),
         updated_at = now()
   where id = case_uuid;
  insert into public.moderation_audit_log (moderator_id, case_id, target_user_id, action, metadata)
  values (auth.uid(), item.id, item.subject_user_id, 'case_admin_attention_requested', jsonb_build_object('reason', clean_reason));
end;
$$;

revoke all on function public.request_admin_moderation_review(uuid, text) from public, anon, authenticated;
grant execute on function public.request_admin_moderation_review(uuid, text) to authenticated;

create or replace function public.resolve_moderation_content_flag(flag_uuid uuid, resolution text, resolution_reason text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  item public.moderation_content_flags;
  clean_reason text := nullif(btrim(resolution_reason), '');
begin
  if not public.is_moderator() then raise exception 'Moderator authorization required'; end if;
  if resolution not in ('cleared','confirmed') or clean_reason is null or char_length(clean_reason) > 500 then
    raise exception 'A resolution and reason are required';
  end if;
  select * into item from public.moderation_content_flags where id = flag_uuid for update;
  if item.id is null then raise exception 'Flag not found'; end if;
  if not public.is_admin() and not exists (
    select 1 from public.moderation_cases c
     where c.id = item.case_id
       and c.assigned_staff_id = auth.uid()
       and c.claim_expires_at is not null
       and c.claim_expires_at > now()
       and c.status not in ('resolved', 'dismissed')
  ) then
    raise exception 'An active moderation case assignment is required';
  end if;
  update public.moderation_content_flags
     set status = resolution,
         cleared_at = now(),
         cleared_by = auth.uid(),
         resolution_reason = clean_reason
   where id = flag_uuid;
  perform public.refresh_moderation_content_state(item.target_type, item.target_id);
  insert into public.moderation_audit_log(moderator_id, case_id, target_user_id, action, metadata)
    values (auth.uid(), item.case_id, item.target_user_id,
            case when resolution = 'cleared' then 'automated_flag_cleared' else 'automated_flag_confirmed' end,
            jsonb_build_object('flag_id', item.id, 'reason', clean_reason, 'target_type', item.target_type, 'target_id', item.target_id));
end;
$$;

revoke all on function public.resolve_moderation_content_flag(uuid, text, text) from public, anon, authenticated;
grant execute on function public.resolve_moderation_content_flag(uuid, text, text) to authenticated;

create or replace function public.add_moderation_case_note(case_uuid uuid, note_text text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  note_id uuid;
  clean_note text := nullif(btrim(note_text), '');
  subject uuid;
begin
  if not public.is_moderator() then raise exception 'Moderator authorization required'; end if;
  if clean_note is null or char_length(clean_note) > 4000 then raise exception 'A case note is required'; end if;
  select subject_user_id into subject from public.moderation_cases where id = case_uuid;
  if not found then raise exception 'Case not found'; end if;
  if not public.is_admin() and not exists (
    select 1 from public.moderation_cases c
     where c.id = case_uuid
       and c.assigned_staff_id = auth.uid()
       and c.claim_expires_at is not null
       and c.claim_expires_at > now()
       and c.status not in ('resolved', 'dismissed')
  ) then
    raise exception 'An active moderation case assignment is required';
  end if;
  insert into public.moderation_case_notes(case_id, author_id, note)
    values (case_uuid, auth.uid(), clean_note)
    returning id into note_id;
  insert into public.moderation_audit_log(moderator_id, case_id, target_user_id, action, metadata)
    values (auth.uid(), case_uuid, subject, 'case_note_added', jsonb_build_object('note_id', note_id));
  return note_id;
end;
$$;

revoke all on function public.add_moderation_case_note(uuid, text) from public, anon, authenticated;
grant execute on function public.add_moderation_case_note(uuid, text) to authenticated;
