-- GDPR export supplement.  This is a self-only, server-side projection of
-- access information that is safe to include without exposing reporters,
-- moderator identities, or protected moderation evidence.
create or replace function public.get_my_data_export_supplement()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  result jsonb;
begin
  if me is null then
    raise exception 'Authentication required';
  end if;

  select jsonb_build_object(
    'account', jsonb_build_object(
      'role', p.role,
      'status', case when p.deactivated_at is null then 'active' else 'deactivated' end,
      'deactivated_at', p.deactivated_at
    ),
    'settings', jsonb_build_object(
      'country_exclusion_codes', coalesce((
        select jsonb_agg(e.country_code order by e.country_code)
          from public.profile_introduction_country_exclusions e
         where e.profile_id = p.id
      ), '[]'::jsonb)
    ),
    'reports_about', coalesce((
      select jsonb_agg(jsonb_build_object(
        'target_type', r.target_type,
        'reason', r.reason,
        'status', r.status,
        'created_at', r.created_at,
        'updated_at', r.updated_at,
        'details', case when r.details is null then null else '[redacted to protect reporter and third-party rights]' end,
        'details_redacted', r.details is not null
      ) order by r.created_at)
        from public.reports r
       where r.target_profile_id = me
          or r.target_introduction_id in (
            select i.id
              from public.conversation_introductions i
             where i.sender_id = me or i.recipient_id = me
          )
          or r.target_message_id in (
            select m.id
              from public.messages m
             where m.sender_id = me
                or exists (
                  select 1
                    from public.conversation_participants cp
                   where cp.conversation_id = m.conversation_id
                     and cp.user_id = me
                )
          )
    ), '[]'::jsonb),
    'moderation', jsonb_build_object(
      'actions_about_account', coalesce((
        select jsonb_agg(jsonb_build_object(
          'action', a.action,
          'old_status', a.old_status,
          'new_status', a.new_status,
          'created_at', a.created_at,
          'metadata', '[redacted protected moderation context]'
        ) order by a.created_at)
          from public.moderation_audit_log a
         where a.target_user_id = me
      ), '[]'::jsonb),
      'profile_content_evidence', coalesce((
        select jsonb_agg(jsonb_build_object(
          'content_type', e.content_type,
          'created_at', e.created_at,
          'previous_value', '[redacted protected moderation evidence]',
          'reason', '[redacted protected moderation evidence]'
        ) order by e.created_at)
          from public.profile_moderation_evidence e
         where e.target_user_id = me
      ), '[]'::jsonb)
    )
  )
    into result
    from public.profiles p
   where p.id = me;

  return coalesce(result, '{}'::jsonb);
end;
$$;

revoke all on function public.get_my_data_export_supplement() from public, anon, authenticated;
grant execute on function public.get_my_data_export_supplement() to authenticated;
