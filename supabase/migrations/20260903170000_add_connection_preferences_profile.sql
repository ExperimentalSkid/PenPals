-- Optional, friendship-focused connection preferences. These fields are
-- intentionally separate from the existing free-text looking_for summary.
alter table public.profiles
  add column if not exists connection_goals text[] not null default '{}'::text[],
  add column if not exists conversation_style text,
  add column if not exists reply_pace text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_connection_goals_check') then
    alter table public.profiles add constraint profiles_connection_goals_check
      check (
        cardinality(connection_goals) <= 7
        and connection_goals <@ array[
          'friendship', 'long_term_friendship', 'casual_conversation',
          'cultural_exchange', 'language_exchange', 'pen_pal',
          'international_friendship'
        ]::text[]
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_conversation_style_check') then
    alter table public.profiles add constraint profiles_conversation_style_check
      check (conversation_style is null or conversation_style in (
        'short_casual_chats', 'longer_conversations', 'thoughtful_messages', 'mix'
      ));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_reply_pace_check') then
    alter table public.profiles add constraint profiles_reply_pace_check
      check (reply_pace is null or reply_pace in (
        'usually_quickly', 'when_available', 'slow_replies_fine', 'no_pressure'
      ));
  end if;
end $$;

create or replace function public.get_public_connection_preferences(target_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when public.viewer_can_access_profile(p.id) then jsonb_strip_nulls(jsonb_build_object(
      'connection_goals', to_jsonb(p.connection_goals),
      'conversation_style', p.conversation_style,
      'reply_pace', p.reply_pace
    ))
    else null
  end
  from public.profiles p
  where p.id = target_user;
$$;

revoke all on function public.get_public_connection_preferences(uuid) from public, anon;
grant execute on function public.get_public_connection_preferences(uuid) to authenticated;
