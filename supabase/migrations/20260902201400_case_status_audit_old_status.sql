create or replace function public.set_moderation_case_status(
  case_uuid uuid,
  new_status text,
  resolution text default null,
  status_reason text default null
)
returns public.moderation_cases
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  updated_case public.moderation_cases;
  previous_status text;
  clean_reason text := nullif(btrim(status_reason), '');
begin
  if not public.is_moderator() then
    raise exception 'Moderator authorization required';
  end if;
  if new_status not in ('new','triage','investigating','waiting','resolved','dismissed') then
    raise exception 'Invalid case status';
  end if;
  if clean_reason is null or char_length(clean_reason) > 500 then
    raise exception 'A status reason is required';
  end if;

  select status into previous_status
    from public.moderation_cases
   where id = case_uuid
   for update;
  if previous_status is null then
    raise exception 'Case not found';
  end if;

  update public.moderation_cases
     set status = new_status,
         resolution_category = nullif(btrim(resolution), ''),
         resolved_at = case when new_status in ('resolved','dismissed') then coalesce(resolved_at, now()) else null end,
         updated_at = now()
   where id = case_uuid
   returning * into updated_case;

  insert into public.moderation_audit_log(
    moderator_id, case_id, target_user_id, action, old_status, new_status, metadata
  ) values (
    auth.uid(), case_uuid, updated_case.subject_user_id, 'case_status_change',
    previous_status, new_status,
    jsonb_build_object('reason', clean_reason, 'resolution_category', resolution)
  );
  return updated_case;
end;
$$;

revoke all on function public.set_moderation_case_status(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.set_moderation_case_status(uuid, text, text, text) to authenticated;
