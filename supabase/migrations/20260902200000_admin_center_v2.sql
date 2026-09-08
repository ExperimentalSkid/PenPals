-- Admin Center V2: narrowly scoped case operations, safe staff projections,
-- pagination, and operational visibility.  This migration does not alter
-- ordinary user RLS or introduce punitive automation.

-- A deactivation temporarily closes introductions, but reactivation must
-- restore the preference the account had before the administrative action.
alter table public.profiles
  add column if not exists accepting_new_conversations_before_deactivation boolean;

create table if not exists public.moderation_cases (
  id uuid primary key default gen_random_uuid(),
  subject_user_id uuid references public.profiles(id) on delete set null,
  primary_target_type text check (primary_target_type in ('profile','introduction','message')),
  primary_target_id uuid,
  status text not null default 'new' check (status in ('new','triage','investigating','waiting','resolved','dismissed')),
  priority integer not null default 0 check (priority between 0 and 100),
  assigned_staff_id uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_category text,
  created_by uuid references public.profiles(id) on delete set null
);

alter table public.moderation_audit_log
  add column if not exists case_id uuid;

create index if not exists moderation_audit_case_idx
  on public.moderation_audit_log(case_id, created_at desc);

-- If the table was new, the earlier audit-column statement could not have
-- created its foreign key.  Add it idempotently after the table exists.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'moderation_audit_log_case_id_fkey'
       and conrelid = 'public.moderation_audit_log'::regclass
  ) then
    alter table public.moderation_audit_log
      add constraint moderation_audit_log_case_id_fkey
      foreign key (case_id) references public.moderation_cases(id) on delete set null;
  end if;
end;
$$;

create index if not exists moderation_cases_queue_idx
  on public.moderation_cases(status, priority desc, updated_at asc);
create index if not exists moderation_cases_assignment_idx
  on public.moderation_cases(assigned_staff_id, claim_expires_at);
create index if not exists moderation_cases_subject_idx
  on public.moderation_cases(subject_user_id, created_at desc);

create table if not exists public.moderation_case_reports (
  case_id uuid not null references public.moderation_cases(id) on delete cascade,
  report_id uuid not null unique references public.reports(id) on delete cascade,
  linked_at timestamptz not null default now(),
  primary key (case_id, report_id)
);

create index if not exists moderation_case_reports_case_idx
  on public.moderation_case_reports(case_id, linked_at desc);

