-- Adult/commercial solicitation detection pack.
--
-- These rules are review-only triage signals.  They never ban, suspend,
-- deactivate, delete, or otherwise change account state.  The dictionary is
-- administrator-only and the detector remains the single shared path for all
-- supported content surfaces.

-- Keep existing callers valid while allowing the expanded, categorized pack.
alter table public.moderation_detection_rules
  drop constraint if exists moderation_detection_rules_category_check;
alter table public.moderation_detection_rules
  add constraint moderation_detection_rules_category_check check (category in (
    'paid_adult_content','pornography_service','cam_service',
    'escort_or_prostitution','sexual_service','commercial_fetish_service',
    'adult_service_other','commercial_solicitation','creator_monetization',
    'bridge_link','obfuscated_link'
  ));
alter table public.moderation_detection_rules enable row level security;
revoke all on table public.moderation_detection_rules from public, anon, authenticated;

alter table public.moderation_detection_rules
  add column if not exists signal_strength text not null default 'MEDIUM',
  add column if not exists is_system_default boolean not null default false,
  add column if not exists requires_context boolean not null default false,
  add column if not exists context_group text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'moderation_detection_rules_strength_check' and conrelid = 'public.moderation_detection_rules'::regclass) then
    alter table public.moderation_detection_rules add constraint moderation_detection_rules_strength_check check (signal_strength in ('HIGH','MEDIUM','REVIEW'));
  end if;
end;
$$;

alter table public.moderation_content_flags
  drop constraint if exists moderation_content_flags_target_type_check,
  drop constraint if exists moderation_content_flags_field_name_check,
  drop constraint if exists moderation_content_flags_category_check;
alter table public.moderation_content_flags
  add constraint moderation_content_flags_target_type_check check (target_type in ('profile','introduction','message','snail_mail')),
  add constraint moderation_content_flags_field_name_check check (field_name in ('username','bio','quote','looking_for','introduction','message','snail_mail')),
  add constraint moderation_content_flags_category_check check (category in (
    'paid_adult_content','pornography_service','cam_service',
    'escort_or_prostitution','sexual_service','commercial_fetish_service',
    'adult_service_other','commercial_solicitation','creator_monetization',
    'bridge_link','obfuscated_link'
  ));
alter table public.moderation_content_flags enable row level security;
revoke all on table public.moderation_content_flags from public, anon, authenticated;
alter table public.moderation_content_flags
  add column if not exists matched_value text,
  add column if not exists signal_strength text not null default 'MEDIUM';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'moderation_content_flags_strength_check' and conrelid = 'public.moderation_content_flags'::regclass) then
    alter table public.moderation_content_flags add constraint moderation_content_flags_strength_check check (signal_strength in ('HIGH','MEDIUM','REVIEW'));
  end if;
end;
$$;
update public.moderation_content_flags f
   set matched_value = public.moderation_normalized_text(r.term)
  from public.moderation_detection_rules r
 where f.rule_id = r.id and f.matched_value is null;

-- Automated cases can be created from a Snail Mail body as well.  This does
-- not expand the public report API; it only lets the protected detector attach
-- a review case to an internally flagged letter.
alter table public.moderation_cases
  drop constraint if exists moderation_cases_primary_target_type_check;
alter table public.moderation_cases
  add constraint moderation_cases_primary_target_type_check check (primary_target_type in ('profile','introduction','message','snail_mail'));

-- Best-effort Unicode NFKC plus conservative obfuscation handling.  The
-- dynamic normalize call keeps this migration compatible with Postgres
-- versions that do not yet expose the built-in function; the fallback still
-- removes zero-width characters and common dot spellings without fuzzy match.
create or replace function public.moderation_normalized_text(value text)
returns text language plpgsql immutable strict set search_path = pg_catalog, public as $$
declare normalized text := coalesce(value, '');
begin
  begin
    execute 'select normalize($1, NFKC)' into normalized using normalized;
  exception when others then
    -- Older local Postgres versions do not have normalize(text, form).
    null;
  end;
  normalized := lower(normalized);
  normalized := replace(normalized, chr(8203), '');
  normalized := replace(normalized, chr(8204), '');
  normalized := replace(normalized, chr(8205), '');
  normalized := replace(normalized, chr(65279), '');
  normalized := regexp_replace(normalized, '\[\s*\.\s*\]', '.', 'gi');
  normalized := regexp_replace(normalized, '\(\s*dot\s*\)', '.', 'gi');
  normalized := regexp_replace(normalized, '(^|[^[:alnum:]])dot([^[:alnum:]]|$)', '\1.\2', 'gi');
  normalized := regexp_replace(normalized, '[[:space:]]*[.][[:space:]]*', '.', 'g');
  normalized := regexp_replace(normalized, '[[:space:]]+', ' ', 'g');
  return btrim(normalized);
