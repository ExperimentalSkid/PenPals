-- One-time production owner bootstrap.
--
-- Run only through a private direct PostgreSQL connection after migrations and
-- after the owner has registered, confirmed their email, and created a profile.
-- This is deliberately not a migration, RPC, browser action, or public API.
-- It refuses to run if any administrator profile already exists.

\set ON_ERROR_STOP on
\prompt 'Confirmed owner account email: ' penpals_owner_email

begin;

-- Keep the address transaction-local and pass it safely into the guarded block.
select set_config('app.penpals_first_admin_email', :'penpals_owner_email', true);

do $bootstrap$
declare
  owner_id uuid;
  owner_confirmed_at timestamptz;
  owner_deactivated_at timestamptz;
  owner_email text := lower(trim(coalesce(current_setting('app.penpals_first_admin_email', true), '')));
begin
  -- Match the existing privileged role-change lock so this cannot race a
  -- concurrent ordinary admin role change.
  perform pg_advisory_xact_lock(hashtextextended('penpal-admin-role-change', 0));

  if owner_email = '' then
    raise exception 'A confirmed owner account email is required';
  end if;

  if exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'An administrator profile already exists; use the authenticated admin tools instead';
  end if;

  select p.id, u.email_confirmed_at, p.deactivated_at
    into owner_id, owner_confirmed_at, owner_deactivated_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = owner_email
  for update of p;

  if owner_id is null then
    raise exception 'No profile exists for the supplied owner email';
  end if;
  if owner_confirmed_at is null then
    raise exception 'The supplied owner email has not been confirmed';
  end if;
  if owner_deactivated_at is not null then
    raise exception 'The supplied owner profile is deactivated';
  end if;

  -- The role trigger permits this setting only for the current transaction.
  perform set_config('app.allow_role_change', '1', true);
  update public.profiles set role = 'admin' where id = owner_id;
  if not found then
    raise exception 'The owner role could not be updated';
  end if;

  raise notice 'First administrator provisioned. Sign in again before opening the admin area.';
end;
$bootstrap$;

commit;