create table if not exists public.moderation_case_notes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.moderation_cases(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  note text not null check (char_length(btrim(note)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists moderation_case_notes_case_idx
  on public.moderation_case_notes(case_id, created_at desc);

alter table public.moderation_cases enable row level security;
alter table public.moderation_case_reports enable row level security;
alter table public.moderation_case_notes enable row level security;
-- No direct client policies.  Staff use the explicit functions below, which
-- apply role and scope checks before returning or mutating any case data.

alter table public.profile_moderation_evidence
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid references public.profiles(id) on delete set null,
  add column if not exists restore_reason text;

-- Keep helper SECURITY DEFINER functions on a fixed, minimal search path.
alter function public.is_admin() set search_path = pg_catalog, public;
alter function public.is_moderator() set search_path = pg_catalog, public;

-- Explicit moderation-safe projection.  In particular, this never serializes
-- whole rows, so profile privacy, role, internal timestamps, and hidden photo
-- paths cannot accidentally be added to a moderator response later.
create or replace function public.get_report_details(report_uuid uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  r public.reports;
  result jsonb;
begin
  if not public.is_moderator() then
    raise exception 'Moderator authorization required';
  end if;

  select * into r from public.reports where id = report_uuid;
  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'report', jsonb_build_object(
      'id', r.id,
      'reporter_id', r.reporter_id,
      'target_type', r.target_type,
      'target_id', r.target_id,
      'target_profile_id', r.target_profile_id,
      'target_introduction_id', r.target_introduction_id,
      'target_message_id', r.target_message_id,
      'reason', r.reason,
      'details', r.details,
      'status', r.status,
      'created_at', r.created_at,
      'updated_at', r.updated_at,
      'case_id', (select mcr.case_id from public.moderation_case_reports mcr where mcr.report_id = r.id)
    ),
    'profile', case when r.target_type = 'profile' then (
      select jsonb_build_object(
        'id', p.id,
        'username', p.username,
        'display_name', p.display_name,
        'birth_date', p.birth_date,
        'gender', p.gender,
        'country', p.country,
        'city', case when p.show_city then p.city else null end,
        'bio', p.bio,
        'quote', p.quote,
        'looking_for', p.looking_for,
        'avatar_available', (p.avatar_path is not null),
        'is_deactivated', (p.deactivated_at is not null)
      ) from public.profiles p where p.id = r.target_profile_id
    ) end,
    'introduction', case when r.target_type = 'introduction' then (
      select jsonb_build_object(
        'id', i.id,
        'sender_id', i.sender_id,
        'recipient_id', i.recipient_id,
        'body', i.body,
        'icebreaker', i.icebreaker,
        'status', i.status,
        'created_at', i.created_at,
        'handled_at', i.handled_at,
        'expires_at', i.expires_at,
        'conversation_id_legacy', i.conversation_id_legacy
      ) from public.conversation_introductions i where i.id = r.target_introduction_id
    ) end,
    'message', case when r.target_type = 'message' then (
      select jsonb_build_object(
        'id', m.id,
        'conversation_id', m.conversation_id,
        'sender_id', m.sender_id,
        'body', m.body,
        'created_at', m.created_at
      ) from public.messages m where m.id = r.target_message_id
    ) end
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_report_details(uuid) from public, anon, authenticated;
grant execute on function public.get_report_details(uuid) to authenticated;

-- Staff routes must be denied before any downstream query when an account is
-- deactivated.
-- (The application guard reads deactivated_at; this function is also useful to
-- server-side callers that need one canonical check.)
create or replace function public.staff_account_is_active()
returns boolean
language sql
security definer
stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and role in ('moderator','admin')
       and deactivated_at is null
  )
$$;

revoke all on function public.staff_account_is_active() from public, anon, authenticated;
grant execute on function public.staff_account_is_active() to authenticated;

-- Preserve the account's contact preference for both self-service and admin
-- status changes.
create or replace function public.deactivate_account()
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  update public.profiles
     set accepting_new_conversations_before_deactivation = accepting_new_conversations,
         deactivated_at = now(),
         accepting_new_conversations = false
   where id = auth.uid() and deactivated_at is null;
end;
$$;
revoke all on function public.deactivate_account() from public, anon, authenticated;
grant execute on function public.deactivate_account() to authenticated;

create or replace function public.reactivate_account()
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  update public.profiles
     set deactivated_at = null,
         accepting_new_conversations = coalesce(accepting_new_conversations_before_deactivation, accepting_new_conversations),
         accepting_new_conversations_before_deactivation = null
   where id = auth.uid() and deactivated_at is not null;
end;
$$;
revoke all on function public.reactivate_account() from public, anon, authenticated;
grant execute on function public.reactivate_account() to authenticated;

-- Replace the latest reason-required administrative status function while
-- preserving its authorization, last-admin guard, and audit behavior.
create or replace function public.admin_set_account_status(
  target_user uuid,
  should_deactivate boolean,
  change_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  was_deactivated boolean;
  target_role text;
  clean_reason text := nullif(btrim(change_reason), '');
begin
  if not public.is_admin() then raise exception 'Administrator authorization required'; end if;
  if target_user is null or target_user = auth.uid() then raise exception 'Administrators cannot change their own account status'; end if;
  if clean_reason is null or char_length(clean_reason) > 500 then raise exception 'A moderation reason is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('penpal-admin-role-change', 0));
  select (deactivated_at is not null), role
    into was_deactivated, target_role
    from public.profiles where id = target_user for update;
  if was_deactivated is null then raise exception 'User not found'; end if;
  if was_deactivated = should_deactivate then return; end if;
  if should_deactivate and target_role = 'admin'
     and (select count(*) from public.profiles where role = 'admin' and deactivated_at is null) <= 1 then
    raise exception 'Cannot deactivate the last active administrator';
  end if;
  if should_deactivate then
    update public.profiles
       set accepting_new_conversations_before_deactivation = accepting_new_conversations,
           deactivated_at = now(), accepting_new_conversations = false
     where id = target_user;
  else
    update public.profiles
       set deactivated_at = null,
           accepting_new_conversations = coalesce(accepting_new_conversations_before_deactivation, accepting_new_conversations),
           accepting_new_conversations_before_deactivation = null
     where id = target_user;
  end if;
  insert into public.moderation_audit_log(moderator_id, target_user_id, action, old_status, new_status, metadata)
  values (auth.uid(), target_user,
          case when should_deactivate then 'deactivate_account' else 'reactivate_account' end,
          case when was_deactivated then 'deactivated' else 'active' end,
          case when should_deactivate then 'deactivated' else 'active' end,
          jsonb_build_object('target_user_id', target_user, 'reason', clean_reason));
end;
$$;
revoke all on function public.admin_set_account_status(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_set_account_status(uuid, boolean, text) to authenticated;

-- Deterministic triage only.  It changes ordering, never account/content
-- state, and groups only exact message/introduction targets.  Profile reports
-- always become separate cases so unrelated incidents are not merged.
create or replace function public.moderation_reason_priority(report_reason text, target_kind text)
returns integer language sql immutable set search_path = pg_catalog, public as $$
  select least(100, (case report_reason
    when 'underage concern' then 90
    when 'sexual/inappropriate content' then 80
    when 'hate/abuse' then 75
    when 'harassment' then 70
    when 'scam/fraud' then 65
    when 'fake profile/impersonation' then 60
    when 'spam' then 35
    else 20 end) + case when target_kind = 'message' then 5 else 0 end)
$$;

create or replace function public.refresh_moderation_case_metrics(target_case uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  report_total bigint;
  reporter_total bigint;
  calculated_priority integer;
begin
  select count(*), count(distinct r.reporter_id), coalesce(max(public.moderation_reason_priority(r.reason, r.target_type)), 0)
    into report_total, reporter_total, calculated_priority
    from public.moderation_case_reports cr join public.reports r on r.id = cr.report_id
   where cr.case_id = target_case;
  calculated_priority := least(100, calculated_priority + greatest(0, least(20, (reporter_total - 1) * 5)));
  update public.moderation_cases
     set report_count = report_total,
         independent_reporter_count = reporter_total,
         priority = calculated_priority,
         updated_at = now()
   where id = target_case;
end;
$$;

-- Add metric columns after the helper is declared so upgrades from the first
-- case migration remain safe.
alter table public.moderation_cases
  add column if not exists report_count bigint not null default 0,
  add column if not exists independent_reporter_count bigint not null default 0;

create or replace function public.link_report_to_moderation_case()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  target_case uuid;
  subject uuid;
begin
  if new.target_type = 'message' then
    select m.sender_id into subject from public.messages m where m.id = new.target_message_id;
    select cr.case_id into target_case
      from public.moderation_case_reports cr
      join public.reports prior on prior.id = cr.report_id
     where prior.target_type = new.target_type and prior.target_id = new.target_id
     order by cr.linked_at limit 1;
  elsif new.target_type = 'introduction' then
    select i.sender_id into subject from public.conversation_introductions i where i.id = new.target_introduction_id;
    select cr.case_id into target_case
      from public.moderation_case_reports cr
      join public.reports prior on prior.id = cr.report_id
     where prior.target_type = new.target_type and prior.target_id = new.target_id
     order by cr.linked_at limit 1;
  elsif new.target_type = 'profile' then
    subject := new.target_profile_id;
  end if;

  if target_case is null then
    insert into public.moderation_cases(subject_user_id, primary_target_type, primary_target_id, priority, created_by)
      values (subject, new.target_type, new.target_id, public.moderation_reason_priority(new.reason, new.target_type), new.reporter_id)
      returning id into target_case;
    insert into public.moderation_audit_log(moderator_id, case_id, report_id, target_user_id, action, metadata)
      values (null, target_case, new.id, subject, 'case_created', jsonb_build_object('source', 'report'));
  end if;
  insert into public.moderation_case_reports(case_id, report_id) values (target_case, new.id)
    on conflict (report_id) do nothing;
  perform public.refresh_moderation_case_metrics(target_case);
  return new;
end;
$$;

drop trigger if exists reports_case_link on public.reports;
create trigger reports_case_link after insert on public.reports
for each row execute function public.link_report_to_moderation_case();

revoke all on function public.moderation_reason_priority(text, text) from public, anon, authenticated;
revoke all on function public.refresh_moderation_case_metrics(uuid) from public, anon, authenticated;
revoke all on function public.link_report_to_moderation_case() from public, anon, authenticated;

-- The backfill above cannot invoke a trigger function directly on all Postgres
-- versions.  Use a one-time insert/update path that safely reuses the same
-- exact-target grouping semantics.
do $$
declare
  report_row record;
  case_row uuid;
begin
  for report_row in select r.* from public.reports r left join public.moderation_case_reports cr on cr.report_id = r.id where cr.report_id is null loop
    case_row := null;
    if report_row.target_type in ('message','introduction') then
      select cr.case_id into case_row
        from public.moderation_case_reports cr join public.reports prior on prior.id = cr.report_id
       where prior.target_type = report_row.target_type and prior.target_id = report_row.target_id
       order by cr.linked_at limit 1;
    end if;
    if case_row is null then
      insert into public.moderation_cases(subject_user_id, primary_target_type, primary_target_id, priority, created_by)
      values (
        case when report_row.target_type = 'profile' then report_row.target_profile_id
             when report_row.target_type = 'message' then (select sender_id from public.messages where id = report_row.target_message_id)
             else (select sender_id from public.conversation_introductions where id = report_row.target_introduction_id) end,
        report_row.target_type, report_row.target_id,
        public.moderation_reason_priority(report_row.reason, report_row.target_type), report_row.reporter_id)
      returning id into case_row;
    end if;
    insert into public.moderation_case_reports(case_id, report_id) values (case_row, report_row.id) on conflict do nothing;
    perform public.refresh_moderation_case_metrics(case_row);
  end loop;
end;
$$;

-- Explicit staff case listing with true server-side pagination.
create or replace function public.admin_list_moderation_cases(
  status_filter text default null,
  assigned_filter uuid default null,
  page_size integer default 30,
  page_offset integer default 0
)
returns table (
  id uuid, subject_user_id uuid, subject_username text, subject_display_name text,
  primary_target_type text, primary_target_id uuid, status text, priority integer,
  assigned_staff_id uuid, assigned_staff_name text, claimed_at timestamptz,
  claim_expires_at timestamptz, created_at timestamptz, updated_at timestamptz,
  resolved_at timestamptz, resolution_category text, report_count bigint,
  independent_reporter_count bigint, total_count bigint
)
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if not public.is_moderator() then raise exception 'Moderator authorization required'; end if;
  page_size := least(greatest(coalesce(page_size, 30), 1), 100);
  page_offset := greatest(coalesce(page_offset, 0), 0);
  return query
  select c.id, c.subject_user_id, subject.username, subject.display_name,
         c.primary_target_type, c.primary_target_id, c.status, c.priority,
         c.assigned_staff_id, assigned.display_name,
         c.claimed_at, c.claim_expires_at, c.created_at, c.updated_at,
         c.resolved_at, c.resolution_category, c.report_count,
         c.independent_reporter_count, count(*) over ()
    from public.moderation_cases c
    left join public.profiles subject on subject.id = c.subject_user_id
    left join public.profiles assigned on assigned.id = c.assigned_staff_id
   where (status_filter is null or status_filter = '' or c.status = status_filter)
     and (assigned_filter is null or c.assigned_staff_id = assigned_filter)
   order by c.priority desc, c.updated_at asc
   limit page_size offset page_offset;
end;
$$;

revoke all on function public.admin_list_moderation_cases(text, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_list_moderation_cases(text, uuid, integer, integer) to authenticated;

create or replace function public.admin_get_moderation_case(case_uuid uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  if not public.is_moderator() then raise exception 'Moderator authorization required'; end if;
  select jsonb_build_object(
    'case', jsonb_build_object(
      'id', c.id, 'subject_user_id', c.subject_user_id,
      'primary_target_type', c.primary_target_type, 'primary_target_id', c.primary_target_id,
      'status', c.status, 'priority', c.priority, 'assigned_staff_id', c.assigned_staff_id,
      'claimed_at', c.claimed_at, 'claim_expires_at', c.claim_expires_at,
      'created_at', c.created_at, 'updated_at', c.updated_at, 'resolved_at', c.resolved_at,
      'resolution_category', c.resolution_category,
      'report_count', c.report_count, 'independent_reporter_count', c.independent_reporter_count
    ),
    'reports', coalesce((select jsonb_agg(jsonb_build_object(
      'id', r.id, 'reporter_id', r.reporter_id, 'target_type', r.target_type,
      'target_id', r.target_id, 'reason', r.reason, 'details', r.details,
      'status', r.status, 'created_at', r.created_at
    ) order by r.created_at desc) from public.moderation_case_reports cr join public.reports r on r.id = cr.report_id where cr.case_id = c.id), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'author_id', n.author_id, 'note', n.note, 'created_at', n.created_at) order by n.created_at desc) from public.moderation_case_notes n where n.case_id = c.id), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'action', a.action, 'old_status', a.old_status, 'new_status', a.new_status, 'metadata', a.metadata, 'created_at', a.created_at) order by a.created_at desc) from public.moderation_audit_log a where a.case_id = c.id), '[]'::jsonb)
  ) into result
  from public.moderation_cases c where c.id = case_uuid;
  return result;
end;
$$;

revoke all on function public.admin_get_moderation_case(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_moderation_case(uuid) to authenticated;

create or replace function public.claim_moderation_case(case_uuid uuid, lease_minutes integer default 30)
returns public.moderation_cases
language plpgsql security definer set search_path = pg_catalog, public as $$
declare current_case public.moderation_cases;
begin
  if not public.is_moderator() then raise exception 'Moderator authorization required'; end if;
  lease_minutes := least(greatest(coalesce(lease_minutes, 30), 5), 240);
  perform pg_advisory_xact_lock(hashtextextended('penpal-case:' || case_uuid::text, 0));
  select * into current_case from public.moderation_cases where id = case_uuid for update;
  if current_case.id is null then raise exception 'Case not found'; end if;
  if current_case.assigned_staff_id is not null
     and current_case.assigned_staff_id <> auth.uid()
     and coalesce(current_case.claim_expires_at, 'infinity'::timestamptz) > now()
  then raise exception 'Case is currently claimed by another staff member'; end if;
  update public.moderation_cases
     set assigned_staff_id = auth.uid(), claimed_at = coalesce(claimed_at, now()),
         claim_expires_at = now() + make_interval(mins => lease_minutes), updated_at = now()
   where id = case_uuid
   returning * into current_case;
  insert into public.moderation_audit_log(moderator_id, case_id, target_user_id, action, metadata)
    values (auth.uid(), case_uuid, current_case.subject_user_id, 'case_claim', jsonb_build_object('lease_minutes', lease_minutes));
  return current_case;
end;
$$;

create or replace function public.release_moderation_case(case_uuid uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare subject uuid;
begin
  if not public.is_moderator() then raise exception 'Moderator authorization required'; end if;
  select subject_user_id into subject from public.moderation_cases where id = case_uuid for update;
  if not found then raise exception 'Case not found'; end if;
  if not public.is_admin() and not exists (select 1 from public.moderation_cases where id = case_uuid and assigned_staff_id = auth.uid()) then
    raise exception 'Only the case owner or an administrator may release this case';
  end if;
  update public.moderation_cases set assigned_staff_id = null, claimed_at = null, claim_expires_at = null, updated_at = now() where id = case_uuid;
  insert into public.moderation_audit_log(moderator_id, case_id, target_user_id, action) values (auth.uid(), case_uuid, subject, 'case_release');
end;
$$;

create or replace function public.reassign_moderation_case(case_uuid uuid, new_staff uuid, assignment_reason text)
returns public.moderation_cases
language plpgsql security definer set search_path = pg_catalog, public as $$
declare updated_case public.moderation_cases;
declare clean_reason text := nullif(btrim(assignment_reason), '');
begin
  if not public.is_admin() then raise exception 'Administrator authorization required'; end if;
  if clean_reason is null or char_length(clean_reason) > 500 then raise exception 'A reassignment reason is required'; end if;
  if new_staff is not null and not exists (select 1 from public.profiles where id = new_staff and role in ('moderator','admin') and deactivated_at is null) then raise exception 'Staff member is not active'; end if;
  update public.moderation_cases set assigned_staff_id = new_staff, claimed_at = case when new_staff is null then null else now() end, claim_expires_at = case when new_staff is null then null else now() + interval '30 minutes' end, updated_at = now() where id = case_uuid returning * into updated_case;
  if updated_case.id is null then raise exception 'Case not found'; end if;
  insert into public.moderation_audit_log(moderator_id, case_id, target_user_id, action, metadata) values (auth.uid(), case_uuid, updated_case.subject_user_id, 'case_reassign', jsonb_build_object('assigned_staff_id', new_staff, 'reason', clean_reason));
  return updated_case;
end;
$$;

create or replace function public.set_moderation_case_status(case_uuid uuid, new_status text, resolution text default null, status_reason text default null)
returns public.moderation_cases
language plpgsql security definer set search_path = pg_catalog, public as $$
declare updated_case public.moderation_cases;
declare clean_reason text := nullif(btrim(status_reason), '');
begin
  if not public.is_moderator() then raise exception 'Moderator authorization required'; end if;
  if new_status not in ('new','triage','investigating','waiting','resolved','dismissed') then raise exception 'Invalid case status'; end if;
  if clean_reason is null or char_length(clean_reason) > 500 then raise exception 'A status reason is required'; end if;
  update public.moderation_cases
     set status = new_status,
         resolution_category = nullif(btrim(resolution), ''),
         resolved_at = case when new_status in ('resolved','dismissed') then coalesce(resolved_at, now()) else null end,
         updated_at = now()
   where id = case_uuid returning * into updated_case;
  if updated_case.id is null then raise exception 'Case not found'; end if;
  insert into public.moderation_audit_log(moderator_id, case_id, target_user_id, action, old_status, new_status, metadata)
    values (auth.uid(), case_uuid, updated_case.subject_user_id, 'case_status_change', null, new_status, jsonb_build_object('reason', clean_reason, 'resolution_category', resolution));
  return updated_case;
end;
$$;

create or replace function public.add_moderation_case_note(case_uuid uuid, note_text text)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare note_id uuid;
declare clean_note text := nullif(btrim(note_text), '');
declare subject uuid;
begin
  if not public.is_moderator() then raise exception 'Moderator authorization required'; end if;
  if clean_note is null or char_length(clean_note) > 4000 then raise exception 'A case note is required'; end if;
  select subject_user_id into subject from public.moderation_cases where id = case_uuid;
  if not found then raise exception 'Case not found'; end if;
  insert into public.moderation_case_notes(case_id, author_id, note) values (case_uuid, auth.uid(), clean_note) returning id into note_id;
  insert into public.moderation_audit_log(moderator_id, case_id, target_user_id, action, metadata) values (auth.uid(), case_uuid, subject, 'case_note_added', jsonb_build_object('note_id', note_id));
  return note_id;
end;
$$;

revoke all on function public.claim_moderation_case(uuid, integer) from public, anon, authenticated;
revoke all on function public.release_moderation_case(uuid) from public, anon, authenticated;
revoke all on function public.reassign_moderation_case(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.set_moderation_case_status(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.add_moderation_case_note(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_moderation_case(uuid, integer) to authenticated;
grant execute on function public.release_moderation_case(uuid) to authenticated;
grant execute on function public.reassign_moderation_case(uuid, uuid, text) to authenticated;
grant execute on function public.set_moderation_case_status(uuid, text, text, text) to authenticated;
grant execute on function public.add_moderation_case_note(uuid, text) to authenticated;

-- Restore only exact, still-retained profile evidence.  Existing live content
-- is never overwritten and the operation is immutable/audited.
create or replace function public.admin_restore_profile_content(evidence_uuid uuid, restore_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare evidence public.profile_moderation_evidence;
declare clean_reason text := nullif(btrim(restore_reason), '');
begin
  if not public.is_admin() then raise exception 'Administrator authorization required'; end if;
  if clean_reason is null or char_length(clean_reason) > 500 then raise exception 'A restoration reason is required'; end if;
  select * into evidence from public.profile_moderation_evidence where id = evidence_uuid for update;
  if evidence.id is null or evidence.target_user_id is null or evidence.previous_value is null then raise exception 'Evidence is unavailable for restoration'; end if;
  if evidence.restored_at is not null then raise exception 'Evidence has already been restored'; end if;
  if evidence.content_type = 'bio' then
    update public.profiles set bio = evidence.previous_value where id = evidence.target_user_id and nullif(btrim(bio), '') is null;
  elsif evidence.content_type = 'quote' then
    update public.profiles set quote = evidence.previous_value where id = evidence.target_user_id and nullif(btrim(quote), '') is null;
  elsif evidence.content_type = 'looking_for' then
    update public.profiles set looking_for = evidence.previous_value where id = evidence.target_user_id and nullif(btrim(looking_for), '') is null;
  elsif evidence.content_type = 'avatar' then
    update public.profiles set avatar_path = evidence.previous_value where id = evidence.target_user_id and nullif(btrim(avatar_path), '') is null;
  else raise exception 'Unsupported evidence type'; end if;
  if not found then raise exception 'Current profile content is not empty'; end if;
  update public.profile_moderation_evidence set restored_at = now(), restored_by = auth.uid(), restore_reason = clean_reason where id = evidence_uuid;
  insert into public.moderation_audit_log(moderator_id, target_user_id, action, metadata) values (auth.uid(), evidence.target_user_id, 'profile_content_restored', jsonb_build_object('evidence_id', evidence_uuid, 'content_type', evidence.content_type, 'reason', clean_reason));
end;
$$;
revoke all on function public.admin_restore_profile_content(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_restore_profile_content(uuid, text) to authenticated;

-- User pagination is done in SQL rather than loading the whole directory into
-- the browser.  The projection matches the established admin directory.
create or replace function public.admin_list_users_page(
  search_query text default null, status_filter text default 'all', role_filter text default 'all', completeness_filter text default 'all', page_size integer default 50, page_offset integer default 0
)
returns table (id uuid, username text, display_name text, birth_date date, gender text, country text, city text, role text, deactivated_at timestamptz, last_active_at timestamptz, created_at timestamptz, availability text, profile_visibility text, show_activity_status boolean, show_response_rate boolean, accepting_new_conversations boolean, profile_complete boolean, has_photo boolean, total_count bigint)
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if not public.is_admin() then raise exception 'Administrator authorization required'; end if;
  page_size := least(greatest(coalesce(page_size, 50), 1), 100); page_offset := greatest(coalesce(page_offset, 0), 0);
  return query
  with profile_rows as (
    select p.*, (nullif(trim(p.display_name), '') is not null and p.birth_date is not null and nullif(trim(p.gender), '') is not null and nullif(trim(p.country), '') is not null and nullif(trim(p.city), '') is not null and nullif(trim(p.bio), '') is not null and nullif(trim(p.quote), '') is not null and nullif(trim(p.looking_for), '') is not null and nullif(trim(p.avatar_path), '') is not null and exists(select 1 from public.profile_languages pl where pl.profile_id=p.id) and (select count(*) from public.profile_interests pi where pi.profile_id=p.id) >= 3) as profile_complete
    from public.profiles p
  )
  select r.id,r.username,r.display_name,r.birth_date,r.gender,r.country,r.city,r.role,r.deactivated_at,r.last_active_at,r.created_at,r.availability,r.profile_visibility,r.show_activity_status,r.show_response_rate,r.accepting_new_conversations,r.profile_complete,(r.avatar_path is not null),count(*) over()
    from profile_rows r
   where (nullif(trim(search_query), '') is null or r.username ilike '%'||trim(search_query)||'%' or r.display_name ilike '%'||trim(search_query)||'%')
     and (status_filter='all' or (status_filter='active' and r.deactivated_at is null) or (status_filter='deactivated' and r.deactivated_at is not null))
     and (role_filter='all' or r.role=role_filter)
     and (completeness_filter='all' or (completeness_filter='complete' and r.profile_complete) or (completeness_filter='incomplete' and not r.profile_complete))
   order by (r.deactivated_at is null) desc, r.last_active_at desc nulls last, r.created_at desc
   limit page_size offset page_offset;
end;
$$;
revoke all on function public.admin_list_users_page(text, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_list_users_page(text, text, text, text, integer, integer) to authenticated;

create or replace function public.admin_list_user_cases(target_user uuid)
returns table (id uuid, status text, priority integer, report_count bigint, independent_reporter_count bigint, assigned_staff_id uuid, created_at timestamptz, updated_at timestamptz)
language sql security definer stable set search_path = pg_catalog, public as $$
  select c.id,c.status,c.priority,c.report_count,c.independent_reporter_count,c.assigned_staff_id,c.created_at,c.updated_at
    from public.moderation_cases c
   where public.is_admin() and c.subject_user_id = target_user
   order by c.updated_at desc
$$;
revoke all on function public.admin_list_user_cases(uuid) from public, anon, authenticated;
grant execute on function public.admin_list_user_cases(uuid) to authenticated;

-- Efficient dashboard aggregates.  Technical/security queues are admin-only;
-- moderators receive only moderation case counts.
create or replace function public.admin_dashboard_summary()
returns jsonb language plpgsql security definer stable set search_path = pg_catalog, public as $$
declare admin_view boolean := public.is_admin();
begin
  if not public.is_moderator() then raise exception 'Moderator authorization required'; end if;
  return jsonb_build_object(
    'new_cases', (select count(*) from public.moderation_cases where status='new'),
    'triage_cases', (select count(*) from public.moderation_cases where status='triage'),
    'investigating_cases', (select count(*) from public.moderation_cases where status='investigating'),
    'waiting_cases', (select count(*) from public.moderation_cases where status='waiting'),
    'high_priority_unassigned', (select count(*) from public.moderation_cases where assigned_staff_id is null and status not in ('resolved','dismissed') and priority >= 70),
    'multi_reporter_cases', (select count(*) from public.moderation_cases where independent_reporter_count >= 2 and status not in ('resolved','dismissed')),
    'stale_cases', (select count(*) from public.moderation_cases where status not in ('resolved','dismissed') and updated_at < now() - interval '7 days'),
    'pending_age_appeals', case when admin_view then (select count(*) from public.age_appeals where status='pending') else 0 end,
    'storage_pending', case when admin_view then (select count(*) from public.account_storage_deletion_outbox where completed_at is null and next_attempt_at <= now()) else 0 end,
    'storage_failed', case when admin_view then (select count(*) from public.account_storage_deletion_outbox where completed_at is null and last_error is not null) else 0 end,
    'storage_oldest_pending', case when admin_view then (select min(requested_at) from public.account_storage_deletion_outbox where completed_at is null) else null end,
    'retention_unconfigured', case when admin_view then (select count(*) from public.data_retention_policies where enabled=false or retention_period is null) else 0 end,
    'active_holds', case when admin_view then (select count(*) from public.data_retention_holds where released_at is null) else 0 end,
    'active_users', case when admin_view then (select count(*) from public.profiles where deactivated_at is null) else 0 end,
    'deactivated_users', case when admin_view then (select count(*) from public.profiles where deactivated_at is not null) else 0 end
  );
end;
$$;
revoke all on function public.admin_dashboard_summary() from public, anon, authenticated;
grant execute on function public.admin_dashboard_summary() to authenticated;

-- Moderators can read only moderation-relevant events.  Admin-only security,
-- IP, user-detail, role and retention events remain invisible to them.
-- This includes security_context_view, user_detail_view, and related-account
-- investigation events generated by the existing trust-and-safety RPCs.
drop policy if exists "Moderators read audit log" on public.moderation_audit_log;
create policy "Staff read scoped audit log" on public.moderation_audit_log
for select to authenticated
using (
  public.is_admin()
  or (public.is_moderator() and action in (
    'status_change','case_created','case_status_change','case_claim','case_release',
    'case_reassign','case_note_added','conversation_review'
  ))
);

-- Audit listing is paginated and returns only rows allowed by the policy.
create or replace function public.admin_list_audit_entries(action_filter text default null, actor_filter uuid default null, page_size integer default 50, page_offset integer default 0)
returns table (id uuid, moderator_id uuid, report_id uuid, target_user_id uuid, case_id uuid, action text, old_status text, new_status text, metadata jsonb, created_at timestamptz, total_count bigint)
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if not public.is_moderator() then raise exception 'Moderator authorization required'; end if;
  page_size := least(greatest(coalesce(page_size,50),1),100); page_offset := greatest(coalesce(page_offset,0),0);
  return query
  select a.id,a.moderator_id,a.report_id,a.target_user_id,a.case_id,a.action,a.old_status,a.new_status,a.metadata,a.created_at,count(*) over()
    from public.moderation_audit_log a
   where (public.is_admin() or a.action in ('status_change','case_created','case_status_change','case_claim','case_release','case_reassign','case_note_added','conversation_review'))
     and (nullif(trim(action_filter), '') is null or a.action = action_filter)
     and (actor_filter is null or a.moderator_id = actor_filter)
   order by a.created_at desc
   limit page_size offset page_offset;
end;
$$;
revoke all on function public.admin_list_audit_entries(text, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_list_audit_entries(text, uuid, integer, integer) to authenticated;