end;
$$;
revoke all on function public.moderation_normalized_text(text) from public, anon, authenticated;

-- Match whole normalized tokens for ordinary phrases/domains while retaining
-- contains semantics for administrators who create a contains rule.
create or replace function public.moderation_rule_matches(rule_term text, rule_match_type text, content text)
returns boolean language sql immutable strict set search_path = pg_catalog, public as $$
  with normalized as (
    select public.moderation_normalized_text(rule_term) as term,
           public.moderation_normalized_text(content) as body
  )
  select case
    when rule_match_type = 'contains' then
      position(lower(btrim(rule_term)) in lower(content)) > 0
      or position(term in body) > 0
    else position(' ' || term || ' ' in ' ' || body || ' ') > 0
  end from normalized
$$;
revoke all on function public.moderation_rule_matches(text, text, text) from public, anon, authenticated;

-- Add a stable normalized-value snapshot and contextual false-positive guard
-- to the existing flagger.  Contextual phrases are useful only alongside a
-- second promotion/bridge signal or a concrete adult/solicitation signal.
create or replace function public.flag_moderation_content(target_kind text, target_uuid uuid, content_owner uuid, content_field text, content_value text, related_conversation uuid default null)
returns void language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  rule_row record;
  existing_flag public.moderation_content_flags;
  inserted_flag_id uuid;
  target_case uuid;
  hash text;
  clean_content text := left(coalesce(content_value, ''), 10000);
  normalized_content text;
begin
  if clean_content = '' or target_kind not in ('profile','introduction','message','snail_mail') then return; end if;
  hash := md5(clean_content);
  normalized_content := public.moderation_normalized_text(clean_content);
  for rule_row in select * from public.moderation_detection_rules where enabled order by id loop
    if not public.moderation_rule_matches(rule_row.term, rule_row.match_type, clean_content) then continue; end if;
    if coalesce(rule_row.requires_context, false) and not exists (
      select 1 from public.moderation_detection_rules other
       where other.enabled and other.id <> rule_row.id
         and public.moderation_rule_matches(other.term, other.match_type, clean_content)
         and (
           (not coalesce(other.requires_context, false) and other.category <> 'creator_monetization')
           or (rule_row.context_group in ('promotion','bridge') and other.context_group in ('promotion','bridge'))
         )
    ) then continue; end if;
    perform pg_advisory_xact_lock(hashtextextended('auto-flag:' || target_kind || ':' || target_uuid::text || ':' || content_field || ':' || rule_row.id::text || ':' || hash, 0));
    select * into existing_flag from public.moderation_content_flags f
     where f.target_type = target_kind and f.target_id = target_uuid and f.field_name = content_field and f.rule_id = rule_row.id and f.content_hash = hash
     order by f.created_at desc limit 1;
    if existing_flag.id is not null then
      if existing_flag.status = 'flagged_for_review' then perform public.refresh_moderation_content_state(target_kind, target_uuid); end if;
      continue;
    end if;
    select c.id into target_case from public.moderation_cases c join public.moderation_content_flags f on f.case_id = c.id
     where f.target_type = target_kind and f.target_id = target_uuid and c.status not in ('resolved','dismissed') order by c.updated_at desc limit 1;
    if target_case is null then
      insert into public.moderation_cases(subject_user_id, primary_target_type, primary_target_id, priority, source)
        values (content_owner, target_kind, target_uuid, case when rule_row.signal_strength = 'HIGH' then 90 when rule_row.signal_strength = 'REVIEW' then 60 else 75 end, 'automated_flag') returning id into target_case;
      insert into public.moderation_audit_log(moderator_id, case_id, target_user_id, action, metadata)
        values (null, target_case, content_owner, 'case_created', jsonb_build_object('source','automated_flag'));
    end if;
    insert into public.moderation_content_flags(rule_id, target_type, target_id, target_user_id, field_name, conversation_id, content_snapshot, content_hash, category, signal_strength, matched_value, case_id)
      values (rule_row.id, target_kind, target_uuid, content_owner, content_field, related_conversation, clean_content, hash, rule_row.category, rule_row.signal_strength, public.moderation_normalized_text(rule_row.term), target_case)
      returning id into inserted_flag_id;
    insert into public.moderation_case_flags(case_id, flag_id) values (target_case, inserted_flag_id) on conflict do nothing;
    update public.moderation_cases set automated_flag_count = automated_flag_count + 1, updated_at = now(), source = case when source = 'report' then 'mixed' else source end where id = target_case;
    insert into public.moderation_audit_log(moderator_id, case_id, target_user_id, action, metadata)
      values (null, target_case, content_owner, 'automated_flag_created', jsonb_build_object('source','automated_flag','rule_identifier',rule_row.rule_identifier,'category',rule_row.category,'signal_strength',rule_row.signal_strength,'field_name',content_field,'target_type',target_kind,'target_id',target_uuid,'normalized_value',public.moderation_normalized_text(rule_row.term)));
  end loop;
