-- Automated adult-services content flagging is a review signal only.  It never
-- changes a user's account state or applies enforcement automatically.

create table if not exists public.moderation_detection_rules (
  id uuid primary key default gen_random_uuid(),
  rule_identifier text not null unique check (rule_identifier ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
  term text not null check (char_length(btrim(term)) between 1 and 160),
  category text not null check (category in (
    'paid_adult_content','pornography_service','cam_service',
    'escort_or_prostitution','sexual_service','commercial_fetish_service',
    'adult_service_other'
  )),
  match_type text not null default 'word' check (match_type in ('contains','word','domain')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.moderation_detection_rules enable row level security;
revoke all on table public.moderation_detection_rules from public, anon, authenticated;

create table if not exists public.moderation_content_flags (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.moderation_detection_rules(id) on delete restrict,
  target_type text not null check (target_type in ('profile','introduction','message')),
  target_id uuid not null,
  target_user_id uuid references public.profiles(id) on delete set null,
  field_name text not null check (field_name in ('username','bio','quote','looking_for','introduction','message')),
  conversation_id uuid references public.conversations(id) on delete set null,
  content_snapshot text not null check (char_length(content_snapshot) <= 10000),
  content_hash text not null,
  category text not null check (category in (
    'paid_adult_content','pornography_service','cam_service',
    'escort_or_prostitution','sexual_service','commercial_fetish_service',
    'adult_service_other'
  )),
  source text not null default 'automated' check (source = 'automated'),
  status text not null default 'flagged_for_review' check (status in ('flagged_for_review','cleared','confirmed')),
  case_id uuid references public.moderation_cases(id) on delete set null,
  created_at timestamptz not null default now(),
  cleared_at timestamptz,
  cleared_by uuid references public.profiles(id) on delete set null,
  resolution_reason text
);

alter table public.moderation_content_flags enable row level security;
revoke all on table public.moderation_content_flags from public, anon, authenticated;
create index if not exists moderation_content_flags_target_idx
  on public.moderation_content_flags(target_type, target_id, created_at desc);
create index if not exists moderation_content_flags_case_idx
  on public.moderation_content_flags(case_id, created_at desc);
create unique index if not exists moderation_content_flags_active_unique
  on public.moderation_content_flags(target_type, target_id, field_name, rule_id, content_hash)
  where status = 'flagged_for_review';

create table if not exists public.moderation_case_flags (
  case_id uuid not null references public.moderation_cases(id) on delete cascade,
  flag_id uuid not null unique references public.moderation_content_flags(id) on delete cascade,
  linked_at timestamptz not null default now(),
  primary key (case_id, flag_id)
);
alter table public.moderation_case_flags enable row level security;
revoke all on table public.moderation_case_flags from public, anon, authenticated;

alter table public.moderation_cases
  add column if not exists source text not null default 'report',
  add column if not exists automated_flag_count bigint not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'moderation_cases_source_check' and conrelid = 'public.moderation_cases'::regclass) then
    alter table public.moderation_cases add constraint moderation_cases_source_check check (source in ('report','automated_flag','mixed'));
  end if;
end;
$$;

alter table public.profiles
  add column if not exists moderation_flagged_fields text[] not null default '{}'::text[];
alter table public.messages
  add column if not exists moderation_status text not null default 'clear';
alter table public.conversation_introductions
  add column if not exists moderation_status text not null default 'clear';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_moderation_flagged_fields_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_moderation_flagged_fields_check check (moderation_flagged_fields <@ array['username','bio','quote','looking_for']::text[]);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'messages_moderation_status_check' and conrelid = 'public.messages'::regclass) then
    alter table public.messages add constraint messages_moderation_status_check check (moderation_status in ('clear','flagged_for_review'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'introductions_moderation_status_check' and conrelid = 'public.conversation_introductions'::regclass) then
    alter table public.conversation_introductions add constraint introductions_moderation_status_check check (moderation_status in ('clear','flagged_for_review'));
  end if;
end;
$$;

create or replace function public.moderation_normalized_text(value text)
returns text language sql immutable strict set search_path = pg_catalog as $$
  select btrim(regexp_replace(lower(coalesce(value, '')), '[^[:alnum:]]+', ' ', 'g'))
$$;

create or replace function public.moderation_rule_matches(rule_term text, rule_match_type text, content text)
returns boolean language sql immutable strict set search_path = pg_catalog as $$
  select case
    when rule_match_type = 'contains' then position(lower(btrim(rule_term)) in lower(content)) > 0
    else position(' ' || public.moderation_normalized_text(rule_term) || ' ' in ' ' || public.moderation_normalized_text(content) || ' ') > 0
  end
$$;
revoke all on function public.moderation_normalized_text(text) from public, anon, authenticated;
revoke all on function public.moderation_rule_matches(text, text, text) from public, anon, authenticated;

create or replace function public.protect_moderation_status_columns()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if coalesce(current_setting('app.allow_moderation_flag_update', true), '') <> '1' then
    if tg_table_name = 'profiles' then
      new.moderation_flagged_fields := old.moderation_flagged_fields;
    else
      new.moderation_status := old.moderation_status;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.protect_moderation_status_columns() from public, anon, authenticated;
drop trigger if exists profiles_moderation_status_guard on public.profiles;
create trigger profiles_moderation_status_guard before update on public.profiles for each row execute function public.protect_moderation_status_columns();
drop trigger if exists messages_moderation_status_guard on public.messages;
create trigger messages_moderation_status_guard before update on public.messages for each row execute function public.protect_moderation_status_columns();
drop trigger if exists introductions_moderation_status_guard on public.conversation_introductions;
create trigger introductions_moderation_status_guard before update on public.conversation_introductions for each row execute function public.protect_moderation_status_columns();

create or replace function public.refresh_moderation_content_state(target_kind text, target_uuid uuid)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  profile_fields text[];
  current_body text;
begin
  if target_kind = 'profile' then
    select coalesce(array_agg(distinct f.field_name order by f.field_name), '{}'::text[]) into profile_fields
      from public.moderation_content_flags f
     where f.target_type = 'profile' and f.target_id = target_uuid and f.status = 'flagged_for_review'
       and f.content_hash = case f.field_name
         when 'username' then md5((select p.username from public.profiles p where p.id = target_uuid))
         when 'bio' then md5((select p.bio from public.profiles p where p.id = target_uuid))
         when 'quote' then md5((select p.quote from public.profiles p where p.id = target_uuid))
         when 'looking_for' then md5((select p.looking_for from public.profiles p where p.id = target_uuid))
       end;
    perform set_config('app.allow_moderation_flag_update', '1', true);
    update public.profiles set moderation_flagged_fields = profile_fields where id = target_uuid;
  elsif target_kind = 'message' then
    select m.body into current_body from public.messages m where m.id = target_uuid;
    perform set_config('app.allow_moderation_flag_update', '1', true);
    update public.messages set moderation_status = case when exists (
      select 1 from public.moderation_content_flags f where f.target_type = 'message' and f.target_id = target_uuid and f.status = 'flagged_for_review' and f.content_hash = md5(current_body)
    ) then 'flagged_for_review' else 'clear' end where id = target_uuid;
  elsif target_kind = 'introduction' then
    select coalesce(nullif(i.icebreaker, ''), i.body) into current_body from public.conversation_introductions i where i.id = target_uuid;
    perform set_config('app.allow_moderation_flag_update', '1', true);
    update public.conversation_introductions set moderation_status = case when exists (
      select 1 from public.moderation_content_flags f where f.target_type = 'introduction' and f.target_id = target_uuid and f.status = 'flagged_for_review' and f.content_hash = md5(current_body)
    ) then 'flagged_for_review' else 'clear' end where id = target_uuid;
  end if;
end;
$$;
revoke all on function public.refresh_moderation_content_state(text, uuid) from public, anon, authenticated;

create or replace function public.flag_moderation_content(target_kind text, target_uuid uuid, content_owner uuid, content_field text, content_value text, related_conversation uuid default null)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  rule_row record;
  existing_flag public.moderation_content_flags;
  inserted_flag_id uuid;
  target_case uuid;
  hash text;
  clean_content text := left(coalesce(content_value, ''), 10000);
begin
  if clean_content = '' or target_kind not in ('profile','introduction','message') then return; end if;
  hash := md5(clean_content);
  for rule_row in select * from public.moderation_detection_rules where enabled order by id loop
    if not public.moderation_rule_matches(rule_row.term, rule_row.match_type, clean_content) then continue; end if;
    perform pg_advisory_xact_lock(hashtextextended('auto-flag:' || target_kind || ':' || target_uuid::text || ':' || content_field || ':' || rule_row.id::text || ':' || hash, 0));
    select * into existing_flag from public.moderation_content_flags f
     where f.target_type = target_kind and f.target_id = target_uuid and f.field_name = content_field and f.rule_id = rule_row.id and f.content_hash = hash
     order by f.created_at desc limit 1;
    if existing_flag.id is not null then
      if existing_flag.case_id is not null then target_case := existing_flag.case_id; end if;
      if existing_flag.status = 'flagged_for_review' then perform public.refresh_moderation_content_state(target_kind, target_uuid); end if;
      continue;
    end if;
    select c.id into target_case from public.moderation_cases c
      join public.moderation_content_flags f on f.case_id = c.id
     where f.target_type = target_kind and f.target_id = target_uuid and c.status not in ('resolved','dismissed')
     order by c.updated_at desc limit 1;
    if target_case is null then
      insert into public.moderation_cases(subject_user_id, primary_target_type, primary_target_id, priority, source)
        values (content_owner, target_kind, target_uuid, 75, 'automated_flag') returning id into target_case;
      insert into public.moderation_audit_log(moderator_id, case_id, target_user_id, action, metadata)
        values (null, target_case, content_owner, 'case_created', jsonb_build_object('source','automated_flag'));
    end if;
    insert into public.moderation_content_flags(rule_id, target_type, target_id, target_user_id, field_name, conversation_id, content_snapshot, content_hash, category, case_id)
      values (rule_row.id, target_kind, target_uuid, content_owner, content_field, related_conversation, clean_content, hash, rule_row.category, target_case)
      returning id into inserted_flag_id;
    insert into public.moderation_case_flags(case_id, flag_id) values (target_case, inserted_flag_id) on conflict do nothing;
    update public.moderation_cases set automated_flag_count = automated_flag_count + 1, updated_at = now(), source = case when source = 'report' then 'mixed' else source end where id = target_case;
    perform set_config('app.allow_moderation_flag_update', '1', true);
    if target_kind = 'profile' then
      update public.profiles set moderation_flagged_fields = array(select distinct unnest(coalesce(moderation_flagged_fields, '{}') || content_field) order by 1) where id = target_uuid;
    elsif target_kind = 'message' then update public.messages set moderation_status = 'flagged_for_review' where id = target_uuid;
    elsif target_kind = 'introduction' then update public.conversation_introductions set moderation_status = 'flagged_for_review' where id = target_uuid;
    end if;
    insert into public.moderation_audit_log(moderator_id, case_id, target_user_id, action, metadata)
      values (null, target_case, content_owner, 'automated_flag_created', jsonb_build_object('source','automated_flag','rule_identifier',rule_row.rule_identifier,'category',rule_row.category,'field_name',content_field,'target_type',target_kind,'target_id',target_uuid));
  end loop;
end;
$$;
revoke all on function public.flag_moderation_content(text, uuid, uuid, text, text, uuid) from public, anon, authenticated;

create or replace function public.flag_profile_content() returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if tg_op = 'INSERT' then
    perform public.flag_moderation_content('profile', new.id, new.id, 'username', new.username);
    perform public.flag_moderation_content('profile', new.id, new.id, 'bio', new.bio);
    perform public.flag_moderation_content('profile', new.id, new.id, 'quote', new.quote);
    perform public.flag_moderation_content('profile', new.id, new.id, 'looking_for', new.looking_for);
  else
    if new.username is distinct from old.username then perform public.flag_moderation_content('profile', new.id, new.id, 'username', new.username); end if;
    if new.bio is distinct from old.bio then perform public.flag_moderation_content('profile', new.id, new.id, 'bio', new.bio); end if;
    if new.quote is distinct from old.quote then perform public.flag_moderation_content('profile', new.id, new.id, 'quote', new.quote); end if;
    if new.looking_for is distinct from old.looking_for then perform public.flag_moderation_content('profile', new.id, new.id, 'looking_for', new.looking_for); end if;
  end if;
  perform public.refresh_moderation_content_state('profile', new.id);
  return new;
end;
$$;
drop trigger if exists profile_content_moderation_flag on public.profiles;
create trigger profile_content_moderation_flag after insert or update of username, bio, quote, looking_for on public.profiles for each row execute function public.flag_profile_content();
revoke all on function public.flag_profile_content() from public, anon, authenticated;

create or replace function public.flag_message_content() returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  perform public.flag_moderation_content('message', new.id, new.sender_id, 'message', new.body, new.conversation_id);
  perform public.refresh_moderation_content_state('message', new.id);
  return new;
end;
$$;
drop trigger if exists message_content_moderation_flag on public.messages;
create trigger message_content_moderation_flag after insert or update of body on public.messages for each row execute function public.flag_message_content();
revoke all on function public.flag_message_content() from public, anon, authenticated;

create or replace function public.flag_introduction_content() returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare value text;
begin
  if pg_trigger_depth() > 1 then return new; end if;
  value := coalesce(nullif(new.icebreaker, ''), new.body);
  perform public.flag_moderation_content('introduction', new.id, new.sender_id, 'introduction', value, new.conversation_id_legacy);
  perform public.refresh_moderation_content_state('introduction', new.id);
  return new;
end;
$$;
drop trigger if exists introduction_content_moderation_flag on public.conversation_introductions;
create trigger introduction_content_moderation_flag after insert or update of body, icebreaker on public.conversation_introductions for each row execute function public.flag_introduction_content();
revoke all on function public.flag_introduction_content() from public, anon, authenticated;

-- Prefer an existing automated case when a human report arrives for the same
-- target. This keeps independent reports attached without double counting them.
create or replace function public.link_report_to_moderation_case()
returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare target_case uuid; subject uuid;
begin
  if new.target_type = 'message' then
    select m.sender_id into subject from public.messages m where m.id = new.target_message_id;
  elsif new.target_type = 'introduction' then
    select i.sender_id into subject from public.conversation_introductions i where i.id = new.target_introduction_id;
  elsif new.target_type = 'profile' then subject := new.target_profile_id;
  end if;
  select f.case_id into target_case from public.moderation_content_flags f join public.moderation_cases c on c.id = f.case_id
   where f.target_type = new.target_type and f.target_id = new.target_id and f.status = 'flagged_for_review' and c.status not in ('resolved','dismissed') order by f.created_at desc limit 1;
  if target_case is null then
    select cr.case_id into target_case from public.moderation_case_reports cr join public.reports prior on prior.id = cr.report_id
     where prior.target_type = new.target_type and prior.target_id = new.target_id order by cr.linked_at limit 1;
  end if;
  if target_case is null then
    insert into public.moderation_cases(subject_user_id, primary_target_type, primary_target_id, priority, created_by, source)
      values (subject, new.target_type, new.target_id, public.moderation_reason_priority(new.reason, new.target_type), new.reporter_id, 'report') returning id into target_case;
    insert into public.moderation_audit_log(moderator_id, case_id, report_id, target_user_id, action, metadata)
      values (null, target_case, new.id, subject, 'case_created', jsonb_build_object('source','report'));
  else
    update public.moderation_cases set source = case when source = 'automated_flag' then 'mixed' else source end, updated_at = now() where id = target_case;
  end if;
  insert into public.moderation_case_reports(case_id, report_id) values (target_case, new.id) on conflict (report_id) do nothing;
  perform public.refresh_moderation_case_metrics(target_case);
  return new;
end;
$$;
revoke all on function public.link_report_to_moderation_case() from public, anon, authenticated;

create or replace function public.admin_get_moderation_case_flags(case_uuid uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  if not public.is_moderator() then raise exception 'Moderator authorization required'; end if;
  if not exists (select 1 from public.moderation_cases where id = case_uuid) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id, 'target_type', f.target_type, 'target_id', f.target_id,
    'target_user_id', f.target_user_id, 'field_name', f.field_name,
    'category', f.category, 'rule_identifier', r.rule_identifier,
    'content_snapshot', f.content_snapshot, 'conversation_id', f.conversation_id,
    'status', f.status, 'created_at', f.created_at, 'cleared_at', f.cleared_at,
    'resolution_reason', f.resolution_reason,
    'context', case when f.target_type = 'message' then coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'sender_id', x.sender_id, 'body', x.body, 'created_at', x.created_at) order by x.created_at, x.id) from (select m.id,m.sender_id,m.body,m.created_at from public.messages m where m.conversation_id = f.conversation_id order by abs(extract(epoch from (m.created_at - f.created_at))), m.created_at limit 11) x), '[]'::jsonb) else '[]'::jsonb end
  ) order by f.created_at desc), '[]'::jsonb) into result
    from public.moderation_content_flags f join public.moderation_detection_rules r on r.id = f.rule_id where f.case_id = case_uuid;
  insert into public.moderation_audit_log(moderator_id, case_id, action, metadata) values (auth.uid(), case_uuid, 'automated_flag_context_view', jsonb_build_object('context','admin_case_detail'));
  return result;
