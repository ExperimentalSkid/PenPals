-- 20260905222000 replaced the four-argument compatibility implementation
-- while adding badge audit actions, which preserved its old authenticated
-- EXECUTE grant. The application uses the date-filtered overload instead;
-- keep this obsolete surface unavailable to client roles.
revoke all on function public.admin_list_audit_entries(text, uuid, integer, integer)
  from public, anon, authenticated;
