alter table public.profiles
  add column if not exists availability text not null default 'available';

alter table public.profiles
  drop constraint if exists profiles_availability_check;

alter table public.profiles
  add constraint profiles_availability_check check (availability in ('available', 'away'));

create table if not exists public.profile_introduction_country_exclusions (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  country_code text not null check (country_code = upper(trim(country_code)) and char_length(trim(country_code)) between 2 and 3),
  created_at timestamptz not null default now(),
  primary key (profile_id, country_code)
);

create index if not exists profile_intro_country_exclusions_country_idx
  on public.profile_introduction_country_exclusions (country_code);

alter table public.profile_introduction_country_exclusions enable row level security;

create policy "Users read own country exclusions"
  on public.profile_introduction_country_exclusions for select to authenticated
  using (profile_id = auth.uid());

create policy "Users insert own country exclusions"
  on public.profile_introduction_country_exclusions for insert to authenticated
  with check (profile_id = auth.uid());

create policy "Users update own country exclusions"
  on public.profile_introduction_country_exclusions for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy "Users delete own country exclusions"
  on public.profile_introduction_country_exclusions for delete to authenticated
  using (profile_id = auth.uid());

create or replace function public.submit_introduction(other_user uuid, introduction text)
returns uuid
language plpgsql
security definer
set search_path = public
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
  if me is null or me = other_user or exists (select 1 from public.profiles where id = me and deactivated_at is not null) then
    raise exception 'Invalid participant';
  end if;
  if char_length(body) < 50 or char_length(body) > 500 or body !~ '^[[:alnum:]].*[[:alnum:]]$' or (select count(*) from regexp_split_to_table(body, '\s+') as words) < 8 then
    raise exception 'Icebreaker must be 50 to 500 characters and at least 8 words';
  end if;
  select country into sender_country from public.profiles where id = me;
  select accepting_new_conversations, introduction_scope into recipient_accepts, recipient_scope
    from public.profiles where id = other_user and deactivated_at is null;
  if recipient_accepts is null or not recipient_accepts or recipient_scope = 'nobody' then
    raise exception 'Conversation unavailable';
  end if;
  if exists (
    select 1 from public.profile_introduction_country_exclusions e
    where e.profile_id = other_user and upper(trim(e.country_code)) = upper(trim(coalesce(sender_country, '')))
  ) then
    raise exception 'Conversation unavailable';
  end if;
  if exists (select 1 from public.profile_blocks where (blocker_id = me and blocked_id = other_user) or (blocker_id = other_user and blocked_id = me)) then
    raise exception 'Conversation unavailable';
  end if;
  if exists (select 1 from public.direct_conversation_pairs where user_a = least(me, other_user) and user_b = greatest(me, other_user))
     or exists (select 1 from public.conversation_participants cp join public.conversation_participants cp2 on cp2.conversation_id = cp.conversation_id where cp.user_id = me and cp2.user_id = other_user) then
    raise exception 'Conversation already exists';
  end if;
  if exists (select 1 from public.conversation_introductions where sender_id = me and recipient_id = other_user and status = 'pending') then
    raise exception 'Introduction already pending';
  end if;
  if (select count(*) from public.conversation_introductions where sender_id = me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Introduction rate limit reached';
  end if;
  if (select count(distinct recipient_id) from public.conversation_introductions where sender_id = me and normalized_hash = body_hash and created_at > now() - interval '24 hours') >= 3 then
    raise exception 'Repeated introduction blocked';
  end if;
  insert into public.conversation_introductions(sender_id, recipient_id, body, normalized_hash, icebreaker, expires_at, status)
    values (me, other_user, body, body_hash, body, now() + interval '7 days', 'pending') returning id into intro_id;
  return intro_id;
end;
$$;

revoke all on function public.submit_introduction(uuid, text) from public;
grant execute on function public.submit_introduction(uuid, text) to authenticated;