end;
$$;
revoke all on function public.admin_get_moderation_case_flags(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_moderation_case_flags(uuid) to authenticated;

create or replace function public.resolve_moderation_content_flag(flag_uuid uuid, resolution text, resolution_reason text)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare item public.moderation_content_flags; clean_reason text := nullif(btrim(resolution_reason), '');
begin
  if not public.is_moderator() then raise exception 'Moderator authorization required'; end if;
  if resolution not in ('cleared','confirmed') or clean_reason is null or char_length(clean_reason) > 500 then raise exception 'A resolution and reason are required'; end if;
  select * into item from public.moderation_content_flags where id = flag_uuid for update;
  if item.id is null then raise exception 'Flag not found'; end if;
  update public.moderation_content_flags set status = resolution, cleared_at = now(), cleared_by = auth.uid(), resolution_reason = clean_reason where id = flag_uuid;
  perform public.refresh_moderation_content_state(item.target_type, item.target_id);
  insert into public.moderation_audit_log(moderator_id, case_id, target_user_id, action, metadata)
    values (auth.uid(), item.case_id, item.target_user_id, case when resolution = 'cleared' then 'automated_flag_cleared' else 'automated_flag_confirmed' end, jsonb_build_object('flag_id',item.id,'reason',clean_reason,'target_type',item.target_type,'target_id',item.target_id));
end;
$$;
revoke all on function public.resolve_moderation_content_flag(uuid, text, text) from public, anon, authenticated;
grant execute on function public.resolve_moderation_content_flag(uuid, text, text) to authenticated;

create or replace function public.sync_flags_on_case_resolution() returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare item record;
begin
  if new.status in ('resolved','dismissed') and old.status is distinct from new.status then
    for item in select f.* from public.moderation_content_flags f where f.case_id = new.id and f.status = 'flagged_for_review' loop
      update public.moderation_content_flags set status = 'cleared', cleared_at = coalesce(cleared_at, now()), cleared_by = auth.uid(), resolution_reason = coalesce(new.resolution_category, 'Case closed') where id = item.id;
      perform public.refresh_moderation_content_state(item.target_type, item.target_id);
      insert into public.moderation_audit_log(moderator_id, case_id, target_user_id, action, metadata) values (auth.uid(), new.id, item.target_user_id, 'automated_flag_cleared', jsonb_build_object('flag_id',item.id,'context','case_closed'));
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists moderation_case_resolution_sync on public.moderation_cases;
create trigger moderation_case_resolution_sync after update of status on public.moderation_cases for each row execute function public.sync_flags_on_case_resolution();
revoke all on function public.sync_flags_on_case_resolution() from public, anon, authenticated;

create or replace function public.admin_list_moderation_detection_rules()
returns table (id uuid, rule_identifier text, term text, category text, match_type text, enabled boolean, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if not public.is_admin() then raise exception 'Administrator authorization required'; end if;
  return query select r.id,r.rule_identifier,r.term,r.category,r.match_type,r.enabled,r.created_at,r.updated_at from public.moderation_detection_rules r order by r.rule_identifier;
end;
$$;
revoke all on function public.admin_list_moderation_detection_rules() from public, anon, authenticated;
grant execute on function public.admin_list_moderation_detection_rules() to authenticated;

create or replace function public.admin_upsert_moderation_detection_rule(rule_identifier text, rule_term text, rule_category text, rule_match_type text, rule_enabled boolean, change_reason text)
returns public.moderation_detection_rules
language plpgsql security definer set search_path = pg_catalog, public as $$
declare result public.moderation_detection_rules; clean_id text := lower(btrim(rule_identifier)); clean_term text := btrim(rule_term); clean_reason text := nullif(btrim(change_reason), '');
begin
  if not public.is_admin() then raise exception 'Administrator authorization required'; end if;
  if clean_reason is null or char_length(clean_reason) > 500 then raise exception 'A change reason is required'; end if;
  if clean_id !~ '^[a-z0-9][a-z0-9._-]{0,79}$' or char_length(clean_term) not between 1 and 160 then raise exception 'Invalid detection rule'; end if;
  if rule_category not in ('paid_adult_content','pornography_service','cam_service','escort_or_prostitution','sexual_service','commercial_fetish_service','adult_service_other') then raise exception 'Invalid detection category'; end if;
  if rule_match_type not in ('contains','word','domain') then raise exception 'Invalid detection match type'; end if;
  insert into public.moderation_detection_rules(rule_identifier,term,category,match_type,enabled,updated_by) values (clean_id,clean_term,rule_category,rule_match_type,coalesce(rule_enabled,true),auth.uid())
    on conflict on constraint moderation_detection_rules_rule_identifier_key do update set term = excluded.term, category = excluded.category, match_type = excluded.match_type, enabled = excluded.enabled, updated_by = auth.uid(), updated_at = now()
    returning * into result;
  insert into public.moderation_audit_log(moderator_id, action, metadata) values (auth.uid(), 'detection_rule_updated', jsonb_build_object('rule_identifier',result.rule_identifier,'category',result.category,'match_type',result.match_type,'enabled',result.enabled,'reason',clean_reason));
  return result;
end;
$$;
revoke all on function public.admin_upsert_moderation_detection_rule(text, text, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_upsert_moderation_detection_rule(text, text, text, text, boolean, text) to authenticated;

-- Recreate the scoped case/audit projections with the automated source and
-- actions visible to staff, while keeping rule terms admin-only.
drop function if exists public.admin_list_moderation_cases(text, uuid, integer, integer);
create or replace function public.admin_list_moderation_cases(status_filter text default null, assigned_filter uuid default null, page_size integer default 30, page_offset integer default 0)
returns table (id uuid, subject_user_id uuid, subject_username text, subject_display_name text, primary_target_type text, primary_target_id uuid, status text, priority integer, assigned_staff_id uuid, assigned_staff_name text, claimed_at timestamptz, claim_expires_at timestamptz, created_at timestamptz, updated_at timestamptz, resolved_at timestamptz, resolution_category text, report_count bigint, independent_reporter_count bigint, source text, automated_flag_count bigint, total_count bigint)
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if not public.is_moderator() then raise exception 'Moderator authorization required'; end if;
  page_size := least(greatest(coalesce(page_size,30),1),100); page_offset := greatest(coalesce(page_offset,0),0);
  return query select c.id,c.subject_user_id,s.username,s.display_name,c.primary_target_type,c.primary_target_id,c.status,c.priority,c.assigned_staff_id,a.display_name,c.claimed_at,c.claim_expires_at,c.created_at,c.updated_at,c.resolved_at,c.resolution_category,c.report_count,c.independent_reporter_count,c.source,c.automated_flag_count,count(*) over() from public.moderation_cases c left join public.profiles s on s.id=c.subject_user_id left join public.profiles a on a.id=c.assigned_staff_id where (status_filter is null or status_filter='' or c.status=status_filter) and (assigned_filter is null or c.assigned_staff_id=assigned_filter) order by c.priority desc,c.updated_at asc limit page_size offset page_offset;
end;
$$;
revoke all on function public.admin_list_moderation_cases(text, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_list_moderation_cases(text, uuid, integer, integer) to authenticated;

-- Add source to the existing case detail projection without exposing terms.
create or replace function public.admin_get_moderation_case(case_uuid uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare result jsonb; subject uuid;
begin
  if not public.is_moderator() then raise exception 'Moderator authorization required'; end if;
  select jsonb_build_object(
    'case', jsonb_build_object('id', c.id, 'subject_user_id', c.subject_user_id, 'primary_target_type', c.primary_target_type, 'primary_target_id', c.primary_target_id, 'status', c.status, 'priority', c.priority, 'assigned_staff_id', c.assigned_staff_id, 'claimed_at', c.claimed_at, 'claim_expires_at', c.claim_expires_at, 'created_at', c.created_at, 'updated_at', c.updated_at, 'resolved_at', c.resolved_at, 'resolution_category', c.resolution_category, 'report_count', c.report_count, 'independent_reporter_count', c.independent_reporter_count, 'source', c.source, 'automated_flag_count', c.automated_flag_count),
    'reports', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'reporter_id', r.reporter_id, 'target_type', r.target_type, 'target_id', r.target_id, 'reason', r.reason, 'details', r.details, 'status', r.status, 'created_at', r.created_at) order by r.created_at desc) from public.moderation_case_reports cr join public.reports r on r.id = cr.report_id where cr.case_id = c.id), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'author_id', n.author_id, 'note', n.note, 'created_at', n.created_at) order by n.created_at desc) from public.moderation_case_notes n where n.case_id = c.id), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'action', a.action, 'old_status', a.old_status, 'new_status', a.new_status, 'metadata', a.metadata, 'created_at', a.created_at) order by a.created_at desc) from public.moderation_audit_log a where a.case_id = c.id), '[]'::jsonb)
  ), c.subject_user_id into result, subject from public.moderation_cases c where c.id = case_uuid;
  if result is null then return null; end if;
  insert into public.moderation_audit_log(moderator_id, case_id, target_user_id, action, metadata) values (auth.uid(), case_uuid, subject, 'case_view', jsonb_build_object('context','admin_case_detail'));
  return result;
