-- Location and friendship-destination foundation.  Legacy free-text country and
-- city columns remain the display fallback so unresolved values are never lost.

create table if not exists public.location_regions (
  id bigint generated always as identity primary key,
  country_code text not null references public.country_codes(code),
  region_code text not null check (region_code = upper(btrim(region_code)) and char_length(btrim(region_code)) between 2 and 16),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  is_major boolean not null default false,
  created_at timestamptz not null default now(),
  unique (country_code, region_code)
);

create table if not exists public.location_localities (
  id bigint generated always as identity primary key,
  country_code text not null references public.country_codes(code),
  region_code text,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  is_major boolean not null default false,
  created_at timestamptz not null default now(),
  unique (country_code, region_code, name)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'location_localities_region_fk'
       and conrelid = 'public.location_localities'::regclass
  ) then
    alter table public.location_localities
      add constraint location_localities_region_fk
      foreign key (country_code, region_code)
      references public.location_regions(country_code, region_code);
  end if;
end;
$$;

alter table public.location_regions enable row level security;
alter table public.location_localities enable row level security;
revoke all on table public.location_regions from public, anon;
revoke all on table public.location_localities from public, anon;
grant select on table public.location_regions, public.location_localities to authenticated;
drop policy if exists "Authenticated users read location regions" on public.location_regions;
create policy "Authenticated users read location regions"
  on public.location_regions for select to authenticated using (true);
drop policy if exists "Authenticated users read location localities" on public.location_localities;
create policy "Authenticated users read location localities"
  on public.location_localities for select to authenticated using (true);

insert into public.location_regions (country_code, region_code, name, is_major) values
  ('PT', 'PT-11', 'Lisbon', true),
  ('JP', 'JP-13', 'Tokyo', true),
  ('KR', 'KR-11', 'Seoul', true),
  ('CA', 'CA-BC', 'British Columbia', true),
  ('NG', 'NG-LA', 'Lagos', true),
  ('IT', 'IT-25', 'Lombardy', true),
  ('AU', 'AU-VIC', 'Victoria', true),
  ('IN', 'IN-MH', 'Maharashtra', true),
  ('BR', 'BR-SP', 'São Paulo', true),
  ('DK', 'DK-84', 'Capital Region', true),
  ('ES', 'ES-AN', 'Andalucía', true),
  ('ES', 'ES-MD', 'Community of Madrid', true),
  ('ES', 'ES-CT', 'Catalonia', true)
on conflict (country_code, region_code) do update
  set name = excluded.name, is_major = excluded.is_major;

insert into public.location_localities (country_code, region_code, name, is_major) values
  ('PT', 'PT-11', 'Lisbon', true), ('PT', 'PT-11', 'Sintra', false), ('PT', 'PT-11', 'Cascais', false),
  ('JP', 'JP-13', 'Tokyo', true), ('JP', 'JP-13', 'Yokohama', true), ('JP', 'JP-13', 'Hachioji', false),
  ('KR', 'KR-11', 'Seoul', true), ('KR', 'KR-11', 'Busan', true), ('KR', 'KR-11', 'Incheon', true),
  ('CA', 'CA-BC', 'Vancouver', true), ('CA', 'CA-BC', 'Victoria', false), ('CA', 'CA-BC', 'Kelowna', false),
  ('NG', 'NG-LA', 'Lagos', true), ('NG', 'NG-LA', 'Ikeja', false), ('NG', 'NG-LA', 'Badagry', false),
  ('IT', 'IT-25', 'Milan', true), ('IT', 'IT-25', 'Bergamo', false), ('IT', 'IT-25', 'Brescia', false),
  ('AU', 'AU-VIC', 'Melbourne', true), ('AU', 'AU-VIC', 'Geelong', false), ('AU', 'AU-VIC', 'Ballarat', false),
  ('IN', 'IN-MH', 'Mumbai', true), ('IN', 'IN-MH', 'Pune', true), ('IN', 'IN-MH', 'Nagpur', false),
  ('BR', 'BR-SP', 'São Paulo', true), ('BR', 'BR-SP', 'Campinas', false), ('BR', 'BR-SP', 'Santos', false),
  ('DK', 'DK-84', 'Copenhagen', true), ('DK', 'DK-84', 'Roskilde', false), ('DK', 'DK-84', 'Helsingør', false),
  ('ES', 'ES-AN', 'Sevilla', true), ('ES', 'ES-AN', 'Málaga', true), ('ES', 'ES-AN', 'Granada', false),
  ('ES', 'ES-MD', 'Madrid', true), ('ES', 'ES-CT', 'Barcelona', true)
