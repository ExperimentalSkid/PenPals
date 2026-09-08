do $$
declare
  u uuid;
  names text[] := array['Sofia Almeida','Mika Tanaka','Yuna Park','Lucas Martin','Amara Okafor','Elena Rossi','Noah Williams','Priya Shah','Mateo Silva','Nora Jensen'];
  handles text[] := array['sofia','mika','yuna','lucas','amara','elena','noah','priya','mateo','nora'];
  cities text[] := array['Lisbon','Tokyo','Seoul','Vancouver','Lagos','Milan','Melbourne','Mumbai','São Paulo','Copenhagen'];
  countries text[] := array['Portugal','Japan','South Korea','Canada','Nigeria','Italy','Australia','India','Brazil','Denmark'];
  bios text[] := array['Slow mornings, long walks, and learning how people see the world.','Design student, coffee finder, and weekend cyclist.','I collect tiny stories from every place I visit.','Outdoors person who enjoys thoughtful conversations.','Music, food, and finding beauty in ordinary days.','Bookshops, train rides, and making new friends.','Curious about languages and everyday life everywhere.','Photographer at heart, always looking for a new perspective.','I love cooking for friends and swapping travel stories.','Trying to live gently, laugh often, and stay curious.'];
  quotes text[] := array['The best conversations begin with a little curiosity.','Every city has a story worth hearing.','I collect tiny joys and long walks.','Always learning something from someone new.','Music makes every distance feel smaller.','A good book is an invitation to wander.','Curiosity is my favorite compass.','Looking for the beauty in ordinary days.','Food tastes better when shared with friends.','Say hello and tell me what made you smile.'];
begin
  u := gen_random_uuid();
  insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@example.com', crypt('admin', gen_salt('bf')), now(), '', now(), now(), '{}', '{}');
  insert into auth.identities(id, user_id, provider_id, identity_data, provider, created_at, updated_at) values (u, u, u::text, jsonb_build_object('sub',u::text,'email','admin@example.com'), 'email', now(), now());
  insert into public.profiles(id, username, display_name, birth_date, gender, country, city, bio)
    values (u, 'admin', 'Local Admin', '1990-01-01', 'prefer not to say', 'Local', 'Dashboard', 'Development moderation account');
  perform set_config('app.allow_role_change', '1', true);
  update public.profiles set role = 'admin' where id = u;
  for i in 1..10 loop
    u := gen_random_uuid();
    insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
      values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', handles[i] || '@example.local', crypt('demo', gen_salt('bf')), now(), '', now(), now(), '{}', '{}');
    insert into auth.identities(id, user_id, provider_id, identity_data, provider, created_at, updated_at) values (u, u, u::text, jsonb_build_object('sub',u::text,'email',handles[i] || '@example.local'), 'email', now(), now());
    select id into u from auth.users where email = handles[i] || '@example.local';
    insert into public.profiles(id, username, display_name, birth_date, gender, country, city, bio, quote, looking_for, avatar_path, last_active_at)
      values (u, handles[i], names[i], (date '1988-01-01' + (i * 900)), 'prefer not to say', countries[i], cities[i], bios[i], quotes[i], 'friendship', 'https://i.pravatar.cc/800?img=' || i, now() - (i || ' hours')::interval)
      on conflict (id) do update set avatar_path = excluded.avatar_path, bio = excluded.bio, city = excluded.city, country = excluded.country;
  end loop;
end $$;

-- GoTrue expects token columns to be non-null when authenticating seeded users.
update auth.users
set confirmation_token = coalesce(confirmation_token, ''),
    email_change = coalesce(email_change, ''),
    email_change_token_new = coalesce(email_change_token_new, ''),
    recovery_token = coalesce(recovery_token, ''),
    phone_change = coalesce(phone_change, ''),
    phone_change_token = coalesce(phone_change_token, ''),
    reauthentication_token = coalesce(reauthentication_token, '')
where email is not null;

insert into public.profile_languages(profile_id, language_id, proficiency, purpose)
select p.id, l.id, 'fluent', 'speaks' from public.profiles p cross join public.languages l
where p.username = 'yuna' and l.name in ('English', 'Korean') on conflict do nothing;
insert into public.profile_interests(profile_id, interest_id)
select p.id, i.id from public.profiles p cross join public.interests i
where p.username = 'yuna' and i.name in ('Art', 'Music') on conflict do nothing;

insert into public.profile_languages(profile_id, language_id, proficiency, purpose)
select p.id, l.id, 'fluent', 'speaks' from public.profiles p cross join public.languages l
where p.username <> 'admin' and l.name = 'English' on conflict do nothing;
insert into public.profile_interests(profile_id, interest_id)
select p.id, i.id from public.profiles p cross join public.interests i
where p.username <> 'admin' and i.name in ('Travel', 'Books', 'Music') on conflict do nothing;
