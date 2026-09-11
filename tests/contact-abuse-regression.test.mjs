import test from "node:test";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAtX"], { input: sql, encoding: "utf8" });
}

const serviceClaims = `select set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);`;
const token = (n) => String(n).repeat(64).slice(0, 64);

test("verified submissions do not count twice toward the 24-hour email limit", { skip: !LOCAL_DB_CONTAINER }, () => {
  const email = `rate-email-${Date.now()}@example.test`;
  const sql = `begin;\n${serviceClaims}\nDO $$\nDECLARE i int; pid uuid; tid uuid; token_value text; successes int := 0; blocked_at int := 0; blocked_reason text := null;\nBEGIN\n  FOR i IN 1..6 LOOP\n    BEGIN\n      token_value := repeat(substr(to_hex(i),1,1), 64);\n      pid := public.create_public_contact_verification('Fixture','${email}','other','Rate fixture subject','This message is long enough for the Contact validation rules.',token_value,jsonb_build_object('client_key_hash','email-client-'||i,'ip_hash','email-ip-'||i));\n      tid := public.verify_public_contact_submission(pid, token_value, '{}'::jsonb);\n      successes := successes + 1;\n      update public.public_contact_pending_verifications set created_at = created_at - interval '2 minutes' where id = pid;\n      update public.support_tickets set created_at = created_at - interval '2 minutes' where id = tid;\n    EXCEPTION WHEN OTHERS THEN\n      blocked_at := i; blocked_reason := SQLERRM; EXIT;\n    END;\n  END LOOP;\n  IF successes <> 5 OR blocked_at <> 6 THEN RAISE EXCEPTION 'email limit mismatch successes=% blocked_at=% reason=%', successes, blocked_at, blocked_reason; END IF;\nEND $$;\nrollback;`;
  psql(sql);
});

test("wrong token and expired verification never create Contact tickets", { skip: !LOCAL_DB_CONTAINER }, () => {
  const email = `verify-invalid-${Date.now()}@example.test`;
  const sql = `begin;\n${serviceClaims}\nDO $$\nDECLARE pid uuid; before_count bigint; after_count bigint;\nBEGIN\n  select count(*) into before_count from public.support_tickets where ticket_type='public_contact';\n  pid := public.create_public_contact_verification('Fixture','${email}','other','Verification fixture','This message is long enough for verification validation.','${token(2)}','{}'::jsonb);\n  BEGIN perform public.verify_public_contact_submission(pid, '${token(3)}', '{}'::jsonb); RAISE EXCEPTION 'wrong token accepted'; EXCEPTION WHEN OTHERS THEN IF sqlerrm='wrong token accepted' THEN RAISE; END IF; END;\n  update public.public_contact_pending_verifications set expires_at = now() - interval '1 second' where id=pid;\n  BEGIN perform public.verify_public_contact_submission(pid, '${token(2)}', '{}'::jsonb); RAISE EXCEPTION 'expired token accepted'; EXCEPTION WHEN OTHERS THEN IF sqlerrm='expired token accepted' THEN RAISE; END IF; END;\n  select count(*) into after_count from public.support_tickets where ticket_type='public_contact';\n  IF after_count <> before_count THEN RAISE EXCEPTION 'invalid verification created a ticket'; END IF;\nEND $$;\nrollback;`;
  psql(sql);
});

test("verified Contact submission remains idempotent on replay", { skip: !LOCAL_DB_CONTAINER }, () => {
  const email = `verify-replay-${Date.now()}@example.test`;
  const sql = `begin;\n${serviceClaims}\nDO $$\nDECLARE pid uuid; first_ticket uuid; replay_ticket uuid;\nBEGIN\n  pid := public.create_public_contact_verification('Fixture','${email}','other','Replay fixture','This message is long enough for replay validation.','${token(4)}',jsonb_build_object('client_key_hash','replay-client'));\n  first_ticket := public.verify_public_contact_submission(pid, '${token(4)}', jsonb_build_object('client_key_hash','replay-client'));\n  replay_ticket := public.verify_public_contact_submission(pid, '${token(4)}', jsonb_build_object('client_key_hash','different-client'));\n  IF first_ticket IS NULL OR replay_ticket <> first_ticket THEN RAISE EXCEPTION 'verification replay was not idempotent'; END IF;\n  IF (select count(*) from public.support_tickets where id=first_ticket) <> 1 THEN RAISE EXCEPTION 'replay duplicated ticket'; END IF;\nEND $$;\nrollback;`;
  psql(sql);
});


