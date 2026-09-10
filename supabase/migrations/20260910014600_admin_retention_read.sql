create or replace function public.admin_get_retention_config()
returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;

  return jsonb_build_object(
    'policies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category', p.category,
        'retention_period', p.retention_period::text,
        'purpose', p.purpose,
        'legal_basis', p.legal_basis,
        'enabled', p.enabled,
        'updated_by', p.updated_by,
        'updated_at', p.updated_at
      ) order by p.category)
      from public.data_retention_policies p
    ), '[]'::jsonb),
    'holds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'category', h.category,
        'record_id', h.record_id,
        'reason', h.reason,
        'started_at', h.started_at,
        'released_at', h.released_at,
        'authorized_by', h.authorized_by
      ) order by h.started_at desc)
      from public.data_retention_holds h
      where h.released_at is null
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_get_retention_config() from public, anon, authenticated;
grant execute on function public.admin_get_retention_config() to authenticated;