end;
$$;
revoke all on function public.admin_get_moderation_case(uuid) from public, anon, authenticated;
grant execute on function public.admin_get_moderation_case(uuid) to authenticated;

-- Staff may see automated flag lifecycle events but not rule configuration
-- changes unless they are administrators.
drop policy if exists "Staff read scoped audit log" on public.moderation_audit_log;
create policy "Staff read scoped audit log" on public.moderation_audit_log for select to authenticated using (
  public.is_admin() or (public.is_moderator() and action in ('status_change','case_created','case_view','case_status_change','case_claim','case_release','case_reassign','case_note_added','conversation_review','automated_flag_created','automated_flag_cleared','automated_flag_confirmed','automated_flag_context_view'))
);

create or replace function public.admin_list_audit_entries(action_filter text default null, actor_filter uuid default null, page_size integer default 50, page_offset integer default 0)
returns table (id uuid, moderator_id uuid, report_id uuid, target_user_id uuid, case_id uuid, action text, old_status text, new_status text, metadata jsonb, created_at timestamptz, total_count bigint)
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if not public.is_moderator() then raise exception 'Moderator authorization required'; end if;
  page_size := least(greatest(coalesce(page_size,50),1),100); page_offset := greatest(coalesce(page_offset,0),0);
  return query select a.id,a.moderator_id,a.report_id,a.target_user_id,a.case_id,a.action,a.old_status,a.new_status,a.metadata,a.created_at,count(*) over() from public.moderation_audit_log a where (public.is_admin() or a.action in ('status_change','case_created','case_status_change','case_claim','case_release','case_reassign','case_note_added','conversation_review','automated_flag_created','automated_flag_cleared','automated_flag_confirmed','automated_flag_context_view')) and (nullif(trim(action_filter),'') is null or a.action=action_filter) and (actor_filter is null or a.moderator_id=actor_filter) order by a.created_at desc limit page_size offset page_offset;
end;
$$;
revoke all on function public.admin_list_audit_entries(text, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_list_audit_entries(text, uuid, integer, integer) to authenticated;

-- No detection rules are seeded: administrators explicitly configure policy.
