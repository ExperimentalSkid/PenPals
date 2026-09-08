-- Allow the focused onboarding gateway to persist its minimum structured
-- fields before optional profile-story fields are filled in.  The existing
-- profile table still protects its non-null columns; the save action supplies
-- neutral defaults for legacy required columns.  Entry access remains gated
-- by display identity, birth date, country, one language, and three interests.

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
  p_friendship_destinations jsonb
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  age_result text;
  clean_username text := lower(btrim(coalesce(p_username, '')));
  clean_display_name text := btrim(coalesce(p_display_name, ''));
  clean_gender text := btrim(coalesce(p_gender, ''));
  clean_country text := btrim(coalesce(p_country, ''));
  clean_city text := btrim(coalesce(p_city, ''));
  clean_bio text := btrim(coalesce(p_bio, ''));
  clean_quote text := btrim(coalesce(p_quote, ''));
  clean_looking_for text := btrim(coalesce(p_looking_for, ''));
  clean_country_code text := nullif(upper(btrim(coalesce(p_country_code, ''))), '');
  clean_region_code text := nullif(upper(btrim(coalesce(p_region_code, ''))), '');
  clean_precision text := lower(btrim(coalesce(p_location_precision, 'locality')));
  language_rows jsonb := coalesce(p_languages, '[]'::jsonb);
  interest_ids bigint[] := coalesce(p_interests, '{}'::bigint[]);
  destination_rows jsonb := coalesce(p_friendship_destinations, '[]'::jsonb);
  canonical_country text;
  canonical_city text := clean_city;
  destination_limit integer;
  inferred_locality_id bigint;
  inferred_region_code text;
  inferred_locality_name text;
  inferred_locality_count integer;
