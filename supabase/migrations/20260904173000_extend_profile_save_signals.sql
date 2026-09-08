-- Extend the existing profile-save RPC with the optional profile signals that
-- are already exposed by the public profile and used by discovery relevance.
-- The original overload remains available for older callers.

create or replace function public.save_profile(
  p_username text,
  p_display_name text,
  p_birth_date date,
  p_gender text,
  p_country text,
  p_city text,
  p_bio text,
  p_quote text,
  p_looking_for text,
  p_languages jsonb,
  p_interests bigint[],
  p_country_code text,
  p_region_code text,
  p_locality_id bigint,
  p_location_precision text,
  p_friendship_destinations jsonb,
  p_social_style text,
  p_daily_rhythm text,
  p_environment_preference text,
  p_travel_style text,
  p_pets text,
  p_connection_goals text[],
  p_conversation_style text,
  p_reply_pace text
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  result text;
  goals text[] := coalesce(p_connection_goals, '{}'::text[]);
begin
  if p_social_style is not null and p_social_style not in ('introvert', 'in_between', 'extrovert') then
    raise exception 'Invalid personality selection';
  end if;
  if p_daily_rhythm is not null and p_daily_rhythm not in ('early_bird', 'flexible', 'night_owl') then
    raise exception 'Invalid personality selection';
  end if;
  if p_environment_preference is not null and p_environment_preference not in ('city', 'nature', 'both') then
    raise exception 'Invalid personality selection';
  end if;
  if p_travel_style is not null and p_travel_style not in ('planner', 'spontaneous', 'mix') then
    raise exception 'Invalid personality selection';
  end if;
  if p_pets is not null and p_pets not in ('has_pets', 'likes_animals', 'no_preference') then
    raise exception 'Invalid personality selection';
  end if;
  if cardinality(goals) > 7 or goals <@ array[
    'friendship', 'long_term_friendship', 'casual_conversation',
    'cultural_exchange', 'language_exchange', 'pen_pal',
    'international_friendship'
  ]::text[] is not true then
    raise exception 'Invalid connection goals';
  end if;
  if p_conversation_style is not null and p_conversation_style not in ('short_casual_chats', 'longer_conversations', 'thoughtful_messages', 'mix') then
    raise exception 'Invalid conversation style';
  end if;
  if p_reply_pace is not null and p_reply_pace not in ('usually_quickly', 'when_available', 'slow_replies_fine', 'no_pressure') then
    raise exception 'Invalid reply pace';
  end if;

  result := public.save_profile(
    p_username, p_display_name, p_birth_date, p_gender, p_country, p_city,
    p_bio, p_quote, p_looking_for, p_languages, p_interests, p_country_code,
    p_region_code, p_locality_id, p_location_precision, p_friendship_destinations
  );
  if result <> 'ok' then return result; end if;

  update public.profiles
  set social_style = p_social_style,
      daily_rhythm = p_daily_rhythm,
      environment_preference = p_environment_preference,
      travel_style = p_travel_style,
      pets = p_pets,
      connection_goals = goals,
      conversation_style = p_conversation_style,
      reply_pace = p_reply_pace
  where id = auth.uid();
  return result;
end;
$$;

revoke all on function public.save_profile(text,text,date,text,text,text,text,text,text,jsonb,bigint[],text,text,bigint,text,jsonb,text,text,text,text,text,text[],text,text) from public, anon, authenticated;
grant execute on function public.save_profile(text,text,date,text,text,text,text,text,text,jsonb,bigint[],text,text,bigint,text,jsonb,text,text,text,text,text,text[],text,text) to authenticated;
