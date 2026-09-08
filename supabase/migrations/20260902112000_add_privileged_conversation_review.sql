-- Privileged conversation review is deliberately separate from ordinary message RLS.
-- Only the protected review functions below can read these records for staff.

create or replace function public.prevent_moderation_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Moderation audit log is immutable';
end;
$$;

revoke all on function public.prevent_moderation_audit_mutation() from public;
drop trigger if exists moderation_audit_immutable on public.moderation_audit_log;
create trigger moderation_audit_immutable
before update or delete on public.moderation_audit_log
for each row execute function public.prevent_moderation_audit_mutation();

create or replace function public.admin_list_user_conversations(
  target_user_id uuid,
  access_reason text default 'admin_user_detail'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb := '[]'::jsonb;
  conversation_row record;
  participants jsonb;
  last_message_at timestamptz;
  clean_reason text := nullif(trim(access_reason), '');
begin
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;
  if clean_reason is null or char_length(clean_reason) > 200 then
    raise exception 'A review reason is required';
  end if;
  if not exists (select 1 from public.profiles where id = target_user_id) then
    return result;
  end if;

  for conversation_row in
    select c.id, c.created_at, c.updated_at
    from public.conversations c
    where exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = c.id and cp.user_id = target_user_id
    )
    order by c.updated_at desc nulls last, c.created_at desc
  loop
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'username', p.username,
      'display_name', p.display_name,
      'birth_date', p.birth_date
    ) order by p.display_name), '[]'::jsonb)
      into participants
      from public.conversation_participants cp
      join public.profiles p on p.id = cp.user_id
      where cp.conversation_id = conversation_row.id;

    select max(m.created_at) into last_message_at
      from public.messages m
      where m.conversation_id = conversation_row.id;

    insert into public.moderation_audit_log(
      moderator_id, target_user_id, action, metadata
    ) values (
      auth.uid(), target_user_id, 'conversation_list', jsonb_build_object(
        'conversation_id', conversation_row.id,
        'reason', clean_reason,
        'context', 'admin_user_detail'
      )
    );

    result := result || jsonb_build_array(jsonb_build_object(
      'id', conversation_row.id,
      'created_at', conversation_row.created_at,
      'updated_at', conversation_row.updated_at,
      'last_message_at', last_message_at,
      'participants', participants
    ));
  end loop;

  return result;
end;
$$;

revoke all on function public.admin_list_user_conversations(uuid, text) from public;
grant execute on function public.admin_list_user_conversations(uuid, text) to authenticated;

create or replace function public.admin_get_conversation_review(
  conversation_uuid uuid,
  target_user_id uuid default null,
  report_uuid uuid default null,
  access_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_access boolean := public.is_admin();
  staff_access boolean := public.is_moderator();
  clean_reason text := nullif(trim(access_reason), '');
  report_type text;
  report_profile uuid;
  report_intro uuid;
  report_message uuid;
  effective_target uuid := target_user_id;
  intro_sender uuid;
  intro_recipient uuid;
  intro_conversation uuid;
  message_sender uuid;
  message_conversation uuid;
  result jsonb;
begin
  if not staff_access then
    raise exception 'Moderator authorization required';
  end if;
  if clean_reason is null or char_length(clean_reason) > 200 then
    raise exception 'A review reason is required';
  end if;
  if not admin_access and report_uuid is null then
    raise exception 'A report context is required';
  end if;
  if admin_access and target_user_id is null and report_uuid is null then
    raise exception 'A user or report context is required';
  end if;
  if not exists (select 1 from public.conversations where id = conversation_uuid) then
    return null;
  end if;
  if target_user_id is not null and not exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = conversation_uuid and cp.user_id = target_user_id
  ) then
    raise exception 'Conversation is outside the requested context';
  end if;

  if report_uuid is not null then
    select r.target_type, r.target_profile_id, r.target_introduction_id, r.target_message_id
      into report_type, report_profile, report_intro, report_message
      from public.reports r
      where r.id = report_uuid;
    if report_type is null then
      raise exception 'Report not found';
    end if;

    if report_type = 'profile' then
      if not exists (
        select 1 from public.conversation_participants cp
        where cp.conversation_id = conversation_uuid and cp.user_id = report_profile
      ) then
        raise exception 'Conversation is not tied to this report';
      end if;
      effective_target := coalesce(effective_target, report_profile);
    elsif report_type = 'introduction' then
      select i.sender_id, i.recipient_id, i.conversation_id_legacy
        into intro_sender, intro_recipient, intro_conversation
        from public.conversation_introductions i
        where i.id = report_intro;
      if intro_conversation is distinct from conversation_uuid then
        raise exception 'Conversation is not tied to this report';
      end if;
      effective_target := coalesce(effective_target, intro_sender, intro_recipient);
    elsif report_type = 'message' then
      select m.sender_id, m.conversation_id
        into message_sender, message_conversation
        from public.messages m
        where m.id = report_message;
      if message_conversation is distinct from conversation_uuid then
        raise exception 'Conversation is not tied to this report';
      end if;
      effective_target := coalesce(effective_target, message_sender);
    else
      raise exception 'Unsupported report target';
    end if;
  end if;

  if effective_target is not null and not exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = conversation_uuid and cp.user_id = effective_target
  ) then
    raise exception 'Conversation is outside the requested context';
  end if;

  select jsonb_build_object(
    'conversation', jsonb_build_object(
      'id', c.id,
      'created_at', c.created_at,
      'updated_at', c.updated_at
    ),
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'username', p.username,
        'display_name', p.display_name,
        'birth_date', p.birth_date,
        'deactivated', p.deactivated_at is not null
      ) order by p.display_name)
      from public.conversation_participants cp
      join public.profiles p on p.id = cp.user_id
      where cp.conversation_id = c.id
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'sender_id', m.sender_id,
        'sender_username', p.username,
        'sender_display_name', p.display_name,
        'body', m.body,
        'created_at', m.created_at
      ) order by m.created_at, m.id)
      from public.messages m
      join public.profiles p on p.id = m.sender_id
      where m.conversation_id = c.id
    ), '[]'::jsonb)
  ) into result
  from public.conversations c
  where c.id = conversation_uuid;

  insert into public.moderation_audit_log(
    moderator_id, report_id, target_user_id, action, metadata
  ) values (
    auth.uid(), report_uuid, effective_target, 'conversation_review', jsonb_build_object(
      'conversation_id', conversation_uuid,
      'reason', clean_reason,
      'context', case when report_uuid is null then 'admin_user_detail' else 'moderation_report' end,
      'report_id', report_uuid
    )
  );

  return result;
end;
$$;

revoke all on function public.admin_get_conversation_review(uuid, uuid, uuid, text) from public;
grant execute on function public.admin_get_conversation_review(uuid, uuid, uuid, text) to authenticated;
