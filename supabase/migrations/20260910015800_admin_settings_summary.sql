create or replace function public.admin_settings_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;

  select jsonb_build_object(
    'max_friendship_destinations', coalesce((
      select c.max_friendship_destinations
      from public.location_configuration c
      where c.id = true
    ), 5)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_settings_summary() from public, anon, authenticated;
grant execute on function public.admin_settings_summary() to authenticated;
