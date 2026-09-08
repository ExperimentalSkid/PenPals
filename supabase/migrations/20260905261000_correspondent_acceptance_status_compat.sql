-- Keep the Correspondent metric compatible with an explicit `accepted` state
-- if it is introduced later. The current introduction schema represents
-- acceptance as `replied`, so this is a forward-compatible predicate only.

create or replace function public.correspondent_successful_outgoing_count(target_user uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(distinct coalesce(i.conversation_id_legacy, i.id))::integer
    from public.conversation_introductions i
   where i.sender_id = target_user
     and i.status in ('accepted', 'replied');
$$;

revoke all on function public.correspondent_successful_outgoing_count(uuid) from public, anon, authenticated;
