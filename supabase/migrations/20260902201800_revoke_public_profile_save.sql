-- save_profile is an authenticated account mutation. A later function
-- recreation restored PostgreSQL's default PUBLIC EXECUTE ACL; remove that
-- anonymous surface and retain the intended authenticated entry point.
revoke all on function public.save_profile(text, text, date, text, text, text, text, text, text, jsonb, bigint[]) from public, anon;
grant execute on function public.save_profile(text, text, date, text, text, text, text, text, text, jsonb, bigint[]) to authenticated;