begin
  if me is null or not public.is_email_verified() then raise exception 'Authentication required'; end if;
  age_result := public.age_gate_validate_current_user(p_birth_date);
  if age_result <> 'ok' then return age_result; end if;
  if clean_username !~ '^[a-z0-9_]{3,24}$'
     or char_length(clean_display_name) not between 2 and 80
     or p_birth_date is null
     or char_length(clean_gender) = 0 or char_length(clean_gender) > 80
     or char_length(clean_country) = 0 or char_length(clean_country) > 100
     or char_length(clean_city) > 100
     or char_length(clean_bio) > 500
     or char_length(clean_quote) > 240
     or char_length(clean_looking_for) not between 1 and 120 then
    raise exception 'Please check your profile details';
  end if;
  if clean_precision not in ('country', 'region', 'locality') then raise exception 'Invalid location precision'; end if;

  if clean_country_code is null then
    select c.code, c.name into clean_country_code, canonical_country
      from public.country_codes c where lower(c.name) = lower(clean_country) limit 1;
    if clean_country_code is null then
      canonical_country := clean_country;
      clean_region_code := null;
      p_locality_id := null;
    end if;
  else
    select c.name into canonical_country from public.country_codes c where c.code = clean_country_code;
  end if;
  if canonical_country is null then raise exception 'Invalid country'; end if;

  if clean_country_code is not null then
    if clean_precision = 'country' then
      clean_region_code := null;
      p_locality_id := null;
    elsif clean_region_code is null and p_locality_id is null and clean_city <> '' then
      select min(l.id), min(l.region_code), min(l.name), count(*)::integer
        into inferred_locality_id, inferred_region_code, inferred_locality_name, inferred_locality_count
        from public.location_localities l
       where l.country_code = clean_country_code
         and lower(btrim(l.name)) = lower(clean_city);
      if inferred_locality_count = 1 then
        clean_region_code := inferred_region_code;
        if clean_precision = 'locality' then
          p_locality_id := inferred_locality_id;
          canonical_city := inferred_locality_name;
        end if;
      end if;
    end if;
    if clean_region_code is null and clean_precision in ('region', 'locality') then
      raise exception 'A region is required for this precision';
    end if;
    if clean_region_code is not null and not exists (
      select 1 from public.location_regions r where r.country_code = clean_country_code and r.region_code = clean_region_code
    ) then raise exception 'Invalid region'; end if;
    if p_locality_id is not null then
      select l.name into canonical_city from public.location_localities l
       where l.id = p_locality_id and l.country_code = clean_country_code and l.region_code = clean_region_code;
      if canonical_city is null then raise exception 'Invalid locality'; end if;
    elsif clean_precision = 'locality' and clean_city = '' then
      raise exception 'A city or town is required for this precision';
    end if;
    if clean_precision = 'region' then p_locality_id := null; end if;
  end if;

  if jsonb_typeof(language_rows) <> 'array' or jsonb_typeof(destination_rows) <> 'array' then raise exception 'Invalid selections'; end if;
  if exists (select 1 from jsonb_to_recordset(language_rows) as l(language_id bigint, proficiency text, purpose text)
             where l.language_id is null or l.proficiency not in ('native','fluent','intermediate','beginner') or l.purpose not in ('speaks','learning')) then raise exception 'Invalid language selection'; end if;
  if exists (select l.language_id, l.purpose from jsonb_to_recordset(language_rows) as l(language_id bigint, proficiency text, purpose text) group by l.language_id,l.purpose having count(*) > 1) then raise exception 'Duplicate language selection'; end if;
  if exists (select 1 from jsonb_to_recordset(language_rows) as l(language_id bigint, proficiency text, purpose text) left join public.languages x on x.id=l.language_id where x.id is null) then raise exception 'Invalid language selection'; end if;
  if exists (select interest_id from unnest(interest_ids) as x(interest_id) group by interest_id having count(*) > 1) then raise exception 'Duplicate interest selection'; end if;
  if exists (select x.interest_id from unnest(interest_ids) as x(interest_id) left join public.interests i on i.id=x.interest_id where i.id is null) then raise exception 'Invalid interest selection'; end if;
  select max_friendship_destinations into destination_limit from public.location_configuration where id = true;
  if jsonb_array_length(destination_rows) > coalesce(destination_limit, 5) then raise exception 'Too many friendship destinations'; end if;
  if exists (select 1 from jsonb_to_recordset(destination_rows) as d(country_code text, region_code text)
             where d.country_code is null or not exists (select 1 from public.country_codes c where c.code=upper(btrim(d.country_code)))
                or (d.region_code is not null and not exists (select 1 from public.location_regions r where r.country_code=upper(btrim(d.country_code)) and r.region_code=upper(btrim(d.region_code))))) then raise exception 'Invalid friendship destination'; end if;
  if exists (select upper(btrim(d.country_code)), nullif(upper(btrim(d.region_code)), '') from jsonb_to_recordset(destination_rows) as d(country_code text, region_code text) group by 1,2 having count(*) > 1) then raise exception 'Duplicate friendship destination'; end if;

  insert into public.profiles (id, username, display_name, birth_date, gender, country, city, bio, quote, looking_for, country_code, region_code, locality_id, location_precision)
  values (me, clean_username, clean_display_name, p_birth_date, clean_gender, canonical_country, canonical_city, clean_bio, clean_quote, clean_looking_for, clean_country_code, clean_region_code, p_locality_id, clean_precision)
  on conflict (id) do update set
    username=excluded.username, display_name=excluded.display_name, birth_date=excluded.birth_date, gender=excluded.gender,
    country=excluded.country, city=excluded.city, bio=excluded.bio, quote=excluded.quote, looking_for=excluded.looking_for,
    country_code=excluded.country_code, region_code=excluded.region_code, locality_id=excluded.locality_id, location_precision=excluded.location_precision;
  delete from public.profile_languages where profile_id=me;
  insert into public.profile_languages(profile_id, language_id, proficiency, purpose)
    select me,l.language_id,l.proficiency,l.purpose from jsonb_to_recordset(language_rows) as l(language_id bigint, proficiency text, purpose text);
  delete from public.profile_interests where profile_id=me;
  insert into public.profile_interests(profile_id, interest_id) select me,x.interest_id from unnest(interest_ids) as x(interest_id);
  delete from public.profile_friendship_destinations where profile_id=me;
  insert into public.profile_friendship_destinations(profile_id,country_code,region_code)
    select me,upper(btrim(d.country_code)),nullif(upper(btrim(d.region_code)),'') from jsonb_to_recordset(destination_rows) as d(country_code text, region_code text);
  return 'ok';
end;
$$;

revoke all on function public.save_profile(text,text,date,text,text,text,text,text,text,jsonb,bigint[],text,text,bigint,text,jsonb) from public, anon, authenticated;
grant execute on function public.save_profile(text,text,date,text,text,text,text,text,text,jsonb,bigint[],text,text,bigint,text,jsonb) to authenticated;
