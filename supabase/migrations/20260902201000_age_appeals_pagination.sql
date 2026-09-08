-- Keep the existing admin age-appeal RPC for compatibility while providing a
-- bounded queue read for the operational UI.
create or replace function public.admin_list_age_appeals_page(
  status_filter text default 'pending',
  page_size integer default 40,
  page_offset integer default 0
)
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
  previous_appeals jsonb,
  total_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.is_admin() then
    raise exception 'Administrator authorization required';
  end if;
  page_size := greatest(1, least(coalesce(page_size, 40), 100));
  page_offset := greatest(0, coalesce(page_offset, 0));

  return query
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
           where prior.normalized_email_hash = a.normalized_email_hash
             and prior.id <> a.id
         ), '[]'::jsonb),
         count(*) over ()
    from public.age_appeals a
    left join public.age_restrictions r on r.id = a.restriction_id
   where status_filter is null or status_filter = 'all' or a.status = status_filter
   order by a.submitted_at desc
   limit page_size offset page_offset;
end;
$$;

revoke all on function public.admin_list_age_appeals_page(text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_list_age_appeals_page(text, integer, integer) to authenticated;
