-- The four-argument audit listing is an obsolete compatibility RPC. Keep the
-- function definition harmlessly present for migration compatibility, but do
-- not expose it to authenticated clients.
revoke all on function public.admin_list_audit_entries(text, uuid, integer, integer) from public, anon, authenticated;
