-- Alias changes can alter the canonical dimension of unresolved legacy rows;
-- invalidate the aggregate cache when the private reference catalogue changes.
drop trigger if exists country_aliases_seo_community_aggregates_dirty on public.country_aliases;
create trigger country_aliases_seo_community_aggregates_dirty
after insert or delete or update
on public.country_aliases
for each statement execute function public.mark_seo_community_aggregates_dirty();
