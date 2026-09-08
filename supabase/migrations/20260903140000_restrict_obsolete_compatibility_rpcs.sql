-- The current application uses the paginated/validated entry points below.
-- Keep the historical implementations for internal compatibility, but remove
-- their client EXECUTE grants now that no repository caller depends on them.
revoke all on function public.admin_get_user_detail_legacy(uuid) from public, anon, authenticated;
revoke all on function public.admin_list_age_appeals(text) from public, anon, authenticated;
revoke all on function public.admin_list_audit_entries(text, uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_list_users(text, text, text, text) from public, anon, authenticated;
revoke all on function public.save_privacy_settings(text, boolean, boolean, boolean, boolean, text, text, text[]) from public, anon, authenticated;
