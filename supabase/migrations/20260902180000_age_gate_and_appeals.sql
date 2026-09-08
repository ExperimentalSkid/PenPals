-- Penpal is an 18+ service.  Age enforcement lives in the database so that
-- profile writes, contact RPCs, and direct API calls share one policy.

create or replace function public.is_adult_birth_date(p_birth_date date)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select p_birth_date is not null
     and p_birth_date <= (current_date - interval '18 years')::date
$$;

create table if not exists public.age_restrictions (
  id uuid primary key default gen_random_uuid(),
  normalized_email_hash text not null unique,
  restricted_user_id uuid references auth.users(id) on delete set null,
  blocked_until date not null,
  created_at timestamptz not null default now(),
  reason text not null default 'underage' check (reason = 'underage'),
  source text not null default 'verified_signup' check (source = 'verified_signup'),
  appeal_status text not null default 'none' check (appeal_status in ('none', 'pending', 'approved', 'rejected')),
  updated_at timestamptz not null default now()
);

create index if not exists age_restrictions_user_idx
  on public.age_restrictions (restricted_user_id);

create table if not exists public.age_gate_cooldowns (
  id uuid primary key default gen_random_uuid(),
  normalized_email_hash text not null unique,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  blocked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists age_gate_cooldowns_blocked_idx
  on public.age_gate_cooldowns (blocked_until);

create table if not exists public.age_appeals (
  id uuid primary key default gen_random_uuid(),
  restriction_id uuid references public.age_restrictions(id) on delete set null,
  restricted_user_id uuid references auth.users(id) on delete set null,
  normalized_email_hash text not null,
  corrected_birth_date date not null,
  explanation text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_reason text
);

create index if not exists age_appeals_status_idx
  on public.age_appeals (status, submitted_at desc);
create unique index if not exists age_appeals_one_pending_idx
  on public.age_appeals (normalized_email_hash)
  where status = 'pending';

alter table public.age_restrictions enable row level security;
alter table public.age_gate_cooldowns enable row level security;
alter table public.age_appeals enable row level security;

-- These are protected records.  They are reachable only through the narrowly
-- scoped functions below; normal Data API clients receive no table access.
revoke all on table public.age_restrictions from public, anon, authenticated;
revoke all on table public.age_gate_cooldowns from public, anon, authenticated;
revoke all on table public.age_appeals from public, anon, authenticated;

create or replace function public.age_gate_signup(p_email text, p_birth_date date)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  normalized_hash text := encode(extensions.digest(lower(btrim(coalesce(p_email, ''))), 'sha256'), 'hex');
  clean_email text := lower(btrim(coalesce(p_email, '')));
  restriction public.age_restrictions;
  cooldown public.age_gate_cooldowns;
  existing_user uuid;
  email_verified boolean := false;
  next_attempts integer;
begin
  if clean_email = '' or p_birth_date is null then
    return 'underage';
  end if;

  select * into restriction
    from public.age_restrictions
   where normalized_email_hash = normalized_hash
   limit 1;
  if restriction.id is not null and restriction.blocked_until >= current_date then
    return 'restricted';
  end if;

  select * into cooldown
    from public.age_gate_cooldowns
   where normalized_email_hash = normalized_hash
   for update;
  if cooldown.id is not null and cooldown.blocked_until is not null and cooldown.blocked_until > now() then
    return 'cooldown';
  end if;

  if cooldown.id is null or cooldown.updated_at <= now() - interval '48 hours' then
    insert into public.age_gate_cooldowns (normalized_email_hash, attempt_count, blocked_until, created_at, updated_at)
      values (normalized_hash, 1, null, now(), now())
    on conflict (normalized_email_hash) do update
      set attempt_count = 1, blocked_until = null, created_at = now(), updated_at = now();
    next_attempts := 1;
  else
    next_attempts := cooldown.attempt_count + 1;
    update public.age_gate_cooldowns
       set attempt_count = next_attempts,
           blocked_until = case when next_attempts >= 3 then now() + interval '48 hours' else blocked_until end,
           updated_at = now()
     where id = cooldown.id;
    if next_attempts >= 3 then
      return 'cooldown';
    end if;
  end if;

  select u.id, u.email_confirmed_at is not null
    into existing_user, email_verified
    from auth.users u
   where lower(u.email) = clean_email
   order by u.created_at desc
   limit 1;

  if not public.is_adult_birth_date(p_birth_date) then
    if email_verified then
      insert into public.age_restrictions (
        normalized_email_hash, restricted_user_id, blocked_until, reason, source, appeal_status
      ) values (
        normalized_hash, existing_user, (p_birth_date + interval '18 years')::date,
        'underage', 'verified_signup', 'none'
      )
      on conflict (normalized_email_hash) do update set
        restricted_user_id = coalesce(excluded.restricted_user_id, public.age_restrictions.restricted_user_id),
        blocked_until = greatest(public.age_restrictions.blocked_until, excluded.blocked_until),
        updated_at = now();
      -- A verified account that has not passed the age gate has no surviving
      -- normal profile.  Keep the auth identity only so its owner can appeal.
      if existing_user is not null then
        delete from public.profiles where id = existing_user;
      end if;
      return 'restricted';
    end if;
    return 'underage';
  end if;

  return 'ok';
end;
$$;

create or replace function public.age_gate_validate_current_user(p_birth_date date)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  email_value text;
  email_verified boolean;
  result text;
begin
  if me is null then
    raise exception 'Authentication required';
  end if;
  select lower(u.email), u.email_confirmed_at is not null
    into email_value, email_verified
    from auth.users u where u.id = me;
  result := public.age_gate_signup(email_value, p_birth_date);
  if result = 'restricted' and email_verified then
    delete from public.profiles where id = me;
  end if;
  return result;
end;
$$;

create or replace function public.enforce_profile_age()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_adult_birth_date(new.birth_date) then
    raise exception 'You must be at least 18 years old to use Penpal.';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_age_gate on public.profiles;
create trigger profiles_age_gate
before insert or update of birth_date on public.profiles
for each row execute function public.enforce_profile_age();

-- Save profile atomically while returning an age-gate result.  The existing
-- field validation and language/interest replacement behavior is preserved.
drop function if exists public.save_profile(text, text, date, text, text, text, text, text, text, jsonb, bigint[]);
create function public.save_profile(
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
  language_rows jsonb := coalesce(p_languages, '[]'::jsonb);
  interest_ids bigint[] := coalesce(p_interests, '{}'::bigint[]);
begin
  if me is null then raise exception 'Authentication required'; end if;

  age_result := public.age_gate_validate_current_user(p_birth_date);
  if age_result <> 'ok' then
    return age_result;
  end if;

  if clean_username !~ '^[a-z0-9_]{3,24}$'
     or char_length(clean_display_name) not between 2 and 80
     or p_birth_date is null
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

  if jsonb_typeof(language_rows) <> 'array' then raise exception 'Invalid language selection'; end if;
  if exists (
    select 1 from jsonb_to_recordset(language_rows) as l(language_id bigint, proficiency text, purpose text)
    where l.language_id is null or l.proficiency not in ('native', 'fluent', 'intermediate', 'beginner')
      or l.purpose not in ('speaks', 'learning')
  ) then raise exception 'Invalid language selection'; end if;
  if exists (
    select l.language_id, l.purpose from jsonb_to_recordset(language_rows) as l(language_id bigint, proficiency text, purpose text)
    group by l.language_id, l.purpose having count(*) > 1
  ) then raise exception 'Duplicate language selection'; end if;
  if exists (
    select 1 from jsonb_to_recordset(language_rows) as l(language_id bigint, proficiency text, purpose text)
    left join public.languages available on available.id = l.language_id where available.id is null
  ) then raise exception 'Invalid language selection'; end if;
  if exists (
    select interest_id from unnest(interest_ids) as selected(interest_id)
    group by interest_id having count(*) > 1
  ) then raise exception 'Duplicate interest selection'; end if;
  if exists (
    select selected.interest_id from unnest(interest_ids) as selected(interest_id)
    left join public.interests available on available.id = selected.interest_id where available.id is null
  ) then raise exception 'Invalid interest selection'; end if;

  insert into public.profiles (
    id, username, display_name, birth_date, gender, country, city, bio, quote, looking_for
  ) values (
    me, clean_username, clean_display_name, p_birth_date, clean_gender,
    clean_country, clean_city, clean_bio, clean_quote, clean_looking_for
  )
  on conflict (id) do update set
    username = excluded.username, display_name = excluded.display_name,
    birth_date = excluded.birth_date, gender = excluded.gender,
    country = excluded.country, city = excluded.city, bio = excluded.bio,
    quote = excluded.quote, looking_for = excluded.looking_for;

  delete from public.profile_languages where profile_id = me;
  insert into public.profile_languages (profile_id, language_id, proficiency, purpose)
  select me, l.language_id, l.proficiency, l.purpose
    from jsonb_to_recordset(language_rows) as l(language_id bigint, proficiency text, purpose text);
  delete from public.profile_interests where profile_id = me;
  insert into public.profile_interests (profile_id, interest_id)
  select me, selected.interest_id from unnest(interest_ids) as selected(interest_id);
  return 'ok';
end;
$$;

create or replace function public.submit_age_appeal(
  corrected_birth_date date,
  appeal_explanation text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  email_value text;
  email_verified boolean;
  normalized_hash text;
  restriction public.age_restrictions;
  appeal_id uuid;
  clean_explanation text := nullif(btrim(coalesce(appeal_explanation, '')), '');
begin
  if me is null then raise exception 'Authentication required'; end if;
  select lower(u.email), u.email_confirmed_at is not null into email_value, email_verified
    from auth.users u where u.id = me;
  if not email_verified or email_value is null then raise exception 'Correction unavailable'; end if;
  if not public.is_adult_birth_date(corrected_birth_date) then raise exception 'Corrected date must show you are at least 18'; end if;
  if char_length(coalesce(clean_explanation, '')) > 500 then raise exception 'Explanation is too long'; end if;
  normalized_hash := encode(extensions.digest(email_value, 'sha256'), 'hex');
  select * into restriction from public.age_restrictions where normalized_email_hash = normalized_hash and blocked_until >= current_date;
  if restriction.id is null then raise exception 'Correction unavailable'; end if;
  if exists (select 1 from public.age_appeals where normalized_email_hash = normalized_hash and status = 'pending') then
    raise exception 'A correction request is already under review';
  end if;
  if exists (select 1 from public.age_appeals where normalized_email_hash = normalized_hash and submitted_at > now() - interval '48 hours') then
    raise exception 'Correction requests are temporarily limited';
  end if;
  insert into public.age_appeals (
    restriction_id, restricted_user_id, normalized_email_hash, corrected_birth_date, explanation
  ) values (
    restriction.id, me, normalized_hash, corrected_birth_date, clean_explanation
  ) returning id into appeal_id;
  update public.age_restrictions set appeal_status = 'pending', updated_at = now() where id = restriction.id;
  return appeal_id;
end;
$$;

create or replace function public.admin_list_age_appeals(status_filter text default 'pending')
returns table (
  id uuid,
  submitted_at timestamptz,
  corrected_birth_date date,
  resulting_age integer,
  explanation text,
  status text,
  blocked_until date,
  restriction_reason text,
  restriction_source text,
  previous_appeals jsonb
)
language sql
security definer
set search_path = pg_catalog, public
as $$
  select a.id,
         a.submitted_at,
         a.corrected_birth_date,
         extract(year from age(current_date, a.corrected_birth_date))::integer,
         a.explanation,
         a.status,
         r.blocked_until,
         r.reason,
         r.source,
         coalesce((
           select jsonb_agg(jsonb_build_object(
             'submitted_at', prior.submitted_at,
             'status', prior.status,
             'reviewed_at', prior.reviewed_at,
             'review_reason', prior.review_reason
           ) order by prior.submitted_at desc)
           from public.age_appeals prior
           where prior.normalized_email_hash = a.normalized_email_hash and prior.id <> a.id
         ), '[]'::jsonb)
    from public.age_appeals a
    left join public.age_restrictions r on r.id = a.restriction_id
   where public.is_admin()
     and (status_filter is null or status_filter = 'all' or a.status = status_filter)
   order by a.submitted_at desc;
$$;

create or replace function public.admin_review_age_appeal(
  appeal_id uuid,
  decision text,
  decision_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  appeal public.age_appeals;
  restriction public.age_restrictions;
  target_user uuid;
  old_status text;
begin
  if not public.is_admin() then raise exception 'Administrator authorization required'; end if;
  if decision not in ('approved', 'rejected') or char_length(btrim(coalesce(decision_reason, ''))) not between 1 and 500 then
    raise exception 'A decision and moderation reason are required';
  end if;
  select * into appeal from public.age_appeals where id = appeal_id for update;
  if appeal.id is null or appeal.status <> 'pending' then raise exception 'Appeal is no longer pending'; end if;
  if decision = 'approved' and not public.is_adult_birth_date(appeal.corrected_birth_date) then
    raise exception 'Corrected date must show the requester is at least 18';
  end if;
  select * into restriction from public.age_restrictions where id = appeal.restriction_id for update;
  target_user := coalesce(appeal.restricted_user_id, restriction.restricted_user_id);
  old_status := appeal.status;

  update public.age_appeals
     set status = decision, reviewed_at = now(), reviewed_by = me, review_reason = btrim(decision_reason)
   where id = appeal.id;

  if decision = 'approved' then
    delete from public.age_gate_cooldowns
     where normalized_email_hash = appeal.normalized_email_hash;
    delete from public.age_restrictions where id = appeal.restriction_id;
    -- The restricted auth identity has no normal profile.  Removing it after
    -- approval lets the person retry signup normally without creating an account.
    if target_user is not null then
      delete from public.profiles where id = target_user;
      delete from auth.users where id = target_user;
    end if;
  else
    update public.age_restrictions set appeal_status = 'rejected', updated_at = now()
     where id = appeal.restriction_id;
  end if;

  insert into public.moderation_audit_log (
    moderator_id, report_id, target_user_id, action, old_status, new_status, metadata
  ) values (
    me, null, target_user,
    case when decision = 'approved' then 'age_appeal_approved' else 'age_appeal_rejected' end,
    old_status, decision,
    jsonb_build_object('appeal_id', appeal.id, 'reason', btrim(decision_reason))
  );
end;
$$;

-- Keep existing privacy/block semantics while ensuring an under-18 row can
-- never be viewed or contacted even if it predates this migration.
create or replace function public.viewer_can_access_profile(target uuid)
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select target = auth.uid()
      or (
        exists (
          select 1 from public.profiles p
           where p.id = target
             and p.deactivated_at is null
             and public.is_adult_birth_date(p.birth_date)
             and (p.profile_visibility = 'public' or auth.uid() is not null)
        )
        and not exists (
          select 1 from public.profile_blocks b
           where (b.blocker_id = auth.uid() and b.blocked_id = target)
              or (b.blocker_id = target and b.blocked_id = auth.uid())
        )
      );
$$;

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
     or body !~ '^[[:alnum:]].*[[:alnum:]]$'
     or (select count(*) from regexp_split_to_table(body, '[[:space:]]+') as words) < 8 then
    raise exception 'Icebreaker must be 50 to 500 characters and at least 8 words';
  end if;
  select country into sender_country from public.profiles where id = me;
  select accepting_new_conversations, introduction_scope into recipient_accepts, recipient_scope
    from public.profiles where id = other_user and deactivated_at is null
      and public.is_adult_birth_date(birth_date);
  if recipient_accepts is null or not recipient_accepts or recipient_scope = 'nobody' then raise exception 'Conversation unavailable'; end if;
  if exists (select 1 from public.profile_introduction_country_exclusions e where e.profile_id = other_user and upper(trim(e.country_code)) = upper(trim(coalesce(sender_country, '')))) then raise exception 'Conversation unavailable'; end if;
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

-- The RPC is intentionally usable only by the signup flow and authenticated
-- profile saves; the protected tables remain inaccessible to the Data API.
revoke all on function public.is_adult_birth_date(date) from public, anon, authenticated;
revoke all on function public.enforce_profile_age() from public, anon, authenticated;
revoke all on function public.age_gate_validate_current_user(date) from public, anon, authenticated;
revoke all on function public.age_gate_signup(text, date) from public, anon, authenticated;
revoke all on function public.submit_age_appeal(date, text) from public, anon, authenticated;
revoke all on function public.admin_list_age_appeals(text) from public, anon, authenticated;
revoke all on function public.admin_review_age_appeal(uuid, text, text) from public, anon, authenticated;
grant execute on function public.age_gate_signup(text, date) to anon, authenticated;
grant execute on function public.age_gate_validate_current_user(date) to authenticated;
grant execute on function public.submit_age_appeal(date, text) to authenticated;
grant execute on function public.admin_list_age_appeals(text) to authenticated;
grant execute on function public.admin_review_age_appeal(uuid, text, text) to authenticated;
grant execute on function public.viewer_can_access_profile(uuid) to authenticated;
grant execute on function public.submit_introduction(uuid, text) to authenticated;
revoke all on function public.enforce_profile_age() from public, anon, authenticated;
revoke all on function public.is_adult_birth_date(date) from public, anon, authenticated;
