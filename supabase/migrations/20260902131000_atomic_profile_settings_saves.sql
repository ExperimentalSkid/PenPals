-- Keep profile and privacy saves transactional. These functions validate every
-- value before changing the caller's row or replacing its selections.

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
  p_languages jsonb default '[]'::jsonb,
  p_interests bigint[] default '{}'::bigint[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  clean_username text := lower(btrim(coalesce(p_username, '')));
  clean_display_name text := btrim(coalesce(p_display_name, ''));
  clean_gender text := btrim(coalesce(p_gender, ''));
  clean_country text := btrim(coalesce(p_country, ''));
  clean_city text := btrim(coalesce(p_city, ''));
  clean_bio text := btrim(coalesce(p_bio, ''));
  clean_quote text := btrim(coalesce(p_quote, ''));
  clean_looking_for text := btrim(coalesce(p_looking_for, ''));
  language_rows jsonb := coalesce(p_languages, '[]'::jsonb);
  interest_ids bigint[] := coalesce(p_interests, '{}'::bigint[]);
begin
  if me is null then
    raise exception 'Authentication required';
  end if;
  if clean_username !~ '^[a-z0-9_]{3,24}$'
     or char_length(clean_display_name) not between 2 and 80
     or p_birth_date is null
     or p_birth_date > current_date
     or char_length(clean_gender) = 0
     or char_length(clean_gender) > 80
     or char_length(clean_country) = 0
     or char_length(clean_country) > 100
     or char_length(clean_city) = 0
     or char_length(clean_city) > 100
     or char_length(clean_bio) > 500
     or char_length(clean_quote) not between 1 and 240
     or char_length(clean_looking_for) not between 1 and 120 then
    raise exception 'Please check your profile details';
  end if;

  if jsonb_typeof(language_rows) <> 'array' then
    raise exception 'Invalid language selection';
  end if;
  if exists (
    select 1
      from jsonb_to_recordset(language_rows) as l(language_id bigint, proficiency text, purpose text)
     where l.language_id is null
        or l.proficiency not in ('native', 'fluent', 'intermediate', 'beginner')
        or l.purpose not in ('speaks', 'learning')
  ) then
    raise exception 'Invalid language selection';
  end if;
  if exists (
    select l.language_id, l.purpose
      from jsonb_to_recordset(language_rows) as l(language_id bigint, proficiency text, purpose text)
     group by l.language_id, l.purpose
    having count(*) > 1
  ) then
    raise exception 'Duplicate language selection';
  end if;
  if exists (
    select 1
      from jsonb_to_recordset(language_rows) as l(language_id bigint, proficiency text, purpose text)
      left join public.languages available on available.id = l.language_id
     where available.id is null
  ) then
    raise exception 'Invalid language selection';
  end if;

  if exists (
    select interest_id
      from unnest(interest_ids) as selected(interest_id)
     group by interest_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate interest selection';
  end if;
  if exists (
    select selected.interest_id
      from unnest(interest_ids) as selected(interest_id)
      left join public.interests available on available.id = selected.interest_id
     where available.id is null
  ) then
    raise exception 'Invalid interest selection';
  end if;

  insert into public.profiles (
    id, username, display_name, birth_date, gender, country, city, bio, quote, looking_for
  ) values (
    me, clean_username, clean_display_name, p_birth_date, clean_gender,
    clean_country, clean_city, clean_bio, clean_quote, clean_looking_for
  )
  on conflict (id) do update set
    username = excluded.username,
    display_name = excluded.display_name,
    birth_date = excluded.birth_date,
    gender = excluded.gender,
    country = excluded.country,
    city = excluded.city,
    bio = excluded.bio,
    quote = excluded.quote,
    looking_for = excluded.looking_for;

  delete from public.profile_languages where profile_id = me;
  insert into public.profile_languages (profile_id, language_id, proficiency, purpose)
  select me, l.language_id, l.proficiency, l.purpose
    from jsonb_to_recordset(language_rows) as l(language_id bigint, proficiency text, purpose text);

  delete from public.profile_interests where profile_id = me;
  insert into public.profile_interests (profile_id, interest_id)
  select me, selected.interest_id
    from unnest(interest_ids) as selected(interest_id);
end;
$$;

create or replace function public.save_privacy_settings(
  p_profile_visibility text,
  p_show_city boolean,
  p_show_activity_status boolean,
  p_show_response_rate boolean,
  p_accepting_new_conversations boolean,
  p_introduction_scope text,
  p_availability text,
  p_country_codes text[] default '{}'::text[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  clean_codes text[] := array(
    select distinct upper(btrim(code))
      from unnest(coalesce(p_country_codes, '{}'::text[])) as input(code)
     where btrim(code) <> ''
  );
begin
  if me is null then
    raise exception 'Authentication required';
  end if;
  if p_profile_visibility not in ('public', 'authenticated_only')
     or p_introduction_scope not in ('everyone', 'matching_preferences', 'verified_only', 'nobody')
     or p_availability not in ('available', 'away') then
    raise exception 'Invalid privacy settings';
  end if;
  if exists (
    select 1 from unnest(clean_codes) as selected(code)
    where selected.code !~ '^[A-Z]{2,3}$'
  ) then
    raise exception 'Invalid country exclusion';
  end if;

  update public.profiles
     set profile_visibility = p_profile_visibility,
         show_city = coalesce(p_show_city, false),
         show_activity_status = coalesce(p_show_activity_status, false),
         show_response_rate = coalesce(p_show_response_rate, false),
         accepting_new_conversations = coalesce(p_accepting_new_conversations, false),
         introduction_scope = p_introduction_scope,
         availability = p_availability
   where id = me;
  if not found then
    raise exception 'Profile not found';
  end if;

  delete from public.profile_introduction_country_exclusions where profile_id = me;
  insert into public.profile_introduction_country_exclusions (profile_id, country_code)
  select me, selected.code from unnest(clean_codes) as selected(code);
end;
$$;

revoke all on function public.save_profile(text, text, date, text, text, text, text, text, text, jsonb, bigint[]) from public, anon, authenticated;
grant execute on function public.save_profile(text, text, date, text, text, text, text, text, text, jsonb, bigint[]) to authenticated;
revoke all on function public.save_privacy_settings(text, boolean, boolean, boolean, boolean, text, text, text[]) from public, anon, authenticated;
grant execute on function public.save_privacy_settings(text, boolean, boolean, boolean, boolean, text, text, text[]) to authenticated;
