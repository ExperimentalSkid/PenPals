-- Make admin IP security context read the IP source Supabase Auth actually persists.
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

  insert into public.moderation_audit_log(
    moderator_id, target_user_id, action, metadata
  ) values (
    auth.uid(), target_user, 'security_context_view',
    jsonb_build_object('context', 'admin_user_detail')
  );

  with session_events as (
    select
      s.created_at,
      host(s.ip)::text as ip_address,
      'login'::text as action
    from auth.sessions s
    where s.user_id = target_user
      and s.ip is not null
      and s.ip <> '127.0.0.1'::inet
      and s.ip <> '::1'::inet
  ),  audit_events as (
    select
      al.created_at,
      nullif(btrim(al.ip_address), '') as ip_address,
      lower(coalesce(al.payload ->> 'action', '')) as action
    from auth.audit_log_entries al
    where al.payload ->> 'actor_id' = target_user::text
      and nullif(btrim(al.ip_address), '') is not null
  ),
  target_events as (
    select * from session_events
    union all
    select * from audit_events
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
           )
      ) as report_count
    from auth.sessions s
    join public.profiles p on p.id = s.user_id
    where s.ip is not null
      and host(s.ip)::text in (select ip_address from target_ips)
      and p.id <> target_user
  )  select jsonb_build_object(
    'registration_ip', coalesce(
      (select e.ip_address from session_events e order by e.created_at asc limit 1),
      (select e.ip_address
         from audit_events e
        where e.action in (
          'signup', 'user_signup', 'user_signedup', 'user_created',
          'confirm_signup', 'user_confirmation'
        )
        order by e.created_at asc
        limit 1)
    ),
    'last_ip', (
      select e.ip_address
      from session_events e
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
