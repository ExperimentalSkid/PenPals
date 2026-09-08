-- A case-specific retention hold must preserve only the account's affected
-- evidence.  Category-wide holds and enabled policies remain category-wide;
-- record-scoped holds do not cause unrelated accounts to be retained.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  recent_sign_in timestamptz;
  conversation_id uuid;
  report_ids uuid[];
  keep_evidence boolean;
  keep_audit boolean;
begin
  if me is null then
    raise exception 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('penpal-account-delete:' || me::text, 0));

  select u.last_sign_in_at
    into recent_sign_in
    from auth.users u
   where u.id = me
   for update;
  if not found then
    raise exception 'Authentication required';
  end if;
  if recent_sign_in is null or recent_sign_in < now() - interval '15 minutes' then
    raise exception 'Please sign in again before deleting your account';
  end if;

  for conversation_id in
    select distinct cp.conversation_id
      from public.conversation_participants cp
     where cp.user_id = me
  loop
    perform 1 from public.conversations c where c.id = conversation_id for update;
  end loop;

  select coalesce(array_agg(r.id), array[]::uuid[])
    into report_ids
    from public.reports r
   where r.target_profile_id = me
      or r.target_introduction_id in (
        select i.id from public.conversation_introductions i
         where i.sender_id = me or i.recipient_id = me
      )
      or r.target_message_id in (
        select m.id from public.messages m where m.sender_id = me
      );

  insert into public.account_storage_deletion_outbox(path)
  select o.name
    from storage.objects o
   where o.bucket_id = 'avatars'
     and (storage.foldername(o.name))[1] = me::text
  on conflict (path) do nothing;

  keep_evidence := public.retention_policy_enabled('moderation_evidence')
    or exists (
      select 1 from public.data_retention_holds h
       where h.category = 'moderation_evidence'
         and h.released_at is null
         and h.started_at <= now()
         and (
           h.record_id is null
           or h.record_id = any(report_ids)
           or exists (
             select 1 from public.profile_moderation_evidence e
              where e.id = h.record_id and e.target_user_id = me
           )
         )
    );
  keep_audit := public.retention_policy_enabled('moderation_audit')
    or exists (
      select 1 from public.data_retention_holds h
       where h.category = 'moderation_audit'
         and h.released_at is null
         and h.started_at <= now()
         and (
           h.record_id is null
           or exists (
             select 1 from public.moderation_audit_log a
              where a.id = h.record_id
                and (
                  a.moderator_id = me
                  or a.target_user_id = me
                  or a.report_id = any(report_ids)
                )
           )
         )
    );

  if keep_evidence then
    update public.reports r
       set target_id = null,
           target_profile_id = null,
           target_introduction_id = null,
           target_message_id = null,
           details = case when r.details is null then null else '[redacted after account deletion]' end,
           redacted_at = now(),
           updated_at = now()
     where r.id = any(report_ids);
    delete from public.reports where reporter_id = me;
  else
    delete from public.reports r
     where r.reporter_id = me
        or r.id = any(report_ids);
  end if;

  if keep_evidence then
    update public.profile_moderation_evidence
       set target_user_id = null,
           previous_value = null,
           reason = 'Redacted after account deletion'
     where target_user_id = me;
  else
    delete from public.profile_moderation_evidence where target_user_id = me;
  end if;

  if keep_audit then
    update public.moderation_audit_log
       set moderator_id = null,
           target_user_id = null,
           metadata = jsonb_build_object('redacted_after_account_deletion', true)
     where moderator_id = me
        or target_user_id = me
        or report_id = any(report_ids);
  else
    delete from public.moderation_audit_log
     where moderator_id = me
        or target_user_id = me
        or report_id = any(report_ids);
  end if;

  delete from public.conversation_introductions
   where sender_id = me or recipient_id = me;
  delete from public.direct_conversation_pairs
   where user_a = me or user_b = me;
  delete from public.profile_photo_access_requests
   where requester_id = me or owner_id = me;
  delete from public.profile_photo_access_grants
   where owner_id = me or viewer_id = me;

  delete from public.conversation_participants where user_id = me;
  delete from public.conversations c
   where not exists (
     select 1 from public.conversation_participants cp
      where cp.conversation_id = c.id
   );

  delete from public.profiles where id = me;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
