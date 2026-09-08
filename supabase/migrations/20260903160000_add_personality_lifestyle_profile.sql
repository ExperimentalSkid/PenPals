-- Optional, non-sensitive profile signals for the public Personality & lifestyle
-- module. All fields remain nullable so this module never affects completeness.
alter table public.profiles
  add column if not exists social_style text,
  add column if not exists daily_rhythm text,
  add column if not exists environment_preference text,
  add column if not exists travel_style text,
  add column if not exists pets text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_social_style_check') then
    alter table public.profiles add constraint profiles_social_style_check
      check (social_style is null or social_style in ('introvert', 'in_between', 'extrovert'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_daily_rhythm_check') then
    alter table public.profiles add constraint profiles_daily_rhythm_check
      check (daily_rhythm is null or daily_rhythm in ('early_bird', 'flexible', 'night_owl'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_environment_preference_check') then
    alter table public.profiles add constraint profiles_environment_preference_check
      check (environment_preference is null or environment_preference in ('city', 'nature', 'both'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_travel_style_check') then
    alter table public.profiles add constraint profiles_travel_style_check
      check (travel_style is null or travel_style in ('planner', 'spontaneous', 'mix'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_pets_check') then
    alter table public.profiles add constraint profiles_pets_check
      check (pets is null or pets in ('has_pets', 'likes_animals', 'no_preference'));
  end if;
end $$;

create or replace function public.get_public_personality_lifestyle(target_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when public.viewer_can_access_profile(p.id) then jsonb_strip_nulls(jsonb_build_object(
      'social_style', p.social_style,
      'daily_rhythm', p.daily_rhythm,
      'environment_preference', p.environment_preference,
      'travel_style', p.travel_style,
      'pets', p.pets
    ))
    else null
  end
  from public.profiles p
  where p.id = target_user;
$$;

revoke all on function public.get_public_personality_lifestyle(uuid) from public, anon;
grant execute on function public.get_public_personality_lifestyle(uuid) to authenticated;
