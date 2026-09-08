alter table public.profiles add column role text not null default 'user' check (role in ('user','moderator','admin'));

create or replace function public.protect_profile_role() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.role := 'user';
  elsif new.role is distinct from old.role and coalesce(current_setting('app.allow_role_change', true), '') <> '1' then
    raise exception 'Role changes require administrator authorization';
  end if;
  return new;
end; $$;
create trigger profiles_role_guard before insert or update of role on public.profiles for each row execute function public.protect_profile_role();
revoke all on function public.protect_profile_role() from public;

create or replace function public.is_moderator() returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('moderator','admin') and deactivated_at is null)
$$;
revoke all on function public.is_moderator() from public;
grant execute on function public.is_moderator() to authenticated;

create table public.moderation_audit_log (
  id uuid primary key default gen_random_uuid(), moderator_id uuid not null references public.profiles(id) on delete restrict,
  report_id uuid not null references public.reports(id) on delete cascade, action text not null,
  old_status text, new_status text, created_at timestamptz not null default now()
);
create index moderation_audit_report_idx on public.moderation_audit_log(report_id, created_at desc);
alter table public.moderation_audit_log enable row level security;
create policy "Moderators read audit log" on public.moderation_audit_log for select to authenticated using (public.is_moderator());

create policy "Moderators read reports" on public.reports for select to authenticated using (public.is_moderator());
create policy "Moderators update report status" on public.reports for update to authenticated using (public.is_moderator()) with check (public.is_moderator());

create or replace function public.log_report_status_change() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.reporter_id is distinct from old.reporter_id or new.target_type is distinct from old.target_type or new.target_id is distinct from old.target_id or new.reason is distinct from old.reason or new.details is distinct from old.details or new.created_at is distinct from old.created_at then
    raise exception 'Only report status may be changed';
  end if;
  if new.status is distinct from old.status then
    insert into public.moderation_audit_log(moderator_id, report_id, action, old_status, new_status)
    values (auth.uid(), new.id, 'status_change', old.status, new.status);
  end if;
  return new;
end; $$;
create trigger reports_status_audit after update of status on public.reports for each row execute function public.log_report_status_change();
revoke all on function public.log_report_status_change() from public;

create or replace function public.set_user_role(target_user uuid, new_role text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_moderator() or not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then raise exception 'Administrator authorization required'; end if;
  if target_user = auth.uid() or new_role not in ('user','moderator','admin') then raise exception 'Invalid role change'; end if;
  perform set_config('app.allow_role_change', '1', true);
  update public.profiles set role = new_role where id = target_user;
end; $$;
revoke all on function public.set_user_role(uuid, text) from public;
grant execute on function public.set_user_role(uuid, text) to authenticated;

create or replace function public.get_report_details(report_uuid uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb; r public.reports;
begin
  if not public.is_moderator() then raise exception 'Moderator authorization required'; end if;
  select * into r from public.reports where id = report_uuid;
  if r.id is null then return null; end if;
  select jsonb_build_object('report', to_jsonb(r), 'profile', case when r.target_type='profile' then (select to_jsonb(p) from public.profiles p where p.id=r.target_profile_id) end,
    'introduction', case when r.target_type='introduction' then (select to_jsonb(i) from public.conversation_introductions i where i.id=r.target_introduction_id) end,
    'message', case when r.target_type='message' then (select to_jsonb(m) from public.messages m where m.id=r.target_message_id) end) into result;
  return result;
end; $$;
revoke all on function public.get_report_details(uuid) from public;
grant execute on function public.get_report_details(uuid) to authenticated;
