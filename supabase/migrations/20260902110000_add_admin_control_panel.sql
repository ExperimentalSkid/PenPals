-- Admin-only operational views and actions. This does not broaden ordinary profile RLS.
alter table public.moderation_audit_log
  alter column report_id drop not null;

alter table public.moderation_audit_log
  add column if not exists target_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists moderation_audit_target_user_idx
  on public.moderation_audit_log(target_user_id, created_at desc);

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and deactivated_at is null
  )
$$;

revoke all on function public.is_admin() from public;

create or replace function public.admin_list_users(
  search_query text default null,
  status_filter text default 'all',
  role_filter text default 'all',
  completeness_filter text default 'all'
)
returns table (
  id uuid,
  username text,
  display_name text,
  birth_date date,
  gender text,
  country text,
  city text,
  role text,
  deactivated_at timestamptz,
  last_active_at timestamptz,
  created_at timestamptz,
  availability text,
  profile_visibility text,
  show_activity_status boolean,
  show_response_rate boolean,
  accepting_new_conversations boolean,
  profile_complete boolean,
  has_photo boolean
)
language sql
security definer
set search_path = public
as $$
  with profile_rows as (
    select
      p.id,
      p.username,
      p.display_name,
      p.birth_date,
      p.gender,
      p.country,
      p.city,
      p.role,
      p.deactivated_at,
      p.last_active_at,
      p.created_at,
      p.availability,
      p.profile_visibility,
      p.show_activity_status,
      p.show_response_rate,
      p.accepting_new_conversations,
      (
        nullif(trim(p.display_name), '') is not null
        and p.birth_date is not null
        and nullif(trim(p.gender), '') is not null
        and nullif(trim(p.country), '') is not null
        and nullif(trim(p.city), '') is not null
        and nullif(trim(p.bio), '') is not null
        and nullif(trim(p.quote), '') is not null
        and nullif(trim(p.looking_for), '') is not null
        and p.avatar_path is not null
        and exists (select 1 from public.profile_languages pl where pl.profile_id = p.id)
        and (select count(*) from public.profile_interests pi where pi.profile_id = p.id) >= 3
      ) as profile_complete,
      p.avatar_path is not null as has_photo
    from public.profiles p
  )
  select
    r.id,
    r.username,
    r.display_name,
    r.birth_date,
    r.gender,
    r.country,
    r.city,
    r.role,
    r.deactivated_at,
    r.last_active_at,
    r.created_at,
    r.availability,
    r.profile_visibility,
    r.show_activity_status,
    r.show_response_rate,
    r.accepting_new_conversations,
    r.profile_complete,
    r.has_photo
  from profile_rows r
  where public.is_admin()
    and (
      nullif(trim(search_query), '') is null
      or r.username ilike '%' || trim(search_query) || '%'
      or r.display_name ilike '%' || trim(search_query) || '%'
    )
    and (
      status_filter = 'all'
      or (status_filter = 'active' and r.deactivated_at is null)
      or (status_filter = 'deactivated' and r.deactivated_at is not null)
    )
    and (role_filter = 'all' or r.role = role_filter)
    and (
      completeness_filter = 'all'
      or (completeness_filter = 'complete' and r.profile_complete)
      or (completeness_filter = 'incomplete' and not r.profile_complete)
    )
  order by (r.deactivated_at is null) desc, r.last_active_at desc nulls last, r.created_at desc
$$;

revoke all on function public.admin_list_users(text, text, text, text) from public;
grant execute on function public.admin_list_users(text, text, text, text) to authenticated;

