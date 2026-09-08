-- The participant message INSERT policy invokes this pure age predicate as
-- the authenticated caller. Restore only the execution permission required
-- for that existing RLS check; the function returns no account or profile data.
grant execute on function public.is_adult_birth_date(date) to authenticated;
