import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { LOCAL_DB_CONTAINER } from "./helpers/local-db.mjs";

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", LOCAL_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAtX"], { input: sql }).toString();
}

const fixturePrelude = `
begin;
select set_config('request.jwt.claims', json_build_object('sub',(select id::text from public.profiles where role='admin' and deactivated_at is null limit 1),'role','authenticated')::text, true);
delete from public.data_retention_policies where category='contact_evidence';
delete from public.data_retention_holds where category='contact_evidence';
`;

function contactInsert(name, status = "resolved", age = "40 days") {
  return `with t as (
    insert into public.support_tickets(ticket_type,subject,contact_name,contact_email,category,status,priority,created_at,updated_at,resolved_at)
    values('public_contact','${name}','Fixture','${name}@example.invalid','other','${status}','normal',now()-interval '${age}',now()-interval '${age}',${status === "resolved" ? `now()-interval '${age}'` : "null"}) returning id
  ), m as (
    insert into public.support_ticket_messages(ticket_id,author_id,body,is_internal,created_at)
    select id,null,'${name} message',false,now()-interval '${age}' from t returning ticket_id
  )
  insert into public.contact_submission_evidence(ticket_id,snapshot_version,capture_source,snapshot,sha256,captured_at)
  select id,1,'backfill_existing_ticket',jsonb_build_object('schema_version',1,'ticket_id',id,'fixture','${name}'),encode(extensions.digest(convert_to(jsonb_build_object('schema_version',1,'ticket_id',id,'fixture','${name}')::text,'UTF8'),'sha256'),'hex'),now()-interval '${age}' from t
  returning ticket_id;`;
}

test("missing Contact retention policy leaves eligible resolved contacts untouched", () => {
  const out = psql(`${fixturePrelude}${contactInsert("no-policy")}
  select public.purge_retained_data()->>'contact_evidence';
  select count(*) from public.support_tickets where contact_email='no-policy@example.invalid';
  rollback;`);
  assert.match(out, /0\n1\n$/);
});

test("disabled Contact retention policy leaves eligible contacts untouched", () => {
  const out = psql(`${fixturePrelude}${contactInsert("disabled-policy")}
  insert into public.data_retention_policies(category,retention_period,purpose,legal_basis,enabled) values('contact_evidence',interval '30 days','Contact evidence retention integration test','test fixture',false);
  select public.purge_retained_data()->>'contact_evidence';
  select count(*) from public.support_tickets where contact_email='disabled-policy@example.invalid';
  rollback;`);
  assert.match(out, /0\n1\n$/);
});

test("enabled policy purges old resolved Contact and cascades messages plus immutable snapshot", () => {
  const out = psql(`${fixturePrelude}${contactInsert("purge-me")}
  insert into public.data_retention_policies(category,retention_period,purpose,legal_basis,enabled) values('contact_evidence',interval '30 days','Contact evidence retention integration test','test fixture',true);
  select public.purge_retained_data()->>'contact_evidence';
  select count(*) from public.support_tickets where contact_email='purge-me@example.invalid';
  select count(*) from public.support_ticket_messages m join public.support_tickets t on t.id=m.ticket_id where t.contact_email='purge-me@example.invalid';
  select count(*) from public.contact_submission_evidence e join public.support_tickets t on t.id=e.ticket_id where t.contact_email='purge-me@example.invalid';
  rollback;`);
  assert.match(out, /1\n0\n0\n0\n$/);
});

test("open Contact survives even when older than retention cutoff", () => {
  const out = psql(`${fixturePrelude}${contactInsert("open-old", "open")}
  insert into public.data_retention_policies(category,retention_period,purpose,legal_basis,enabled) values('contact_evidence',interval '30 days','Contact evidence retention integration test','test fixture',true);
  select public.purge_retained_data()->>'contact_evidence';
  select count(*) from public.support_tickets where contact_email='open-old@example.invalid';
  rollback;`);
  assert.match(out, /0\n1\n$/);
});

test("ordinary support ticket survives Contact evidence purge", () => {
  const out = psql(`${fixturePrelude}
  insert into public.support_tickets(ticket_type,subject,category,status,priority,created_at,updated_at,resolved_at)
  values('support','ordinary','other','resolved','normal',now()-interval '40 days',now()-interval '40 days',now()-interval '40 days');
  insert into public.data_retention_policies(category,retention_period,purpose,legal_basis,enabled) values('contact_evidence',interval '30 days','Contact evidence retention integration test','test fixture',true);
  select public.purge_retained_data()->>'contact_evidence';
  select count(*) from public.support_tickets where subject='ordinary' and ticket_type='support';
  rollback;`);
  assert.match(out, /0\n1\n$/);
});

test("record-level Contact hold protects only its ticket", () => {
  const out = psql(`${fixturePrelude}${contactInsert("held-one")}${contactInsert("held-two")}
  insert into public.data_retention_policies(category,retention_period,purpose,legal_basis,enabled) values('contact_evidence',interval '30 days','Contact evidence retention integration test','test fixture',true);
  insert into public.data_retention_holds(category,record_id,reason,authorized_by)
  select 'contact_evidence',id,'fixture record hold',(select id from public.profiles where role='admin' and deactivated_at is null limit 1) from public.support_tickets where contact_email='held-one@example.invalid';
  select public.purge_retained_data()->>'contact_evidence';
  select count(*) from public.support_tickets where contact_email='held-one@example.invalid';
  select count(*) from public.support_tickets where contact_email='held-two@example.invalid';
  rollback;`);
  assert.match(out, /1\n1\n0\n$/);
});

