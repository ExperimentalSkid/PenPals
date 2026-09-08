-- Deleted participants must remain readable as an anonymized sender in the
-- surviving participant's export and in privileged, read-only review.

create or replace function public.create_data_export()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  export_request_id uuid;
  export_data jsonb;
begin
  if me is null then
    raise exception 'Authentication required';
  end if;

  if exists (
    select 1
      from public.data_export_requests r
     where r.user_id = me
       and r.requested_at > now() - interval '48 hours'
  ) then
    raise exception 'Data export can be requested once every 48 hours';
  end if;

  insert into public.data_export_requests (user_id)
  values (me)
  returning id into export_request_id;

  select jsonb_build_object(
    'exported_at', now(),
    'account', jsonb_build_object(
      'email', u.email,
      'created_at', u.created_at,
      'last_sign_in_at', u.last_sign_in_at
    ),
    'profile', coalesce((
      select jsonb_build_object(
        'username', p.username,
        'display_name', p.display_name,
        'birth_date', p.birth_date,
        'gender', p.gender,
        'country', p.country,
        'city', p.city,
        'bio', p.bio,
        'quote', p.quote,
        'looking_for', p.looking_for,
        'avatar_path', p.avatar_path,
        'created_at', p.created_at,
        'updated_at', p.updated_at
      ) from public.profiles p where p.id = me
    ), '{}'::jsonb),
    'settings', coalesce((
      select jsonb_build_object(
        'profile_visibility', p.profile_visibility,
        'show_city', p.show_city,
        'show_activity_status', p.show_activity_status,
        'show_response_rate', p.show_response_rate,
        'accepting_new_conversations', p.accepting_new_conversations,
        'introduction_scope', p.introduction_scope,
        'availability', p.availability,
        'deactivated_at', p.deactivated_at
      ) from public.profiles p where p.id = me
    ), '{}'::jsonb),
    'languages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'language', l.name,
        'proficiency', pl.proficiency,
        'purpose', pl.purpose
      ) order by l.name, pl.purpose)
        from public.profile_languages pl
        join public.languages l on l.id = pl.language_id
       where pl.profile_id = me
    ), '[]'::jsonb),
    'interests', coalesce((
      select jsonb_agg(i.name order by i.name)
        from public.profile_interests pi
        join public.interests i on i.id = pi.interest_id
       where pi.profile_id = me
    ), '[]'::jsonb),
    'introductions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'direction', case when i.sender_id = me then 'sent' else 'received' end,
        'body', i.body,
        'status', i.status,
        'created_at', i.created_at,
        'handled_at', i.handled_at,
        'expires_at', i.expires_at,
        'conversation_id', i.conversation_id_legacy
      ) order by i.created_at)
        from public.conversation_introductions i
       where i.sender_id = me or i.recipient_id = me
    ), '[]'::jsonb),
    'conversations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'created_at', c.created_at,
        'updated_at', c.updated_at,
        'messages', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', m.id,
            'sender', case
              when m.sender_id = me then 'self'
              when m.sender_id is null then 'Deleted user'
              else 'other'
            end,
            'body', m.body,
            'created_at', m.created_at
          ) order by m.created_at, m.id)
            from public.messages m
           where m.conversation_id = c.id
        ), '[]'::jsonb)
      ) order by c.created_at)
        from public.conversations c
       where exists (
         select 1 from public.conversation_participants cp
          where cp.conversation_id = c.id and cp.user_id = me
       )
    ), '[]'::jsonb),
    'notifications', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', n.type,
        'related_id', n.related_id,
        'created_at', n.created_at,
        'read_at', n.read_at
      ) order by n.created_at)
        from public.notifications n where n.user_id = me
    ), '[]'::jsonb),
    'photo_access', jsonb_build_object(
      'requests', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', r.id,
          'direction', case when r.requester_id = me then 'requested' else 'received' end,
          'conversation_id', r.conversation_id,
          'status', r.status,
          'created_at', r.created_at,
          'updated_at', r.updated_at
        ) order by r.created_at)
          from public.profile_photo_access_requests r
         where r.requester_id = me or r.owner_id = me
      ), '[]'::jsonb),
      'grants', coalesce((
        select jsonb_agg(jsonb_build_object(
          'direction', case when g.owner_id = me then 'granted_by_me' else 'granted_to_me' end,
          'granted_at', g.granted_at
        ) order by g.granted_at)
          from public.profile_photo_access_grants g
         where g.owner_id = me or g.viewer_id = me
      ), '[]'::jsonb)
    ),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'direction', case when b.blocker_id = me then 'blocked_by_me' else 'blocked_me' end,
        'created_at', b.created_at
      ) order by b.created_at)
        from public.profile_blocks b
       where b.blocker_id = me or b.blocked_id = me
    ), '[]'::jsonb),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'path', o.name,
        'created_at', o.created_at,
        'metadata', o.metadata
      ) order by o.created_at)
        from storage.objects o
       where o.bucket_id = 'avatars'
         and (storage.foldername(o.name))[1] = me::text
    ), '[]'::jsonb),
    'activity_security', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event', a.payload->>'action',
        'created_at', a.created_at,
        'ip_address', nullif(a.ip_address, '')
      ) order by a.created_at)
        from auth.audit_log_entries a
       where a.payload->>'actor_id' = me::text
    ), '[]'::jsonb),
    'reports_submitted', coalesce((
      select jsonb_agg(jsonb_build_object(
        'target_type', r.target_type,
        'reason', r.reason,
        'details', r.details,
        'created_at', r.created_at,
        'status', r.status
      ) order by r.created_at)
        from public.reports r where r.reporter_id = me
    ), '[]'::jsonb)
  )
  into export_data
  from auth.users u
  where u.id = me;

  insert into public.data_rights_audit_log (user_id, export_request_id, action)
  values (me, export_request_id, 'export_requested');

  return jsonb_build_object('request_id', export_request_id, 'data', export_data);
end;
$$;

revoke all on function public.create_data_export() from public, anon, authenticated;
grant execute on function public.create_data_export() to authenticated;

create or replace function public.admin_get_conversation_review(
  conversation_uuid uuid,
  target_user_id uuid default null,
  report_uuid uuid default null,
  access_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  admin_access boolean := public.is_admin();
  staff_access boolean := public.is_moderator();
  clean_reason text := nullif(btrim(access_reason), '');
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
        'id', cp.user_id,
        'username', case when p.id is null then null else p.username end,
        'display_name', coalesce(p.display_name, 'Deleted user'),
        'birth_date', p.birth_date,
        'deactivated', coalesce(p.deactivated_at is not null, false)
      ) order by coalesce(p.display_name, 'Deleted user'))
      from public.conversation_participants cp
      left join public.profiles p on p.id = cp.user_id
      where cp.conversation_id = c.id
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'sender_id', m.sender_id,
        'sender_username', case when p.id is null then null else p.username end,
        'sender_display_name', coalesce(p.display_name, 'Deleted user'),
        'body', m.body,
        'created_at', m.created_at
      ) order by m.created_at, m.id)
      from public.messages m
      left join public.profiles p on p.id = m.sender_id
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

revoke all on function public.admin_get_conversation_review(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_get_conversation_review(uuid, uuid, uuid, text) to authenticated;