test("already-verified Contact replay still requires the original token", { skip: !LOCAL_DB_CONTAINER }, () => {
  const email = `verified-token-${Date.now()}@example.test`;
  const sql = `begin;\n${serviceClaims}\nDO $$\nDECLARE pid uuid; ticket uuid; rejected boolean := false;\nBEGIN\n  pid := public.create_public_contact_verification('Fixture','${email}','other','Verified replay token fixture','This message is long enough for replay-token validation.','${token(5)}','{}'::jsonb);\n  ticket := public.verify_public_contact_submission(pid, '${token(5)}', '{}'::jsonb);\n  BEGIN\n    perform public.verify_public_contact_submission(pid, '${token(6)}', '{}'::jsonb);\n  EXCEPTION WHEN OTHERS THEN\n    IF position('invalid' in lower(SQLERRM)) > 0 THEN rejected := true; ELSE RAISE; END IF;\n  END;\n  IF NOT rejected THEN RAISE EXCEPTION 'verified replay accepted the wrong token'; END IF;\n  IF public.verify_public_contact_submission(pid, '${token(5)}', '{}'::jsonb) <> ticket THEN RAISE EXCEPTION 'valid replay stopped being idempotent'; END IF;\nEND $$;\nrollback;`;
  psql(sql);
});

test("client correlation limit allows ten submissions and blocks the eleventh in 24 hours", { skip: !LOCAL_DB_CONTAINER }, () => {
  const stamp = Date.now();
  const sql = `begin;\n${serviceClaims}\nDO $$\nDECLARE i int; pid uuid; tid uuid; token_value text; successes int := 0; blocked_at int := 0; client text := 'shared-client-${stamp}';\nBEGIN\n  FOR i IN 1..11 LOOP\n    token_value := repeat(substr(to_hex((i % 15) + 1),1,1), 64);\n    BEGIN\n      pid := public.create_public_contact_verification('Fixture','client-${stamp}-'||i||'@example.test','other','Client rate fixture','This message is long enough for Contact client-rate validation.',token_value,jsonb_build_object('client_key_hash',client,'ip_hash','ip-'||i));\n      tid := public.verify_public_contact_submission(pid, token_value, '{}'::jsonb);\n      successes := successes + 1;\n    EXCEPTION WHEN OTHERS THEN\n      IF position('wait' in lower(SQLERRM)) > 0 THEN blocked_at := i; EXIT; ELSE RAISE; END IF;\n    END;\n  END LOOP;\n  IF successes <> 10 OR blocked_at <> 11 THEN RAISE EXCEPTION 'client limit mismatch successes=% blocked_at=%', successes, blocked_at; END IF;\nEND $$;\nrollback;`;
  psql(sql);
});

test("correlation counts and verification-client mismatch are recorded as supporting signals", { skip: !LOCAL_DB_CONTAINER }, () => {
  const stamp = Date.now();
  const email = `correlation-${stamp}@example.test`;
  const sql = `begin;\n${serviceClaims}\nDO $$\nDECLARE i int; pid uuid; tid uuid; token_value text; final_ticket uuid; meta jsonb;\nBEGIN\n  FOR i IN 1..3 LOOP\n    token_value := repeat(substr(to_hex(i),1,1),64);\n    pid := public.create_public_contact_verification('Fixture','${email}','other','Correlation fixture','This message is long enough for Contact correlation validation.',token_value,jsonb_build_object('client_key_hash','corr-client-${stamp}','ip_hash','corr-ip-${stamp}'));\n    tid := public.verify_public_contact_submission(pid, token_value, jsonb_build_object('client_key_hash',case when i=3 then 'different-verification-client' else 'corr-client-${stamp}' end));\n    update public.public_contact_pending_verifications set created_at=created_at-interval '2 minutes' where id=pid;\n    update public.support_tickets set created_at=created_at-interval '2 minutes' where id=tid;\n    final_ticket := tid;\n  END LOOP;\n  select contact_request_metadata into meta from public.support_tickets where id=final_ticket;\n  IF (meta->>'prior_verified_email_count')::int <> 2 THEN RAISE EXCEPTION 'prior email correlation count mismatch'; END IF;\n  IF (meta->>'prior_verified_client_count')::int <> 2 THEN RAISE EXCEPTION 'prior client correlation count mismatch'; END IF;\n  IF (meta->>'prior_verified_ip_count')::int <> 2 THEN RAISE EXCEPTION 'prior IP correlation count mismatch'; END IF;\n  IF (meta->>'verification_same_client')::boolean IS DISTINCT FROM false THEN RAISE EXCEPTION 'verification client mismatch was not recorded'; END IF;\nEND $$;\nrollback;`;
  psql(sql);
});