test("category-wide Contact hold protects every eligible Contact", () => {
  const out = psql(`${fixturePrelude}${contactInsert("category-held-a")}${contactInsert("category-held-b")}
  insert into public.data_retention_policies(category,retention_period,purpose,legal_basis,enabled) values('contact_evidence',interval '30 days','Contact evidence retention integration test','test fixture',true);
  insert into public.data_retention_holds(category,record_id,reason,authorized_by)
  values('contact_evidence',null,'fixture category hold',(select id from public.profiles where role='admin' and deactivated_at is null limit 1));
  select public.purge_retained_data()->>'contact_evidence';
  select count(*) from public.support_tickets where contact_email in ('category-held-a@example.invalid','category-held-b@example.invalid');
  rollback;`);
  assert.match(out, /0\n2\n$/);
});

test("released record hold makes old resolved Contact purgeable", () => {
  const out = psql(`${fixturePrelude}${contactInsert("released-hold")}
  insert into public.data_retention_policies(category,retention_period,purpose,legal_basis,enabled) values('contact_evidence',interval '30 days','Contact evidence retention integration test','test fixture',true);
  with target as (select id from public.support_tickets where contact_email='released-hold@example.invalid')
  insert into public.data_retention_holds(category,record_id,reason,started_at,released_at,authorized_by)
  select 'contact_evidence',id,'released fixture',now()-interval '2 days',now()-interval '1 day',(select id from public.profiles where role='admin' and deactivated_at is null limit 1) from target;
  select public.purge_retained_data()->>'contact_evidence';
  select count(*) from public.support_tickets where contact_email='released-hold@example.invalid';
  rollback;`);
  assert.match(out, /1\n0\n$/);
});

test("active investigation retention hold prevents purge", () => {
  const out = psql(`${fixturePrelude}${contactInsert("investigated")}
  insert into public.data_retention_policies(category,retention_period,purpose,legal_basis,enabled) values('contact_evidence',interval '30 days','Contact evidence retention integration test','test fixture',true);
  insert into public.contact_investigations(ticket_id,reason,created_by)
  select id,'fixture investigation',(select id from public.profiles where role='admin' and deactivated_at is null limit 1) from public.support_tickets where contact_email='investigated@example.invalid';
  insert into public.data_retention_holds(category,record_id,reason,authorized_by)
  select 'contact_evidence',id,'Active Contact investigation: fixture',(select id from public.profiles where role='admin' and deactivated_at is null limit 1) from public.support_tickets where contact_email='investigated@example.invalid';
  select public.purge_retained_data()->>'contact_evidence';
  select count(*) from public.contact_investigations i join public.support_tickets t on t.id=i.ticket_id where t.contact_email='investigated@example.invalid';
  rollback;`);
  assert.match(out, /0\n1\n$/);
});

test("Contact record hold RPC rejects ordinary support ticket ids", () => {
  const sql = `${fixturePrelude}
  do $$ declare ordinary uuid; begin
    insert into public.support_tickets(ticket_type,subject,category,status,priority) values('support','ordinary-invalid-hold','other','open','normal') returning id into ordinary;
    begin
      perform public.set_data_retention_hold('contact_evidence',ordinary,'invalid fixture');
      raise exception 'expected hold validation failure';
    exception when others then
      if sqlerrm not like '%Contact ticket not found%' then raise; end if;
    end;
  end $$;
  rollback;`;
  assert.doesNotThrow(() => psql(sql));
});

test("repeat purge is idempotent after eligible Contact was removed", () => {
  const out = psql(`${fixturePrelude}${contactInsert("idempotent")}
  insert into public.data_retention_policies(category,retention_period,purpose,legal_basis,enabled) values('contact_evidence',interval '30 days','Contact evidence retention integration test','test fixture',true);
  select public.purge_retained_data()->>'contact_evidence';
  select public.purge_retained_data()->>'contact_evidence';
  rollback;`);
  assert.match(out, /1\n0\n$/);
});

test("active Contact investigation blocks evidence-hold release", () => {
  const out = psql(`${fixturePrelude}${contactInsert("release-guard")}
  do $$ declare ticket uuid; hold_id uuid; investigation uuid; begin
    select id into ticket from public.support_tickets where contact_email='release-guard@example.invalid';
    investigation := public.admin_escalate_contact_investigation(ticket,'fixture guard');
    select id into hold_id from public.data_retention_holds where category='contact_evidence' and record_id=ticket and released_at is null limit 1;
    begin
      perform public.admin_release_contact_evidence_hold(ticket,hold_id);
      raise exception 'expected active investigation guard';
    exception when others then
      if sqlerrm not like '%Resolve the Contact investigation before releasing its evidence hold%' then raise; end if;
    end;
  end $$;
  select count(*) from public.data_retention_holds h join public.support_tickets t on t.id=h.record_id where t.contact_email='release-guard@example.invalid' and h.released_at is null;
  rollback;`);
  assert.match(out, /1\n$/);
});
