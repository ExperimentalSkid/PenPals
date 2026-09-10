create or replace function public.get_public_activity_rank(target_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when p.role = 'admin' and lower(p.username) in ('admin', 'mentalclay') then
      jsonb_build_object(
        'name', 'Director General of the Universal Penpal Union',
        'flavor', 'Currently trying to untangle themselves from 50 yards of packing tape.'
      )
    else
      jsonb_build_object('name', d.display_name, 'flavor', d.flavor_text)
    end
    from public.activity_rank_state s
    join public.activity_rank_definitions d on d.rank_key = s.rank_key
    join public.profiles p on p.id = s.user_id
   where s.user_id = target_user;
$$;

revoke all on function public.get_public_activity_rank(uuid) from public, anon, authenticated;
