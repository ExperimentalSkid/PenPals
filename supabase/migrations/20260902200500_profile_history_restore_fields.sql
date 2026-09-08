create or replace function public.admin_get_profile_content_history(target_user uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'Administrator authorization required'; end if;
  if not exists (select 1 from public.profiles where id = target_user) then return '[]'::jsonb; end if;
  insert into public.moderation_audit_log(moderator_id, target_user_id, action, metadata) values (auth.uid(), target_user, 'profile_content_history_view', jsonb_build_object('context', 'admin_user_detail'));
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'content_type', e.content_type, 'previous_value', e.previous_value, 'reason', e.reason, 'moderator_id', e.moderator_id, 'created_at', e.created_at, 'restored_at', e.restored_at, 'restored_by', e.restored_by, 'restore_reason', e.restore_reason) order by e.created_at desc), '[]'::jsonb) into result from public.profile_moderation_evidence e where e.target_user_id = target_user;
  return result;
end;
$$;
revoke all on function public.admin_get_profile_content_history(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_profile_content_history(uuid) to authenticated;
