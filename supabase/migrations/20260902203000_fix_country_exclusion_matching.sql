-- Match country exclusions (stored as ISO codes) against profile country names.
-- The profile model stores a display country name while privacy settings store
-- canonical ISO country codes. Keep the mapping server-side and unavailable to
-- ordinary clients so the generic introduction response cannot reveal policy.
create table if not exists public.country_codes (
  code text primary key check (code = upper(trim(code)) and char_length(code) = 2),
  name text not null unique
);

insert into public.country_codes (code, name) values
  ('AF', 'Afghanistan'),
  ('AX', 'Åland Islands'),
  ('AL', 'Albania'),
  ('DZ', 'Algeria'),
  ('AS', 'American Samoa'),
  ('AD', 'Andorra'),
  ('AO', 'Angola'),
  ('AI', 'Anguilla'),
  ('AQ', 'Antarctica'),
  ('AG', 'Antigua & Barbuda'),
  ('AR', 'Argentina'),
  ('AM', 'Armenia'),
  ('AW', 'Aruba'),
  ('AU', 'Australia'),
  ('AT', 'Austria'),
  ('AZ', 'Azerbaijan'),
  ('BS', 'Bahamas'),
  ('BH', 'Bahrain'),
  ('BD', 'Bangladesh'),
  ('BB', 'Barbados'),
  ('BY', 'Belarus'),
  ('BE', 'Belgium'),
  ('BZ', 'Belize'),
  ('BJ', 'Benin'),
  ('BM', 'Bermuda'),
  ('BT', 'Bhutan'),
  ('BO', 'Bolivia'),
  ('BQ', 'Caribbean Netherlands'),
  ('BA', 'Bosnia & Herzegovina'),
  ('BW', 'Botswana'),
  ('BV', 'Bouvet Island'),
  ('BR', 'Brazil'),
  ('IO', 'British Indian Ocean Territory'),
  ('BN', 'Brunei'),
  ('BG', 'Bulgaria'),
  ('BF', 'Burkina Faso'),
  ('BI', 'Burundi'),
  ('CV', 'Cape Verde'),
  ('KH', 'Cambodia'),
  ('CM', 'Cameroon'),
  ('CA', 'Canada'),
  ('KY', 'Cayman Islands'),
  ('CF', 'Central African Republic'),
  ('TD', 'Chad'),
  ('CL', 'Chile'),
  ('CN', 'China'),
  ('CX', 'Christmas Island'),
  ('CC', 'Cocos (Keeling) Islands'),
  ('CO', 'Colombia'),
  ('KM', 'Comoros'),
  ('CD', 'Congo - Kinshasa'),
  ('CG', 'Congo - Brazzaville'),
  ('CK', 'Cook Islands'),
  ('CR', 'Costa Rica'),
  ('CI', 'Côte d’Ivoire'),
  ('HR', 'Croatia'),
  ('CU', 'Cuba'),
  ('CW', 'Curaçao'),
  ('CY', 'Cyprus'),
  ('CZ', 'Czechia'),
  ('DK', 'Denmark'),
  ('DJ', 'Djibouti'),
  ('DM', 'Dominica'),
  ('DO', 'Dominican Republic'),
  ('EC', 'Ecuador'),
  ('EG', 'Egypt'),
  ('SV', 'El Salvador'),
  ('GQ', 'Equatorial Guinea'),
  ('ER', 'Eritrea'),
  ('EE', 'Estonia'),
  ('SZ', 'Eswatini'),
  ('ET', 'Ethiopia'),
  ('FK', 'Falkland Islands'),
  ('FO', 'Faroe Islands'),
  ('FJ', 'Fiji'),
  ('FI', 'Finland'),
  ('FR', 'France'),
  ('GF', 'French Guiana'),
  ('PF', 'French Polynesia'),
  ('TF', 'French Southern Territories'),
  ('GA', 'Gabon'),
  ('GM', 'Gambia'),
  ('GE', 'Georgia'),
  ('DE', 'Germany'),
  ('GH', 'Ghana'),
  ('GI', 'Gibraltar'),
  ('GR', 'Greece'),
  ('GL', 'Greenland'),
  ('GD', 'Grenada'),
  ('GP', 'Guadeloupe'),
  ('GU', 'Guam'),
  ('GT', 'Guatemala'),
  ('GG', 'Guernsey'),
  ('GN', 'Guinea'),
  ('GW', 'Guinea-Bissau'),
  ('GY', 'Guyana'),
  ('HT', 'Haiti'),
  ('HM', 'Heard & McDonald Islands'),
  ('VA', 'Vatican City'),
  ('HN', 'Honduras'),
  ('HK', 'Hong Kong SAR China'),
  ('HU', 'Hungary'),
  ('IS', 'Iceland'),
  ('IN', 'India'),
  ('ID', 'Indonesia'),
  ('IR', 'Iran'),
  ('IQ', 'Iraq'),
  ('IE', 'Ireland'),
  ('IM', 'Isle of Man'),
  ('IL', 'Israel'),
  ('IT', 'Italy'),
  ('JM', 'Jamaica'),
  ('JP', 'Japan'),
  ('JE', 'Jersey'),
  ('JO', 'Jordan'),
  ('KZ', 'Kazakhstan'),
  ('KE', 'Kenya'),
  ('KI', 'Kiribati'),
  ('KP', 'North Korea'),
  ('KR', 'South Korea'),
  ('KW', 'Kuwait'),
  ('KG', 'Kyrgyzstan'),
  ('LA', 'Laos'),
  ('LV', 'Latvia'),
  ('LB', 'Lebanon'),
  ('LS', 'Lesotho'),
  ('LR', 'Liberia'),
  ('LY', 'Libya'),
  ('LI', 'Liechtenstein'),
  ('LT', 'Lithuania'),
  ('LU', 'Luxembourg'),
  ('MO', 'Macao SAR China'),
  ('MG', 'Madagascar'),
  ('MW', 'Malawi'),
  ('MY', 'Malaysia'),
  ('MV', 'Maldives'),
  ('ML', 'Mali'),
  ('MT', 'Malta'),
  ('MH', 'Marshall Islands'),
  ('MQ', 'Martinique'),
  ('MR', 'Mauritania'),
  ('MU', 'Mauritius'),
  ('YT', 'Mayotte'),
  ('MX', 'Mexico'),
  ('FM', 'Micronesia'),
  ('MD', 'Moldova'),
  ('MC', 'Monaco'),
  ('MN', 'Mongolia'),
  ('ME', 'Montenegro'),
  ('MS', 'Montserrat'),
  ('MA', 'Morocco'),
  ('MZ', 'Mozambique'),
  ('MM', 'Myanmar (Burma)'),
  ('NA', 'Namibia'),
  ('NR', 'Nauru'),
  ('NP', 'Nepal'),
  ('NL', 'Netherlands'),
  ('NC', 'New Caledonia'),
  ('NZ', 'New Zealand'),
  ('NI', 'Nicaragua'),
  ('NE', 'Niger'),
  ('NG', 'Nigeria'),
  ('NU', 'Niue'),
  ('NF', 'Norfolk Island'),
  ('MK', 'North Macedonia'),
  ('MP', 'Northern Mariana Islands'),
  ('NO', 'Norway'),
  ('OM', 'Oman'),
  ('PK', 'Pakistan'),
  ('PW', 'Palau'),
  ('PS', 'Palestinian Territories'),
  ('PA', 'Panama'),
  ('PG', 'Papua New Guinea'),
  ('PY', 'Paraguay'),
  ('PE', 'Peru'),
  ('PH', 'Philippines'),
  ('PN', 'Pitcairn Islands'),
  ('PL', 'Poland'),
  ('PT', 'Portugal'),
  ('PR', 'Puerto Rico'),
  ('QA', 'Qatar'),
  ('RE', 'Réunion'),
  ('RO', 'Romania'),
  ('RU', 'Russia'),
  ('RW', 'Rwanda'),
  ('BL', 'St. Barthélemy'),
  ('SH', 'St. Helena'),
  ('KN', 'St. Kitts & Nevis'),
  ('LC', 'St. Lucia'),
  ('MF', 'St. Martin'),
  ('PM', 'St. Pierre & Miquelon'),
  ('VC', 'St. Vincent & Grenadines'),
  ('WS', 'Samoa'),
  ('SM', 'San Marino'),
  ('ST', 'São Tomé & Príncipe'),
  ('SA', 'Saudi Arabia'),
  ('SN', 'Senegal'),
  ('RS', 'Serbia'),
  ('SC', 'Seychelles'),
  ('SL', 'Sierra Leone'),
  ('SG', 'Singapore'),
  ('SX', 'Sint Maarten'),
  ('SK', 'Slovakia'),
  ('SI', 'Slovenia'),
  ('SB', 'Solomon Islands'),
  ('SO', 'Somalia'),
  ('ZA', 'South Africa'),
  ('GS', 'South Georgia & South Sandwich Islands'),
  ('SS', 'South Sudan'),
  ('ES', 'Spain'),
  ('LK', 'Sri Lanka'),
  ('SD', 'Sudan'),
  ('SR', 'Suriname'),
  ('SJ', 'Svalbard & Jan Mayen'),
  ('SE', 'Sweden'),
  ('CH', 'Switzerland'),
  ('SY', 'Syria'),
  ('TW', 'Taiwan'),
  ('TJ', 'Tajikistan'),
  ('TZ', 'Tanzania'),
  ('TH', 'Thailand'),
  ('TL', 'Timor-Leste'),
  ('TG', 'Togo'),
  ('TK', 'Tokelau'),
  ('TO', 'Tonga'),
  ('TT', 'Trinidad & Tobago'),
  ('TN', 'Tunisia'),
  ('TR', 'Türkiye'),
  ('TM', 'Turkmenistan'),
  ('TC', 'Turks & Caicos Islands'),
  ('TV', 'Tuvalu'),
  ('UG', 'Uganda'),
  ('UA', 'Ukraine'),
  ('AE', 'United Arab Emirates'),
  ('GB', 'United Kingdom'),
  ('US', 'United States'),
  ('UM', 'U.S. Outlying Islands'),
  ('UY', 'Uruguay'),
  ('UZ', 'Uzbekistan'),
  ('VU', 'Vanuatu'),
  ('VE', 'Venezuela'),
  ('VN', 'Vietnam'),
  ('VG', 'British Virgin Islands'),
  ('VI', 'U.S. Virgin Islands'),
  ('WF', 'Wallis & Futuna'),
  ('EH', 'Western Sahara'),
  ('YE', 'Yemen'),
  ('ZM', 'Zambia'),
  ('ZW', 'Zimbabwe')