on conflict (country_code, region_code, name) do update
  set is_major = excluded.is_major;

alter table public.profiles
  add column if not exists country_code text references public.country_codes(code),
  add column if not exists region_code text,
  add column if not exists locality_id bigint references public.location_localities(id),
  add column if not exists location_precision text not null default 'locality';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_location_precision_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_location_precision_check
      check (location_precision in ('country', 'region', 'locality'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_region_country_fk' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_region_country_fk
      foreign key (country_code, region_code)
      references public.location_regions(country_code, region_code);
  end if;
end;
$$;

-- Backfill only unambiguous matches.  The original country/city values remain
-- untouched and continue to represent unresolved legacy locations.
-- This migration is the controlled owner of the normalization columns; pause
-- only the profile write guard while copying legacy values, then restore it.
do $$
begin
  if exists (
    select 1 from pg_trigger
     where tgname = 'profiles_require_verified_email'
       and tgrelid = 'public.profiles'::regclass
       and not tgisinternal
  ) then
    alter table public.profiles disable trigger profiles_require_verified_email;
  end if;
end;
$$;

update public.profiles p
   set country_code = c.code
  from public.country_codes c
 where p.country_code is null
   and lower(trim(c.name)) = lower(trim(p.country));

update public.profiles p
   set locality_id = l.id,
       region_code = l.region_code
  from public.location_localities l
 where p.locality_id is null
   and p.country_code = l.country_code
   and lower(trim(l.name)) = lower(trim(p.city))
   and (
     select count(*)
       from public.location_localities candidate
      where candidate.country_code = p.country_code
        and lower(trim(candidate.name)) = lower(trim(p.city))
        and (p.region_code is null or candidate.region_code = p.region_code)
   ) = 1;

update public.profiles
   set location_precision = case
     when locality_id is not null then 'locality'
     when region_code is not null then 'region'
     else 'locality'
   end
 where location_precision = 'locality';

do $$
begin
  if exists (
    select 1 from pg_trigger
     where tgname = 'profiles_require_verified_email'
       and tgrelid = 'public.profiles'::regclass
       and not tgisinternal
  ) then
    alter table public.profiles enable trigger profiles_require_verified_email;
  end if;
end;
$$;

create index if not exists profiles_country_code_idx on public.profiles(country_code);
create index if not exists profiles_region_code_idx on public.profiles(country_code, region_code);
create index if not exists location_localities_lookup_idx on public.location_localities(country_code, region_code, is_major desc, name);

-- Operator-configurable product limit.  It is intentionally not readable or
-- writable by normal clients; the protected profile-save RPC reads it.
create table if not exists public.location_configuration (
  id boolean primary key default true check (id),
  max_friendship_destinations smallint not null default 5 check (max_friendship_destinations between 1 and 20)
);
insert into public.location_configuration (id, max_friendship_destinations)
values (true, 5)
on conflict (id) do nothing;
revoke all on table public.location_configuration from public, anon, authenticated;

create table if not exists public.profile_friendship_destinations (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  country_code text not null references public.country_codes(code),
  region_code text,
  created_at timestamptz not null default now(),
  constraint friendship_destination_region_fk foreign key (country_code, region_code)
    references public.location_regions(country_code, region_code)
);

create unique index if not exists profile_friendship_destinations_unique
  on public.profile_friendship_destinations(profile_id, country_code, coalesce(region_code, ''));
create index if not exists profile_friendship_destinations_profile_idx
  on public.profile_friendship_destinations(profile_id, created_at);
alter table public.profile_friendship_destinations enable row level security;
revoke all on table public.profile_friendship_destinations from public, anon;
grant select, insert, update, delete on table public.profile_friendship_destinations to authenticated;
drop policy if exists "Users read own friendship destinations" on public.profile_friendship_destinations;
create policy "Users read own friendship destinations"
  on public.profile_friendship_destinations for select to authenticated using (profile_id = auth.uid());
drop policy if exists "Users insert own friendship destinations" on public.profile_friendship_destinations;
create policy "Users insert own friendship destinations"
  on public.profile_friendship_destinations for insert to authenticated with check (profile_id = auth.uid());
drop policy if exists "Users update own friendship destinations" on public.profile_friendship_destinations;
create policy "Users update own friendship destinations"
  on public.profile_friendship_destinations for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
drop policy if exists "Users delete own friendship destinations" on public.profile_friendship_destinations;
create policy "Users delete own friendship destinations"
  on public.profile_friendship_destinations for delete to authenticated using (profile_id = auth.uid());

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
     or char_length(clean_quote) not between 1 and 240
     or char_length(clean_looking_for) not between 1 and 120 then
    raise exception 'Please check your profile details';
  end if;
  if clean_precision not in ('country', 'region', 'locality') then raise exception 'Invalid location precision'; end if;

  if clean_country_code is null then
    select c.code, c.name into clean_country_code, canonical_country
      from public.country_codes c where lower(c.name) = lower(clean_country) limit 1;
  else
    select c.name into canonical_country from public.country_codes c where c.code = clean_country_code;
  end if;
  if clean_country_code is null or canonical_country is null then raise exception 'Invalid country'; end if;
  if clean_precision = 'country' then clean_region_code := null; p_locality_id := null;
  elsif clean_region_code is null then raise exception 'A region is required for this precision';
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

-- Compatibility for callers that have not adopted normalized location fields.
create or replace function public.save_profile(
  p_username text, p_display_name text, p_birth_date date, p_gender text, p_country text, p_city text,
  p_bio text, p_quote text, p_looking_for text, p_languages jsonb default '[]'::jsonb, p_interests bigint[] default '{}'::bigint[]
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return public.save_profile(p_username,p_display_name,p_birth_date,p_gender,p_country,p_city,p_bio,p_quote,p_looking_for,p_languages,p_interests,null,null,null,'locality','[]'::jsonb);
end;
$$;

revoke all on function public.save_profile(text,text,date,text,text,text,text,text,text,jsonb,bigint[]) from public, anon, authenticated;
revoke all on function public.save_profile(text,text,date,text,text,text,text,text,text,jsonb,bigint[],text,text,bigint,text,jsonb) from public, anon, authenticated;
grant execute on function public.save_profile(text,text,date,text,text,text,text,text,text,jsonb,bigint[]) to authenticated;
grant execute on function public.save_profile(text,text,date,text,text,text,text,text,text,jsonb,bigint[],text,text,bigint,text,jsonb) to authenticated;

-- Public profile location is derived at the selected precision.  Existing
-- privacy checks and allow-listed fields remain in force.
create or replace function public.get_public_profile(target_username text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  p public.profiles;
  response_label text;
  rank_json jsonb;
  region_name text;
  locality_name text;
  location_label text;
begin
  select p0.* into p from public.profiles p0
   where p0.username = lower(btrim(target_username)) and public.viewer_can_access_profile(p0.id);
  if not found then return null; end if;
  select r.name into region_name from public.location_regions r where r.country_code=p.country_code and r.region_code=p.region_code;
  select l.name into locality_name from public.location_localities l where l.id=p.locality_id;
  location_label := case
    when p.location_precision='country' or p.country_code is null then p.country
    when p.location_precision='region' then concat_ws(', ', coalesce(region_name,p.region_code), p.country)
    when p.show_city then concat_ws(', ',
      coalesce(locality_name,nullif(p.city,''),coalesce(region_name,p.region_code)),
      nullif(region_name, coalesce(locality_name,nullif(p.city,''))),
      p.country)
    else concat_ws(', ', coalesce(region_name,p.region_code), p.country)
  end;
  select case when s.completed_opportunities >= 5 and s.response_rate is not null then s.response_rate::text || '%' else 'New member' end into response_label from public.get_response_stats(p.id) s;
  rank_json := public.get_public_activity_rank(p.id);
  return jsonb_build_object(
    'id',p.id,'username',p.username,'display_name',p.display_name,'birth_date',p.birth_date,'gender',p.gender,
    'country',p.country,'city',case when p.show_city and p.location_precision='locality' then coalesce(locality_name,p.city) else null end,
    'country_code',p.country_code,'region_code',case when p.location_precision in ('region','locality') then p.region_code else null end,
    'location_precision',p.location_precision,'region_name',case when p.location_precision in ('region','locality') then region_name else null end,
    'locality_name',case when p.show_city and p.location_precision='locality' then locality_name else null end,'location_label',location_label,
    'bio',p.bio,'quote',p.quote,'looking_for',p.looking_for,
    'avatar_path',case when public.can_view_profile_photo(p.id,auth.uid()) then p.avatar_path else null end,
    'availability',case when p.show_activity_status and not p.inactive_mode then p.availability else null end,
    'activity_status',case when not p.show_activity_status or p.inactive_mode then null when p.availability='away' then 'Away' when p.last_active_at is null then 'Active more than a week ago' when p.last_active_at >= now()-interval '5 minutes' then 'Online now' when p.last_active_at >= now()-interval '1 hour' then 'Active recently' when p.last_active_at >= now()-interval '1 day' then 'Active today' when p.last_active_at >= now()-interval '7 days' then 'Active this week' else 'Active more than a week ago' end,
    'response_rate_label',response_label,'is_verified',public.is_profile_verified(p.id),'activity_rank',coalesce(rank_json->>'name','Passing Notes'),'activity_rank_flavor',rank_json->>'flavor'
  );
end;
$$;
revoke all on function public.get_public_profile(text) from public, anon;
grant execute on function public.get_public_profile(text) to authenticated;

drop function if exists public.get_discover_profiles(uuid);
create function public.get_discover_profiles(viewer uuid default auth.uid())
returns table (id uuid, username text, display_name text, birth_date date, gender text, country text, city text, country_code text, region_code text, avatar_path text, last_active_at timestamptz, recently_active boolean, quote text)
language sql security definer set search_path = pg_catalog, public
as $$
  select p.id,p.username,p.display_name,p.birth_date,p.gender,p.country,
         case when p.show_city and p.location_precision='locality' then p.city end,
         coalesce(p.country_code,c.code),
         case when p.location_precision in ('region','locality') then p.region_code end,
         null::text,null::timestamptz,
         case when p.show_activity_status then p.last_active_at >= now()-interval '24 hours' else null end,
         p.quote
    from public.profiles p left join public.country_codes c on lower(c.name)=lower(p.country)
   where p.id<>auth.uid() and p.deactivated_at is null and p.inactive_mode=false and p.last_active_at >= now()-interval '7 days'
     and nullif(btrim(p.display_name),'') is not null and p.birth_date is not null and nullif(btrim(p.gender),'') is not null
     and nullif(btrim(p.country),'') is not null and (p.location_precision in ('country','region') or nullif(btrim(p.city),'') is not null) and nullif(btrim(p.bio),'') is not null
     and nullif(btrim(p.quote),'') is not null and nullif(btrim(p.looking_for),'') is not null and nullif(btrim(p.avatar_path),'') is not null
     and exists (select 1 from public.profile_languages pl where pl.profile_id=p.id)
     and (select count(*) from public.profile_interests pi where pi.profile_id=p.id) >= 3
     and public.viewer_can_access_profile(p.id)
   order by p.last_active_at desc nulls last,p.created_at desc;
$$;
revoke all on function public.get_discover_profiles(uuid) from public, anon, authenticated;
grant execute on function public.get_discover_profiles(uuid) to authenticated;