create or replace function public.admin_get_user_detail(target_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
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

  select jsonb_build_object(
    'profile', jsonb_build_object(
      'id', p.id,
      'username', p.username,
      'display_name', p.display_name,
      'birth_date', p.birth_date,
      'gender', p.gender,
      'country', p.country,
      'city', p.city,
      'bio', p.bio,
      'quote', p.quote,
      'looking_for', p.looking_for,
      'role', p.role,
      'deactivated_at', p.deactivated_at,
      'last_active_at', p.last_active_at,
      'created_at', p.created_at,
      'availability', p.availability,
      'profile_visibility', p.profile_visibility,
      'show_city', p.show_city,
      'show_activity_status', p.show_activity_status,
      'show_response_rate', p.show_response_rate,
      'accepting_new_conversations', p.accepting_new_conversations,
      'introduction_scope', p.introduction_scope,
      'profile_complete', (
        nullif(trim(p.display_name), '') is not null
        and p.birth_date is not null
        and nullif(trim(p.gender), '') is not null
        and nullif(trim(p.country), '') is not null
        and nullif(trim(p.city), '') is not null
        and nullif(trim(p.bio), '') is not null
        and nullif(trim(p.quote), '') is not null
        and nullif(trim(p.looking_for), '') is not null
        and p.avatar_path is not null
        and exists (select 1 from public.profile_languages pl where pl.profile_id = p.id)
        and (select count(*) from public.profile_interests pi where pi.profile_id = p.id) >= 3
      ),
      'has_photo', p.avatar_path is not null
    ),
    'languages', coalesce((
      select jsonb_agg(jsonb_build_object('name', l.name, 'proficiency', pl.proficiency, 'purpose', pl.purpose) order by l.name)
      from public.profile_languages pl
      join public.languages l on l.id = pl.language_id
      where pl.profile_id = p.id
    ), '[]'::jsonb),
    'interests', coalesce((
      select jsonb_agg(jsonb_build_object('name', i.name) order by i.name)
      from public.profile_interests pi
      join public.interests i on i.id = pi.interest_id
      where pi.profile_id = p.id
    ), '[]'::jsonb),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'target_type', r.target_type,
        'target_id', r.target_id,
        'reason', r.reason,
        'details', r.details,
        'status', r.status,
        'created_at', r.created_at
      ) order by r.created_at desc)
      from public.reports r
      where r.reporter_id = p.id
        or r.target_profile_id = p.id
        or r.target_introduction_id in (
          select i.id from public.conversation_introductions i
          where i.sender_id = p.id or i.recipient_id = p.id
        )
        or r.target_message_id in (
          select m.id from public.messages m
          where m.sender_id = p.id
             or exists (
               select 1 from public.conversation_participants cp
               where cp.conversation_id = m.conversation_id and cp.user_id = p.id
             )
        )
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'moderator_id', a.moderator_id,
        'report_id', a.report_id,
        'target_user_id', a.target_user_id,
        'action', a.action,
        'old_status', a.old_status,
        'new_status', a.new_status,
        'metadata', a.metadata,
        'created_at', a.created_at
      ) order by a.created_at desc)
      from public.moderation_audit_log a
      where a.target_user_id = p.id
        or a.report_id in (
          select r.id from public.reports r
          where r.reporter_id = p.id
            or r.target_profile_id = p.id
            or r.target_introduction_id in (
              select i.id from public.conversation_introductions i
              where i.sender_id = p.id or i.recipient_id = p.id
            )
            or r.target_message_id in (
              select m.id from public.messages m
              where m.sender_id = p.id
                 or exists (
                   select 1 from public.conversation_participants cp
                   where cp.conversation_id = m.conversation_id and cp.user_id = p.id
                 )
            )
        )
    ), '[]'::jsonb)
  ) into result
  from public.profiles p
  where p.id = target_user;

  return result;
end;
$$;

revoke all on function public.admin_get_user_detail(uuid) from public;
grant execute on function public.admin_get_user_detail(uuid) to authenticated;

create or replace function public.set_user_role(target_user uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_role text;
begin
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;
  if target_user = auth.uid() or new_role not in ('user', 'moderator', 'admin') then
    raise exception 'Invalid role change';
  end if;
  select role into old_role from public.profiles where id = target_user for update;
  if old_role is null then
    raise exception 'User not found';
  end if;
  if old_role = new_role then
    return;
  end if;
  perform set_config('app.allow_role_change', '1', true);
  update public.profiles set role = new_role where id = target_user;
  insert into public.moderation_audit_log(moderator_id, target_user_id, action, old_status, new_status, metadata)
    values (auth.uid(), target_user, 'role_change', old_role, new_role, jsonb_build_object('target_user_id', target_user));
end;
$$;

revoke all on function public.set_user_role(uuid, text) from public;
grant execute on function public.set_user_role(uuid, text) to authenticated;

create or replace function public.admin_set_account_status(target_user uuid, should_deactivate boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  was_deactivated boolean;
  new_state text;
begin
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;
  if target_user = auth.uid() then
    raise exception 'Administrators cannot change their own account status';
  end if;
  select (deactivated_at is not null) into was_deactivated from public.profiles where id = target_user for update;
  if was_deactivated is null then
    raise exception 'User not found';
  end if;
  if was_deactivated = should_deactivate then
    return;
  end if;
  if should_deactivate then
    update public.profiles set deactivated_at = now(), accepting_new_conversations = false where id = target_user;
    new_state := 'deactivated';
  else
    update public.profiles set deactivated_at = null, accepting_new_conversations = true where id = target_user;
    new_state := 'active';
  end if;
  insert into public.moderation_audit_log(moderator_id, target_user_id, action, old_status, new_status, metadata)
    values (auth.uid(), target_user, case when should_deactivate then 'deactivate_account' else 'reactivate_account' end, case when was_deactivated then 'deactivated' else 'active' end, new_state, jsonb_build_object('target_user_id', target_user));
end;
$$;

revoke all on function public.admin_set_account_status(uuid, boolean) from public;
grant execute on function public.admin_set_account_status(uuid, boolean) to authenticated;
