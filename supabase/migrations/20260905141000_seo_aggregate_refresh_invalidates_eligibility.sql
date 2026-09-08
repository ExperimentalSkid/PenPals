-- Keep the eligibility decision cache invalid whenever the aggregate cache is
-- rebuilt directly by a trusted job, not only when source tables change.
drop trigger if exists seo_community_aggregates_eligibility_dirty
  on public.seo_community_aggregates;

create trigger seo_community_aggregates_eligibility_dirty
after insert or update or delete on public.seo_community_aggregates
for each statement execute function public.mark_seo_community_eligibility_dirty();
