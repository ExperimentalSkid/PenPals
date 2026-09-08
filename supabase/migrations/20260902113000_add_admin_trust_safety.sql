-- Trust & safety extensions for the admin user detail view.
-- IP data is read from Supabase Auth's private audit log; it is never exposed
-- through ordinary profile queries or client-side keys.

create table if not exists public.profile_moderation_evidence (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  moderator_id uuid not null references public.profiles(id) on delete restrict,
  content_type text not null check (content_type in ('bio', 'quote', 'looking_for', 'avatar')),
  previous_value text,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists profile_moderation_evidence_target_idx
  on public.profile_moderation_evidence(target_user_id, created_at desc);

alter table public.profile_moderation_evidence enable row level security;

-- There are intentionally no ordinary-user policies. Evidence is only returned
-- by the admin-only RPC below, after the caller's role is checked.

create or replace function public.admin_log_user_detail_access(
  target_user_id uuid,
  access_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  clean_reason text := nullif(btrim(access_reason), '');
begin
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;
  if clean_reason is null or char_length(clean_reason) > 200 then
    raise exception 'A review reason is required';
  end if;
  if not exists (select 1 from public.profiles where id = target_user_id) then
    return;
  end if;

  insert into public.moderation_audit_log(
    moderator_id, target_user_id, action, metadata
  ) values (
    auth.uid(), target_user_id, 'user_detail_view',
    jsonb_build_object('reason', clean_reason, 'context', 'admin_user_detail')
  );
end;
$$;

revoke all on function public.admin_log_user_detail_access(uuid, text) from public;
grant execute on function public.admin_log_user_detail_access(uuid, text) to authenticated;

create or replace function public.admin_get_user_security_context(target_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;
  if not exists (select 1 from public.profiles where id = target_user) then
    return null;
  end if;

  -- Reading this private Auth audit data is itself an auditable action.
  insert into public.moderation_audit_log(
    moderator_id, target_user_id, action, metadata
  ) values (
    auth.uid(), target_user, 'security_context_view',
    jsonb_build_object('context', 'admin_user_detail')
  );

  with target_events as (
    select
      al.created_at,
      nullif(btrim(al.ip_address), '') as ip_address,
      lower(coalesce(al.payload ->> 'action', '')) as action
    from auth.audit_log_entries al
    where al.payload ->> 'actor_id' = target_user::text
      and nullif(btrim(al.ip_address), '') is not null
  ),
  target_ips as (
    select distinct ip_address from target_events
  ),
  other_accounts as (
    select distinct
      p.id,
      p.username,
      p.display_name,
      p.created_at,
      p.deactivated_at,
      (
        select count(*)
        from public.reports r
        where r.reporter_id = p.id
           or r.target_profile_id = p.id
           or exists (
             select 1 from public.conversation_introductions i
             where r.target_introduction_id = i.id
               and (i.sender_id = p.id or i.recipient_id = p.id)
           )
           or exists (
             select 1 from public.messages m
             where r.target_message_id = m.id
               and (m.sender_id = p.id or exists (
                 select 1 from public.conversation_participants cp
                 where cp.conversation_id = m.conversation_id and cp.user_id = p.id
               ))
      )) as report_count
    from auth.audit_log_entries al
    join public.profiles p on p.id::text = al.payload ->> 'actor_id'
    where nullif(btrim(al.ip_address), '') in (select ip_address from target_ips)
      and p.id <> target_user
  )
  select jsonb_build_object(
    'registration_ip', (
      select e.ip_address
      from target_events e
      where e.action in ('signup', 'user_signup', 'user_created', 'confirm_signup', 'user_confirmation')
      order by e.created_at asc
      limit 1
    ),
    'last_ip', (
      select e.ip_address
      from target_events e
      where e.action = 'login'
      order by e.created_at desc
      limit 1
    ),
    'ip_history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ip_address', e.ip_address,
        'action', e.action,
        'created_at', e.created_at
      ) order by e.created_at desc)
      from target_events e
    ), '[]'::jsonb),
    'other_accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'username', o.username,
        'display_name', o.display_name,
        'created_at', o.created_at,
        'deactivated_at', o.deactivated_at,
        'report_count', o.report_count
      ) order by o.created_at desc)
      from other_accounts o
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_get_user_security_context(uuid) from public;
grant execute on function public.admin_get_user_security_context(uuid) to authenticated;

create or replace function public.admin_get_profile_content_history(target_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;
  if not exists (select 1 from public.profiles where id = target_user) then
    return '[]'::jsonb;
  end if;

  insert into public.moderation_audit_log(
    moderator_id, target_user_id, action, metadata
  ) values (
    auth.uid(), target_user, 'profile_content_history_view',
    jsonb_build_object('context', 'admin_user_detail')
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'content_type', e.content_type,
    'previous_value', e.previous_value,
    'reason', e.reason,
    'moderator_id', e.moderator_id,
    'created_at', e.created_at
  ) order by e.created_at desc), '[]'::jsonb)
  into result
  from public.profile_moderation_evidence e
  where e.target_user_id = target_user;

  return result;
end;
$$;

revoke all on function public.admin_get_profile_content_history(uuid) from public;
grant execute on function public.admin_get_profile_content_history(uuid) to authenticated;

create or replace function public.admin_remove_profile_content(
  target_user uuid,
  content_type text,
  removal_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  clean_reason text := nullif(btrim(removal_reason), '');
  previous text;
  target_exists boolean;
begin
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;
  if target_user = auth.uid() then
    raise exception 'Administrators cannot remove their own profile content';
  end if;
  if content_type not in ('bio', 'quote', 'looking_for', 'avatar') then
    raise exception 'Unsupported profile content';
  end if;
  if clean_reason is null or char_length(clean_reason) > 500 then
    raise exception 'A moderation reason is required';
  end if;

  select true, case content_type
    when 'bio' then p.bio
    when 'quote' then p.quote
    when 'looking_for' then p.looking_for
    when 'avatar' then p.avatar_path
  end
  into target_exists, previous
  from public.profiles p
  where p.id = target_user
  for update;

  if not coalesce(target_exists, false) then
    raise exception 'User not found';
  end if;
  if previous is null or (content_type <> 'avatar' and btrim(previous) = '') then
    raise exception 'Profile content is already empty';
  end if;

  if content_type = 'bio' then
    update public.profiles set bio = '' where id = target_user;
  elsif content_type = 'quote' then
    update public.profiles set quote = '' where id = target_user;
  elsif content_type = 'looking_for' then
    update public.profiles set looking_for = '' where id = target_user;
  else
    -- Keep the object as private evidence. Clearing the profile pointer makes
    -- normal profile/storage access fail immediately without deleting evidence.
    update public.profiles set avatar_path = null where id = target_user;
  end if;

  insert into public.profile_moderation_evidence(
    target_user_id, moderator_id, content_type, previous_value, reason
  ) values (
    target_user, auth.uid(), content_type, previous, clean_reason
  );

  insert into public.moderation_audit_log(
    moderator_id, target_user_id, action, metadata
  ) values (
    auth.uid(), target_user, 'profile_content_removed',
    jsonb_build_object('content_type', content_type, 'reason', clean_reason)
  );

  return jsonb_build_object('content_type', content_type, 'removed', true);
end;
$$;

revoke all on function public.admin_remove_profile_content(uuid, text, text) from public;
grant execute on function public.admin_remove_profile_content(uuid, text, text) to authenticated;