end;
$$;
revoke all on function public.flag_moderation_content(text, uuid, uuid, text, text, uuid) from public, anon, authenticated;

-- Snail Mail is immutable, so this trigger only observes the body at insert
-- time.  The internal sender remains available in the protected flag/case;
-- recipient-facing RPCs are unchanged and continue to hide in-transit bodies.
create or replace function public.flag_snail_mail_content() returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  perform public.flag_moderation_content('snail_mail', new.id, new.sender_id, 'snail_mail', new.body, new.conversation_id);
  return new;
end;
$$;
drop trigger if exists snail_mail_content_moderation_flag on public.snail_mail_letters;
create trigger snail_mail_content_moderation_flag after insert on public.snail_mail_letters for each row execute function public.flag_snail_mail_content();
revoke all on function public.flag_snail_mail_content() from public, anon, authenticated;

-- Re-run the canonical detector for preserved report targets.  Reports do not
-- expose the dictionary and this trigger never changes report/enforcement
-- state; it only creates or links the same review-only evidence case.
create or replace function public.flag_reported_content() returns trigger language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  profile_row record;
  message_row record;
  introduction_row record;
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if new.target_type = 'profile' then
    select p.* into profile_row from public.profiles p where p.id = new.target_profile_id;
    if profile_row.id is not null then
      perform public.flag_moderation_content('profile', profile_row.id, profile_row.id, 'username', profile_row.username);
      perform public.flag_moderation_content('profile', profile_row.id, profile_row.id, 'bio', profile_row.bio);
      perform public.flag_moderation_content('profile', profile_row.id, profile_row.id, 'quote', profile_row.quote);
      perform public.flag_moderation_content('profile', profile_row.id, profile_row.id, 'looking_for', profile_row.looking_for);
    end if;
  elsif new.target_type = 'message' then
    select m.* into message_row from public.messages m where m.id = new.target_message_id;
    if message_row.id is not null then perform public.flag_moderation_content('message', message_row.id, message_row.sender_id, 'message', message_row.body, message_row.conversation_id); end if;
  elsif new.target_type = 'introduction' then
    select i.* into introduction_row from public.conversation_introductions i where i.id = new.target_introduction_id;
    if introduction_row.id is not null then perform public.flag_moderation_content('introduction', introduction_row.id, introduction_row.sender_id, 'introduction', coalesce(nullif(introduction_row.icebreaker, ''), introduction_row.body), introduction_row.conversation_id_legacy); end if;
  end if;
  return new;
end;
$$;
drop trigger if exists report_content_moderation_flag on public.reports;
create trigger report_content_moderation_flag after insert on public.reports for each row execute function public.flag_reported_content();
revoke all on function public.flag_reported_content() from public, anon, authenticated;

