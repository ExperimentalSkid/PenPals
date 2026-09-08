-- GDPR data rights: authenticated exports, auditable downloads, and account erasure.
-- Export payloads are generated on demand and are never persisted in the database.

create table if not exists public.data_export_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  generated_at timestamptz not null default now(),
  downloaded_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days')
);

create index if not exists data_export_requests_user_requested_idx
  on public.data_export_requests (user_id, requested_at desc);

create table if not exists public.data_rights_audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  export_request_id uuid references public.data_export_requests(id) on delete set null,
  action text not null check (action in ('export_requested', 'export_downloaded')),
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists data_rights_audit_user_created_idx
  on public.data_rights_audit_log (user_id, created_at desc);

alter table public.data_export_requests enable row level security;
alter table public.data_rights_audit_log enable row level security;

create policy "Users read own export requests"
  on public.data_export_requests for select to authenticated
  using (user_id = auth.uid());

create policy "Users read own data rights audit"
  on public.data_rights_audit_log for select to authenticated
  using (user_id = auth.uid());

create or replace function public.list_my_avatar_paths()
returns text[]
language sql
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(array_agg(o.name order by o.created_at), array[]::text[])
    from storage.objects o
   where o.bucket_id = 'avatars'
     and (storage.foldername(o.name))[1] = auth.uid()::text;
$$;

revoke all on function public.list_my_avatar_paths() from public, anon, authenticated;
grant execute on function public.list_my_avatar_paths() to authenticated;

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
            'sender', case when m.sender_id = me then 'self' else 'other' end,
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

create or replace function public.record_data_export_download(export_request uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Authentication required';
  end if;
  update public.data_export_requests
     set downloaded_at = now()
   where id = export_request and user_id = me and expires_at > now();
  if not found then
    raise exception 'Data export is unavailable';
  end if;
  insert into public.data_rights_audit_log (user_id, export_request_id, action)
  values (me, export_request, 'export_downloaded');
end;
$$;

-- Account deletion intentionally removes all user-facing records and shared
-- conversations involving the account. Existing moderation/auth provider logs
-- are not part of this user-owned cascade and remain a documented retention gap.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  recent_sign_in timestamptz;
begin
  if me is null then
    raise exception 'Authentication required';
  end if;

  select u.last_sign_in_at into recent_sign_in from auth.users u where u.id = me;
  if recent_sign_in is null or recent_sign_in < now() - interval '15 minutes' then
    raise exception 'Please sign in again before deleting your account';
  end if;

  -- Remove report rows that would otherwise retain this account's target ID.
  delete from public.reports
   where reporter_id = me
      or target_profile_id = me
      or target_introduction_id in (
        select i.id from public.conversation_introductions i
         where i.sender_id = me or i.recipient_id = me
      )
      or target_message_id in (
        select m.id from public.messages m
         where exists (
           select 1 from public.conversation_participants cp
            where cp.conversation_id = m.conversation_id and cp.user_id = me
         )
      );

  -- Shared conversations are erased consistently with the account's messages.
  delete from public.conversations c
   where exists (
     select 1 from public.conversation_participants cp
      where cp.conversation_id = c.id and cp.user_id = me
   );

  -- The server action removes the physical objects through Storage first. This
  -- metadata cleanup is a defense-in-depth fallback for direct RPC callers.
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.objects o
   where o.bucket_id = 'avatars'
     and (storage.foldername(o.name))[1] = me::text;

  delete from public.profiles where id = me;
  delete from auth.users where id = me;
end;
$$;

revoke all on function public.create_data_export() from public, anon, authenticated;
grant execute on function public.create_data_export() to authenticated;
revoke all on function public.record_data_export_download(uuid) from public, anon, authenticated;
grant execute on function public.record_data_export_download(uuid) to authenticated;
revoke all on function public.delete_my_account() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
