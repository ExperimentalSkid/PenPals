-- Keep the content-removal entry point strict even when called directly via
-- PostgREST. The original implementation is retained as a private helper.
alter function public.admin_remove_profile_content(uuid, text, text)
  rename to admin_remove_profile_content_legacy;
revoke all on function public.admin_remove_profile_content_legacy(uuid, text, text) from public;
revoke all on function public.admin_remove_profile_content_legacy(uuid, text, text) from authenticated;

create function public.admin_remove_profile_content(
  target_user uuid,
  content_type text,
  removal_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if target_user is null
     or content_type is null
     or content_type not in ('bio', 'quote', 'looking_for', 'avatar') then
    raise exception 'Unsupported profile content';
  end if;
  if removal_reason is null or char_length(btrim(removal_reason)) not between 1 and 500 then
    raise exception 'A moderation reason is required';
  end if;

  return public.admin_remove_profile_content_legacy(target_user, content_type, removal_reason);
end;
$$;

revoke all on function public.admin_remove_profile_content(uuid, text, text) from public;
grant execute on function public.admin_remove_profile_content(uuid, text, text) to authenticated;