-- Expose only the minimum additional metadata to staff.  Terms and normalized
-- matches remain behind the existing admin-only RPC; ordinary clients have no
-- table or dictionary privileges.
drop function if exists public.admin_get_moderation_case_flags(uuid);
create or replace function public.admin_get_moderation_case_flags(case_uuid uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public as $$
declare result jsonb;
begin
  if not public.is_moderator() then raise exception 'Moderator authorization required'; end if;
  if not exists (select 1 from public.moderation_cases where id = case_uuid) then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id, 'target_type', f.target_type, 'target_id', f.target_id,
    'target_user_id', f.target_user_id, 'field_name', f.field_name,
    'category', f.category, 'signal_strength', f.signal_strength,
    'rule_identifier', r.rule_identifier, 'matched_term', r.term,
    'matched_value', f.matched_value, 'content_snapshot', f.content_snapshot,
    'conversation_id', f.conversation_id, 'status', f.status,
    'created_at', f.created_at, 'cleared_at', f.cleared_at,
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

drop function if exists public.admin_list_moderation_detection_rules();
create or replace function public.admin_list_moderation_detection_rules()
returns table (id uuid, rule_identifier text, term text, category text, match_type text, enabled boolean, signal_strength text, is_system_default boolean, requires_context boolean, created_at timestamptz, updated_at timestamptz)
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if not public.is_admin() then raise exception 'Administrator authorization required'; end if;
  return query select r.id,r.rule_identifier,r.term,r.category,r.match_type,r.enabled,r.signal_strength,r.is_system_default,r.requires_context,r.created_at,r.updated_at from public.moderation_detection_rules r order by r.rule_identifier;
end;
$$;
revoke all on function public.admin_list_moderation_detection_rules() from public, anon, authenticated;
grant execute on function public.admin_list_moderation_detection_rules() to authenticated;

-- Preserve the existing six-argument admin API and permit the expanded
-- categories.  System defaults are not overwritten by this compatibility
-- editor; administrators may still disable or replace them explicitly.
create or replace function public.admin_upsert_moderation_detection_rule(rule_identifier text, rule_term text, rule_category text, rule_match_type text, rule_enabled boolean, change_reason text)
returns public.moderation_detection_rules
language plpgsql security definer set search_path = pg_catalog, public as $$
declare result public.moderation_detection_rules; clean_id text := lower(btrim(rule_identifier)); clean_term text := btrim(rule_term); clean_reason text := nullif(btrim(change_reason), '');
begin
  if not public.is_admin() then raise exception 'Administrator authorization required'; end if;
  if clean_reason is null or char_length(clean_reason) > 500 then raise exception 'A change reason is required'; end if;
  if clean_id !~ '^[a-z0-9][a-z0-9._-]{0,79}$' or char_length(clean_term) not between 1 and 160 then raise exception 'Invalid detection rule'; end if;
  if rule_category not in ('paid_adult_content','pornography_service','cam_service','escort_or_prostitution','sexual_service','commercial_fetish_service','adult_service_other','commercial_solicitation','creator_monetization','bridge_link','obfuscated_link') then raise exception 'Invalid detection category'; end if;
  if rule_match_type not in ('contains','word','domain') then raise exception 'Invalid detection match type'; end if;
  insert into public.moderation_detection_rules(rule_identifier,term,category,match_type,enabled,updated_by,is_system_default) values (clean_id,clean_term,rule_category,rule_match_type,coalesce(rule_enabled,true),auth.uid(),false)
    on conflict on constraint moderation_detection_rules_rule_identifier_key do update set term = excluded.term, category = excluded.category, match_type = excluded.match_type, enabled = excluded.enabled, updated_by = auth.uid(), updated_at = now(), is_system_default = false
    returning * into result;
  insert into public.moderation_audit_log(moderator_id, action, metadata) values (auth.uid(), 'detection_rule_updated', jsonb_build_object('rule_identifier',result.rule_identifier,'category',result.category,'match_type',result.match_type,'enabled',result.enabled,'reason',clean_reason));
  return result;
end;
$$;
revoke all on function public.admin_upsert_moderation_detection_rule(text, text, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.admin_upsert_moderation_detection_rule(text, text, text, text, boolean, text) to authenticated;

-- Idempotent default seed.  Conflict-do-nothing preserves administrator
-- changes while making rerunning deployment/bootstrap safe.
create or replace function public.seed_adult_commercial_detection_rules()
returns integer language plpgsql security definer set search_path = pg_catalog, public as $$
declare inserted_count integer;
begin
  with seed(rule_identifier,term,category,match_type,signal_strength,requires_context,context_group) as (values
    -- High-confidence adult platforms
    ('adult.onlyfans.com','onlyfans.com','paid_adult_content','domain','HIGH',false,null),('adult.fansly.com','fansly.com','paid_adult_content','domain','HIGH',false,null),('adult.manyvids.com','manyvids.com','paid_adult_content','domain','HIGH',false,null),('adult.loyalfans.com','loyalfans.com','paid_adult_content','domain','HIGH',false,null),('adult.fancentro.com','fancentro.com','paid_adult_content','domain','HIGH',false,null),('adult.justforfans.com','justfor.fans','paid_adult_content','domain','HIGH',false,null),('adult.clips4sale.com','clips4sale.com','paid_adult_content','domain','HIGH',false,null),('adult.iwantclips.com','iwantclips.com','paid_adult_content','domain','HIGH',false,null),('adult.admireme.vip','admireme.vip','paid_adult_content','domain','HIGH',false,null),('adult.modelcentro.com','modelcentro.com','paid_adult_content','domain','HIGH',false,null),('adult.chaturbate.com','chaturbate.com','cam_service','domain','HIGH',false,null),('adult.myfreecams.com','myfreecams.com','cam_service','domain','HIGH',false,null),('adult.stripchat.com','stripchat.com','cam_service','domain','HIGH',false,null),('adult.bongacams.com','bongacams.com','cam_service','domain','HIGH',false,null),('adult.livejasmin.com','livejasmin.com','cam_service','domain','HIGH',false,null),
    -- Generic creator monetization is contextual and never adult proof alone
    ('creator.fanvue.com','fanvue.com','creator_monetization','domain','REVIEW',true,'creator'),('creator.patreon.com','patreon.com','creator_monetization','domain','REVIEW',true,'creator'),('creator.ko-fi.com','ko-fi.com','creator_monetization','domain','REVIEW',true,'creator'),('creator.buymeacoffee.com','buymeacoffee.com','creator_monetization','domain','REVIEW',true,'creator'),('creator.stan.store','stan.store','creator_monetization','domain','REVIEW',true,'creator'),
    -- Link hubs are useful context only when paired with promotion/evasion
    ('bridge.linktr.ee','linktr.ee','bridge_link','domain','REVIEW',true,'bridge'),('bridge.tr.ee','tr.ee','bridge_link','domain','REVIEW',true,'bridge'),('bridge.allmylinks.com','allmylinks.com','bridge_link','domain','REVIEW',true,'bridge'),('bridge.beacons.ai','beacons.ai','bridge_link','domain','REVIEW',true,'bridge'),('bridge.carrd.co','carrd.co','bridge_link','domain','REVIEW',true,'bridge'),('bridge.bio.site','bio.site','bridge_link','domain','REVIEW',true,'bridge'),('bridge.solo.to','solo.to','bridge_link','domain','REVIEW',true,'bridge'),('bridge.linkr.bio','linkr.bio','bridge_link','domain','REVIEW',true,'bridge'),('bridge.milkshake.app','milkshake.app','bridge_link','domain','REVIEW',true,'bridge'),('bridge.hoo.be','hoo.be','bridge_link','domain','REVIEW',true,'bridge'),('bridge.snipfeed.co','snipfeed.co','bridge_link','domain','REVIEW',true,'bridge'),('bridge.taplink.cc','taplink.cc','bridge_link','domain','REVIEW',true,'bridge'),('bridge.lnk.bio','lnk.bio','bridge_link','domain','REVIEW',true,'bridge'),
    -- Shorteners/obfuscation are review signals, never automatic action
    ('obfuscated.bitly','bit.ly','obfuscated_link','domain','REVIEW',false,null),('obfuscated.tinyurl','tinyurl.com','obfuscated_link','domain','REVIEW',false,null),('obfuscated.tco','t.co','obfuscated_link','domain','REVIEW',false,null),('obfuscated.isgd','is.gd','obfuscated_link','domain','REVIEW',false,null),('obfuscated.rebrandly','rebrand.ly','obfuscated_link','domain','REVIEW',false,null),('obfuscated.cuttly','cutt.ly','obfuscated_link','domain','REVIEW',false,null),('obfuscated.shorturl','shorturl.at','obfuscated_link','domain','REVIEW',false,null),
    -- Platform phrases and handle forms (never the abbreviation "of" alone)
    ('phrase.onlyfans','onlyfans','paid_adult_content','word','HIGH',false,null),('phrase.only-fans','only-fans','paid_adult_content','word','HIGH',false,null),('phrase.only-fans-spaced','only fans','paid_adult_content','word','HIGH',false,null),('phrase.fansly','fansly','paid_adult_content','word','HIGH',false,null),('phrase.manyvids','manyvids','paid_adult_content','word','HIGH',false,null),('phrase.many-vids','many vids','paid_adult_content','word','HIGH',false,null),('phrase.loyalfans','loyalfans','paid_adult_content','word','HIGH',false,null),('phrase.loyal-fans','loyal fans','paid_adult_content','word','HIGH',false,null),('phrase.fancentro','fancentro','paid_adult_content','word','HIGH',false,null),('phrase.fan-centro','fan centro','paid_adult_content','word','HIGH',false,null),('phrase.justforfans','justforfans','paid_adult_content','word','HIGH',false,null),('phrase.just-for-fans','just for fans','paid_adult_content','word','HIGH',false,null),('phrase.clips4sale','clips4sale','paid_adult_content','word','HIGH',false,null),('phrase.clips-4-sale','clips 4 sale','paid_adult_content','word','HIGH',false,null),('phrase.iwantclips','iwantclips','paid_adult_content','word','HIGH',false,null),('phrase.i-want-clips','i want clips','paid_adult_content','word','HIGH',false,null),('phrase.chaturbate','chaturbate','cam_service','word','HIGH',false,null),('phrase.myfreecams','myfreecams','cam_service','word','HIGH',false,null),('phrase.my-free-cams','my free cams','cam_service','word','HIGH',false,null),('phrase.stripchat','stripchat','cam_service','word','HIGH',false,null),('phrase.bongacams','bongacams','cam_service','word','HIGH',false,null),('phrase.livejasmin','livejasmin','cam_service','word','HIGH',false,null),
    ('handle.onlyfans','onlyfans @','paid_adult_content','contains','MEDIUM',false,null),('handle.fansly','fansly @','paid_adult_content','contains','MEDIUM',false,null),('handle.of-colon','of:','paid_adult_content','contains','MEDIUM',false,null),('handle.of-at','of @','paid_adult_content','contains','MEDIUM',false,null),('handle.find-onlyfans','find me on onlyfans','paid_adult_content','word','HIGH',false,null),('handle.same-onlyfans','same username on onlyfans','paid_adult_content','word','HIGH',false,null),
    -- Explicit commercial/sexual solicitation
    ('solicitation.paid-content','paid content','commercial_solicitation','word','HIGH',false,null),('solicitation.paid-private-content','paid private content','commercial_solicitation','word','HIGH',false,null),('solicitation.custom-content','custom content for sale','commercial_solicitation','word','HIGH',false,null),('solicitation.private-show','private show','commercial_solicitation','word','HIGH',false,null),('solicitation.paid-private-show','paid private show','commercial_solicitation','word','HIGH',false,null),('solicitation.custom-videos','custom videos','commercial_solicitation','word','HIGH',false,null),('solicitation.custom-pics','custom pics','commercial_solicitation','word','HIGH',false,null),('solicitation.custom-photos','custom photos','commercial_solicitation','word','HIGH',false,null),('solicitation.premium-adult','premium adult content','commercial_solicitation','word','HIGH',false,null),('solicitation.adult-creator','adult content creator','commercial_solicitation','word','HIGH',false,null),('solicitation.camgirl','camgirl','cam_service','word','HIGH',false,null),('solicitation.cam-girl','cam girl','cam_service','word','HIGH',false,null),('solicitation.camboy','camboy','cam_service','word','HIGH',false,null),('solicitation.cam-boy','cam boy','cam_service','word','HIGH',false,null),('solicitation.webcam-show','webcam show','cam_service','word','HIGH',false,null),('solicitation.private-cam','private cam','cam_service','word','HIGH',false,null),('solicitation.escort','escort service','escort_or_prostitution','word','HIGH',false,null),('solicitation.escorts','escort services','escort_or_prostitution','word','HIGH',false,null),('solicitation.sexual-services','sexual services','sexual_service','word','HIGH',false,null),('solicitation.paid-sex','paid sex','sexual_service','word','HIGH',false,null),('solicitation.pay-sex','pay for sex','sexual_service','word','HIGH',false,null),('solicitation.book-sex','book me for sex','sexual_service','word','HIGH',false,null),('solicitation.meet-money','meet for money','sexual_service','word','HIGH',false,null),('solicitation.subscription-page','subscription page','commercial_solicitation','word','MEDIUM',false,null),('solicitation.subscribe-onlyfans','subscribe to my onlyfans','commercial_solicitation','word','HIGH',false,null),('solicitation.subscribe-fansly','subscribe to my fansly','commercial_solicitation','word','HIGH',false,null),('solicitation.buy-content','buy my content','commercial_solicitation','word','HIGH',false,null),('solicitation.buy-videos','buy my videos','commercial_solicitation','word','HIGH',false,null),('solicitation.buy-pics','buy my pics','commercial_solicitation','word','HIGH',false,null),('solicitation.dm-prices','dm me for prices','commercial_solicitation','word','HIGH',false,null),('solicitation.message-prices','message me for prices','commercial_solicitation','word','HIGH',false,null),('solicitation.menu-bio','menu in bio','commercial_solicitation','word','MEDIUM',false,null),('solicitation.customs','customs available','commercial_solicitation','word','HIGH',false,null),
    -- Lower-confidence promotion/evasion; contextual by design
    ('context.link-in-bio','link in bio','commercial_solicitation','word','REVIEW',true,'promotion'),('context.check-bio','check my bio','commercial_solicitation','word','REVIEW',true,'promotion'),('context.all-links','all my links','commercial_solicitation','word','REVIEW',true,'promotion'),('context.other-page','my other page','commercial_solicitation','word','REVIEW',true,'promotion'),('context.premium-page','my premium page','commercial_solicitation','word','REVIEW',true,'promotion'),('context.paid-page','my paid page','commercial_solicitation','word','REVIEW',true,'promotion'),('context.private-page','my private page','commercial_solicitation','word','REVIEW',true,'promotion'),('context.subscribe-me','subscribe to me','commercial_solicitation','word','REVIEW',true,'promotion'),('context.support-content','support my content','commercial_solicitation','word','REVIEW',true,'promotion'),('context.dm-link','dm me for my link','commercial_solicitation','word','REVIEW',true,'promotion'),('context.ask-link','ask me for my link','commercial_solicitation','word','REVIEW',true,'promotion'),('context.message-menu','message for menu','commercial_solicitation','word','REVIEW',true,'promotion'),('context.dm-menu','dm for menu','commercial_solicitation','word','REVIEW',true,'promotion'),('context.message-rates','message for rates','commercial_solicitation','word','REVIEW',true,'promotion'),('context.dm-rates','dm for rates','commercial_solicitation','word','REVIEW',true,'promotion')
  )
  insert into public.moderation_detection_rules(rule_identifier,term,category,match_type,signal_strength,requires_context,context_group,is_system_default)
  select rule_identifier,term,category,match_type,signal_strength,requires_context,context_group,true from seed
  on conflict (rule_identifier) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
revoke all on function public.seed_adult_commercial_detection_rules() from public, anon, authenticated;
select public.seed_adult_commercial_detection_rules();
