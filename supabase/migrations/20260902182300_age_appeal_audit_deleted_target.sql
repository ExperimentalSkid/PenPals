-- A restricted account intentionally has no profile at review time.  Keep the
-- immutable audit event while leaving its nullable target reference empty.
create or replace function public.admin_review_age_appeal(
  appeal_id uuid,
  decision text,
  decision_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  me uuid := auth.uid();
  appeal public.age_appeals;
  restriction public.age_restrictions;
  target_user uuid;
  old_status text;
  audit_target uuid;
begin
  if not public.is_admin() then raise exception 'Administrator authorization required'; end if;
  if decision not in ('approved', 'rejected') or char_length(btrim(coalesce(decision_reason, ''))) not between 1 and 500 then
    raise exception 'A decision and moderation reason are required';
  end if;
  select * into appeal from public.age_appeals where id = appeal_id for update;
  if appeal.id is null or appeal.status <> 'pending' then raise exception 'Appeal is no longer pending'; end if;
  if decision = 'approved' and not public.is_adult_birth_date(appeal.corrected_birth_date) then
    raise exception 'Corrected date must show the requester is at least 18';
  end if;
  select * into restriction from public.age_restrictions where id = appeal.restriction_id for update;
  target_user := coalesce(appeal.restricted_user_id, restriction.restricted_user_id);
  old_status := appeal.status;
  select p.id into audit_target from public.profiles p where p.id = target_user;

  update public.age_appeals
     set status = decision, reviewed_at = now(), reviewed_by = me, review_reason = btrim(decision_reason)
   where id = appeal.id;
  insert into public.moderation_audit_log (
    moderator_id, report_id, target_user_id, action, old_status, new_status, metadata
  ) values (
    me, null, audit_target,
    case when decision = 'approved' then 'age_appeal_approved' else 'age_appeal_rejected' end,
    old_status, decision,
    jsonb_build_object('appeal_id', appeal.id, 'reason', btrim(decision_reason))
  );

  if decision = 'approved' then
    delete from public.age_gate_cooldowns where normalized_email_hash = appeal.normalized_email_hash;
    delete from public.age_restrictions where id = appeal.restriction_id;
    if target_user is not null then
      delete from public.profiles where id = target_user;
      delete from auth.users where id = target_user;
    end if;
  else
    update public.age_restrictions set appeal_status = 'rejected', updated_at = now() where id = appeal.restriction_id;
  end if;
end;
$$;

revoke all on function public.admin_review_age_appeal(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_review_age_appeal(uuid, text, text) to authenticated;
