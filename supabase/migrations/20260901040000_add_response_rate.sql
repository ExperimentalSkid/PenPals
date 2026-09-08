create table public.response_opportunities (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  initiator_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (initiator_id <> recipient_id)
);
create index response_opportunities_recipient_idx on public.response_opportunities (recipient_id, created_at);
alter table public.response_opportunities enable row level security;
create policy "Authenticated users read response metrics" on public.response_opportunities for select to authenticated using (true);

create or replace function public.record_first_response() returns trigger language plpgsql security definer set search_path = public as $$ begin update public.response_opportunities set responded_at = new.created_at where conversation_id = new.conversation_id and recipient_id = new.sender_id and responded_at is null and new.created_at <= created_at + interval '7 days'; return new; end; $$;
drop trigger if exists messages_first_response on public.messages;
create trigger messages_first_response after insert on public.messages for each row execute function public.record_first_response();

create or replace function public.get_response_stats(target_user uuid) returns table (completed_opportunities bigint, response_rate numeric, median_hours numeric) language sql security definer set search_path = public as $$
  with valid as (
    select o.* from public.response_opportunities o
    where o.recipient_id = target_user
      and o.created_at + interval '7 days' <= now()
      and not exists (select 1 from public.profile_blocks b where (b.blocker_id = o.initiator_id and b.blocked_id = o.recipient_id) or (b.blocker_id = o.recipient_id and b.blocked_id = o.initiator_id))
  ), stats as (
    select count(*) filter (where responded_at is not null) as answered, count(*) as completed,
      percentile_cont(0.5) within group (order by extract(epoch from (responded_at - created_at)) / 3600.0) filter (where responded_at is not null) as median
    from valid
  ) select completed, case when completed >= 5 then round(answered::numeric * 100 / completed, 0) else null end, case when answered > 0 then round(median::numeric, 1) else null end from stats;
$$;
revoke all on function public.get_response_stats(uuid) from public;
grant execute on function public.get_response_stats(uuid) to authenticated;

create or replace function public.start_conversation(other_user uuid) returns uuid language plpgsql security definer set search_path = public as $$ declare conversation_id uuid; me uuid := auth.uid(); begin if me is null or me = other_user then raise exception 'Invalid participant'; end if; if exists (select 1 from public.profile_blocks where (blocker_id = me and blocked_id = other_user) or (blocker_id = other_user and blocked_id = me)) then raise exception 'Conversation unavailable'; end if; select cp.conversation_id into conversation_id from public.conversation_participants cp join public.conversation_participants cp2 on cp2.conversation_id = cp.conversation_id where cp.user_id = me and cp2.user_id = other_user limit 1; if conversation_id is null then insert into public.conversations default values returning id into conversation_id; insert into public.conversation_participants values (conversation_id, me, now()), (conversation_id, other_user, null); insert into public.response_opportunities (conversation_id, initiator_id, recipient_id) values (conversation_id, me, other_user); end if; return conversation_id; end; $$;
