create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index messages_conversation_created_idx on public.messages (conversation_id, created_at);
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
create or replace function public.is_conversation_participant(target_conversation uuid, target_user uuid default auth.uid()) returns boolean language sql security definer set search_path = public stable as $$ select exists (select 1 from public.conversation_participants where conversation_id = target_conversation and user_id = target_user) $$;
revoke all on function public.is_conversation_participant(uuid, uuid) from public;
grant execute on function public.is_conversation_participant(uuid, uuid) to authenticated;
create policy "Participants read conversations" on public.conversations for select to authenticated using (public.is_conversation_participant(id));
create policy "Participants read participants" on public.conversation_participants for select to authenticated using (public.is_conversation_participant(conversation_id));
create policy "Participants read messages" on public.messages for select to authenticated using (public.is_conversation_participant(conversation_id));
create policy "Participants send messages" on public.messages for insert to authenticated with check (sender_id = (select auth.uid()) and public.is_conversation_participant(conversation_id) and not exists (select 1 from public.profile_blocks b join public.conversation_participants other on other.user_id = b.blocked_id where b.blocker_id = (select auth.uid()) and other.conversation_id = messages.conversation_id and other.user_id <> (select auth.uid())) and not exists (select 1 from public.profile_blocks b join public.conversation_participants other on other.user_id = b.blocker_id where b.blocked_id = (select auth.uid()) and other.conversation_id = messages.conversation_id and other.user_id <> (select auth.uid())));
create policy "Participants update own read state" on public.conversation_participants for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create or replace function public.start_conversation(other_user uuid) returns uuid language plpgsql security definer set search_path = public as $$ declare conversation_id uuid; me uuid := auth.uid(); begin if me is null or me = other_user then raise exception 'Invalid participant'; end if; if exists (select 1 from public.profile_blocks where (blocker_id = me and blocked_id = other_user) or (blocker_id = other_user and blocked_id = me)) then raise exception 'Conversation unavailable'; end if; select cp.conversation_id into conversation_id from public.conversation_participants cp join public.conversation_participants cp2 on cp2.conversation_id = cp.conversation_id where cp.user_id = me and cp2.user_id = other_user limit 1; if conversation_id is null then insert into public.conversations default values returning id into conversation_id; insert into public.conversation_participants values (conversation_id, me, now()), (conversation_id, other_user, null); end if; return conversation_id; end; $$;
revoke all on function public.start_conversation(uuid) from public;
grant execute on function public.start_conversation(uuid) to authenticated;