on conflict (code) do update set name = excluded.name;

alter table public.country_codes enable row level security;
revoke all on table public.country_codes from public, anon, authenticated;

create or replace function public.country_code_matches_name(country_code text, country_name text)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  select upper(trim(coalesce(country_code, ''))) = upper(trim(coalesce(country_name, '')))
      or exists (
        select 1
          from public.country_codes c
         where c.code = upper(trim(coalesce(country_code, '')))
           and lower(trim(c.name)) = lower(trim(coalesce(country_name, '')))
      );
$$;

revoke all on function public.country_code_matches_name(text, text) from public, anon, authenticated;

create or replace function public.submit_introduction(other_user uuid, introduction text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  intro_id uuid;
  me uuid := auth.uid();
  recipient_accepts boolean;
  recipient_scope text;
  sender_country text;
  body text := trim(coalesce(introduction, ''));
  body_hash text := md5(regexp_replace(lower(body), '\s+', ' ', 'g'));
begin
  perform public.expire_introductions();
  if me is null or me = other_user
     or not public.is_adult_birth_date((select birth_date from public.profiles where id = me))
     or exists (select 1 from public.profiles where id = me and deactivated_at is not null) then
    raise exception 'Invalid participant';
  end if;
  if char_length(body) < 50 or char_length(body) > 500
     or (select count(*) from regexp_split_to_table(body, '[[:space:]]+') as words where words ~ '[[:alnum:]]') < 8 then
    raise exception 'Icebreaker must be 50 to 500 characters and at least 8 words';
  end if;
  select country into sender_country from public.profiles where id = me;
  select accepting_new_conversations, introduction_scope into recipient_accepts, recipient_scope
    from public.profiles where id = other_user and deactivated_at is null
      and public.is_adult_birth_date(birth_date);
  if recipient_accepts is null or not recipient_accepts or recipient_scope = 'nobody' then raise exception 'Conversation unavailable'; end if;
  if exists (select 1 from public.profile_introduction_country_exclusions e where e.profile_id = other_user and public.country_code_matches_name(e.country_code, sender_country)) then raise exception 'Conversation unavailable'; end if;
  if exists (select 1 from public.profile_blocks where (blocker_id = me and blocked_id = other_user) or (blocker_id = other_user and blocked_id = me)) then raise exception 'Conversation unavailable'; end if;
  if exists (select 1 from public.direct_conversation_pairs where user_a = least(me, other_user) and user_b = greatest(me, other_user))
     or exists (select 1 from public.conversation_participants cp join public.conversation_participants cp2 on cp2.conversation_id = cp.conversation_id where cp.user_id = me and cp2.user_id = other_user) then raise exception 'Conversation already exists'; end if;
  if exists (select 1 from public.conversation_introductions where sender_id = me and recipient_id = other_user and status = 'pending') then raise exception 'Introduction already pending'; end if;
  if (select count(*) from public.conversation_introductions where sender_id = me and created_at > now() - interval '1 hour') >= 10 then raise exception 'Introduction rate limit reached'; end if;
  if (select count(distinct recipient_id) from public.conversation_introductions where sender_id = me and normalized_hash = body_hash and created_at > now() - interval '24 hours') >= 3 then raise exception 'Repeated introduction blocked'; end if;
  insert into public.conversation_introductions(sender_id, recipient_id, body, normalized_hash, icebreaker, expires_at, status)
    values (me, other_user, body, body_hash, body, now() + interval '7 days', 'pending') returning id into intro_id;
  return intro_id;
end;
$$;

revoke all on function public.submit_introduction(uuid, text) from public, anon;
grant execute on function public.submit_introduction(uuid, text) to authenticated;
