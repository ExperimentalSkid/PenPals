-- Message INSERT policies run as the caller. Reading profile_blocks directly
-- from that policy only sees rows where the caller is the blocker, so a block
-- created by the other participant could be bypassed. Resolve the symmetric
-- relationship through a narrowly scoped definer helper instead.
create or replace function public.users_are_blocked(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select first_user is not null
     and second_user is not null
     and exists (
       select 1
         from public.profile_blocks b
        where (b.blocker_id = first_user and b.blocked_id = second_user)
           or (b.blocker_id = second_user and b.blocked_id = first_user)
     );
$$;

revoke all on function public.users_are_blocked(uuid, uuid) from public, anon, authenticated;
grant execute on function public.users_are_blocked(uuid, uuid) to authenticated;

drop policy if exists "Participants send active adult unblocked messages" on public.messages;
create policy "Participants send active adult unblocked messages" on public.messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and public.is_conversation_participant(conversation_id)
  and public.is_adult_birth_date((select birth_date from public.profiles where id = auth.uid()))
  and not exists (select 1 from public.profiles where id = auth.uid() and deactivated_at is not null)
  and not exists (
    select 1
      from public.conversation_participants p
     where p.conversation_id = messages.conversation_id
       and p.user_id <> auth.uid()
       and public.users_are_blocked(auth.uid(), p.user_id)
  )
);
