-- Staff-only, read-only analytics derived from existing platform records.
-- This function intentionally exposes aggregates only; it does not add event
-- tracking, return private content, or change any moderation semantics.

create or replace function public.admin_analytics_summary(
  period_start date default (current_date - 6),
  period_end date default current_date
)
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
declare
  days integer;
  previous_start date;
  previous_end date;
  window_start timestamptz;
  window_end timestamptz;
  admin_view boolean := public.is_admin();
begin
  if not public.is_moderator() then
    raise exception 'Moderator authorization required';
  end if;
  if period_start is null or period_end is null or period_end < period_start then
    raise exception 'Invalid analytics date range';
  end if;

  days := period_end - period_start + 1;
  if days > 366 then
    raise exception 'Analytics date range cannot exceed one year';
  end if;

  previous_end := period_start - 1;
  previous_start := previous_end - days + 1;
  window_start := period_start::timestamptz;
  window_end := (period_end + 1)::timestamptz;

  return jsonb_build_object(
    'period', jsonb_build_object(
      'start', period_start,
      'end', period_end,
      'days', days,
      'previous_start', previous_start,
      'previous_end', previous_end
    ),
    'users', jsonb_build_object(
      'total_accounts', (select count(*) from public.profiles),
      'active_accounts', (select count(*) from public.profiles where deactivated_at is null),
      'deactivated_accounts', (select count(*) from public.profiles where deactivated_at is not null),
      'new_registrations', (select count(*) from public.profiles where created_at >= window_start and created_at < window_end),
      'active_in_period', (select count(*) from public.profiles where deactivated_at is null and last_active_at >= window_start and last_active_at < window_end),
      'online_now', (select count(*) from public.profiles where deactivated_at is null and not inactive_mode and availability = 'available' and last_active_at >= now() - interval '5 minutes'),
      'paused_accounts', (select count(*) from public.profiles where deactivated_at is null and inactive_mode)
    ),
    'engagement', jsonb_build_object(
      'messages_sent', (select count(*) from public.messages where created_at >= window_start and created_at < window_end),
      'conversations_started', (select count(*) from public.conversations where created_at >= window_start and created_at < window_end),
      'introductions_sent', (select count(*) from public.conversation_introductions where created_at >= window_start and created_at < window_end),
      'snail_mail_sent', (select count(*) from public.snail_mail_letters where sent_at >= window_start and sent_at < window_end),
      'snail_mail_delivered', (select count(*) from public.snail_mail_letters where delivered_at >= window_start and delivered_at < window_end),
      'instant_messaging_enabled', (select count(*) from public.profiles where deactivated_at is null and allow_instant_messages),
      'snail_mail_enabled', (select count(*) from public.profiles where deactivated_at is null and allow_snail_mail)
    ),
    'moderation', jsonb_build_object(
      'reports_created', (select count(*) from public.reports where created_at >= window_start and created_at < window_end),
      'reports_resolved', (select count(*) from public.reports where status in ('actioned', 'dismissed') and updated_at >= window_start and updated_at < window_end),
      'open_reports', (select count(*) from public.reports where status in ('open', 'reviewing')),
      'open_cases', (select count(*) from public.moderation_cases where status not in ('resolved', 'dismissed')),
      'moderation_actions', (select count(*) from public.moderation_audit_log where created_at >= window_start and created_at < window_end),
      'automated_flags', (select count(*) from public.moderation_content_flags where created_at >= window_start and created_at < window_end)
    ),
    'verification', case when admin_view then jsonb_build_object(
      'verified_profiles', (select count(distinct penpal_user_id) from public.external_account_verifications where status = 'verified' and revoked_at is null and (reverify_after is null or reverify_after > now())),
      'pending_age_appeals', (select count(*) from public.age_appeals where status = 'pending')
    ) else null end,
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', day::date,
        'registrations', (select count(*) from public.profiles p where p.created_at >= day and p.created_at < day + interval '1 day'),
        'messages', (select count(*) from public.messages m where m.created_at >= day and m.created_at < day + interval '1 day'),
        'introductions', (select count(*) from public.conversation_introductions i where i.created_at >= day and i.created_at < day + interval '1 day'),
        'snail_mail', (select count(*) from public.snail_mail_letters l where l.sent_at >= day and l.sent_at < day + interval '1 day'),
        'reports', (select count(*) from public.reports r where r.created_at >= day and r.created_at < day + interval '1 day')
      ) order by day)
      from generate_series(period_start::timestamptz, period_end::timestamptz, interval '1 day') as series(day)
    ), '[]'::jsonb),
    'previous', jsonb_build_object(
      'new_registrations', (select count(*) from public.profiles where created_at >= previous_start::timestamptz and created_at < (previous_end + 1)::timestamptz),
      'messages_sent', (select count(*) from public.messages where created_at >= previous_start::timestamptz and created_at < (previous_end + 1)::timestamptz),
      'reports_created', (select count(*) from public.reports where created_at >= previous_start::timestamptz and created_at < (previous_end + 1)::timestamptz),
      'snail_mail_sent', (select count(*) from public.snail_mail_letters where sent_at >= previous_start::timestamptz and sent_at < (previous_end + 1)::timestamptz)
    )
  );
end;
$$;

revoke all on function public.admin_analytics_summary(date, date) from public, anon, authenticated;
grant execute on function public.admin_analytics_summary(date, date) to authenticated;
