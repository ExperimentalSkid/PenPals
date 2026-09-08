-- Keep all trust & safety SECURITY DEFINER helpers on immutable/system schemas
-- plus explicitly-qualified application schemas.
alter function public.admin_log_user_detail_access(uuid, text)
  set search_path = pg_catalog, public;
alter function public.admin_get_user_security_context(uuid)
  set search_path = pg_catalog, public, auth;
alter function public.admin_get_profile_content_history(uuid)
  set search_path = pg_catalog, public;
alter function public.admin_remove_profile_content(uuid, text, text)
  set search_path = pg_catalog, public;
