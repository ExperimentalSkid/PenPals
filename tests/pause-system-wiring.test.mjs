import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

const root = new URL("../", import.meta.url);
const pauseMigration = await readFile(new URL("supabase/migrations/20260903000000_activity_ranks_and_inactive_mode.sql", root), "utf8");
const settings = await readFile(new URL("src/app/app/settings/page.tsx", root), "utf8");
const profileActions = await readFile(new URL("src/app/app/profile/actions.ts", root), "utf8");
const presence = await readFile(new URL("src/app/PresenceProvider.tsx", root), "utf8");
const notifications = await readFile(new URL("src/app/app/notifications/page.tsx", root), "utf8");

const hasLocalDatabase = (() => {
  try {
    execFileSync("docker", ["inspect", LOCAL_DB_CONTAINER], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

test("pause wiring stays distinct across settings, contact, presence, rank, and notifications", () => {
  assert.match(pauseMigration, /inactive_mode boolean not null default false/);
  assert.match(pauseMigration, /deactivated_at is null/);
  assert.match(pauseMigration, /create trigger introductions_inactive_guard/);
  assert.match(pauseMigration, /create trigger messages_inactive_guard/);
  assert.match(pauseMigration, /p\.inactive_mode = false/);
  assert.match(pauseMigration, /target\.inactive_mode = false/);
  assert.match(pauseMigration, /if profile_row\.inactive_mode then/);
  assert.match(pauseMigration, /is_frozen = true/);
  assert.match(pauseMigration, /if state_row\.is_frozen then/);
  assert.match(settings, /name="inactive_mode"/);
  assert.match(profileActions, /p_inactive_mode: formData\.get\("inactive_mode"\) === "on"/);
  assert.match(presence, /ownSettingsRef\.current\.inactive_mode/);
  assert.match(presence, /await ownChannel\.untrack\(\)/);
  assert.match(notifications, /unread_notification_count|notifications/);
});

test("live pause hides participation, freezes rank, preserves data, and resumes", { skip: !hasLocalDatabase }, () => {
  const sql = String.raw`
begin;
do $$
declare
  paused_user uuid;
  viewer_user uuid;
  profile_row record;
  after_profile record;
  excluded_codes text[];
  before_score numeric;
  frozen_score numeric;
  rank_frozen boolean;
  before_notifications bigint;
  after_notifications bigint;
  profile_json jsonb;
  event_count integer;
  intro_body text := 'A thoughtful introduction about books, travel, and the small details that make daily conversations memorable.';
begin
  select p.id into paused_user
    from public.profiles p
   where p.deactivated_at is null
     and not p.inactive_mode
     and exists (select 1 from auth.users u where u.id = p.id and u.email_confirmed_at is not null)
   order by p.created_at
   limit 1;
  select p.id into viewer_user
    from public.profiles p
   where p.id <> paused_user
     and p.deactivated_at is null
     and not p.inactive_mode
     and exists (select 1 from auth.users u where u.id = p.id and u.email_confirmed_at is not null)
   order by p.created_at
   limit 1;
  if paused_user is null or viewer_user is null then raise exception 'verified active fixtures unavailable'; end if;

  select p.* into profile_row from public.profiles p where p.id = paused_user;
  select coalesce(array_agg(e.country_code), '{}'::text[])
    into excluded_codes
    from public.profile_introduction_country_exclusions e
   where e.profile_id = paused_user;
  select s.current_score into before_score from public.activity_rank_state s where s.user_id = paused_user;
  select count(*) into before_notifications from public.notifications n where n.user_id = paused_user and n.read_at is null;

  perform set_config('request.jwt.claim.sub', paused_user::text, true);
  perform public.save_privacy_settings(
    profile_row.profile_visibility,
    profile_row.show_city,
    profile_row.show_activity_status,
    profile_row.show_response_rate,
    profile_row.accepting_new_conversations,
    profile_row.introduction_scope,
    profile_row.availability,
    excluded_codes,
    true
  );

  select s.is_frozen, s.frozen_score into rank_frozen, frozen_score
    from public.activity_rank_state s where s.user_id = paused_user;
  if not rank_frozen then raise exception 'pause did not freeze activity rank state'; end if;
  if frozen_score is distinct from before_score then raise exception 'pause changed the frozen score'; end if;
  if exists (select 1 from public.profiles p where p.id = paused_user and p.deactivated_at is not null) then
    raise exception 'pause changed deactivation state';
  end if;

  perform public.record_activity_event(paused_user, 'pause-wiring-event', 'active_day', now());
  select count(*) into event_count from public.activity_rank_events e where e.user_id = paused_user and e.event_key = 'pause-wiring-event';
  if event_count <> 0 then raise exception 'paused account earned a new activity event'; end if;

  perform set_config('request.jwt.claim.sub', viewer_user::text, true);
  select public.get_public_profile(profile_row.username) into profile_json;
  if profile_json is null then raise exception 'paused profile identity disappeared'; end if;
  if profile_json->>'activity_status' is not null or profile_json->>'availability' is not null then
    raise exception 'paused profile advertised activity or availability';
  end if;
  if exists (select 1 from public.get_discover_profiles() d where d.id = paused_user) then
    raise exception 'paused profile remained in Discover';
  end if;
  begin
    perform public.submit_introduction(
      paused_user,
      intro_body
    );
    raise exception 'paused profile accepted a new introduction';
  exception when others then
    if sqlerrm <> 'Conversation unavailable' then raise; end if;
  end;

  select public.unread_notification_count() into after_notifications;
  perform set_config('request.jwt.claim.sub', paused_user::text, true);
  select count(*) into after_notifications from public.notifications n where n.user_id = paused_user and n.read_at is null;
  if after_notifications <> before_notifications then raise exception 'pause changed notification state'; end if;

  perform public.save_privacy_settings(
    profile_row.profile_visibility,
    profile_row.show_city,
    profile_row.show_activity_status,
    profile_row.show_response_rate,
    profile_row.accepting_new_conversations,
    profile_row.introduction_scope,
    profile_row.availability,
    excluded_codes,
    false
  );
  if not exists (select 1 from public.activity_rank_state s where s.user_id = paused_user and s.is_frozen = false and s.frozen_score is null) then
    raise exception 'resume did not unfreeze activity rank state';
  end if;
  select p.* into after_profile from public.profiles p where p.id = paused_user;
  if after_profile.inactive_mode or after_profile.deactivated_at is not null then
    raise exception 'resume left the account in a lifecycle-restricted state';
  end if;
  if after_profile.username is distinct from profile_row.username
     or after_profile.display_name is distinct from profile_row.display_name
     or after_profile.country is distinct from profile_row.country
     or after_profile.city is distinct from profile_row.city then
    raise exception 'pause changed profile data';
  end if;
  if exists (select 1 from public.profiles p where p.id = paused_user and p.deactivated_at is not null) then
    raise exception 'resume changed deactivation state';
  end if;
end;
$$;
rollback;
`;
  execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], { input: sql, stdio: ["pipe", "ignore", "pipe"] });
});
