# First VPS deployment

This is the handoff for the existing Pen-Pals app and self-hosted Supabase.
A GitHub push publishes source; it does not provision or deploy a VPS. Use
your existing deployment panel/process manager. No server access needs to be
shared with the coding agent.

The local audit and selected regression results are recorded in
[`CODEX_REVIEW_STATE.md`](../CODEX_REVIEW_STATE.md). They support a controlled
test deployment, not a claim that production email or infrastructure is live.

## 1. Prepare the production environment

- Use Node.js 24 and the repository's pinned pnpm 11.19.0.
- Start from your official self-hosted Supabase stack with its own production
  keys, database credentials and persistent database/Storage volumes. Do not
  deploy the local CLI stack or copy local Docker volumes/development users.
- Provide HTTPS for `https://pen-pals.net` and your real Supabase API gateway.
  Keep the database and administrative dashboards private.
- Put Next.js behind your existing reverse proxy. Overwrite client-supplied
  forwarding headers with the trusted client address; the app uses these for
  login throttling. Preserve the public host and HTTPS scheme.
- Do not cache authenticated HTML, Auth callbacks or Server Action responses at
  the proxy. Allow Supabase Realtime WebSocket connections and the existing
  upload sizes (the app's Server Action body limit is 35 MB).
- Set up database and Storage backups and test restoration into a separate
  environment. Keep public registration closed at the proxy/access layer until
  the controlled launch checks below pass; do not change onboarding rules.

## 2. Supply private configuration

Keep populated environment files outside the checkout, readable only by the
deployment account. `.env.example` is a variable inventory, not production
credentials. Never reuse local `.env.local` or commit a populated file.

| Process | Required configuration |
| --- | --- |
| Next.js build **and** runtime | `NEXT_PUBLIC_SITE_URL=https://pen-pals.net`, `NEXT_PUBLIC_SUPABASE_URL` set to your public HTTPS API gateway, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from that same production stack. |
| Next.js server | `SUPABASE_SERVICE_ROLE_KEY` from that stack for existing account-management/server-only operations; never use it as the public key. |
| Background worker | `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. |
| Supabase Auth | Its existing stack configuration plus the separate [production email overlay and variables](production-email.md). |

`NEXT_PUBLIC_` values are included in the browser bundle at build time. Build
with the production values; replacing runtime variables cannot repair a bundle
built against localhost. Do not copy a local `.next` build to production.

Before building, validate the **app/worker** environment without printing any
credentials:

```sh
node --env-file=/etc/penpals/app.env scripts/validate-production-app-config.mjs
```

The app check requires the two public origins, a matching publishable key and
the server-only service-role key. It rejects localhost origins, a public secret,
or accidentally using the same key for browser and server. It intentionally
does not assume a particular self-hosted Supabase key format.

If Google login/linking is enabled, preserve its Auth provider settings and
approved callback URLs, enable the existing manual-linking setting, and set
the app's private `GOOGLE_LOGIN_STATE_SECRET` to a random value of at least 32
characters. Preserve existing Auth MFA settings for authenticator verification.
Optional external verification providers stay disabled until separately
configured; these are not Google login. Local `supabase/config.toml` does not
configure a self-hosted production Auth container.

Configure Resend through [the email guide](production-email.md), using
`Pen-Pals <no-reply@pen-pals.net>`. Rotate the key previously shared in chat.
Only the Auth stack needs SMTP/Resend secrets, not the Next.js browser or worker.
Validate the separate Auth/SMTP environment with
`node --env-file=/etc/penpals/auth-email.env scripts/validate-production-email-config.mjs`.

## 3. Apply application migrations, without demo data

Run from the checked-out repository root. First take a verified backup and
confirm the target database. For a fresh stack, apply the repository migrations
after the official Supabase services have initialized their own schemas.

Load `PENPALS_DATABASE_URL` privately in the deployment environment. It is the
direct administrative PostgreSQL connection for your self-hosted stack, with
URL-encoded credentials where needed. Do not paste credentials into commands,
enable shell tracing, expose the database publicly or print the environment.

```sh
pnpm install --frozen-lockfile
pnpm schema:check
pnpm dlx --yes --package=supabase@2.116.0 supabase db push --db-url "$PENPALS_DATABASE_URL" --skip-vault --dry-run
```

Review the pending migration list and backup before running the real command:

```sh
pnpm dlx --yes --package=supabase@2.116.0 supabase db push --db-url "$PENPALS_DATABASE_URL" --skip-vault
pnpm dlx --yes --package=supabase@2.116.0 supabase migration list --db-url "$PENPALS_DATABASE_URL"
pnpm dlx --yes --package=supabase@2.116.0 supabase db lint --db-url "$PENPALS_DATABASE_URL" --fail-on error
```

The pinned CLI matches repository validation. `--skip-vault` avoids applying
local Vault configuration to production. Verify local/remote migration versions
match and inspect lint warnings as well as errors. Stop on any migration error;
do not blindly repair migration history or reset a database to obtain a pass.

Do **not** use `--include-seed` or run `supabase/seed.sql`: it creates demo
accounts with known development passwords. Canonical country/location,
language and interest catalogues are already supplied by migrations.
See [database validation](database-validation.md) for the existing local/CI gate.
These production commands must be run by the operator; local parity is not
evidence that they have run against the VPS.

### Bootstrap the first administrator

The production database intentionally has no demo administrator. After the
migrations are applied, create and confirm your real owner account through the
private app, complete enough setup to create its profile, then run this once
from a direct **private database-admin** connection:

```sh
psql "$PENPALS_DATABASE_URL" --set=ON_ERROR_STOP=1 --file=deploy/bootstrap-first-admin.sql
```

The script prompts for the owner email rather than putting it in the command.
It takes the same role-change lock as the admin tools, requires a confirmed and
active profile, and refuses if *any* administrator profile already exists. Its
temporary role-change setting expires with the transaction. It is not a
migration, browser API or callable RPC. Do not run `supabase/seed.sql`, do not
expose the database, and do not reuse this script to change staff roles. Sign
out/in after it completes; later role changes belong in the authenticated admin
area and retain the ordinary audit path.

## 4. Build and supervise the app and worker

Example private file paths below are placeholders for your server, not files
in Git. Run from the release directory. With environment injection from your
panel, `pnpm build` and `pnpm start` are equivalent app entry points.

```sh
node --env-file=/etc/penpals/app.env node_modules/next/dist/bin/next build
node --env-file=/etc/penpals/app.env node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3000
```

Use your process manager for restart-on-failure and startup after reboot, not
an interactive terminal. The loopback binding assumes a host reverse proxy;
for an existing container setup, use its private network instead. Keep the
release's `public`, `.next`, installed dependencies and Next configuration
available. Use the Node server, not `next dev` or a static HTML export.

Schedule the existing one-shot worker using your server's scheduler, for
example once per minute with overlapping runs prevented:

```sh
node --env-file=/etc/penpals/jobs.env scripts/run-background-jobs.mjs
```

The worker handles avatar cleanup, introduction expiry, Snail Mail delivery,
SEO aggregate/eligibility/history refresh and existing retention jobs. It does
not automatically load `.env.local`. Capture its exit status and summaries;
nonzero status or a nonempty `failed_jobs` list requires attention. Existing
database cadence and retention rules remain authoritative. Do not activate
public SEO eligibility or change retention policies as part of deployment.

## 5. Controlled launch checks

Before opening public registration:

1. Confirm signup, resend and recovery reach a controlled real inbox, from the
   intended sender. Follow each relevant link on HTTPS; no localhost, Mailpit
   or tracking redirect should appear. Complete the [Auth checks](production-email.md#launch-verification).
2. Complete a new account's onboarding, refresh, log out/in and verify the
   saved profile. Confirm required onboarding still guards normal app entry.
3. With two controlled accounts, check introductions, chat/Realtime, Snail Mail
   and permitted photos. Check Settings, support and the account-data export.
4. Verify a successful scheduled-worker run, process restart and reboot
   persistence. Confirm backup restoration works outside production.
5. Inspect app/Auth/proxy logs for errors without logging credentials, tokens
   or private message content. Keep the prior compatible release for rollback;
   do not blindly roll back database migrations with a code release.

Only the deployed checks establish production readiness. The repository has
no automatic VPS provisioning or deploy-on-push workflow, and this guide does
not claim access to or verification of the user's server.
