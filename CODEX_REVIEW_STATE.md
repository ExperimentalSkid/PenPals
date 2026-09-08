# PenPal Review State

This file is the persistent checkpoint for the multi-pass project review. It
must be updated after every review action, including interruptions, failed
commands, lost context, or blocked work. A pass is not complete until its
scope is explicitly verified.

## Current pass

- Current requested task (2026-09-08): `VERIFIED` — project source published
  to the public ExperimentalSkid/PenPals GitHub repository on `main` after
  production-email validation and a source-only secret/privacy review.
  Production VPS activation remains `BLOCKED` on deployment access/settings.
  The master audit below remains incomplete and its continuation is preserved.
- `FIXED` → `VERIFIED`: Production Auth-email code now targets the confirmed
  self-hosted Supabase Docker deployment, not hosted Supabase Management API.
  The existing Auth service uses Resend SMTP and a private, unexposed Caddy
  service to fetch six read-only production templates. Signup/resend and
  recovery templates carry explicit token-hash flow types; other Supabase Auth
  lifecycles retain their native confirmation URL or reauthentication token.
- `VERIFIED`: The requested sender was corrected to
  `Pen-Pals <no-reply@pen-pals.net>`. Resend accepted a one-off routine delivery
  request to the owner's controlled inbox. The supplied sending-only key cannot
  read domain state or message status (`restricted_api_key`), so provider API
  acceptance—not inbox delivery—is the only verified external result.
- `VERIFIED` (2026-09-08): Resend SMTP TLS connection and authentication on
  `smtp.resend.com:465` succeeded with the supplied key held only in a temporary
  process environment. No email was sent by this check. The earlier SMTP send
  attempt has no retained outcome, so do not assume delivery or resend it.
- `VERIFIED`: Local `.env.local`, `supabase/config.toml`, Mailpit, Auth actions,
  session handling and application runtime dependencies were not changed.
  The VPS overlay preserves the existing Auth image/database/OAuth/session
  settings, publishes no template port, and uses an absolute read-only mount.
  A synthetic Compose merge/config check passed without starting containers.
- `VERIFIED`: 47 focused email/auth/template/self-hosted tests, TypeScript,
  ESLint and the production build passed. Static migration validation reports
  244 valid unique files. Current schema parity/lint rerun is `BLOCKED` because
  Docker Desktop is stopped (Docker pipe absent; database port 54322 refused).
  The prior successful 244-migration parity result below remains historical.
- Final publication validation: TypeScript, ESLint, production build (13 static
  pages), and static validation of all 244 migrations passed again. The focused
  email/auth suite reports 59 passing tests; one database assertion returns
  early when Docker is unavailable and therefore remains unverified. The
  production environment validator passed with synthetic values. The earlier
  524-check static/mocked suite passed. No live VPS verification is implied.
- Publication review: 719 source files, no real key/JWT/private-key matches,
  no populated secret environment files, no runtime/build/backup artifacts,
  and no file over 5 MiB. Two private workstation paths were removed from docs.
  Git's whitespace check reports 34 pre-existing trailing-space/EOF warnings;
  these do not affect the build and were left unchanged. Local seeded accounts
  are development fixtures and must never be seeded on the VPS.
- `VERIFIED`: Initial commit `1b208debf715ee4de8e46d058547ffc069a250f1`
  was pushed to `main` at https://github.com/ExperimentalSkid/PenPals. Remote
  and local commit IDs matched; GitHub uses `main` as its default branch.
- `ISSUE FOUND` → `FIXED` → `VERIFIED`: first GitHub database CI run
  34186140745 failed during dependency installation because Node 20 cannot run
  pnpm 11 (`node:sqlite` unavailable). CI now selects Node 24, matching the
  validated local runtime; package engines and deployment docs record the
  minimum Node 22.13 requirement. No application dependency was changed.
- `VERIFIED`: Node 24 cleared the runtime failure on GitHub. Run 34186271771
  then exposed an unresolved `allowBuilds` placeholder for the existing
  `unrs-resolver` dependency. Its installed 1.12.2 postinstall was inspected:
  it invokes `napi-postinstall` to prepare its platform binding. The package is
  now explicitly allowed; no global script-policy bypass was added. CI path
  filters include `pnpm-workspace.yaml` so future policy changes rerun the gate.
  Fresh CI verification passed in run 34186417263. Two local package-inspection commands
  failed to resolve the transitive module before resolving through its actual
  ESLint parent; this did not change files or invalidate the retained checks.
- `VERIFIED`: GitHub database release gate 34186417263 succeeded on source
  commit `8a4da21ff7f7e0ff0e17df5837a826b47351cd74`. Clean dependency install,
  fresh Supabase startup/application of all 244 migrations, incremental
  migration check, schema lint, and history parity all passed. Schema lint
  retained three existing extra warnings and no errors. Image-download rate
  limits were retried successfully by the CLI. Existing GitHub action runtime
  deprecation warnings did not fail the run. Local Docker remains unavailable;
  this fresh database verification ran on GitHub's disposable runner.
- Exact publication continuation: the source and CI corrections are pushed;
  publish this documentation-only checkpoint and verify remote/local commit
  equality. Next product work is the preserved master-audit continuation below.
  For production email, obtain the VPS connection/public Supabase gateway URL,
  configure the private deployment environment, and execute the documented
  live Auth delivery/callback checks. A GitHub push does not deploy the VPS.
- `BLOCKED`: The VPS/self-hosted Supabase instance does not exist in this local
  workspace, so production signup, resend, recovery, remaining enabled Auth
  flows and real callback delivery require post-deploy verification. Resend DNS
  records and tracking state cannot be audited with the scoped sending key;
  exact provider values were not invented. Rotate the chat-exposed key before
  final production deployment and load the replacement only from VPS secrets.
- `FIXED`: Before the first public GitHub commit, a hardcoded private owner email
  alias was removed from distributable seed/migration/checkpoint text. Fresh
  local fixtures retain `admin@example.com` and username `admin`; the generic
  private, password-gated alias architecture remains. The disclosed Resend key,
  personal inbox address and test password are absent from publishable source.
- Exact email continuation: deploy from GitHub to the VPS, set the real public
  self-hosted Supabase URL and private environment, merge the documented Compose
  overlay, rotate/load the Resend key, then run the seven real delivery/callback
  checks in `docs/production-email.md`. Do not mark production mail operational
  before those checks pass.
- Audit interruption: migration 20260905440000 and its completeness test were
  written by the earlier specialist before its interruption. Treat them as
  pending inspection/verification; do not discard or claim complete.

- State: `IN PROGRESS`
- Pass: `Architecture audit → full existing-project audit, repair and consolidation`
- Scope: Architecture, backend/data, defensive privacy/security inspection,
  frontend/wiring, browser visual/responsive/accessibility QA, verified bloat,
  reliability and final regression. Preserve existing product policy/design.
- Started: 2026-09-05
- Resumed: 2026-09-06; master audit remains `IN PROGRESS` (do not stop after a
  single repaired feature). The user's localhost onboarding form was left
  untouched when concurrent editing was observed. Browser QA uses the separate
  127.0.0.1 account audit-20260905b@example.test / @audit_traveller.
- `VERIFIED`: This QA profile saved partial basics, resumed Languages after
  refresh, completed English + Books/Music/Travel, entered Discover, and shows
  the saved location/language/interests/bio through the real profile projection.
- `FIXED` → `VERIFIED`: Completion initially opened Discover without navigation
  until reload. saveProfile now revalidates /app layout after successful saves.
  Browser re-test: remove/re-add a QA interest → focused incomplete shell →
  completion restores Main navigation immediately. Added mocked order regression.
  The optional gender input no longer displays its internal neutral sentinel.
- `FIXED`: PresenceProvider guards async session/profile/subscription callbacks
  after unmount/unwatch and waits for same-topic channel teardown before reuse.
  20 targeted lifecycle/activity checks and type/lint checks passed. Import graph
  inspection found no cycles or unresolved local imports (132 modules/242 edges).
- `FIXED`: Inbox identity/location/photo projection reads are deduplicated per
  contact and per render, never globally across viewers. Applied forward local
  migration 20260905430000_atomic_message_conversation_timestamp.sql: timestamp
  update is atomic with message insert, monotonic, with no new client grants.
  Removed the ineffective second client UPDATE. Agent reports 48 related checks
  passed plus normal rolled-back DB inserts; metadata has no stale timestamps.
- `VERIFIED`: Desktop/tablet/mobile profile screenshots; mobile document 375px
  within 390px viewport; badge tooltip visible by keyboard focus. No verification
  badge relocation. Discover Japan search filters to the Japanese seed profile.
  Introduction dialog disables short text and enables the valid local QA note.
- Regression checkpoint: 88 static/mocked/unit files ran: 472 checks, 462 passed,
  10 stale prior copy/structure expectations. Those expectations were aligned
  with unchanged approved UI; affected 38 tests now pass. All 20 automatic badge
  families also passed 80 checks including real transactional DB calculations.
  Runtime-dependent/adversarial mixed suites are separately scoped; they were
  not blindly executed. No test/rule was disabled to obtain these results.
- `VERIFIED`: Admin accepted the QA introduction by replying; conversation
  17d064b3-3f29-48bd-a78d-5aca15f2bd85 contains the introduction and reply.
  A further admin message saved and cleared the composer correctly. No draft
  reset change was needed.
- `FIXED`: Successful introduction reply/decline now revalidates the app layout
  to refresh the stale notification count observed in the browser. Support
  resolve/reopen also refreshes the staff inbox count. Report-and-decline uses
  the same success-only invalidation; ordinary/failed reports do not.
- `FIXED`: Report return navigation validates normalized internal paths and
  attaches feedback before fragments without duplicating query parameters.
  Report targets, RPC permissions, reasons and error behavior are unchanged.
  All validation here used static inspection and mocked actions, not live
  adversarial requests. 24 report-related and 19 notification-related tests
  passed. The message harness was updated for the new next/cache import; its
  18 combined tests passed without changing message behavior.
- `VERIFIED` (2026-09-06): Latest complete static/mocked subset: 490/490 tests,
  zero skips/failures. Production-email configuration tests: 5/5. Whole-project
  TypeScript and ESLint passed. Production build passed (13 static pages;
  authenticated and SEO data routes remain dynamic). Public homepage, sign-in,
  sign-up and recovery navigation/layout inspected in the browser at desktop,
  768px tablet and 390px mobile sizes. No console warnings/errors in these
  public checks; no horizontal page overflow. Invalid registration email keeps
  focus in the invalid field. Viewport override reset afterward; no design edits.
  Schema filename validation passed for all 243 migrations. Fresh schema parity
  and database lint both failed to connect to 127.0.0.1:54322 (ECONNREFUSED),
  so their database-dependent verification remains BLOCKED, not VERIFIED.
- Prior environment interruption (`RESOLVED`): Local Docker daemon was unavailable; no
  dockerDesktopLinuxEngine pipe exists. The development app was restarted, but
  database-backed routes cannot load. Starting the existing Docker executable
  reached an error dialog; Docker's log records a GUI "Reset to factory defaults"
  action which this agent did not initiate. No further Docker mutation attempted;
  user asked whether they are changing Docker. Do not reset or recreate data.
- `VERIFIED`: User restored Docker; existing QA account and conversation intact.
  Fresh 243-migration parity/schema lint passed (0 errors, 3 existing warnings).
  All 20 badge families plus ordinary message timestamp integration passed:
  81 tests, no skips/failures. Local Vector logging transport still restarts
  because host.docker.internal:2375 refuses its Docker log connection; core
  Auth/DB/REST/storage/realtime are healthy. No Docker security settings changed.
- `VERIFIED`: Browser receiving/sending between @audit_traveller/@admin;
  Snail Mail send, sender transit/cooldown and recipient sealed-until-delivery
  views. QA support ticket SUP-1001 / 0889082c-84e3-409e-8576-bc5162b9b028:
  submitted, staff claimed, public reply, private note, owner reply, resolved.
  Owner sees public replies but not the internal note; resolved form is closed.
- `VERIFIED`: Settings country aliases/flags (Turkey -> Türkiye, Japan, South
  Africa), multiple save/reload/remove; original empty exclusions restored.
  QA data export browser link returned a 200 ZIP response. No real account
  deletion, password/TOTP credential changes or external OAuth linking performed.
- `FIXED` -> `VERIFIED`: Settings country control stole autofocus and scrolled
  the page on entry. Disabled autofocus only at that control; browser now enters
  Settings at scrollY 0 with no search autofocus. Added country-specific Remove
  accessible names; 5 focused tests pass, shared picker/design unchanged.
- `VERIFIED`: QA report 7ff9caf2-4846-40f2-81fa-ea1a130dfa15 reached staff intake
  with preserved message/context. Report dismissed; related case
  816757e1-51fb-4760-9824-bf3844cdc6fd claimed and dismissed with explicit
  synthetic-QA reason, no account enforcement. Case status had same stale Mod
  Inbox count; success-only layout invalidation added with 8 new mocks.
- `FIXED`: Conversation/introduction report return pages ignored reported=1.
  Added the existing profile success-notice treatment; 6 mocked page render
  checks passed. Browser confirmation recheck still pending.
- `VERIFIED`: Helpful Penpal assigned through staff UI to @audit_traveller,
  displayed alongside derived badges, then removed through staff UI; public
  projection returned to its original 2 derived badges. Mystery Pick revealed
  one selected real seed profile and navigated correctly.
- `IN PROGRESS`: Admin completeness still duplicated obsolete looking_for
  requirements. Database specialist is preparing a forward migration to reuse
  the existing authoritative 100% completion function while retaining all
  existing projections/guards/ACLs/audits. Do not mark this repaired yet.
- Exact continuation: integrate/inspect admin-completeness migration/tests;
  browser recheck report success and moderation counter, logout/login and
  responsive smoke; final type/lint/tests/build after all last changes integrate.
  Earlier successful DB/browser checks below remain historical, not a claim
  that the currently unavailable database has been reverified.
- Checkpoint: Architecture findings integrated: shared pure badge definitions and
  manual vocabulary, real badge-form pending state, support viewer shared by
  member/staff routes, removed unused Nav/activity helper/public-avatar URL
  helper/root proxy/old badge icon renderer. Worker failures are isolated;
  SEO metadata/render share request-local reads. README/template and env-example
  ignore corrected. The subsequent atomic message timestamp migration is
  documented above; no prior migrations were rewritten.
- `VERIFIED`: 16 worker/asset checks and 6 consolidation regressions passed;
  typecheck and lint passed before the latest auth/tooltip changes. Schema
  parity: 242 migrations, database lint no errors (3 existing unused-variable/
  parameter warnings). Production dependency audit: no known vulnerabilities.
- `VERIFIED`: Live public schema has no views/materialized views; 63 of 64
  tables use RLS; the non-RLS location_configuration has no anon/member SELECT
  grant. All SECURITY DEFINER functions have configured search paths. This is
  metadata inspection, not proof of every policy's runtime behavior.
- `FIXED`: Badge tooltip sizing caused horizontal page overflow; mobile browser
  screenshot and DOM width confirmed correction (375px content within 390px
  viewport). Subsequent desktop/tablet/focus checks also passed, as noted above.
- `FIXED`: Proxy redirects now preserve refreshed session cookies; completion
  query selects only entry-rule fields. New unit check passed.
- `VERIFIED`: Local email callback retains the initiating localhost/127 origin;
  production remains canonical. A fresh localhost registration revealed a
  second defect: browser-client URL auto-detection and the confirmation effect
  both redeemed the same one-use code, incorrectly showing an expired link.
  The confirmation operation now uses a local client with URL auto-detection
  disabled and a shared promise across React effect replay. Network rejections
  produce a recoverable error. Other browser clients and permissions unchanged.
  Five new mocked regressions cover single exchange/replay, recovery/fragment
  compatibility, expired links, confirmed-email requirement and network errors.
- `VERIFIED`: Browser registration for audit-confirmed-20260905@example.test
  → local Mailpit email → 127.0.0.1:54321 Auth verification → localhost:3000
  callback → real /app/profile/setup. Screenshot inspected; no console errors
  or warnings in the successful flow. Profile completion has not yet been done.
  Earlier audit-localhost-20260905@example.test captured the before-fix failure;
  the two earlier audit-20260905 and audit-20260905b accounts also remain.
- `FIXED`: Next development assets were blocked on the already-supported
  loopback-IP site alias. Added only 127.0.0.1 to allowedDevOrigins; production
  behavior unchanged. Subsequent IP-origin onboarding/profile browser QA passed.
- `VERIFIED`: Latest 28 targeted confirmation/onboarding/static/consolidation
  checks passed, typecheck passed, lint passed, production build passed (13
  static pages; application/data routes remain dynamic). Initial lint flagged
  reserved module variable names in two new test harnesses; renamed and reran.
  Existing check-email test copy expectation now matches the unchanged Send
  again button. No database or schema changes in this email repair.
- Preserve audit-confirmed-20260905@example.test: the user was editing that
  account's onboarding. Do not overwrite it or reuse its one-time email link.
  Use the separate completed @audit_traveller fixture for remaining QA. Latest
  dev logs are dev-resumed.stdout.log / dev-resumed.stderr.log in the recovery
  directory. Browser/runtime failures are environmental checkpoints, not grounds
  to mark the audit complete.
- Recovery copy: a local temporary backup outside the repository (not published)
  contains original src/scripts/tests/config guidance before this pass's edits.
- Parallel specialist availability recovered: notification and report repairs
  completed in this resumed turn. Remaining browser QA still depends on Docker.
- Read-command corrections: bundled Next docs use `.md`, not `.mdx`; one
  PowerShell read supplied null LiteralPath. Both are inspection mistakes,
  not application failures; retry with the actual paths.

## Completed areas

- `VERIFIED` — Review-state file created in the project root.
- `VERIFIED` — Required status vocabulary and continuation fields are present.
- `VERIFIED` — No application review or application changes were performed in
  this pass.
- `VERIFIED` — Complete technical map added for all repository application
  areas and supporting files; every mapped area is marked `UNREVIEWED`.
- `VERIFIED` — Second inventory comparison completed against the repository
  tree before marking Pass 2 complete.
- `VERIFIED` — Pass 3 dependency/package, script, build, lint, TypeScript,
  environment-configuration, and test-command checks were completed without
  modifying application code.
- `VERIFIED` — Pass 4 database/persistent-data inspection covered schema,
  migration, relation, constraint, trigger, and data-access findings; the
  reviewed scope is complete.
- `VERIFIED` — Pass 4 inspected the live public schema, all 198 ordered
  migrations, database clients, function overloads, foreign keys, checks,
  indexes, RLS/grants, and persistent-write callers relevant to data integrity.
- `VERIFIED` — Pass 4 re-reviewed the resulting schema and data for orphaned
  rows, invalid normalized locations, broken conversation/message relations,
  invalid moderation/support links, TOTP interval violations, and unintended
  cascade targets; no remaining live data-integrity anomaly was found.
- `VERIFIED` — Pass 5 authentication/session/authorization tracing completed;
  protected route, server-action, RPC, RLS, ownership, and role entry points
  were rechecked, including alternate callers.
- `VERIFIED` — Pass 5 authentication/session/authorization re-review was
  completed; prior findings and the blocked fixture checks were revalidated.
- `VERIFIED` — Pass 5 re-review completed with no new verified
  authentication, session, identity, authorization, or access-control issue.

## Verified issues found

- `ISSUE FOUND` — The protected `save_profile` RPC rejected edits to legacy
  profiles that had a canonical country/city but null normalized location
  children (for example, locality precision with no region), returning
  `A region is required for this precision`. The profile-save caller passes
  those stored null fields back during ordinary edits, so the failure was
  reproducible in the live local database.
- `FIXED` — Added migration
  `supabase/migrations/20260904254000_infer_legacy_profile_location.sql`.
  It infers a region/locality only for an unambiguous country+city catalogue
  match, then retains the existing validation/error path for ambiguous or
  unknown values. It preserves the existing atomic profile/language/interest/
  destination write behavior and the legacy unresolved-location fallback.
- `VERIFIED` — The 16-argument RPC and the 24-argument profile-signal wrapper
  both resolve through the fixed function; no other overload or caller was
  removed.
- `ISSUE FOUND` — A deployment-specific private owner login alias had been
  embedded in distributable migration and seed text. Besides public privacy
  exposure, its pre-seed migration ordering made fresh fixtures inconsistent.
- `FIXED` — Before the first public repository commit, removed that private
  alias from migration/seed source. Retained the already-applied
  `20260904255000_backfill_admin_login_alias.sql` version as an explicit no-op
  placeholder. Fresh fixtures use the documented `admin@example.com` email or
  username `admin`; the generic private alias table/resolver remains available
  for deployment-owned aliases.
- `VERIFIED` — The password-gated identifier resolver and seeded canonical
  admin credentials remain covered by focused tests. The existing local
  database may retain the former private alias as local data only; it is not
  published and no committed cleanup migration exposes it.

## Fixes made

- Created `CODEX_REVIEW_STATE.md` (checkpoint history).
- Added `supabase/migrations/20260904254000_infer_legacy_profile_location.sql`
  to repair the verified legacy profile-save data-integrity defect.
- The previously added avatar-trigger migration remains part of the recorded
  earlier pass history; it was revalidated here but not changed in Pass 4.
- Migration version `20260904255000_backfill_admin_login_alias.sql` was added
  during Pass 5, then converted to a no-op before the first public commit when
  its deployment-specific private alias was removed. Canonical seeded email
  and username login remain; no private alias is distributed.

## Verification performed

- `VERIFIED` — Confirmed the file did not already exist before creation.
- `VERIFIED` — Confirmed the checkpoint contains current pass, scope,
  completed areas, issues, fixes, verification, unresolved items, blocked
  items, re-review items, and an exact continuation point.
- `ISSUE FOUND` — The first checkpoint validation command emitted PowerShell
  errors while extracting status labels; it did not inspect or modify the
  application.
- `FIXED` — Corrected and reran the validation command successfully.
- `VERIFIED` — The corrected validation found all required sections and the
  complete status vocabulary.
- `VERIFIED` — No backend, frontend, database, security, logic, or design
  checks were run.
- `VERIFIED` — Pass 2 inventory-only verification used read-only file listings
  and path comparison; no application behavior was exercised.
- `VERIFIED` — `pnpm schema:check` reports 198 valid, unique, ordered
  migrations.
- `VERIFIED` — The local migration history has all 198 migrations applied with
  no parity or ordering drift (`pnpm schema:check:local`).
- `VERIFIED` — `pnpm schema:lint` completed; it reports only the existing
  non-blocking unused-variable/parameter warnings in
  `refresh_activity_rank` and `snail_mail_distance_band`.
- `VERIFIED` — `supabase db diff --local --schema public` reports no schema
  changes after applying the new migration.
- `VERIFIED` — Focused database/profile/location/avatar/TOTP/age/deletion
  checks passed (including the live `supabase-integration` test run), and the
  profile test set passed 41/41.
- `VERIFIED` — An invalid over-limit profile save was exercised against the
  live RPC; its transaction failed without changing the existing friendship
  destinations.
- `VERIFIED` — Full `pnpm test` completed with 501/506 passing. The five
  failures are stale local fixture/state checks recorded below, not failures
  of the reviewed migration or data-integrity paths.

## Unresolved issues

- `UNREVIEWED` — Application areas outside the completed infrastructure,
  database, and authentication/authorization passes remain to be reviewed in
  later passes.

## Blocked items

- `BLOCKED` — The full `pnpm test` command executed all 506 tests but exited
  with seven pre-existing local database state/fixture failures; the exact
  tests and messages are recorded in the Pass 3 blocked-validation section.
- `BLOCKED` — The local environment intentionally lacks production SMTP/site
  variables, so `pnpm check:production-email` fails closed without injected
  production values; the validator passed with a complete synthetic
  configuration.
- `BLOCKED` — Full-suite live fixture `tests/account-deactivation-authority.test.mjs`
  uses a hard-coded user id that is absent from the current local seed, so its
  direct-update assertion never reaches a profile row.
- `BLOCKED` — Full-suite live fixture `tests/moderation-admin-escalation.test.mjs`
  requires an open moderation-case fixture that is absent from the current
  local database.
- `BLOCKED` — Both live checks in
  `tests/moderator-conversation-review-assignment.test.mjs` require a message/
  open-case fixture absent from the current local database.
- `BLOCKED` — Live Snail Mail check in
  `tests/privacy-lifecycle-wiring.test.mjs` requires a conversation fixture
  absent from the current local database.
- `BLOCKED` — In the Pass 5 full-suite run,
  `tests/account-deactivation-authority.test.mjs` reported
  `direct profile UPDATE unexpectedly succeeded` because its hard-coded
  profile ids (`7ede9653-34bf-4de4-a69b-184a6c35c0f0` and
  `21621151-e65d-4dda-a2ad-de562756df61`) are absent locally; the update
  matched zero rows and hit the test sentinel, so no real-row trigger bypass
  was demonstrated. No fixtures were created and no reset/reseed was run.
- `BLOCKED` — The same full-suite run could not execute the live moderation
  checks in `tests/moderation-admin-escalation.test.mjs` and
  `tests/moderator-conversation-review-assignment.test.mjs` because their
  required open-case/message fixtures are absent.
- `BLOCKED` — The same full-suite run could not execute the paused Snail Mail
  live case in `tests/privacy-lifecycle-wiring.test.mjs` because its required
  conversation fixture is absent. The independent live Supabase integration
  test passed in that run.

## Items requiring later re-review

- `RE-REVIEW REQUIRED` — Any area whose pass is interrupted, has a failed
  command, loses context, or cannot complete its verification must be listed
  here with the exact failure and continuation point.
- `RE-REVIEW REQUIRED` — Re-run the seven blocked live-database tests from
  Pass 3 once the local fixtures/database state are intentionally prepared;
  do not infer application correctness from their current blocked result.
- `RE-REVIEW REQUIRED` — Re-run the five blocked full-suite live fixture checks
  above after restoring their documented fixtures; no fixture data was created
  or reseeded during this pass.
- `RE-REVIEW REQUIRED` — Re-run the hard-coded account-deactivation authority
  test after its documented profile fixtures are intentionally restored, then
  verify the real-row trigger path rather than the current zero-row sentinel.
- `RE-REVIEW REQUIRED` — On the next fresh local database initialization,
  verify that `supabase/seed.sql` creates the administrator's guarded login
  alias after migrations complete; the existing database was validated through
  the backfill migration in this pass.

## Exact continuation point

Next session should begin by reading this file, changing `Current pass` to
the explicitly requested review pass, and recording its scope as `IN PROGRESS`.
Do not assume any application area has been reviewed from this initialization
checkpoint. After each concrete review action, record the result here using
one of: `UNREVIEWED`, `IN PROGRESS`, `ISSUE FOUND`, `FIXED`, `VERIFIED`,
`BLOCKED`, or `RE-REVIEW REQUIRED`.

Pass 2 is complete after the required second inventory comparison. Pass 3 is
complete for the infrastructure checks recorded below; the full test suite has
an explicit blocked result caused by pre-existing local database fixtures. No
quality review has started. If a later pass encounters any failed command or
interruption, leave that pass non-complete, record the failure and exact
command/context here, and mark the affected area `RE-REVIEW REQUIRED` before
stopping.

## PASS 3 work log

- `VERIFIED` — Pass 3 started after reading the Pass 2 checkpoint.
- `VERIFIED` — `pnpm install --frozen-lockfile` completed with the lockfile
  already up to date.
- `VERIFIED` — `pnpm list --depth 0` resolved all 13 declared dependencies and
  dev dependencies without an unresolved package.
- `VERIFIED` — `pnpm lint` completed successfully using the configured ESLint
  flat config and Next.js presets.
- `VERIFIED` — `pnpm typecheck` completed successfully with `tsc --noEmit`.
- `VERIFIED` — `pnpm build` completed successfully with Next.js 16.3.3,
  generated the complete App Router route table, and emitted only the
  informational server-actions experimental notice.
- `VERIFIED` — `pnpm run` and executable-version checks confirmed every
  package script points to an installed command or an existing repository
  script; `next`, `eslint`, `tsc`, and Node all resolved.
- `VERIFIED` — The targeted Node test invocation for accessibility and
  frontend consistency ran 11 tests with 11 passes, confirming the test
  command accepts explicit test files and executes them.
- `VERIFIED` — `pnpm test` invoked the intended Node test runner and completed
  506 tests (499 passed, 7 failed). The failing tests are recorded as a
  blocked local fixture/database result below, not as a test-runner failure.
- `VERIFIED` — Production email configuration validation failed closed with
  the local environment's intentionally incomplete production variables, then
  passed with a synthetic complete HTTPS site/callback/SMTP environment;
  no secret values were read or recorded.
- `VERIFIED` — `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`,
  `postcss.config.mjs`, `proxy.ts`, `.env.example`, `.env.local` key names,
  `.github/workflows/database-release-gate.yml`, and package/lock metadata
  were inspected for structural path and command consistency.
- `VERIFIED` — No repository-side infrastructure defect was found that could
  be fixed safely within this pass; no rules, tests, type checking, warnings,
  or validation were disabled.

## PASS 3 blocked validation

- `BLOCKED` — `pnpm test` reported seven live-database/fixture failures:
  `tests/account-deactivation-authority.test.mjs` (direct profile UPDATE
  unexpectedly succeeded), `tests/external-avatar-path.test.mjs` (external
  avatar write unexpectedly succeeded),
  `tests/moderation-admin-escalation.test.mjs` (local open-case fixture
  missing), `tests/moderator-conversation-review-assignment.test.mjs` (two
  local message/open-case fixtures missing),
  `tests/privacy-lifecycle-wiring.test.mjs` (conversation fixture unavailable),
  and `tests/supabase-integration.test.mjs` (existing local friendship
  destination precision state rejected restore). These are application/local
  database conditions and were intentionally not altered while this pass was
  limited to validation infrastructure.
- `BLOCKED` — `pnpm check:production-email` without production environment
  variables correctly failed closed; this is expected for the local
  development environment, not a script defect. A complete synthetic
  production configuration passed the same validator.

## PASS 3 completion

- State: `VERIFIED` for dependency resolution, package scripts, build
  configuration, TypeScript, linting, test-command execution, environment
  variable structure, and build-time warning inspection.
- Full suite status: `BLOCKED` only by the seven pre-existing local
  database/fixture failures listed above; no infrastructure fix was indicated.
- Application features, UI, authentication, database behavior, and business
  logic were not reviewed or changed.

## Pass 3 continuation point

The next session must read this file first and begin the explicitly requested
Pass 4. Set that pass to `IN PROGRESS` and limit inspection to its stated
scope. The seven blocked local test conditions above remain `BLOCKED` and
should be re-run when their fixtures/database state is intentionally prepared;
they must not be treated as verified application behavior. If any later pass
is interrupted or a command fails, record its exact location and command,
mark the affected area `RE-REVIEW REQUIRED`, and do not mark that pass
complete.

## PASS 2 technical map

Every entry in this inventory is intentionally marked `UNREVIEWED`. The map
records where implementation lives; it is not a quality, security, UX, or
behavior review.

### Repository/runtime and application entry points

- `UNREVIEWED` — Repository roots and product guidance: `README.md`,
  `AGENTS.md`, `CLAUDE.md`, `docs/`, `src/`, `supabase/`, `scripts/`,
  `tests/`, `public/`, and `backups/`.
- `UNREVIEWED` — Next.js runtime/configuration entry points:
  `src/app/layout.tsx`, `src/app/globals.css`, `src/app/favicon.ico`,
  `next-env.d.ts`, `next.config.ts`, `proxy.ts`, `tsconfig.json`,
  `postcss.config.mjs`, and `eslint.config.mjs`.
- `UNREVIEWED` — Package/workspace metadata: `package.json`,
  `pnpm-lock.yaml`, and `pnpm-workspace.yaml`.

### Public pages, authentication, and onboarding routes

- `UNREVIEWED` — Landing and public profile routes: `src/app/page.tsx`,
  `src/app/profile/[username]/page.tsx`, and
  `src/app/profile/IcebreakerModal.tsx`.
- `UNREVIEWED` — Email/password auth pages: `src/app/sign-in/page.tsx`,
  `src/app/sign-up/page.tsx`, `src/app/forgot-password/page.tsx`,
  `src/app/update-password/page.tsx`,
  `src/app/update-password/UpdatePasswordForm.tsx`, and
  `src/app/check-email/page.tsx`.
- `UNREVIEWED` — Auth actions and controls:
  `src/app/auth/actions.ts`, `src/app/auth/AuthSubmitButton.tsx`, and
  `src/app/auth/GoogleAuthButton.tsx`.
- `UNREVIEWED` — Supabase OAuth/session callback routes:
  `src/app/auth/callback/route.ts`, `src/app/auth/confirm/page.tsx`,
  `src/app/auth/verification/[provider]/start/route.ts`, and
  `src/app/auth/verification/[provider]/callback/route.ts`.
- `UNREVIEWED` — Age and account lifecycle entry pages/actions:
  `src/app/age-appeal/page.tsx`, `src/app/age-appeal/actions.ts`, and
  `src/app/reactivate/page.tsx`.

### Authenticated application shell and shared UI

- `UNREVIEWED` — Authenticated shell/layout: `src/app/app/layout.tsx`,
  `src/app/app/page.tsx`, `src/app/app/AppNavigation.tsx`,
  `src/app/app/Nav.tsx`, and `src/app/PresenceProvider.tsx`.
- `UNREVIEWED` — Shared app components: `src/app/components/CountryFlag.tsx`,
  `src/app/components/LanguageFlag.tsx`, and
  `src/app/app/shared/InlineSearchList.tsx`.
- `UNREVIEWED` — Shared domain/client libraries: `src/lib/supabase/client.ts`,
  `src/lib/supabase/server.ts`, `src/lib/supabase/proxy.ts`,
  `src/lib/avatar.ts`, and `src/lib/countries.ts`.

### User profile, setup, location, languages, interests, and preferences

- `UNREVIEWED` — Profile setup/edit page and server actions:
  `src/app/app/profile/setup/page.tsx` and
  `src/app/app/profile/actions.ts`.
- `UNREVIEWED` — Setup field components:
  `src/app/app/profile/setup/LocationEditor.tsx` and
  `src/app/app/profile/setup/FriendshipDestinationPicker.tsx`.
- `UNREVIEWED` — Profile presentation and controls:
  `src/app/app/profile/[username]/page.tsx`,
  `src/app/app/profile/[username]/ProfileView.tsx`,
  `src/app/app/profile/[username]/AboutSection.tsx`,
  `src/app/app/profile/[username]/FriendshipDestinationsSection.tsx`,
  `src/app/app/profile/[username]/InterestsSection.tsx`,
  `src/app/app/profile/[username]/LanguagesSection.tsx`,
  `src/app/app/profile/[username]/PersonalityLifestyleSection.tsx`,
  `src/app/app/profile/[username]/not-found.tsx`,
  `src/app/app/profile/ProfileChoices.tsx`,
  `src/app/app/profile/ProfileSignals.tsx`, and
  `src/app/app/profile/BlockControl.tsx`.
- `UNREVIEWED` — Profile/domain utility logic:
  `src/lib/profile-completeness.ts` and
  `src/lib/language-compatibility.ts`.

### Discover and Mystery Pick

- `UNREVIEWED` — Discover page and filter/results components:
  `src/app/app/discover/page.tsx`,
  `src/app/app/discover/DiscoverFilters.tsx`, and
  `src/app/app/discover/DiscoverResults.tsx`.
- `UNREVIEWED` — Mystery Pick feature:
  `src/app/app/discover/mystery/page.tsx`,
  `src/app/app/discover/mystery/actions.ts`, and
  `src/app/app/discover/mystery/MysteryPickBoard.tsx`.

### Introductions, contacts, blocking, and communication preferences

- `UNREVIEWED` — Introduction inbox and sorting:
  `src/app/app/introductions/page.tsx` and
  `src/app/app/introductions/IntroductionSort.tsx`.
- `UNREVIEWED` — Report submission actions: `src/app/app/reports/actions.ts`.
- `UNREVIEWED` — Profile block/contact controls:
  `src/app/app/profile/BlockControl.tsx`,
  `src/app/app/profile/ProfileChoices.tsx`, and
  `src/app/app/profile/ProfileSignals.tsx`.
- `UNREVIEWED` — Communication preferences are surfaced in profile setup and
  settings (`src/app/app/profile/setup/page.tsx` and
  `src/app/app/settings/page.tsx`) and persisted by the corresponding
  profile/settings actions.

### Instant messaging and conversations

- `UNREVIEWED` — Message list and server actions:
  `src/app/app/messages/page.tsx` and
  `src/app/app/messages/actions.ts`.
- `UNREVIEWED` — Conversation route and UI:
  `src/app/app/messages/[id]/page.tsx`,
  `src/app/app/messages/[id]/ConversationThread.tsx`, and
  `src/app/app/messages/snailMailStory.ts`.
- `UNREVIEWED` — Staff conversation-review route:
  `src/app/app/admin/conversations/[id]/page.tsx`.

### Snail Mail

- `UNREVIEWED` — Snail Mail panel embedded in conversations:
  `src/app/app/messages/[id]/SnailMailPanel.tsx`.
- `UNREVIEWED` — Snail Mail story/presentation support:
  `src/app/app/messages/snailMailStory.ts`.
- `UNREVIEWED` — Snail Mail server-side mutations share
  `src/app/app/messages/actions.ts`; database implementation is in the
  Snail Mail migration group listed below.

### Notifications and presence/activity

- `UNREVIEWED` — Notifications page, loading state, and sorting:
  `src/app/app/notifications/page.tsx`,
  `src/app/app/notifications/loading.tsx`, and
  `src/app/app/notifications/NotificationSort.tsx`.
- `UNREVIEWED` — Presence provider and activity utilities:
  `src/app/PresenceProvider.tsx`, `src/lib/activity-status.ts`, and
  `src/app/app/layout.tsx`.
- `UNREVIEWED` — Notification count and delivery persistence is database
  backed by the privacy/notifications and later support/verification
  migrations listed below.

### Settings, data rights, account lifecycle, and verification

- `UNREVIEWED` — Settings workspace and settings controls:
  `src/app/app/settings/page.tsx`,
  `src/app/app/settings/AccountActions.tsx`,
  `src/app/app/settings/CountryExclusionPicker.tsx`,
  `src/app/app/settings/TotpVerificationPanel.tsx`, and
  `src/app/app/settings/blocked/page.tsx`.
- `UNREVIEWED` — Settings/data actions and export endpoint:
  `src/app/app/settings/data-actions.ts` and
  `src/app/app/settings/data-export/route.ts`.
- `UNREVIEWED` — External verification implementation:
  `src/lib/verification/display.ts`, `src/lib/verification/oauth.ts`,
  `src/lib/verification/providers.ts`,
  `src/lib/verification/registry.ts`,
  `src/lib/verification/server.ts`, and provider adapters
  `src/lib/verification/providers/facebook.ts`,
  `src/lib/verification/providers/google.ts`,
  `src/lib/verification/providers/instagram.ts`, and
  `src/lib/verification/providers/tiktok.ts`.
- `UNREVIEWED` — Auth Google-login helper, separate from verification:
  `src/lib/auth/google-login.ts`.

### Media, avatars, private photos, and storage

- `UNREVIEWED` — Profile photo/avatar UI and rendering:
  `src/app/app/profile/setup/page.tsx`,
  `src/app/app/profile/[username]/ProfileView.tsx`,
  `src/lib/avatar.ts`, and `src/app/components/*Flag.tsx` assets used by
  profile cards.
- `UNREVIEWED` — Private-photo request/access UI is rendered by profile and
  conversation components; authorization/storage behavior is represented in
  the profile-photo/private-photo migration group below.
- `UNREVIEWED` — Support upload/viewer UI:
  `src/app/app/support/page.tsx`,
  `src/app/app/support/actions.ts`,
  `src/app/app/admin/support/[id]/SupportAttachmentViewer.tsx`, and
  `src/app/app/admin/support/[id]/page.tsx`.

### Staff, moderation, admin, audit, and investigation workspace

- `UNREVIEWED` — Staff authorization/chrome/actions:
  `src/app/app/admin/guard.ts`,
  `src/app/app/admin/AdminChrome.tsx`,
  `src/app/app/admin/actions.ts`, and
  `src/app/app/admin/investigation-context.ts`.
- `UNREVIEWED` — Staff/admin landing and queue routes:
  `src/app/app/admin/page.tsx`,
  `src/app/app/admin/cases/page.tsx`,
  `src/app/app/admin/cases/[id]/page.tsx`,
  `src/app/app/admin/reports/page.tsx`,
  `src/app/app/admin/inbox/page.tsx`, and
  `src/app/app/admin/moderation-rules/page.tsx`.
- `UNREVIEWED` — Compatibility moderation route:
  `src/app/app/moderation/page.tsx` (redirects into the staff reports area).
- `UNREVIEWED` — Admin escalation inbox and analytics/audit:
  `src/app/app/admin/analytics/page.tsx`,
  `src/app/app/admin/audit/page.tsx`, and
  `src/app/app/admin/inbox/page.tsx`.
- `UNREVIEWED` — Admin user context and actions:
  `src/app/app/admin/users/page.tsx`,
  `src/app/app/admin/users/[id]/page.tsx`,
  `src/app/app/admin/users/[id]/AdminProfileContentActions.tsx`, and
  `src/app/app/admin/users/[id]/AdminUserActions.tsx`.
- `UNREVIEWED` — Age appeals:
  `src/app/app/admin/age-appeals/page.tsx`,
  `src/app/app/admin/age-appeals/actions.ts`, and
  `src/app/app/admin/age-appeals/AgeAppealDecision.tsx`.
- `UNREVIEWED` — Staff Support Inbox and ticket detail:
  `src/app/app/admin/support/page.tsx`,
  `src/app/app/admin/support/actions.ts`,
  `src/app/app/admin/support/StaffSupportSubmitButton.tsx`,
  `src/app/app/admin/support/[id]/page.tsx`, and
  `src/app/app/admin/support/[id]/SupportAttachmentViewer.tsx`.
- `UNREVIEWED` — User-facing support submission, requests, and ticket detail:
  `src/app/app/support/page.tsx`,
  `src/app/app/support/actions.ts`,
  `src/app/app/support/SubmitSupportButton.tsx`,
  `src/app/app/support/SubmitSupportReplyButton.tsx`,
  `src/app/app/support/requests/page.tsx`, and
  `src/app/app/support/requests/[id]/page.tsx`.

### Server routes and server actions

- `UNREVIEWED` — Next route handlers (the complete `route.ts` inventory):
  `src/app/auth/callback/route.ts`,
  `src/app/auth/verification/[provider]/start/route.ts`,
  `src/app/auth/verification/[provider]/callback/route.ts`, and
  `src/app/app/settings/data-export/route.ts`.
- `UNREVIEWED` — No separate `pages/api`, Express, or standalone API
  directory was found; server endpoints are the route handlers and server
  actions listed in this map.
- `UNREVIEWED` — Auth/age/profile actions:
  `src/app/auth/actions.ts`, `src/app/age-appeal/actions.ts`, and
  `src/app/app/profile/actions.ts`.
- `UNREVIEWED` — Messaging/report/settings/support actions:
  `src/app/app/messages/actions.ts`,
  `src/app/app/reports/actions.ts`,
  `src/app/app/settings/data-actions.ts`, and
  `src/app/app/support/actions.ts`.
- `UNREVIEWED` — Admin/mystery actions:
  `src/app/app/admin/actions.ts`,
  `src/app/app/admin/age-appeals/actions.ts`,
  `src/app/app/admin/support/actions.ts`, and
  `src/app/app/discover/mystery/actions.ts`.

### Database, schema, migrations, and seed

- `UNREVIEWED` — Supabase project configuration and seed:
  `supabase/config.toml` and `supabase/seed.sql`.
- `UNREVIEWED` — Migration directory: `supabase/migrations/` contains the
  complete ordered migration history below (196 SQL migrations currently
  present).
- `UNREVIEWED` — Foundation/profile/catalog/privacy migrations:
  `20260901000000_create_profiles.sql`,
  `20260901010000_add_languages_interests.sql`,
  `20260901020000_add_blocks.sql`,
  `20260901030000_add_messaging.sql`,
  `20260901040000_add_response_rate.sql`,
  `20260901050000_add_activity.sql`,
  `20260901060000_add_profile_photos.sql`,
  `20260901070000_add_introduction_controls.sql`,
  `20260901080000_refactor_introductions.sql`,
  `20260901090000_tighten_icebreaker_validation.sql`,
  `20260901100000_add_reports.sql`,
  `20260901110000_add_privacy_notifications_accounts.sql`,
  `20260901120000_security_hardening.sql`,
  `20260901130000_add_moderator_authorization.sql`,
  `20260901140000_add_profile_quote.sql`,
  `20260901140100_add_quote_to_discovery_rpc.sql`,
  `20260901140200_add_looking_for_and_discovery_eligibility.sql`,
  `20260901150000_add_availability_contact_privacy.sql`,
  `20260901160000_add_presence_realtime_policies.sql`,
  `20260901170000_add_private_photo_access.sql`,
  `20260901170100_hide_discovery_photo_paths.sql`,
  `20260901180000_fix_presence_authorization.sql`,
  `20260901190000_fix_presence_topic_parsing.sql`,
  `20260901200000_fix_presence_extension_gate.sql`,
  `20260901210000_fix_private_photo_access.sql`,
  `20260901220000_fix_photo_request_conflict.sql`, and
  `20260901230000_drop_photo_request_unique_constraint.sql`.
- `UNREVIEWED` — Photo/access/admin/privacy/data/age migrations:
  `20260902100000_photo_access_cooldown_and_grant.sql`,
  `20260902110000_add_admin_control_panel.sql`,
  `20260902111000_harden_admin_last_admin.sql`,
  `20260902112000_add_privileged_conversation_review.sql`,
  `20260902113000_add_admin_trust_safety.sql`,
  `20260902113100_harden_trust_safety_search_paths.sql`,
  `20260902113200_harden_profile_content_validation.sql`,
  `20260902114000_require_admin_action_reasons.sql`,
  `20260902120000_security_remediation.sql`,
  `20260902121000_security_remediation_system_acl.sql`,
  `20260902130000_correctness_discovery_response_identity.sql`,
  `20260902131000_atomic_profile_settings_saves.sql`,
  `20260902132000_fix_introduction_word_count.sql`,
  `20260902140000_add_data_rights.sql`,
  `20260902143000_harden_data_export_cooldown.sql`,
  `20260902144500_allow_account_erasure_after_moderation.sql`,
  `20260902150000_transient_notifications.sql`,
  `20260902160000_harden_gdpr_export.sql`,
  `20260902161000_scope_gdpr_reports.sql`,
  `20260902170000_account_deletion_retention.sql`,
  `20260902171000_account_deletion_consumers.sql`,
  `20260902172000_scope_deletion_holds.sql`,
  `20260902173000_repair_deletion_holds_runtime.sql`,
  `20260902174000_scope_record_retention.sql`,
  `20260902175000_preserve_audit_links.sql`,
  `20260902176000_remove_deleted_actor_evidence.sql`,
  `20260902180000_age_gate_and_appeals.sql`,
  `20260902181000_fix_profile_age_gate_attempts.sql`,
  `20260902181100_lock_age_appeal_admin_rpc.sql`,
  `20260902182000_block_underage_contact_paths.sql`,
  `20260902182100_age_restriction_boundary_and_viewer_gate.sql`,
  `20260902182200_audit_age_appeal_before_erasure.sql`,
  `20260902182300_age_appeal_audit_deleted_target.sql`,
  `20260902182400_do_not_restrict_future_dob.sql`,
  `20260902190000_report_and_appeal_rate_limits.sql`,
  `20260902190100_report_rate_check.sql`, and
  `20260902190200_age_appeal_rejection_cooldown.sql`.
- `UNREVIEWED` — Admin/moderation migrations:
  `20260902200000_admin_center_v2.sql`,
  `20260902200100_admin_dashboard_counts.sql`,
  `20260902200200_admin_audit_date_filters.sql`,
  `20260902200300_harden_conversation_list_reason.sql`,
  `20260902200400_conversation_review_reason_floor.sql`,
  `20260902200500_profile_history_restore_fields.sql`,
  `20260902200600_case_note_activity_timestamp.sql`,
  `20260902200700_audit_case_access.sql`,
  `20260902200800_audit_case_view_listing.sql`,
  `20260902200900_storage_error_summary.sql`,
  `20260902201000_age_appeals_pagination.sql`,
  `20260902201100_case_link_concurrency.sql`,
  `20260902201200_harden_legacy_audit_listing.sql`,
  `20260902201300_storage_retry_summary.sql`,
  `20260902201400_case_status_audit_old_status.sql`,
  `20260902201500_qa_auth_helpers.sql`,
  `20260902201600_hide_discovery_activity_timestamp.sql`,
  `20260902201700_restore_age_check_for_rls.sql`,
  `20260902201800_revoke_public_profile_save.sql`,
  `20260902201900_fix_introduction_punctuation_validation.sql`,
  `20260902203000_fix_country_exclusion_matching.sql`,
  `20260902205000_block_restricted_profile_save_bypass.sql`,
  `20260902210000_fix_data_rights_runtime_authorization.sql`,
  `20260902211000_photo_access_notifications.sql`,
  `20260902212000_enable_service_background_purge.sql`,
  `20260902212100_allow_service_purge_audit_guard.sql`,
  `20260902213000_fix_blocked_message_insert_rls.sql`,
  `20260902220000_require_verified_email.sql`, and
  `20260902220100_require_verified_email_reads.sql`.
- `UNREVIEWED` — External verification and detection migrations:
  `20260902230000_external_verification_foundation.sql`,
  `20260902231000_external_verification_capability_architecture.sql`,
  `20260902232000_preserve_verification_status_compatibility.sql`,
  `20260902233000_external_verification_provider_records.sql`,
  `20260902240000_external_verification_admin_audit.sql`,
  `20260902240100_external_verification_revoke_status.sql`,
  `20260902250000_moderation_content_flagging.sql`, and
  `20260902250100_fix_content_flagging_lint.sql`.
- `UNREVIEWED` — Activity/location/Snail Mail/lifecycle migrations:
  `20260903000000_activity_ranks_and_inactive_mode.sql`,
  `20260903010000_location_and_friendship_destinations.sql`,
  `20260903020000_snail_mail.sql`,
  `20260903030000_snail_mail_transport_modes.sql`,
  `20260903040000_account_deactivation_authority.sql`,
  `20260903050000_email_verification_enforcement.sql`,
  `20260903060000_remove_public_dob_exposure.sql`,
  `20260903070000_require_active_case_assignment_for_moderator_conversation_review.sql`,
  `20260903080000_discover_database_pagination.sql`,
  `20260903090000_fix_admin_profile_completeness_location_precision.sql`,
  `20260903100000_fix_pre_account_age_appeal_lifecycle.sql`,
  `20260903110000_restrict_presence_viewer_surface.sql`,
  `20260903120000_communication_mode_preferences.sql`,
  `20260903121000_communication_mode_lifecycle_guard.sql`,
  `20260903130000_harden_avatar_path_compatibility.sql`,
  `20260903131000_preserve_legacy_avatar_paths_safely.sql`,
  `20260903132000_tighten_legacy_avatar_permission.sql`,
  `20260903133000_preserve_owner_avatar_storage_access.sql`,
  `20260903140000_restrict_obsolete_compatibility_rpcs.sql`,
  `20260903141000_restrict_legacy_profile_save_overload.sql`,
  `20260903142000_harden_low_risk_database_functions.sql`,
  `20260903150000_communication_anti_spam_guards.sql`,
  `20260903151000_fix_message_antispam_same_timestamp.sql`,
  `20260903152000_fix_snail_mail_idempotency_guard.sql`,
  `20260903160000_add_personality_lifestyle_profile.sql`,
  `20260903170000_add_connection_preferences_profile.sql`,
  `20260903180000_cancel_snail_mail.sql`,
  `20260903181000_harden_cancelled_snail_mail_read.sql`, and
  `20260903182000_restrict_snail_mail_cancel_lifecycle.sql`.
- `UNREVIEWED` — Later integration migrations (Discover, moderation,
  introductions, lifecycle, and preferences):
  `20260903200000_add_discover_card_location.sql`,
  `20260903210000_case_evidence_authorized_match.sql`,
  `20260903220000_moderation_admin_attention.sql`,
  `20260903221000_keep_legacy_audit_rpc_revoked.sql`,
  `20260903230000_adult_commercial_detection_pack.sql`,
  `20260903231000_adult_detection_matching_fix.sql`,
  `20260903232000_preserve_detection_status_updates.sql`,
  `20260903233000_preserve_system_default_identity.sql`,
  `20260903234000_fix_domain_boundaries.sql`,
  `20260903235000_add_platform_handle_forms.sql`,
  `20260904000000_raise_case_priority_for_signal_strength.sql`,
  `20260904010000_reuse_existing_report_cases.sql`,
  `20260904020000_word_match_punctuation_boundaries.sql`,
  `20260904030000_bridge_review_signals.sql`,
  `20260904040000_add_active_adult_platforms.sql`,
  `20260904060000_contextual_creator_pairing.sql`,
  `20260904070000_wire_introduction_acceptance.sql`,
  `20260904071000_preserve_introduction_response_timestamp.sql`,
  `20260904090000_wire_snail_mail_only_relationships.sql`,
  `20260904100000_restore_admin_reactivation_preferences.sql`,
  `20260904110000_block_deactivated_profile_mutations.sql`,
  `20260904120000_clear_account_status_override.sql`,
  `20260904130000_align_notification_unread_count.sql`,
  `20260904140000_serialize_moderation_signal_cases.sql`,
  `20260904150000_profile_location_integrity.sql`,
  `20260904151000_profile_location_name_consistency.sql`,
  `20260904152000_friendship_destination_flow.sql`,
  `20260904153000_prevent_duplicate_snail_mail_acceptance.sql`,
  `20260904160000_close_deactivated_photo_viewer_bypass.sql`,
  `20260904161000_allow_paused_snail_mail_read.sql`,
  `20260904162000_require_active_block_mutations.sql`,
  `20260904163000_scope_moderation_case_actions.sql`,
  `20260904164000_require_claim_for_moderator_actions.sql`,
  `20260904165000_restore_case_status_audit_context.sql`,
  `20260904170000_mystery_profile_pick_game.sql`,
  `20260904171000_fix_mystery_pick_session_id.sql`,
  `20260904172000_mystery_pick_relevance_floor.sql`,
  `20260904173000_extend_profile_save_signals.sql`,
  `20260904180000_expand_interest_catalogue.sql`, and
  `20260904190000_expand_language_catalogue.sql`.
- `UNREVIEWED` — Staff analytics, admin escalation, Support, login identity,
  TOTP, and latest compatibility migrations:
  `20260904200000_staff_analytics.sql`,
  `20260904210000_admin_escalation_inbox.sql`,
  `20260904220000_support_inbox_foundation.sql`,
  `20260904223000_allow_legacy_profile_location_edits.sql`,
  `20260904230000_prevent_admin_self_deactivation.sql`,
  `20260904230500_support_submission.sql`,
  `20260904230600_support_staff_attachments.sql`,
  `20260904230700_support_submission_confirmation.sql`,
  `20260904230800_support_user_requests.sql`,
  `20260904230900_support_user_conversation.sql`,
  `20260904231000_support_user_replies.sql`,
  `20260904232000_support_staff_lifecycle.sql`,
  `20260904232100_support_staff_claim_boundary.sql`,
  `20260904232200_support_notifications.sql`,
  `20260904232300_support_notifications_initial_guard.sql`,
  `20260904232400_support_waiting_user_notification.sql`,
  `20260904232500_align_support_notification_count.sql`,
  `20260904232600_support_login_identifiers.sql`,
  `20260904240000_login_identifier_rate_limits.sql`,
  `20260904250000_profile_totp_verification.sql`,
  `20260904250100_fix_profile_totp_notification_lint.sql`,
  `20260904251000_allow_local_seed_superuser.sql`,
  `20260904251100_allow_local_seed_avatar_superuser.sql`,
  `20260904251200_allow_local_seed_age_superuser.sql`,
  `20260904251300_profile_totp_pause_expiry_fix.sql`, and
  `20260904252000_allow_legacy_profile_text_edits.sql`.

### Background jobs, email, and external integrations

- `UNREVIEWED` — Background worker and scheduled maintenance entry point:
  `scripts/run-background-jobs.mjs`.
- `UNREVIEWED` — Email is primarily Supabase Auth lifecycle (confirmation,
  password recovery, and verification enforcement) configured through auth
  settings and the auth actions/routes above; no separate application mailer
  directory was found.
- `UNREVIEWED` — External integrations are Supabase Auth/OAuth and the
  verification provider adapters in `src/lib/verification/providers/`.
- `UNREVIEWED` — Production email configuration validation:
  `scripts/validate-production-email-config.mjs` and
  `tests/production-email-config.test.mjs`.

### Validation, services, and utilities

- `UNREVIEWED` — Supabase/runtime helpers: `scripts/supabase-cli.mjs`,
  `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, and
  `src/lib/supabase/proxy.ts`.
- `UNREVIEWED` — Schema/migration validation scripts:
  `scripts/check-migrations.mjs` and `scripts/schema-lint.mjs`.
- `UNREVIEWED` — Domain utilities: `src/lib/activity-status.ts`,
  `src/lib/avatar.ts`, `src/lib/countries.ts`,
  `src/lib/language-compatibility.ts`, `src/lib/profile-completeness.ts`,
  `src/lib/verification/*`, and `src/lib/auth/google-login.ts`.
- `UNREVIEWED` — Runtime validation and error-handling patterns are exercised
  by `tests/server-action-error-handling.test.mjs` and the domain test suites
  listed below.
- `UNREVIEWED` — State management is provided by Next.js App Router server
  components/actions plus local React client-component state; no separate
  Redux, Zustand, or global store directory was found.

### Tests

- `UNREVIEWED` — Accessibility, presentation, and cleanup:
  `tests/accessibility-pass.test.mjs`,
  `tests/frontend-consistency.test.mjs`,
  `tests/legacy-code-cleanup.test.mjs`,
  `tests/server-action-error-handling.test.mjs`,
  `tests/security-hardening.test.mjs`,
  `tests/security-remediation.test.mjs`, and
  `tests/low-risk-database-hardening.test.mjs`.
- `UNREVIEWED` — Lifecycle, data rights, age, and email:
  `tests/account-deactivation-authority.test.mjs`,
  `tests/account-deletion-retention.test.mjs`,
  `tests/deactivation-system-wiring.test.mjs`,
  `tests/data-rights.test.mjs`,
  `tests/pause-system-wiring.test.mjs`,
  `tests/privacy-lifecycle-wiring.test.mjs`,
  `tests/pre-account-age-appeal.test.mjs`,
  `tests/age-gate.test.mjs`,
  `tests/age-gate-entry-consistency.test.mjs`,
  `tests/email-auth-onboarding-parity.test.mjs`,
  `tests/email-verification-enforcement.test.mjs`, and
  `tests/email-verification.test.mjs`.
- `UNREVIEWED` — Discover/activity/location/language/profile:
  `tests/activity-ranks.test.mjs`,
  `tests/activity-status.test.mjs`,
  `tests/discover-filter-wiring.test.mjs`,
  `tests/discover-pagination.test.mjs`,
  `tests/discover-presentation.test.mjs`,
  `tests/location-foundation.test.mjs`,
  `tests/language-compatibility.test.mjs`,
  `tests/profile-about.test.mjs`,
  `tests/profile-interests.test.mjs`,
  `tests/profile-languages.test.mjs`,
  `tests/profile-personality-lifestyle.test.mjs`,
  `tests/profile-save-legacy-edit.test.mjs`,
  `tests/profile-setup-interests.test.mjs`, and
  `tests/profile-setup-routing.test.mjs`.
- `UNREVIEWED` — Authentication and account security:
  `tests/google-login-separation.test.mjs`,
  `tests/login-identifiers.test.mjs`, and
  `tests/password-recovery-and-security.test.mjs`.
- `UNREVIEWED` — Contact, introductions, communication, messaging, and Snail
  Mail:
  `tests/anti-spam.test.mjs`,
  `tests/blocking-system-wiring.test.mjs`,
  `tests/both-communication-path.test.mjs`,
  `tests/communication-anti-spam.test.mjs`,
  `tests/communication-modes.test.mjs`,
  `tests/communication-preference-changes.test.mjs`,
  `tests/contact-communication-wiring.test.mjs`,
  `tests/contact-privacy.test.mjs`,
  `tests/im-only-communication-path.test.mjs`,
  `tests/introduction-acceptance-wiring.test.mjs`,
  `tests/introduction-controls.test.mjs`,
  `tests/introduction-rejection-ux.test.mjs`,
  `tests/introduction-word-count.test.mjs`,
  `tests/introductions-presentation.test.mjs`,
  `tests/introductions.test.mjs`,
  `tests/messaging-permissions.test.mjs`,
  `tests/response-rate.test.mjs`,
  `tests/snail-mail-cancellation.test.mjs`,
  `tests/snail-mail-only-communication-path.test.mjs`, and
  `tests/snail-mail.test.mjs`.
- `UNREVIEWED` — Photos, avatars, and verification:
  `tests/external-avatar-path.test.mjs`,
  `tests/private-avatar-rendering.test.mjs`,
  `tests/private-photo-flow.test.mjs`,
  `tests/photo-access-notifications.test.mjs`,
  `tests/photo-access.test.mjs`,
  `tests/profile-totp-verification.test.mjs`,
  `tests/verification-display-consistency.test.mjs`,
  `tests/external-verification-admin.test.mjs`,
  `tests/external-verification-capabilities.test.mjs`,
  `tests/external-verification-providers.test.mjs`,
  `tests/external-verification.test.mjs`, and
  `tests/public-dob-privacy.test.mjs`.
- `UNREVIEWED` — Moderation/admin/staff:
  `tests/admin-center-v2.test.mjs`,
  `tests/admin-context-navigation.test.mjs`,
  `tests/admin-control-panel.test.mjs`,
  `tests/admin-inbox.test.mjs`,
  `tests/admin-panel-presentation.test.mjs`,
  `tests/admin-profile-completeness.test.mjs`,
  `tests/admin-trust-safety.test.mjs`,
  `tests/adult-services-flagging.test.mjs`,
  `tests/moderation-admin-escalation.test.mjs`,
  `tests/moderation-authorization.test.mjs`,
  `tests/moderation-evidence-navigation.test.mjs`,
  `tests/moderation-signal-to-case.test.mjs`,
  `tests/moderator-conversation-review-assignment.test.mjs`,
  `tests/reports.test.mjs`,
  `tests/staff-analytics.test.mjs`, and
  `tests/mystery-profile-pick.test.mjs`.
- `UNREVIEWED` — Notifications and Support:
  `tests/notification-action-routing.test.mjs`,
  `tests/notification-counts.test.mjs`,
  `tests/notifications-presentation.test.mjs`,
  `tests/transient-notifications.test.mjs`,
  `tests/sidebar-notifications-visual.test.mjs`,
  `tests/support-inbox.test.mjs`,
  `tests/support-notifications.test.mjs`,
  `tests/support-requests.test.mjs`, and
  `tests/support-submission.test.mjs`.
- `UNREVIEWED` — Integration, jobs, and legacy RPC surface:
  `tests/background-jobs.test.mjs`,
  `tests/correctness-remediation.test.mjs`,
  `tests/supabase-integration.test.mjs`, and
  `tests/legacy-rpc-surface.test.mjs`.
- `UNREVIEWED` — Additional settings/privacy/presence coverage:
  `tests/privacy-notifications.test.mjs`,
  `tests/presence-authorization-surface.test.mjs`,
  `tests/settings-layout.test.mjs`, and
  `tests/settings-read-failure.test.mjs`.

### Documentation, backups, logs, and static assets

- `UNREVIEWED` — Project documentation: `README.md`, `AGENTS.md`,
  `CLAUDE.md`, `docs/data-inventory.md`, and `docs/database-validation.md`.
- `UNREVIEWED` — CI/release configuration: `.github/workflows/database-release-gate.yml`.
- `UNREVIEWED` — Environment and repository metadata: `.env.example`,
  `.env.local` (values intentionally not recorded), `.gitignore`, and
  `tsconfig.tsbuildinfo`.
- `UNREVIEWED` — Historical implementation snapshots:
  `backups/discover-overhaul-20260903/README.md`,
  `backups/discover-overhaul-20260903/DiscoverFilters.tsx.bak`,
  `backups/discover-overhaul-20260903/DiscoverResults.tsx.bak`,
  `backups/discover-overhaul-20260903/page.tsx.bak`,
  `backups/messages-overhaul-20260903/README.md`,
  `backups/messages-overhaul-20260903/page.tsx.bak`,
  `backups/profile-overhaul-20260903/README.md`,
  `backups/profile-overhaul-20260903/ProfileView.tsx.bak`,
  `backups/profile-overhaul-20260903/page.tsx.bak`,
  `backups/profile-overhaul-20260903/not-found.tsx.bak`,
  `backups/snail-mail-cancellation-prechange-20260903/20260903152000_fix_snail_mail_idempotency_guard.sql`,
  `backups/snail-mail-cancellation-prechange-20260903/actions.ts`,
  `backups/snail-mail-cancellation-prechange-20260903/page.tsx`, and
  `backups/snail-mail-cancellation-prechange-20260903/SnailMailPanel.tsx`.
- `UNREVIEWED` — Public static assets: `public/file.svg`, `public/globe.svg`,
  `public/next.svg`, `public/vercel.svg`, and `public/window.svg`.
- `UNREVIEWED` — Existing runtime/server diagnostic logs at repository root:
  `about-server-error.log`, `about-server.log`, `comm-server-error.log`,
  `comm-server.log`, `flag-server-error.log`, `flag-server.log`,
  `global-lang-server-error.log`, `global-lang-server.log`,
  `interest-server-error.log`, `interest-server.log`,
  `lang-column-server-error.log`, `lang-column-server.log`,
  `languages-server-error.log`, `languages-server.log`,
  `post-remove-build.log`, `post-remove-server-error.log`,
  `post-remove-server.log`, `runtime.stderr.log`, `runtime.stdout.log`,
  `server-error.log`, `server-output.log`, `server-profile.stderr.log`,
  `server-profile.stdout.log`, `snail-cancel-server.stderr.log`,
  `snail-cancel-server.stdout.log`, and `accessibility-rg.txt`.

## Second inventory check

- `VERIFIED` — Re-ran a read-only repository file listing with
  `rg --files -g '!node_modules/**' -g '!.next/**'` after composing the map.
- `VERIFIED` — Compared the second listing against the map's route, component,
  action, library, test, migration, script, documentation, backup, log, asset,
  and configuration sections.
- `VERIFIED` — Included the additional routes/components found during the
  comparison (`src/app/app/moderation/page.tsx`,
  `src/app/app/shared/InlineSearchList.tsx`, and
  `src/app/profile/IcebreakerModal.tsx`) and all other files present in those
  categories.
- `VERIFIED` — No unlisted application route, server action, route handler,
  library/service, migration, test, script, configuration file, static asset,
  backup, documentation file, or repository-root diagnostic log was found.
- `VERIFIED` — Final post-map comparison still reports 445 enumerated files,
  including 196 migrations, 102 app files, 18 libraries, and 102 tests, with
  no omissions.
- `VERIFIED` — No application logic was reviewed or changed during the
  inventory; no reset, reseed, migration execution, or quality verification
  was performed in this pass.

## PASS 2 — COMPLETE

- State: `VERIFIED`
- Scope completed: complete technical repository map for later review passes.
- All mapped application areas remain `UNREVIEWED` for quality and behavior.
- No fixes were made and no application files were modified by this pass.

## Pass 2 unresolved and blocked items

- `UNREVIEWED` — Every listed application subsystem still requires its own
  later quality/integration review; this is intentional and not a finding.
- `BLOCKED` — None. No unrelated work was blocked; no review work was started
  beyond inventory.

## Pass 2 continuation point

The next session must read this file first and begin the explicitly requested
Pass 3. Set only that pass's scope to `IN PROGRESS` before inspecting its
implementation. Treat every map entry above as `UNREVIEWED` until that later
pass performs and records its own evidence. If interrupted, a command fails,
context is lost, or verification cannot finish, record the exact location and
failure here, mark the affected area `RE-REVIEW REQUIRED`, and do not mark that
pass complete.

## PASS 4 — DATABASE/PERSISTENT-DATA LAYER — COMPLETE

- State: `VERIFIED`
- Scope completed: live schema and migration history, database clients and
  overloads, relations/foreign keys, nullability/defaults, checks and unique
  constraints, indexes, RLS/grants, persistent write paths, and direct
  data-integrity callers only.
- Verified fix: legacy canonical country/city profiles can now be saved when
  normalized location child fields are absent; an unambiguous locality match
  repairs the normalized region/locality, while ambiguous/unknown values still
  fail closed. The fix is in migration
  `supabase/migrations/20260904254000_infer_legacy_profile_location.sql`.
- No reset, reseed, delete, or manual SQL data edit was performed. The live
  profile-save verification used the application RPC (and consequently
  repaired the exercised legacy profile's normalized location as intended);
  the temporary invalid-save check rolled back and confirmed atomicity.
- Remaining blocked validation is limited to stale/hard-coded or absent live
  fixtures in the five full-suite tests listed in `## Blocked items`; it is not
  a discovered schema/data-integrity failure.

## PASS 4 continuation point

The next session must read this file first and start only the next explicitly
requested pass. Do not repeat Pass 4 unless the five blocked fixture tests are
restored or a later pass identifies a concrete regression in the migration
above. If interrupted, preserve the exact command/failure here, mark the
affected scope `RE-REVIEW REQUIRED`, and leave unrelated work available to
continue.

## PASS 5 — AUTHENTICATION, SESSIONS, IDENTITY, AUTHORIZATION, AND ACCESS CONTROL — COMPLETE

- State: `VERIFIED`
- Scope completed: sign-up/sign-in/sign-out, session claims and protected app
  boundaries, email confirmation and password recovery/change, Google Login
  and authenticated identity linking, age/setup/deactivation gates,
  ownership checks, staff/admin role enforcement, API/server-action/RPC
  authorization, and database RLS/storage boundaries visible from the
  implemented callers.
- `VERIFIED` — `proxy.ts`, the Supabase proxy, the server-rendered app layout,
  and staff/admin guards consistently fail closed for missing claims,
  unconfirmed email, incomplete profile, deactivated account, and unauthorized
  role. Protected server actions re-derive the authenticated subject and do
  not trust client-supplied user ids for ownership-sensitive writes.
- `VERIFIED` — Email, username, and configured alias login all resolve through
  the password-gated resolver; Google Login remains separate from Google
  profile verification, with callback state/PKCE/nonce and safe internal
  redirects preserved. Existing account-linking logic links only an
  authenticated user's own identity and does not merge accounts by email.
- `VERIFIED` — Profile, messaging, introductions, Snail Mail, reports,
  support, uploads, notifications, photo access, age appeals, deactivation,
  and data/account actions were traced to their protected RPCs, server actions,
  and RLS/storage policies. Admin-only queues and reason-gated conversation
  review remain server-enforced; no alternate UI/API caller was found that
  bypasses those checks.
- `VERIFIED` — Removed the deployment-specific administrator alias from
  distributable initialization. Fresh installs keep canonical email and
  username login; optional aliases remain private deployment data.

### Pass 5 verification

- `VERIFIED` — Focused authentication/authorization suite: 61 tests passed,
  0 failed (`pnpm exec node --test tests/login-identifiers.test.mjs
  tests/age-gate-entry-consistency.test.mjs
  tests/email-auth-onboarding-parity.test.mjs
  tests/email-verification-enforcement.test.mjs
  tests/google-login-separation.test.mjs
  tests/password-recovery-and-security.test.mjs
  tests/security-hardening.test.mjs tests/security-remediation.test.mjs
  tests/deactivation-system-wiring.test.mjs
  tests/pre-account-age-appeal.test.mjs
  tests/presence-authorization-surface.test.mjs
  tests/legacy-rpc-surface.test.mjs`).
- `VERIFIED` — `pnpm schema:check:local`: 199 migrations applied with no
  parity or ordering drift; `pnpm schema:lint` completed with only the two
  existing non-blocking unused-variable/parameter warnings.
- `VERIFIED` — `pnpm typecheck`, `pnpm lint`, and `pnpm build` all completed
  successfully. The production build emitted only the existing informational
  Server Actions experimental notice.
- `VERIFIED` — Full `pnpm test` executed all 506 tests: 501 passed and 5
  remained blocked by absent local fixtures (the exact failures are listed in
  `## Blocked items`); no auth/session test failed.
- Historical local verification before public-source cleanup confirmed the
  generic resolver accepted a valid configured alias and rejected an incorrect
  password. Current committed-source verification covers canonical
  `admin@example.com` and username `admin`; it makes no claim that a private
  alias is seeded.
- `VERIFIED` — Second focused inspection confirms the generic alias table keeps
  its Auth foreign key and normalized uniqueness constraint, while no personal
  alias or deployment credential remains in distributable SQL.
- `VERIFIED` — A rollback-only live RPC check marked an existing profile
  deactivated, attempted `save_profile` under that user's authenticated
  subject, and confirmed the deactivated-profile trigger rejected the
  mutation; the transaction was rolled back.
- `VERIFIED` — A rollback-only live RPC check attempted
  `deactivate_account()` as the current seeded administrator and confirmed
  the administrator self-deactivation guard rejected it.

### Pass 5 unresolved and continuation

- `UNREVIEWED` — No additional verified authentication or authorization
  bypass remains from this pass. Product areas outside the recorded review
  scopes still require their own passes.
- `RE-REVIEW REQUIRED` — Restore the documented local profile/open-case/
  conversation fixtures and rerun the blocked live tests before relying on
  those runtime assertions.
- `RE-REVIEW REQUIRED` — After future seed/migration changes, verify canonical
  `admin@example.com` and username `admin` on a disposable fresh local
  initialization; do not reset the working local database during ordinary QA.
- `BLOCKED` — A live browser round-trip through an external Google account
  could not be exercised in this environment because no external OAuth
  identity/credential was available. Provider configuration, callback state,
  PKCE/nonce handling, and failure paths were verified statically and by the
  focused tests.

Next session should read this file first and set only the explicitly requested
next pass to `IN PROGRESS`. If a pass is interrupted or a command fails,
record the exact command and continuation point here before stopping.

## PASS 5 AUTHENTICATION/ACCESS-CONTROL RE-REVIEW — COMPLETE

- State: `VERIFIED`
- Re-read the prior checkpoint first, then re-traced the auth callback,
  Supabase proxy, app boundary, server actions, staff/admin guards, protected
  RPCs, ownership policies, and Google-link/verification separation. No new
  bypass or contradictory account-state path was found.
- `VERIFIED` — Focused auth suite rerun: 61 passed, 0 failed.
- `VERIFIED` — `pnpm schema:check:local`, `pnpm typecheck`, `pnpm lint`, and
  `pnpm build` all passed. The schema lint/build output contains only the
  existing non-blocking warnings/notices recorded above.
- `VERIFIED` — `pnpm schema:lint` was rerun and completed with the same two
  existing non-blocking unused-variable/parameter warnings.
- `VERIFIED` — Full `pnpm test` rerun remained 501/506 passing. The same five
  live checks remain blocked by absent/stale account, moderation, and
  conversation fixtures; no auth/session test failed and no fixtures were
  created.
- Historical live resolver checks mapped a then-configured local alias and
  username to the canonical admin email and rejected incorrect credentials.
  That local-data observation predates the public-source privacy cleanup and
  is not a claim that current seed SQL creates a private alias. Rollback-only
  checks again confirmed deactivated profile saves and administrator
  self-deactivation are rejected.
- The subsequent public-source cleanup removed the deployment-specific alias;
  generic alias enforcement and canonical fixture login remain unchanged.
- `ISSUE FOUND` — The first checkpoint self-validation command in this
  re-review had a PowerShell quoting/parser error before it could inspect the
  file; it did not inspect or modify application code.
- `FIXED` — The checkpoint validation command was corrected and rerun below;
  this transient tooling error did not affect the application review.
- `VERIFIED` — Corrected checkpoint self-validation found every required
  section and all seven status labels, with Pass 5 re-review recorded as
  complete.

Next session should read this file first and set only the explicitly requested
next review scope to `IN PROGRESS`; preserve the blocked-fixture re-review
items until those fixtures are intentionally restored.

## PASS 5A TOTP AUTHENTICATOR RE-REVIEW — COMPLETE

- State: `VERIFIED`
- Scope: Existing profile-verification authenticator enrollment, QR rendering,
  Supabase MFA challenge/verification, badge persistence, and refresh behavior.
- `ISSUE FOUND` — Supabase Auth JS 2.112.4 already returns `totp.qr_code` as a
  `data:image/svg+xml;utf-8,...` URI. The Settings panel prepended a second
  `data:image/svg+xml;utf-8,` prefix, so the browser rendered a broken QR image
  and users could not scan the enrollment code.
- `FIXED` — `src/app/app/settings/TotpVerificationPanel.tsx` now preserves
  existing image data URIs and only wraps a raw SVG payload when necessary,
  encoding that fallback safely.
- `VERIFIED` — Browser reproduction showed the broken QR before the change;
  after the change the QR rendered correctly. A current TOTP code was entered
  through the real Settings form, Supabase MFA challenge/verify succeeded, the
  `complete_profile_totp_verification` RPC persisted the badge window, and the
  refreshed page continued to show the active badge.
- `VERIFIED` — Focused `tests/profile-totp-verification.test.mjs` passed 5/5;
  `pnpm typecheck` and `pnpm lint` passed.
- `ISSUE FOUND` — An initial ad-hoc `pnpm exec tsx ...` check failed because
  `tsx` is not a declared project command; it was unrelated to the application
  and no files were changed by that command.
- `FIXED` — The invalid ad-hoc check was abandoned; the supported test,
  typecheck, lint, and browser verification commands above were used instead.
- `VERIFIED` — No migration, schema, notification, pause-timer, account,
  Google-login, or reset/reseed changes were made in this pass.

Next session should read this file first and set only the explicitly requested
next review scope to `IN PROGRESS`; retain the blocked-fixture items and the
existing Pass 5 history.

## PASS 6 — NAVIGATION AND PROFILE ENTRY WIRING RE-REVIEW — COMPLETE

- State: `VERIFIED`
- Scope: Browser-reproduced setup-page navigation failures, the Next.js proxy
  entrypoint, authenticated app-route gating, and the minimum onboarding
  boundary. No visual redesign or unrelated feature work was performed.
- `ISSUE FOUND` — The root `proxy.ts` re-exported `config`, which prevented
  Next.js from statically recognizing the proxy matcher during production
  builds.
- `FIXED` — `proxy.ts` now re-exports only `proxy` and declares the matcher
  locally; the implementation remains in `src/proxy.ts`.
- `VERIFIED` — `pnpm build` completes and reports `ƒ Proxy (Middleware)`.
- `ISSUE FOUND` — The signed-in seeded bootstrap administrator was subject to
  the normal incomplete-profile redirect, making every main-navigation click
  appear to return to setup while the account was being used for operations.
- `FIXED` — Only the canonical bootstrap profile (`role = 'admin'` and
  `username = 'admin'`) bypasses the completion redirect in
  `src/lib/supabase/proxy.ts` and `src/app/auth/callback/route.ts`. Deactivation,
  age, email-verification, and authentication checks still run first; other
  administrators and normal users retain the normal boundary.
- `FIXED` — `hasCompletedProfile` now uses the intentionally small entry
  requirement already requested for normal members: display identity, birth
  date, country, one language, and three interests. The detailed progress
  calculation and remaining profile fields are preserved for later completion.
- `FIXED` — New setup location state defaults to country precision when no
  region/locality has been selected, so a country-only profile can satisfy the
  entry requirement without an artificial city step.
- `VERIFIED` — Browser session for the seeded `@admin` account opened
  `/app/profile/setup`, navigated to `/app/discover`, `/app/messages`, and
  `/app/admin`; each destination rendered the expected page heading. Setup
  section anchors remained reachable and persisted selections were observed
  after refresh in the earlier pass.
- `VERIFIED` — Focused routing/onboarding/location/frontend tests passed 37/37.
- `VERIFIED` — `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed after the
  final edits.
- `VERIFIED` — Static correctness checks for profile-save error handling and
  deactivation route guards passed after preserving explicit error-first flow.
- `BLOCKED` — The final full test command completed 508/510 tests; the two
  remaining failures are existing fixture limitations, not navigation
  regressions: the live deactivation guard references a missing hard-coded
  profile ID (so its zero-row update cannot fire the trigger), and the paused
  Snail Mail check reports an unavailable conversation fixture. No fixture was
  created and no reset or reseed was run.
- `BLOCKED` — `pnpm schema:check:local` cannot claim parity because the local
  database history is one migration behind the repository (`20260905100000_
  clear_handled_introduction_notifications.sql`). Applying that existing
  migration would change database state, so it was not performed in this
  navigation-only pass.
- `RE-REVIEW REQUIRED` — Restore the documented local deactivation and
  conversation fixtures before relying on those two full-suite assertions.
  Re-run the external Google OAuth round-trip only with a configured test
  identity.

Next session should read this file first and set only the explicitly requested
next review scope to `IN PROGRESS`; preserve the blocked-fixture and external
OAuth items above.

## PASS 7 — ONBOARDING AUDIT ONLY — COMPLETE

- State: `VERIFIED`
- Scope: Registration → email confirmation/Google callback → profile setup →
  first app entry. Audit only; no application, schema, or data changes made.
- `VERIFIED` — Email registration collects email, date of birth, and password
  in `src/app/sign-up/page.tsx`; `signUp` calls the server `age_gate_signup`
  RPC before `auth.signUp`, then routes to `/check-email`.
- `VERIFIED` — Email confirmation is handled by `src/app/auth/confirm/page.tsx`
  (`verifyOtp`, PKCE exchange, or hash session), checks
  `email_confirmed_at`, and routes signup confirmations toward profile setup.
  Non-signup confirmation types use the normal app boundary.
- `VERIFIED` — Google login is handled by `src/app/auth/GoogleAuthButton.tsx`
  and `src/app/auth/callback/route.ts`; the callback exchanges the code,
  checks email confirmation, age restriction, deactivation, and then routes a
  missing/incomplete profile to `/app/profile/setup`.
- `VERIFIED` — Every `/app/*` request is guarded in
  `src/lib/supabase/proxy.ts`; `src/app/app/layout.tsx` repeats the session,
  email, age, and deactivation checks. Direct URLs, refreshes, and returning
  sessions therefore cannot skip setup for normal users. The seeded
  `@admin` bootstrap exception is intentionally limited to that canonical
  `role = admin` + `username = admin` account.
- `VERIFIED` — Profile setup currently lives at
  `src/app/app/profile/setup/page.tsx` and is one long form with anchor-based
  section navigation (`Basics`, `Languages`, `Interests`, `Preferences`), a
  sidebar preview/progress panel, avatar upload, and one final Save/Create
  action. It is wrapped by the normal app shell, so the global sidebar remains
  visible even while a normal incomplete user is gated.
- `VERIFIED` — Structured SEO-value data is persisted through the authenticated
  `save_profile` RPC in `src/app/app/profile/actions.ts` and the latest profile
  save migration `supabase/migrations/20260904254000_infer_legacy_profile_location.sql`:
  display identity, age, gender, legacy/canonical location, languages,
  interests, bio, quote, looking-for, destinations, and optional signals.
  Languages and interests are catalogue-backed (`languages`, `interests`) with
  owner rows in `profile_languages` and `profile_interests`.
- `VERIFIED` — The current entry predicate in `src/lib/profile-completeness.ts`
  intentionally requires username/display name, birth date, country, at least
  one language, and at least three interests. `profileCompletionProgress`
  separately scores gender, location precision, bio, quote, looking-for, and
  photo for the full profile percentage.
- `ISSUE FOUND` — The entry predicate and the actual first-save contract are
  not aligned: the UI and `save_profile` still require gender, `looking_for`,
  and (for a new row) non-empty bio and quote, while `hasCompletedProfile`
  omits those fields. A user cannot reliably reach the stated “basic fields
  only” completion state without also filling additional fields.
- `ISSUE FOUND` — The minimum language/interests counts are enforced by the
  route gate and UI copy, but the `save_profile` RPC itself accepts empty
  language and interest arrays. A first save can therefore return `ok` and
  redirect to `/app`, only for the proxy to send the user back to setup; the
  guided flow should make this state explicit and keep the server contract
  aligned with the chosen minimum.
- `ISSUE FOUND` — The setup UI exposes duplicate hierarchy/copy layers
  (`Languages you use` + `Languages`, `Things you enjoy` + `Interests`) and
  presents `profileCompletionProgress.complete` as “ready” even though the
  route gate uses a smaller predicate. This can make the visible percentage
  and the actual entry decision disagree.
- `ISSUE FOUND` — Progress is client-held until the single final form submit;
  there is no persisted draft or step-level save. Refreshing or leaving setup
  before Save loses unsaved selections, although completed saves are persisted
  server-side.
- `ISSUE FOUND` — The “Back to app” link on the setup page targets `/app` for
  incomplete normal users, which is correctly redirected back to setup and
  feels like a loop rather than a deliberate locked gateway.
- `ISSUE FOUND` — Required structured selectors (country, one language, three
  interests) are enforced mainly by hidden form values/server RPC errors; the
  search controls themselves do not provide field-level required/error
  feedback. Save failures return a page-level query error rather than mapping
  to the exact missing field.
- `VERIFIED` — Existing completed users remain able to use the setup route as
  an edit page and are not trapped by the completion redirect. Existing rows
  and legacy location values are preserved by the normalized location
  migrations and legacy-compatible save overloads.

### Implementation plan for the focused gateway (not implemented in Pass 7)

1. Keep the current server boundary and route targets, but render a dedicated
   onboarding shell for incomplete normal users; hide/disable normal site
   navigation until the entry predicate is satisfied. Preserve the existing
   edit shell for completed users and the narrowly scoped bootstrap admin.
2. Define one canonical `onboardingEntryRequirements` helper shared by the
   proxy, Google callback, setup page, and save validation. Align the UI and
   `save_profile` contract so the chosen minimum (identity, 18+ birth date,
   country, one language, three interests) can actually be saved without
   unrelated extra fields, while retaining full-profile fields for later.
3. Convert the current anchor sections into a small guided sequence using the
   existing components and catalogues: Basics/location → Languages →
   Interests → concise optional completion. Persist each completed step via
   the existing authenticated RPC (or a minimal draft path only if required),
   and resume from the first unmet requirement after refresh/direct URL entry.
4. Add shared field-level validation and accessible error/focus handling for
   date/18+ checks, country precision, language count, and interest count;
   retain server-side validation as authoritative and keep age restrictions
   and appeals unchanged.
5. Replace the incomplete-user “Back to app” loop with a clear locked-gateway
   explanation, while keeping “View public profile” and edit return context
   available only when a profile identity exists.
6. Separate the small `entryComplete` state from the full profile percentage
   in copy/progress UI so “ready to enter” and “profile completeness” cannot
   contradict each other. Preserve structured country/language/interest data
   for discovery and future aggregate SEO work without exposing private data.
7. Verify email signup, Google first login, returning completed/incomplete
   users, refresh/direct/back navigation, age-restricted users, mobile/desktop,
   keyboard focus, and persisted profile data with the existing tests and a
   real browser run. Do not reset or reseed.

Next session should read this file first and set only the implementation pass
for the focused onboarding gateway to `IN PROGRESS`; Pass 7 itself made no
application changes.

## PASS 8 — ONBOARDING GATEWAY IMPLEMENTATION — COMPLETE

- State: `VERIFIED`
- Scope: Implement the focused registration/profile-onboarding gateway from
  Pass 7, keeping the existing design and authentication boundary intact.
- `VERIFIED` — The shared `onboardingEntryComplete` predicate now defines the
  single entry minimum (display identity, birth date, country, one language,
  and three interests); `hasCompletedProfile` delegates to it for compatibility.
- `VERIFIED` — `onboardingNextStep` derives the first unmet basics, language,
  or interest step for persisted onboarding resume.
- `FIXED` — `saveProfile` now permits partial onboarding saves, preserves
  existing optional values, supplies only neutral legacy-column defaults
  (`prefer_not_to_say` and `friendship`), and redirects incomplete members
  back to setup with a `saved=1` status and the next section anchor.
- `FIXED` — Added migration
  `supabase/migrations/20260905110000_onboarding_entry_minimum.sql` to remove
  the old first-save quote requirement while retaining all existing server,
  age, email, location, catalogue, and atomic-write validation.
- `FIXED` — The app layout now computes the same server-side entry predicate
  and renders a quiet onboarding-only shell for incomplete normal members;
  completed profiles retain the existing navigation and editing shell. The
  bootstrap admin exception remains narrowly scoped and lifecycle gates still
  run first.
- `FIXED` — Setup copy and controls now identify only the gateway minimum as
  required; gender, bio, quote, looking-for, and photo are optional for entry.
  The completed edit experience remains available, and the incomplete-user
  back-link loop is replaced with a clear gateway message.
- `FIXED` — Setup progress highlights the first unmet gateway section and
  reports save-and-continue feedback. Country-only legacy location rows now
  resolve consistently in progress calculations.
- `VERIFIED` — Applied the existing pending migration and the new onboarding
  migration to the running local database without reset/reseed; local history
  now reports 201/201 migrations with no parity drift.
- `VERIFIED` — A rollback-scoped live RPC call confirmed a minimum-field save
  succeeds with an empty quote/bio and country precision without changing
  persisted demo data.
- `VERIFIED` — Browser flow with the seeded member account: completed setup
  retained the normal shell and entered Discover; removing the third interest
  and saving returned `saved=1#interests`, showed the gateway message, and
  hard-refreshing removed the normal sidebar; direct Discover navigation was
  redirected back to setup; restoring the interest returned to Discover.
- `VERIFIED` — Targeted onboarding/auth/accessibility/frontend tests passed
  26/26 after updating the stale legacy test expectations for optional story
  fields.
- `VERIFIED` — `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm schema:check`,
  `pnpm schema:check:local`, and `pnpm schema:lint` passed. Schema lint retains
  only the previously documented unrelated warnings.
- `BLOCKED` — The final `pnpm test` completed 506/510; the four remaining
  failures are pre-existing local fixture limitations (hard-coded deactivation
  profile id, two missing open moderation-case fixtures, and unavailable
  paused Snail Mail conversation), unrelated to onboarding. The targeted
  onboarding/auth test set remained 15/15 passing after the final heading and
  progress adjustments.

### Pass 8 continuation point

Next session should read this file first and set the next explicitly requested
scope to `IN PROGRESS`. No onboarding work remains required for this pass.
Re-run the four blocked fixture tests only after their documented fixtures are
intentionally restored. No reset or reseed was performed.

## PASS 9 — ONBOARDING GATEWAY DESIGN — COMPLETE

- State: `VERIFIED`
- Scope: Local presentation refinement for the Pass 8 onboarding gateway only;
  field requirements, routing, persistence, and server-side gates were not
  changed.
- `FIXED` — Incomplete users now get a narrower, centered gateway column with
  a compact optional-photo panel and a bordered setup context banner, keeping
  normal application navigation out of the shell.
- `FIXED` — Added an explicit 3-section entry progress bar with accessible
  progress semantics, next-section copy, and a highlighted next section in the
  setup navigation. Preferences remains visibly optional.
- `FIXED` — Removed the competing primary treatment from optional photo upload
  during onboarding; the save/continue action is the sole primary action and
  becomes full-width on narrow screens.
- `FIXED` — Removed duplicate/conflicting completion language in the footer:
  incomplete users see `N of 3 entry steps complete`, while completed editors
  retain the full profile percentage.
- `VERIFIED` — Rebuilt and restarted the local app, then visually checked the
  incomplete gateway at desktop size, including progress, section navigation,
  form hierarchy, and the final action area. The seeded member was restored to
  a completed profile afterward; completed editing still renders the normal
  app shell and `Edit your profile` state.
- `VERIFIED` — Browser accessibility snapshot contains labelled setup regions,
  `aria-current="step"` for the next section, a real progressbar with values,
  and keyboard tab movement from display name to birth date. Browser console
  error logs were empty.
- `VERIFIED` — Desktop document width remained within the viewport (no
  horizontal overflow). Responsive classes were checked for single-column
  mobile stacking, two-column-to-one-column form wrapping, two-column setup
  navigation below `sm`, and full-width onboarding save action below `sm`.
- `VERIFIED` — `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed after the
  design changes. Targeted setup, profile-save, and frontend-consistency tests
  passed 12/12.
- `BLOCKED` — Repository-wide `pnpm test` still reports the same four
  documented local-fixture failures from Pass 8 (deactivation guard,
  unavailable moderation case fixtures, and unavailable paused Snail Mail
  conversation); no new failure was introduced by this pass.

### Pass 9 continuation point

No onboarding design work remains for this pass. If a later session resumes
the review, read this file first and start only the next explicitly requested
scope. Do not reset or reseed the database.

## PASS 10 — ONBOARDING FINAL VERIFICATION — COMPLETE

- State: `VERIFIED`
- Scope: Browser QA of the Passes 1–4 onboarding flow; no feature, design, or
  onboarding-logic changes were made.
- `VERIFIED` — Registration age validation rejects a 17-year-old date with the
  expected accessible alert. A valid disposable registration reached the
  existing email-verification error boundary; the local SMTP/email-confirmation
  dependency is documented below.
- `VERIFIED` — Seeded member flow completed end to end: setup edit opened with
  persisted identity/language/interest data, a reversible missing-interest
  state was saved, hard refresh resumed setup with `Set up your profile`, and
  direct `/app/discover` navigation redirected back to setup without the app
  sidebar.
- `VERIFIED` — Browser back/forward retained the gateway, restoring the missing
  interest and saving returned to Discover, and the completed profile remained
  in the normal shell with `Edit your profile` on revisit.
- `VERIFIED` — A real bio edit persisted after save and refresh, then the demo
  value was restored. An invalid future birth date was rejected server-side
  with the expected age-gate error and the valid date was restored.
- `VERIFIED` — Logout/login returned directly to Discover without incorrectly
  showing onboarding again. Browser console error logs were empty throughout
  the tested flow.
- `VERIFIED` — Required-field browser validation blocked an empty display name
  without navigation. Existing pending-save disabling remains implemented by
  `ProfileSaveButton`; no duplicate submission was observed.
- `VERIFIED` — Desktop screenshots and accessibility snapshots showed the
  focused gateway, progress state, required/optional labels, keyboard focus
  movement, and no horizontal overflow. Responsive mobile/tablet classes were
  rechecked; the CUA browser does not expose a viewport-resize control for a
  true narrow-device screenshot.
- `BLOCKED` — A new account could not progress past registration because the
  local environment reports `Email verification is temporarily unavailable`;
  no test email/SMTP delivery path is configured. Existing confirmed demo
  accounts were used for every post-confirmation onboarding step.
- `VERIFIED` — No reproducible onboarding defect was found, so no application
  files were changed in this pass. Existing repository-wide test fixture
  blockers remain documented under Passes 8–9.

### Pass 10 continuation point

Final onboarding QA is complete. If a later session resumes the review, read
this file first and begin only the next explicitly requested scope. Do not
reset or reseed the database.

## PASS 11 — SEO ENGINE PASS 1 — AUDIT AND ARCHITECTURE — COMPLETE

- State: `VERIFIED`
- Scope: Repository and route architecture audit for a scalable SEO system
  backed by real, privacy-safe Pen-Pals community aggregates. No application
  code, schema, configuration, or database state was changed in this pass.

### Current SEO and public-route inventory

- `VERIFIED` — The only genuinely anonymous content page is `src/app/page.tsx`
  at `/`. It contains global metadata from `src/app/layout.tsx` (title,
  description, Open Graph, Twitter, manifest, and icons), but no
  `metadataBase`, canonical alternate, robots directive, structured data, or
  dynamic community statistics.
- `VERIFIED` — There is no `sitemap.ts`, `robots.ts`, `robots.txt`, SEO route,
  schema.org implementation, or existing public aggregate endpoint in the
  repository. `next.config.ts` has no SEO rewrites or indexing configuration.
- `VERIFIED` — `/profile/[username]` is only a legacy redirect to
  `/app/profile/[username]`. The app profile route is authenticated,
  `force-dynamic`, and calls the privacy-aware `get_public_profile` RPC; it is
  not an anonymous/indexable public-profile surface and has no route metadata.
- `VERIFIED` — `/app/discover` is authenticated and server-rendered. Its URL
  filters are canonicalized and passed to the paginated
  `get_discover_profiles_page` RPC, but the route is app UX, not an SEO page.

### Canonical structured data available for aggregation

- `VERIFIED` — `public.profiles` is the identity/profile source. Relevant
  structured columns include canonical `country_code`, optional `region_code`
  and `locality_id`, explicit `location_precision`, lifecycle fields
  (`deactivated_at`, `inactive_mode`), visibility, activity timestamps, and
  profile-completion fields. Legacy `country`/`city` text remains as a
  compatibility/display fallback.
- `VERIFIED` — `public.languages` and `public.interests` are shared catalogues;
  `profile_languages` links profiles to a language with `proficiency` and
  `purpose` (`speaks` or `learning`), while `profile_interests` links stable
  interest IDs. These are the canonical language/interest dimensions already
  reused by setup and Discover. The catalogue includes the later curated
  language and comprehensive interest additions.
- `VERIFIED` — `profile_friendship_destinations` is a separate country/region
  destination relation and must not be conflated with a member's home
  location in SEO copy or counts. `connection_goals` and other profile signals
  are optional arrays/columns and can be considered only as bounded dimensions
  after their public-aggregation policy is explicitly decided.
- `VERIFIED` — Current entry minimum is shared by `src/lib/profile-completeness.ts`,
  the proxy, app layout, and onboarding save path: display identity, birth
  date/age-gate validity, country, at least one language, and at least three
  interests. Discover adds non-empty profile/story fields, avatar, recent
  activity, non-paused/non-deactivated state, and authenticated privacy checks.

### Existing aggregation capabilities

- `VERIFIED` — `admin_analytics_summary` in
  `supabase/migrations/20260904200000_staff_analytics.sql` is the only broad
  aggregate helper found. It is staff-gated, includes operational counts and
  time-series totals, and is not suitable for anonymous SEO because it exposes
  platform-wide operational data and has no public-dimension policy.
- `VERIFIED` — `get_discover_profiles_page` computes eligibility, filters,
  counts, and a paginated profile projection, but it is authenticated,
  viewer-bound, and returns profile-level data. It must not be reused as a
  public aggregate API.
- `VERIFIED` — No existing public function groups completed profiles by
  country, region, language, interest, destination, or goal. A dedicated
  aggregate RPC (or a server-only cached query over the same canonical joins)
  will be required in the implementation pass.

### Recommended implementation architecture (not implemented)

1. Add one narrowly scoped, `SECURITY DEFINER` aggregate function (or a small
   versioned family of functions) that returns counts and approved dimension
   labels only—never profile IDs, names, exact birth dates, text, photo paths,
   or per-user rows. Enforce a single server-side eligibility predicate:
   completed profile, active/non-paused/non-deactivated, explicitly public
   visibility, and canonical structured dimensions. Keep anonymous execution
   limited to this function; do not grant table reads to `anon`.
2. Use a privacy threshold (configurable k-anonymity floor) before rendering or
   publishing a count/page, so a page never identifies a tiny cohort. Label
   every figure as Pen-Pals community data (for example, “Pen-Pals.net members
   in Spain”), never as a general-population statistic. Define separately any
   “active recently” metric rather than equating it with total members.
3. Create a constant-size App Router template set for bounded canonical
   dimensions, such as `/pen-pals/country/[countryCode]`,
   `/pen-pals/language/[languageSlug]`, `/pen-pals/interest/[interestSlug]`,
   and (only if justified by volume/threshold) a small, explicitly allowlisted
   pair template. Resolve route keys against `country_codes`, `location_regions`,
   `languages`, and `interests`; reject unknown or unsupported combinations and
   redirect aliases to one canonical URL. Do not expose arbitrary query-string
   combinations as indexable pages.
4. Add route-level `generateMetadata` with `metadataBase` derived from the
   existing `NEXT_PUBLIC_SITE_URL`, canonical alternates, Open Graph/Twitter
   values, and explicit `robots` behavior. Keep authenticated `/app/*`, setup,
   support, staff, and individual protected profile routes out of indexing.
5. Add a dynamic `sitemap.ts` that lists only approved dimension pages whose
   aggregate passes the threshold. Cache the aggregate response with a short,
   bounded revalidation window (`revalidate`/`unstable_cache`) and invalidate
   that cache only when relevant profile/catalogue changes occur. This keeps
   request-time work bounded and avoids physical HTML files, per-combination
   storage, and mass prebuilds.
6. Generate stable URL keys from immutable country codes/region codes. The
   current language/interest tables have stable IDs and names but no slug
   column; the implementation should either add a minimal unique normalized
   slug field with a one-time backfill or use a server-owned slug map, then
   canonicalize aliases without changing stored selection IDs.

### Guardrails and unresolved implementation decisions

- `UNREVIEWED` — Exact aggregate eligibility predicate and privacy floor need to
  be selected during implementation and documented with the resulting RPC.
- `UNREVIEWED` — Whether regional pages should use `location_precision` to
  exclude members who selected only country-level visibility, and whether
  destination/goal dimensions have enough volume to publish, needs a data-size
  check before adding routes.
- `UNREVIEWED` — Cache invalidation trigger strategy and sitemap refresh cadence
  must be chosen when the aggregate path is implemented.
- `BLOCKED` — No blocker for the architecture audit. Production data-volume
  thresholds cannot be measured from repository inspection alone; they require
  a later read-only aggregate query against the deployment database.

### Pass 11 continuation point

Pass 1 SEO audit is complete. The next session should read this file first and,
only after explicit authorization to implement, begin `SEO ENGINE PASS 2` at
the aggregate-contract/eligibility decision, then add the dynamic route,
metadata, robots, and sitemap paths. No code or database changes were made in
this pass; do not prebuild or seed SEO pages.

## PASS 12 — SEO ENGINE PASS 2 — DATA FOUNDATION

### Scope

`VERIFIED` — Implemented only the private data foundation for later anonymous
SEO aggregates. No SEO routes, sitemap, public profile pages, user-facing
required fields, or duplicated profile table were added.

### Completed areas

- `VERIFIED` — Canonical country alias resolution is backed by
  `public.country_aliases`, keyed through immutable ISO `country_codes` values.
  Canonical country names are seeded for the full existing catalogue, with
  localized/abbreviated aliases including `España`/`espana`, `USA`, `UK`,
  `South Korea`, `Czechia`, `Türkiye`, and other common legacy spellings.
- `VERIFIED` — `public.resolve_country_code(text,text)` resolves an explicit
  country code first and otherwise resolves a normalized alias; it is
  `SECURITY DEFINER` and not executable by ordinary client roles.
- `VERIFIED` — The existing profile location trigger now canonicalizes country
  aliases, infers an unambiguous catalogue locality from free-text city input,
  preserves unresolved legacy text safely, and continues enforcing country /
  region / locality precision rules.
- `VERIFIED` — Existing profiles were backfilled only where the alias and
  location match was unambiguous. The local seeded set now has canonical
  country codes; matching region/locality IDs and canonical names were filled
  without deleting or copying profile data.
- `VERIFIED` — A post-backfill check found zero profiles whose country text
  matches a known alias while `country_code` remains null.
- `VERIFIED` — Added a narrow country/code write-consistency guard so direct
  client updates cannot change only the legacy country text or only the
  normalized code to a mismatched value. The existing protected profile-save
  path remains the supported write path.
- `VERIFIED` — Added partial/dimension indexes for public active locations,
  profile languages, interests, friendship destinations, and connection goals.
- `VERIFIED` — Added private `public.seo_profile_dimensions()` as a
  server-only, aggregate-ready source. It returns canonical dimension IDs /
  labels, spoken and learning language IDs, interest IDs, connection goals,
  public/active flags, and the shared entry-complete predicate; it returns no
  public profile projection or anonymous user rows to client roles.
- `VERIFIED` — Documented the private alias/source boundary in `AGENTS.md`,
  `README.md`, and `docs/data-inventory.md`.

### Verified issue found and fixed

- `ISSUE FOUND` → `FIXED` → `VERIFIED` — Alias canonicalization initially
  allowed a direct legacy `country` update to overwrite the canonical code
  relationship. Added `20260905121000_seo_location_write_consistency.sql` and
  reran the live Supabase integration test; mismatched direct writes are now
  rejected while equivalent aliases normalize safely.

### Verification performed

- `VERIFIED` — `20260905120000_seo_data_normalization.sql` and
  `20260905121000_seo_location_write_consistency.sql` applied to the local
  Supabase database.
- `VERIFIED` — `pnpm schema:check:local`: 203 migrations applied with no
  parity or ordering drift.
- `VERIFIED` — `pnpm schema:lint`: completed; only two pre-existing unused
  variable/parameter warnings remain in unrelated functions.
- `VERIFIED` — New-profile test: inserted a temporary confirmed Auth user and
  profile with `España` / `Sevilla`, added one canonical language and three
  canonical interests, observed `ES` / `ES-AN` / locality `Sevilla` and
  `is_entry_complete = true` from `seo_profile_dimensions()`, then deleted the
  temporary profile and Auth user. Final check found zero `seo_test_*` rows.
- `VERIFIED` — `node --test tests/supabase-integration.test.mjs`: passed after
  the consistency guard fix.
- `VERIFIED` — `pnpm typecheck`, `pnpm lint`, and `pnpm build`: passed.
- `RE-REVIEW REQUIRED` — Full `pnpm test` completed 506/510 tests. Four
  failures are existing local-fixture-dependent tests:
  `account-deactivation-authority.test.mjs` (missing fixed account fixture),
  `moderation-admin-escalation.test.mjs` and
  `moderator-conversation-review-assignment.test.mjs` (no local open case),
  and `privacy-lifecycle-wiring.test.mjs` (no local conversation fixture).
  They do not exercise the new SEO migration and remain blocked without
  reseeding, which this pass does not permit.

### Blocked / unresolved items

- `BLOCKED` — Supabase repeatedly reports the pre-existing critical advisory
  that `public.location_configuration` has RLS disabled. The remediation is
  intentionally not applied here because enabling RLS without an approved
  policy would block existing configuration reads. This is outside the SEO
  data-foundation scope and needs an explicit policy decision.
- `UNREVIEWED` — A public, thresholded aggregate RPC, route templates,
  metadata, robots, sitemap, cache invalidation, and URL slug policy remain for
  the later SEO implementation pass.

### Exact continuation point

The next session should read this file first and begin the next explicitly
authorized SEO implementation scope at the aggregate contract: choose the
eligibility predicate/privacy floor and expose only approved aggregate counts
from `seo_profile_dimensions()`. Do not grant the private source to anon or
authenticated roles, do not create per-profile/per-combination pages, and do
not reseed the local database.

### PASS 12 status

`VERIFIED` — SEO data-foundation scope complete. `RE-REVIEW REQUIRED` applies
only to the four blocked fixture tests and the existing unrelated RLS advisory.

## PASS 13 — SEO ENGINE PASS 3 — AGGREGATION

### Scope

`VERIFIED` — Implemented the database-owned aggregation layer only. No public
SEO routes, HTML generation, sitemap entries, user-facing fields, or profile
records copied into an SEO table were added.

### Completed areas

- `VERIFIED` — Added private `seo_community_aggregates` rows for dimensions
  supported by real normalized data: country, region, spoken language,
  learning language, interest, connection goal, country+spoken/learning
  language, country+interest, and spoken/learning language+interest. Rows are
  created only for combinations represented by eligible members.
- `VERIFIED` — Every aggregate stores a stable key, typed canonical IDs,
  `member_count`, `cohort_size`, calculation time, JSON dimension metadata,
  and a `sufficient` flag. The default privacy floor is five unique eligible
  members; the state row also records the total eligible cohort and freshness.
- `VERIFIED` — Added `seo_community_aggregate_state` with a dirty marker,
  timestamps, eligible-member count, and configurable minimum cohort size.
- `VERIFIED` — Profile, language-selection, interest-selection,
  friendship-destination, and catalogue changes mark the cache dirty through
  statement-level triggers. Refreshes are serialized by a transaction advisory
  lock and rebuild the cache atomically from the private normalized source.
- `VERIFIED` — Added service-only `refresh_seo_community_aggregates()` and
  `get_seo_community_aggregates(text)`. Reads refresh only when dirty and
  return source freshness/threshold metadata; anon/authenticated roles have no
  table or function access.
- `VERIFIED` — Added cache indexes and documented the private cache, dirty
  behavior, threshold, and service boundary in `AGENTS.md`, `README.md`, and
  `docs/data-inventory.md`.

### Verification performed

- `VERIFIED` — Applied `20260905130000_seo_community_aggregation.sql` and
  `20260905131000_seo_alias_cache_invalidation.sql` locally; schema history
  now has 205 applied migrations with no parity drift.
- `VERIFIED` — Initial cache refresh produced 11 eligible public members and
  only real dimensions. Current one-member cohorts are marked
  `sufficient = false` at the configured floor of five.
- `VERIFIED` — Independent country counts from `seo_profile_dimensions()`
  matched every materialized country aggregate.
- `VERIFIED` — A transactional profile update set the dirty marker, and
  rollback restored the clean state; the aggregate read path reports a clean,
  timestamped cache afterward.
- `VERIFIED` — A private country-alias catalogue update also sets the dirty
  marker, covering changes that can alter unresolved legacy dimensions.
- `VERIFIED` — A temporary eligible profile sharing Australia increased the
  materialized `country:AU` count from 1 to 2 after refresh; deleting it and
  refreshing returned the count to 1. Both temporary Auth/profile checks found
  zero remaining test rows.
- `VERIFIED` — Authenticated-role invocation of the aggregate read function was
  denied (`permission denied for function get_seo_community_aggregates`).
- `VERIFIED` — A `service_role` session can read the aggregate function and
  receives the expected country rows.
- `VERIFIED` — `pnpm schema:check:local`, `pnpm schema:lint`,
  `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed. Schema lint retains
  only the two pre-existing unrelated unused-variable warnings.
- `RE-REVIEW REQUIRED` — Full `pnpm test` completed 506/510 tests. The same
  four local-fixture-dependent failures remain from Pass 12 and are unrelated
  to the aggregate migration; no reset/reseed was performed.
- `VERIFIED` — The final post-suite refresh left the aggregate cache clean with
  11 eligible members and a current refresh timestamp.

### Blocked / unresolved items

- `BLOCKED` — The pre-existing Supabase advisory that
  `public.location_configuration` has RLS disabled remains. It is outside this
  pass; enabling it without approved policies could break existing reads.
- `UNREVIEWED` — Public thresholded aggregate exposure, dynamic SEO routes,
  metadata, robots, sitemap, and cache invalidation scheduling remain for a
  later SEO pass. The private cache intentionally has no public entry point.

### Exact continuation point

The next session should read this file first and, only with explicit
authorization, design the public SEO read contract over
`get_seo_community_aggregates()`: enforce `sufficient`, label counts as
Pen-Pals community data, resolve canonical route keys, and keep all
authenticated/private routes out of indexing. Do not expose the cache tables,
do not generate per-combination files, and do not reseed the database.

### PASS 13 status

`VERIFIED` — Aggregation scope complete. `RE-REVIEW REQUIRED` applies only to
the four pre-existing fixture failures and the unrelated RLS advisory.

## PASS 14 — SEO ENGINE PASS 4 — ELIGIBILITY ENGINE

### Scope

`VERIFIED` — Implemented only the private eligibility decision layer over the
real aggregate cache. No public SEO route, sitemap, metadata, HTML generation,
user-facing field, or per-combination page was added.

### Completed areas

- `VERIFIED` — Added the private single-row
  `seo_aggregate_eligibility_config` policy. It centralizes the explicit
  public-indexing switch (off by default), minimum privacy cohort (5), useful
  information floor (2), minimum parent distinction (1 member), and maximum
  aggregate age (7 days). Constraints keep these values in safe, tunable
  ranges.
- `VERIFIED` — Added private
  `seo_community_aggregate_eligibility` decisions keyed to the real aggregate
  cache. Each row records the cohort, parent aggregate/cohort, useful
  information count, uniqueness result, source/evaluation timestamps, an
  explanatory reason, and a boolean `is_indexable`.
- `VERIFIED` — The evaluator preserves a default-deny posture and emits the
  states `eligible_indexable`, `available_non_indexable`, `insufficient_data`,
  `suppressed_for_privacy`, `duplicate_redundant`, and `stale`. Privacy and
  aggregate-sufficiency checks run before freshness/usefulness/uniqueness, and
  the explicit public-indexing switch is the final gate.
- `VERIFIED` — Parent fallback/uniqueness is bounded to the existing hierarchy:
  region and country/language/interest pairs compare with country; language +
  interest compares with its language aggregate. A child that adds no cohort
  distinction is marked `duplicate_redundant`, allowing a later route layer to
  choose the broader valid parent instead of publishing a granular duplicate.
- `VERIFIED` — Aggregate/profile/catalogue invalidation now also marks
  eligibility dirty. Policy changes invalidate the decision cache. Evaluation
  refreshes aggregates first, serializes with a transaction advisory lock, and
  rebuilds decision rows atomically; aggregate deletion cascades its decision.
- `VERIFIED` — Added service-only
  `evaluate_seo_community_eligibility()` and
  `get_seo_community_eligibility(text, boolean)`. Ordinary `anon` and
  `authenticated` roles have no table or function access, so no arbitrary
  query parameter can become an indexable surface through this layer.
- `VERIFIED` — Documented the policy, decision states, default-deny contract,
  and bounded-route requirement in `AGENTS.md`, `README.md`, and
  `docs/data-inventory.md`.

### Verified issue found and fixed

- `ISSUE FOUND` → `FIXED` → `VERIFIED` — The aggregate cache had no separate
  privacy/usefulness/freshness/parent-distinction decision, so a future public
  route could have treated any materialized row as indexable. Added the
  default-deny eligibility policy/cache and service boundary; current local
  rows are now explicitly classified and all remain non-indexable by default.

### Verification performed

- `VERIFIED` — Applied `20260905140000_seo_aggregate_eligibility.sql` and
  `20260905141000_seo_aggregate_refresh_invalidates_eligibility.sql` locally;
  migration history is now 207 applied migrations with no parity or ordering
  drift.
- `VERIFIED` — Initial service read evaluated the current real cache. All
  current one-member cohorts are `suppressed_for_privacy`, with
  `is_indexable = false`; state reports `eligibility_dirty = false` and a
  current evaluation timestamp.
- `VERIFIED` — The `p_indexable_only = true` service read currently returns
  zero rows, confirming the default policy cannot accidentally expose a public
  indexable aggregate.
- `VERIFIED` — Rollback-only boundary test with two temporary complete public
  profiles in one country lowered the test policy floor and enabled indexing;
  the country cohort became `eligible_indexable` and indexable. The transaction
  rolled back completely.
- `VERIFIED` — Rollback-only policy-switch test with the same temporary cohort
  classified it `available_non_indexable` when public indexing was disabled.
  A child country/interest cohort equal to its country parent was classified
  `duplicate_redundant`. All temporary Auth/profile/language/interest rows were
  rolled back.
- `VERIFIED` — Service authorization is enforced by privileges: `anon` and
  `authenticated` lack EXECUTE on the eligibility read function and
  `service_role` has it. No client table grants were added.
- `VERIFIED` — A direct trusted aggregate refresh marks
  `eligibility_dirty = true`; the next service eligibility read re-evaluates
  the decision cache and clears the marker. This closes the refresh path that
  bypasses source-table invalidation triggers.
- `VERIFIED` — `pnpm schema:check:local`: 207 migrations applied with no
  parity or ordering drift.
- `VERIFIED` — `pnpm schema:lint`: completed with only the two pre-existing
  unrelated unused-variable/parameter warnings.
- `VERIFIED` — `pnpm typecheck`, `pnpm lint`, and `pnpm build`: passed.
- `RE-REVIEW REQUIRED` — Full `pnpm test` remains 506/510. The same four
  local-fixture-dependent failures remain (`account-deactivation-authority`,
  `moderation-admin-escalation`,
  `moderator-conversation-review-assignment`, and
  `privacy-lifecycle-wiring`); no new eligibility failure appeared and no
  reset/reseed was performed.

### Blocked / unresolved items

- `BLOCKED` — Supabase still reports the pre-existing critical advisory that
  `public.location_configuration` has RLS disabled. The suggested remediation
  is `ALTER TABLE public.location_configuration ENABLE ROW LEVEL SECURITY;`,
  but it was not applied because policies must be chosen first and enabling
  RLS without them would block existing configuration reads.
- `UNREVIEWED` — Public SEO read routes, canonical slugs, metadata/robots,
  sitemap inclusion, and freshness scheduling remain for a later authorized
  pass. Any such layer must consume only `is_indexable` decisions and keep a
  fixed, bounded route grammar.

### Exact continuation point

The next session should read this file first and begin the next explicitly
authorized SEO scope at the public read contract. Expose only aggregates whose
eligibility state is `eligible_indexable`, label every count as Pen-Pals.net
community data, use canonical typed route keys, and fall back to the recorded
parent when a granular row is non-indexable. Do not expose cache/config tables,
do not accept arbitrary filter combinations, do not generate per-combination
files, and do not reseed the database.

### PASS 14 status

`VERIFIED` — Eligibility-engine scope complete. `RE-REVIEW REQUIRED` applies
only to the four pre-existing fixture failures; the unrelated RLS advisory
remains blocked pending a policy decision.

## PASS 15 — SEO ENGINE PASS 5 — DYNAMIC PUBLIC SURFACES

### Scope

`VERIFIED` — Added the public SEO read contract and three dynamic route
families only. No physical page generation, `generateStaticParams`, sitemap
expansion, arbitrary query filters, or per-combination files were added.

### Completed areas

- `VERIFIED` — Added the allow-listed anonymous
  `get_public_seo_surface(text,text)` projection. It accepts only `country`,
  `language`, or `interest`, resolves canonical catalogue entities, reads the
  cached aggregate/eligibility layers, and returns only explicitly
  `eligible_indexable` rows plus qualifying related aggregate communities.
  Private cache/config tables and profile rows remain inaccessible.
- `VERIFIED` — Added reusable dynamic App Router templates at
  `/country/[slug]`, `/language/[slug]`, and `/interest/[slug]`, all marked
  `force-dynamic`; the shared renderer lives in
  `src/app/seo/SeoSurfacePage.tsx`. There is no build-time enumeration, so the
  source-file count remains constant as data grows.
- `VERIFIED` — Added canonical slug/entity resolution, absolute canonical
  metadata, noindex metadata for unresolved/non-eligible surfaces, and
  aggregate-only Open Graph descriptions. The rendered copy explicitly says
  every statistic describes Pen-Pals.net members and never the general
  population.
- `VERIFIED` — Pages show real cohort size, calculation time, and only
  qualifying related countries/languages/interests. No filler or fabricated
  member content is used. The shared Pen-Pals navigation, palette, surfaces,
  and sign-up/discovery paths are reused.
- `VERIFIED` — The public RPC is executable by `anon`/`authenticated` but
  exposes no direct table access or evaluator privilege. Unknown slugs,
  policy-disabled rows, suppressed/duplicate/stale rows, and insufficient
  cohorts return an empty result, which the route renders as not found rather
  than indexable content.
- `VERIFIED` — The public RPC is a read-only guarded wrapper. It checks the
  aggregate state row under `FOR SHARE` and fails closed while eligibility is
  dirty, unevaluated, or older than the configured freshness window; anonymous
  requests cannot trigger the private full-cache evaluator. The internal
  projection function has no `anon`/`authenticated` execute privilege.
- `VERIFIED` — Documented the public route grammar and projection boundary in
  `AGENTS.md`, `README.md`, and `docs/data-inventory.md`.

### Verified issue found and fixed

- `ISSUE FOUND` → `FIXED` → `VERIFIED` — The completed aggregate and
  eligibility layers had no public route contract. Added a fixed-size,
  canonical, aggregate-only projection and shared dynamic templates so only
  policy-approved communities can receive public SEO pages without URL or
  filesystem explosion.
- `ISSUE FOUND` → `FIXED` → `VERIFIED` — The first public projection version
  could invoke the private eligibility evaluator when its dirty marker was
  set, allowing an anonymous page request to cause an expensive refresh.
  Renamed that implementation to an ungranted internal function and replaced
  the public entry point with a read-only freshness/dirty guard that returns no
  rows until a trusted refresh has completed.

### Verification performed

- `VERIFIED` — Applied `20260905150000_seo_public_surfaces.sql` and
  `20260905151000_seo_public_surface_read_guard.sql` locally; migration
  history is now 209 applied migrations with no parity or ordering drift.
- `VERIFIED` — Default-deny live check: `public_indexing_enabled = false`,
  `get_public_seo_surface('language','english')` returns no rows, and the
  indexable eligibility read returns zero rows.
- `VERIFIED` — Public privilege check: `anon` and `authenticated` can execute
  only `get_public_seo_surface`; direct cache/config table access and private
  eligibility functions remain unavailable.
- `VERIFIED` — Guard check: with the eligibility state marked dirty, the
  public function returned zero rows without evaluating or clearing the state;
  after a trusted evaluation it served only eligible rows. `anon` has execute
  on the public wrapper and no execute on the internal projection.
- `VERIFIED` — Rollback-only anonymous projection test with two temporary
  complete public profiles produced a real `country:ES` surface when the test
  policy was enabled, including canonical `es` slug and live member count.
  Language and interest surfaces also resolved correctly. All temporary Auth,
  profile, language, and interest rows were rolled back.
- `VERIFIED` — Started a fresh production server from the current build and
  requested `/language/english` and `/interest/books` under a reversible
  enabled-policy test after the read guard; both rendered HTTP 200 pages
  containing Pen-Pals.net provenance and canonical metadata. Unknown and
  non-eligible `/country/es` and unknown-language routes returned 404. Policy
  was restored and re-evaluated to the safe default afterward.
- `VERIFIED` — `pnpm schema:verify`: 209 migrations applied with no parity or
  ordering drift; schema lint retains only the two pre-existing unrelated
  warnings.
- `VERIFIED` — `pnpm typecheck`, `pnpm lint`, and `pnpm build`: passed. Build
  lists only the three dynamic SEO route templates; no static combinations are
  generated.
- `RE-REVIEW REQUIRED` — Full `pnpm test` remains 506/510. The same four
  local-fixture-dependent failures remain (`account-deactivation-authority`,
  `moderation-admin-escalation`,
  `moderator-conversation-review-assignment`, and
  `privacy-lifecycle-wiring`); no new SEO failure appeared and no reset/reseed
  was performed.

### Blocked / unresolved items

- `BLOCKED` — Supabase still reports the pre-existing critical advisory that
  `public.location_configuration` has RLS disabled. The suggested remediation
  is `ALTER TABLE public.location_configuration ENABLE ROW LEVEL SECURITY;`,
  but it was not applied because approved policies are required first.
- `UNREVIEWED` — Sitemap/robots inclusion, editorial route curation, and a
  production refresh scheduler remain for a later explicitly authorized SEO
  pass. Any future sitemap must enumerate only approved `is_indexable` rows;
  no arbitrary combination URLs should be added.

### Exact continuation point

The next session should read this file first and, only with explicit
authorization, review the public SEO surfaces in the browser and add bounded
metadata/sitemap integration. Keep the indexing switch default-off until real
cohorts are approved, preserve the aggregate-only projection, and never expose
profiles, private cache tables, arbitrary query combinations, or generated
per-dataset files.

### PASS 15 status

`VERIFIED` — Dynamic public-surface scope complete. `RE-REVIEW REQUIRED`
applies only to the four pre-existing fixture failures; the unrelated RLS
advisory remains blocked pending a policy decision.

## PASS 16 — SEO ENGINE PASS 6 — GOOGLE INDEX CONTROL

### Scope

`VERIFIED` — Connected the existing eligibility decisions to canonical public
indexing controls. Added only bounded dynamic metadata, sitemap, robots, and
alias/query handling; no static route enumeration or per-dataset files were
introduced.

### Completed areas

- `VERIFIED` — Added the guarded read-only
  `public.get_public_seo_sitemap()` projection. It emits only the three
  approved route families (`country`, `language`, `interest`) whose aggregate
  decisions are `eligible_indexable`, whose source and eligibility caches are
  clean/current, and whose explicit public-indexing switch is enabled. Slug
  collisions are excluded rather than published ambiguously.
- `VERIFIED` — Added runtime `src/app/sitemap.ts` and `src/app/robots.ts`.
  Sitemap URLs are generated from the eligible projection at request time,
  use the canonical origin/slug, and carry aggregate calculation timestamps.
  Robots references `/sitemap.xml` and excludes private `/app/` and `/auth/`
  surfaces. Build output remains one fixed sitemap route, not one file per
  community.
- `VERIFIED` — Public SEO pages now redirect aliases, case variants, and any
  query/filter URL to the clean canonical route with a permanent redirect.
  Metadata marks noncanonical/query requests non-indexable while canonical
  qualified pages remain self-canonical and indexable.
- `VERIFIED` — Country name aliases resolve to the canonical country-code
  route. Language/interest slug collisions and invalid/non-qualified entities
  return no public surface, preventing duplicate or ambiguous URLs.

### Verified issue found and fixed

- `ISSUE FOUND` → `FIXED` → `VERIFIED` — Pass 15 exposed individual eligible
  pages but had no sitemap/robots integration, so Google could not be given a
  controlled canonical URL set. Added the eligible-only sitemap projection
  and runtime sitemap/robots handlers.
- `ISSUE FOUND` → `FIXED` → `VERIFIED` — Alias, case, and arbitrary query
  variants could render the same page at multiple URLs. Added permanent
  canonical redirects, noindex metadata for noncanonical/query requests, and
  ambiguity rejection for colliding catalogue slugs.
- `ISSUE FOUND` → `FIXED` → `VERIFIED` — The initial sitemap SQL final select
  conflicted with PL/pgSQL output-column variables. Qualified the projection
  columns; schema lint now passes.
- `ISSUE FOUND` → `FIXED` → `VERIFIED` — The SQL and JavaScript slug
  implementations handled accented catalogue names differently. Added shared
  NFKD/combining-mark normalization to `public.seo_public_slug`, matching the
  application slugger and preserving canonical aliases.

### Verification performed

- `VERIFIED` — Applied `20260905160000_seo_public_sitemap.sql` and
  `20260905161000_seo_slug_unicode_consistency.sql`; migration history is now
  211 applied migrations with no parity or ordering drift.
- `VERIFIED` — With the default policy disabled, the public sitemap and SEO
  projection return zero rows; state is clean and no rows are indexable.
- `VERIFIED` — Under a reversible enabled-policy test, the public sitemap
  returned four real eligible canonical routes and no country/non-qualified
  entries. Policy was restored to disabled and eligibility re-evaluated.
- `VERIFIED` — Fresh production-server HTTP checks: canonical language page
  200; case alias and query/filter variants 308 to the clean canonical URL;
  unknown language and non-qualified country 404; sitemap 200 with only the
  four eligible `<loc>` entries; robots 200 with sitemap reference and
  private-route disallow rules.
- `VERIFIED` — A rolled-back duplicate language-slug catalogue row caused the
  public resolver to return zero rows, confirming ambiguous slugs cannot
  publish an arbitrary first-match page.
- `VERIFIED` — Database slug checks match the application for accented,
  punctuation, and non-Latin values (`Café del Mar` → `cafe-del-mar`; empty
  slug for unsupported-only text), preventing app/database canonical drift.
- `VERIFIED` — `pnpm schema:verify`: 211 migrations applied with no parity or
  ordering drift; schema lint retains only the two pre-existing unrelated
  warnings.
- `VERIFIED` — `pnpm typecheck`, `pnpm lint`, and `pnpm build`: passed. Build
  lists fixed dynamic SEO templates plus runtime sitemap/robots routes; no
  per-dataset files are generated.
- `RE-REVIEW REQUIRED` — Full `pnpm test` remains 506/510 after the final slug
  fix. The same four
  local-fixture-dependent failures remain (`account-deactivation-authority`,
  `moderation-admin-escalation`,
  `moderator-conversation-review-assignment`, and
  `privacy-lifecycle-wiring`); no new Pass 16 failure appeared and no
  reset/reseed was performed.

### Blocked / unresolved items

- `BLOCKED` — Supabase still reports the pre-existing critical advisory that
  `public.location_configuration` has RLS disabled. The suggested remediation
  is `ALTER TABLE public.location_configuration ENABLE ROW LEVEL SECURITY;`,
  but it was not applied because approved policies are required first.
- `UNREVIEWED` — Sitemap scale splitting and editorial/quality curation beyond
  the current eligibility engine remain for a later explicitly authorized
  pass. The route/page architecture does not need to change to add a bounded
  sitemap index later.

### Exact continuation point

The next session should read this file first and, only with explicit
authorization, review the public SEO surfaces in production-like browser
conditions and add any approved sitemap splitting or editorial controls.
Keep the indexing switch default-off until real cohorts are approved; preserve
canonical redirects, eligible-only sitemap rows, aggregate-only responses,
and the fail-closed freshness guard. Do not expose profiles, private cache or
config tables, arbitrary query combinations, or generated per-dataset files.

### PASS 16 status

`VERIFIED` — Google index-control scope complete. `RE-REVIEW REQUIRED` applies
only to the four pre-existing fixture failures; the unrelated RLS advisory
remains blocked pending a policy decision.

## PASS 17 — SEO ENGINE PASS 7 — HISTORICAL DATA

### Scope

`VERIFIED` — Added private, aggregate-only historical tracking. No individual
profile snapshots, public historical pages, or duplicate SEO data store were
introduced.

### Completed areas

- `VERIFIED` — Added `seo_community_aggregate_snapshots` with canonical
  aggregate keys, dimensions, member/cohort counts, source calculation time,
  capture time, sufficiency, and the existing canonical dimension payload.
  The table has no profile foreign keys or user identifiers, so aggregate
  cache rebuilds cannot erase history and personal records are never copied.
- `VERIFIED` — Added one-row private
  `seo_aggregate_history_config` with a guarded default one-day capture
  cadence and 730-day retention. Bounds prevent accidental high-frequency
  capture or unbounded retention.
- `VERIFIED` — Added service-only
  `capture_seo_community_aggregate_snapshots()`. It serializes overlapping
  workers with an advisory lock, skips captures inside the configured cadence,
  refreshes dirty source aggregates through the existing service refresh path,
  stores only nonzero `sufficient` rows, prunes expired snapshots, and updates
  its cadence marker atomically.
- `VERIFIED` — Added service-only
  `get_seo_community_aggregate_history(text,timestamptz,timestamptz)` for later
  trend analysis with exact-key and range validation. Ordinary client roles
  have no table or function access, and no historical public SEO route uses it.
- `VERIFIED` — Wired the existing `scripts/run-background-jobs.mjs` worker to
  call the capture function. Cadence enforcement keeps each worker run
  lightweight while allowing daily history in production.

### Verified issue found and fixed

- `ISSUE FOUND` → `FIXED` → `VERIFIED` — The aggregate engine had no durable
  time series, so later trend statements would require comparing transient
  cache rebuilds. Added bounded snapshots of only meaningful aggregate rows,
  retaining source/capture timestamps for truthful comparisons.

### Verification performed

- `VERIFIED` — Applied `20260905170000_seo_aggregate_history.sql`; migration
  history is now 212 applied migrations with no parity or ordering drift.
- `VERIFIED` — Live service capture created seven real sufficient aggregate
  snapshots from the current cache; an immediate second call returned zero,
  confirming cadence idempotency. The service-only history read returned the
  expected keyed snapshot.
- `VERIFIED` — `anon` execution of the capture function was denied. Direct
  snapshot/config table access and history reads remain unavailable to ordinary
  roles.
- `VERIFIED` — Rollback-only retention test inserted an expired aggregate
  snapshot, ran capture with a 30-day test retention, and confirmed the old
  row was pruned; the transaction was rolled back.
- `VERIFIED` — `pnpm schema:verify`: 212 migrations applied with no parity or
  ordering drift; schema lint retains only the two pre-existing unrelated
  warnings.
- `VERIFIED` — `pnpm typecheck`, `pnpm lint`, and `pnpm build`: passed. The
  background worker regression assertion for the snapshot call also passed.
- `RE-REVIEW REQUIRED` — Full `pnpm test` remains 506/510. The same four
  local-fixture-dependent failures remain (`account-deactivation-authority`,
  `moderation-admin-escalation`,
  `moderator-conversation-review-assignment`, and
  `privacy-lifecycle-wiring`); no new Pass 17 failure appeared and no
  reset/reseed was performed.

### Blocked / unresolved items

- `BLOCKED` — Supabase still reports the pre-existing critical advisory that
  `public.location_configuration` has RLS disabled. The suggested remediation
  is `ALTER TABLE public.location_configuration ENABLE ROW LEVEL SECURITY;`,
  but it was not applied because approved policies are required first.
- `UNREVIEWED` — Historical trend presentation, historical SEO eligibility,
  and public historical pages remain intentionally deferred. Any future public
  trend must apply the same privacy, usefulness, freshness, and provenance
  checks as current aggregates.

### Exact continuation point

The next session should read this file first and, only with explicit
authorization, review aggregate trend consumers or historical SEO eligibility.
Keep snapshots private, aggregate-only, cadence/retention bounded, and tied to
canonical aggregate keys. Do not snapshot profiles, expose raw history to
clients, or publish historical pages without a fresh eligibility decision.

### PASS 17 status

`VERIFIED` — Historical aggregate tracking scope complete. `RE-REVIEW
REQUIRED` applies only to the four pre-existing fixture failures; the
unrelated RLS advisory remains blocked pending a policy decision.

## PASS 18 — SEO ENGINE PASS 8 — INTERNAL DISCOVERY GRAPH

### Scope

`VERIFIED` — Added a bounded internal discovery graph between qualified
  aggregate pages. The existing dynamic route families and normal user
  discovery behavior were preserved; no pair-combination routes or generated
  files were introduced.

### Completed areas

- `VERIFIED` — Added the private
  `get_public_seo_surface_graph(text,text)` projection. It starts from the
  existing public surface and filters every related country, language, and
  interest link to a destination whose own base aggregate is
  `eligible_indexable` and `is_indexable=true`.
- `VERIFIED` — Added a follow-up slug guard that excludes ambiguous language
  and interest slugs from the graph, matching the canonical public resolver's
  duplicate-slug behavior. Each relation is capped at 12 items and retains
  the existing member-count/name ordering.
- `VERIFIED` — Kept the existing public
  `get_public_seo_surface(text,text)` contract and freshness/ambiguity guard,
  but routed its related data through the target-qualified graph. The graph
  itself has no ordinary `anon`/`authenticated` execute privilege.
- `VERIFIED` — Updated `SeoSurfacePage` related cards to use descriptive,
  crawlable anchor text (`Pen pals in …`, `Pen pals who speak …`, and
  `Pen pals interested in …`) while preserving the existing layout and link
  destinations.
- `VERIFIED` — Added static regression coverage for qualification,
  ambiguity/cap guards, and descriptive anchors.

### Verified issue found and fixed

- `ISSUE FOUND` → `FIXED` → `VERIFIED` — Related arrays were qualified only
  by pair aggregates, while their links pointed to base country/language/
  interest routes. A pair could therefore produce a link to a suppressed,
  non-indexable, or (in future catalogue data) ambiguous destination. The
  graph now requires independent target qualification and canonical slug
  uniqueness before emitting a link.

### Verification performed

- `VERIFIED` — Applied
  `20260905180000_seo_internal_discovery_graph.sql` and
  `20260905181000_seo_internal_discovery_graph_slug_guard.sql`; migration
  history is now 214 applied migrations with no parity or ordering drift.
- `VERIFIED` — Direct privilege checks show the public wrapper executable by
  `anon`, while the graph and internal resolver remain unavailable to
  `anon`.
- `VERIFIED` — Reversible live REST test: an eligible language/pair relation
  returned no country link while its Australia base aggregate was suppressed;
  qualifying that base aggregate immediately exposed the real Australia link.
  All policy and eligibility changes were restored; indexing remains disabled
  and no rows are indexable.
- `VERIFIED` — Reversible production-server HTTP test on the canonical
  `/language/english` route returned 200 and contained a real
  `/interest/books` anchor with the descriptive `Pen pals interested in
  Books` text and connected-cohort copy. The temporary qualifications were
  removed afterward.
- `VERIFIED` — `node --test tests/seo-internal-discovery-graph.test.mjs`:
  3/3 passed.
- `VERIFIED` — `pnpm schema:verify`: 214 migrations applied with no parity or
  ordering drift; schema lint retains only the two pre-existing unrelated
  warnings.
- `VERIFIED` — `pnpm typecheck`, `pnpm lint`, and `pnpm build`: passed. The
  build still contains only the three dynamic SEO route families plus runtime
  sitemap/robots handlers.
- `RE-REVIEW REQUIRED` — Full `pnpm test` is 509/513. The same four
  local-fixture-dependent failures remain (`account-deactivation-authority`,
  `moderation-admin-escalation`,
  `moderator-conversation-review-assignment`, and
  `privacy-lifecycle-wiring`); the three new graph tests passed and no new
  failure appeared.

### Blocked / unresolved items

- `BLOCKED` — Supabase still reports the pre-existing critical advisory that
  `public.location_configuration` has RLS disabled. The suggested remediation
  is `ALTER TABLE public.location_configuration ENABLE ROW LEVEL SECURITY;`,
  but it was not applied because approved policies are required first.
- `UNREVIEWED` — Future editorial/quality tuning of relation labels and
  sitemap splitting remains outside this graph pass. No additional relation
  families are emitted until they have real qualified route templates.

### Exact continuation point

The next session should read this file first and, only with explicit
authorization, review the public SEO surfaces and graph quality in
production-like conditions. Keep the graph aggregate-only, target-qualified,
slug-unambiguous, and capped; preserve the indexing switch default-off,
canonical redirects, eligible-only sitemap, and no-combination-route policy.
Do not expose profiles, private cache/config/history tables, or arbitrary
query/filter URLs.

### PASS 18 status

`VERIFIED` — Internal discovery graph scope complete. `RE-REVIEW REQUIRED`
applies only to the four pre-existing fixture failures; the unrelated RLS
advisory remains blocked pending a policy decision.

## PASS 19 — SEO ENGINE PASS 9 — FULL VERIFICATION

### Scope

`VERIFIED` — Completed an end-to-end audit of the SEO normalization,
  aggregation, eligibility, public-route, sitemap, canonical, graph, cache,
  and build surfaces using the real local profile data and reversible policy
  toggles. No unrelated product behavior was changed.

### Architecture verified

- `VERIFIED` — Profile/onboarding dimensions flow through the server-only
  `seo_profile_dimensions()` source into the private aggregate cache, then
  into the private eligibility cache and finally the allow-listed public
  projection. Public pages never read profiles directly.
- `VERIFIED` — Supported aggregate dimensions are country, region,
  spoken/learning language, interest, connection goal, country-language,
  country-interest, and language-interest (spoken/learning) pairs.
- `VERIFIED` — Public discovery uses only the fixed dynamic templates
  `/country/[slug]`, `/language/[slug]`, and `/interest/[slug]`; the graph
  links only independently qualified base pages and caps each relation at 12.

### Data, eligibility, and privacy verification

- `VERIFIED` — The local database contains 12 profiles; 11 are complete,
  public, and active for aggregation. All 12 resolve to canonical country
  codes; no unresolved nonempty country values or orphaned language/interest
  references were found.
- `VERIFIED` — All 87 cached aggregate rows matched source-derived counts
  across every supported dimension; no cached/source count mismatches were
  found. The aggregate state reports 11 eligible members and is clean.
- `VERIFIED` — The privacy floor and sufficiency flags suppress one-member
  cohorts (Australia remained unavailable even with temporary indexing
  enabled). Weak/non-qualified rows never reached public output.
- `VERIFIED` — Public HTML states that numbers describe Pen-Pals.net members
  only; a known profile UUID and email pattern were absent from rendered
  output. Snapshot storage contains aggregate fields only, with no profile
  identifiers.

### Routes, indexing, and filesystem verification

- `VERIFIED` — With a reversible qualified-data setup, generated HTML for
  `/language/english` contained a self-canonical tag, real descriptive
  related anchors, provenance copy, and no private records. The configured
  canonical origin is `http://localhost:3000`.
- `VERIFIED` — Case/alias and query/filter variants returned 308 redirects to
  the clean canonical slug; nonexistent language and non-qualified country
  routes returned 404. The sitemap contained only four eligible canonical
  URLs, no pair routes, and no query variants; default indexing was restored
  to off and then returned zero rows. Robots still referenced the sitemap.
- `VERIFIED` — The production build emitted only the three dynamic SEO page
  artifact sets (nine route artifacts including maps/metadata), with no
  `generateStaticParams` or per-entity files. Route count is independent of
  aggregate cardinality.

### Cache, refresh, and load verification

- `ISSUE FOUND` → `FIXED` → `VERIFIED` — Profile/catalogue writes correctly
  invalidated both source and eligibility state, but the background worker
  refreshed aggregates without evaluating eligibility. Added the existing
  service-only `evaluate_seo_community_eligibility()` call between refresh and
  snapshot capture, so valid updates become eligible again without manual
  intervention.
- `VERIFIED` — Reproduced the defect with a real profile-selection write:
  state became dirty, refresh cleared only source dirtiness, and public output
  stayed fail-closed. Re-running the corrected refresh→evaluate sequence
  cleared both markers and restored the qualified public surface. Final state
  is clean with indexing disabled.
- `VERIFIED` — Public requests use precomputed aggregate/eligibility rows and
  bounded graph relations rather than scanning profile records. Indexed
  aggregate/cache tables have primary and dimension/state indexes; private
  history remains bounded (seven existing snapshots). No unbounded route or
  filesystem generation exists.

### Verification performed

- `VERIFIED` — `pnpm schema:verify`: 214 migrations applied with no parity or
  ordering drift; schema lint retains only the two pre-existing unrelated
  warnings.
- `VERIFIED` — `pnpm typecheck`, `pnpm lint`, and `pnpm build`: passed.
- `VERIFIED` — Targeted SEO/worker tests: 7/7 passed. Full `pnpm test` is
  509/513; the same four local-fixture-dependent failures remain
  (`account-deactivation-authority`, `moderation-admin-escalation`,
  `moderator-conversation-review-assignment`, and `privacy-lifecycle-wiring`)
  with no new failure.

### Not yet activated / blocked items

- `UNREVIEWED` — Public indexing remains deliberately disabled by default;
  no production sitemap entries are published until an operator enables and
  evaluates real cohorts. Historical public pages, editorial tuning, and
  future sitemap splitting remain deferred.
- `BLOCKED` — Supabase still reports the pre-existing critical advisory that
  `public.location_configuration` has RLS disabled. The suggested remediation
  is `ALTER TABLE public.location_configuration ENABLE ROW LEVEL SECURITY;`,
  but it was not applied because approved policies are required first.

### Exact continuation point

The next session should read this file first and, only with explicit
authorization, review production SEO activation/editorial controls. Preserve
the default-off indexing switch, aggregate-only public projection,
target-qualified graph, canonical redirects, eligible-only sitemap, bounded
snapshots, and fixed dynamic route families. Do not expose profiles, private
cache/config/history tables, arbitrary query URLs, or generated per-dataset
files.

### PASS 19 status

`VERIFIED` — Full SEO engine verification complete. `RE-REVIEW REQUIRED`
applies only to the four pre-existing fixture failures; the unrelated RLS
advisory remains blocked pending a policy decision.

## PASS 20 — SEO PRODUCTION ACTIVATION READINESS

### Scope

`VERIFIED` — Reviewed the production activation controls and current local
  qualification state after Pass 9. No public indexing switch was enabled and
  no unrelated application behavior was changed.

### Completed areas

- `VERIFIED` — Confirmed the configured policy is safe by default:
  `public_indexing_enabled=false`, minimum privacy cohort 5, useful-information
  floor 2, parent-delta requirement 1, and seven-day aggregate freshness.
- `VERIFIED` — With a reversible enabled-policy simulation against the real
  local data, four base datasets qualified (Books, Music, Travel, and English);
  80 weak cohorts remained privacy-suppressed and three pair datasets remained
  duplicate/redundant. The policy was restored and eligibility re-evaluated.
- `VERIFIED` — Confirmed production configuration validation exists for the
  HTTPS site origin, Supabase URL, auth redirect, and SMTP settings. The local
  development environment intentionally lacks those production values.
- `VERIFIED` — Confirmed the runtime robots/sitemap/canonical handlers use the
  configured origin and fail closed to an empty sitemap while indexing is off.
  Production-like HTML, canonical, redirect, 404, sitemap, and graph behavior
  was already verified in Pass 19.

### Verified issue found and fixed

- `UNREVIEWED` — No new activation defect was found. The prior Pass 19 worker
  invalidation defect remains fixed and is covered by the corrected refresh →
  eligibility evaluation sequence.

### Verification performed

- `VERIFIED` — `pnpm check:production-email` correctly rejected the local
  development environment because production-only URL, redirect, and SMTP
  variables are unset; this is an environment readiness blocker, not a code
  failure.
- `VERIFIED` — Final database state is clean: indexing disabled, zero
  indexable rows, 11 eligible members, and seven aggregate history snapshots.
- `VERIFIED` — No per-entity build generation or arbitrary route expansion was
  introduced; the fixed dynamic route architecture remains unchanged.

### Blocked / not yet activated

- `BLOCKED` — Production SEO cannot be activated in this workspace until the
  deployment supplies a real HTTPS `NEXT_PUBLIC_SITE_URL`, production
  Supabase URL, auth redirect, and SMTP configuration, then an operator
  explicitly enables the database indexing switch after reviewing cohorts.
- `BLOCKED` — Supabase still reports the pre-existing critical advisory that
  `public.location_configuration` has RLS disabled. The suggested remediation
  is `ALTER TABLE public.location_configuration ENABLE ROW LEVEL SECURITY;`,
  but it was not applied because approved policies are required first.
- `UNREVIEWED` — Search Console submission/monitoring, editorial threshold
  tuning, and sitemap splitting remain deferred until production activation.

### Exact continuation point

The next session should read this file first and, only after production
environment values and policy approval are supplied, validate the deployed
origin, run a final eligible-cohort review, and explicitly decide whether to
enable public indexing. Preserve the default-off switch, aggregate-only
projection, target-qualified graph, canonical redirects, eligible-only
 sitemap, bounded snapshots, and fixed dynamic route families.

### PASS 20 status

`VERIFIED` — Activation-readiness scope complete; production activation is
blocked on deployment configuration, operator approval, and the unrelated RLS
policy decision.

## PASS 21 — FULL BROWSER QA (2026-09-05)

### Scope

`RE-REVIEW REQUIRED` — Human-style browser QA of the running application,
covering registration, onboarding, authentication, profile persistence,
discovery, introductions, messaging, Snail Mail, notifications, reporting,
moderation, support, admin overview, analytics, refresh/back-forward behavior,
and visible error states. No unrelated redesign was performed.

### Completed areas

- `VERIFIED` — Created a disposable local QA account, completed email-confirmed
  sign-in, and completed onboarding from Basics through Languages and Interests.
- `VERIFIED` — Required onboarding data persisted across refreshes; direct
  navigation to Discover redirected incomplete users back to setup; completed
  users entered the normal app and did not re-enter onboarding after logout/login.
- `VERIFIED` — Profile edit (bio) persisted to the public profile after save and
  refresh. Username was generated from the display name as expected.
- `VERIFIED` — Email and username sign-in, sign-out, invalid credentials, and
  normal-user versus staff navigation/visibility behaved correctly.
- `VERIFIED` — Discover filters, clear/apply behavior, profile opening, empty
  state, and clean URL/query state worked.
- `VERIFIED` — Introduction send, dynamic recipient-aware placeholder, minimum
  50-character/8-word button gating, duplicate prevention, recipient acceptance,
  and conversation creation worked end to end.
- `VERIFIED` — Chat reply appeared immediately and survived refresh; unread
  notification routed to the conversation and was cleared when opened.
- `VERIFIED` — Snail Mail composer, send, in-transit state, and recipient-side
  sealed-letter presentation worked. Photo-request unavailable state was clear.
- `VERIFIED` — Reporting created a real report and moderation case; duplicate
  report throttling worked. Admin claimed, noted, and resolved the case, with
  internal notes remaining staff-only in the user conversation view.
- `VERIFIED` — Staff Support Inbox, user support form validation, requests list,
  ticket detail, and existing secure attachment preview/lightbox (including
  Escape close and metadata) rendered and routed correctly.
- `VERIFIED` — Admin overview and Analytics rendered live data; Analytics range
  selection changed the URL and displayed values. Desktop screenshots showed no
  visual regressions in the exercised screens.

### Verified issue found and fixed

- `ISSUE FOUND` → `FIXED` → `VERIFIED` — The user Support server-action form
  redundantly set `encType="multipart/form-data"`, producing a Next.js warning
  because server actions provide multipart encoding automatically. Removed the
  redundant attribute in `src/app/app/support/page.tsx`; the form still renders
  correctly and the warning no longer appears.

### Verification performed

- `VERIFIED` — Browser console error/warning snapshot was empty after the final
  QA flow. Server-side report, case, assignment, note, status, introduction,
  message, notification, and profile persistence were confirmed through refresh
  and subsequent account views.
- `VERIFIED` — `pnpm typecheck` passed.
- `VERIFIED` — `pnpm lint` passed.
- `VERIFIED` — `pnpm build` passed; all existing dynamic routes compiled.
- `RE-REVIEW REQUIRED` — Full `pnpm test` completed with 509/513 passing. The
  same four local-fixture-dependent failures remain from earlier review passes:
  `account-deactivation-authority`, `moderation-admin-escalation`,
  `moderator-conversation-review-assignment`, and `privacy-lifecycle-wiring`.

### Unresolved / blocked items

- `BLOCKED` — Mobile/tablet viewport resizing could not be exercised because
  the available in-app browser control exposes no viewport override; desktop
  behavior was inspected.
- `BLOCKED` — A fresh Support submission with a newly uploaded attachment was
  not created in this pass. The existing Support form, validation, staff inbox,
  ticket detail, and attachment viewer were tested; the confirmed QA records
  were limited to onboarding, introductions, chat, notifications, and report
  workflows.
- `RE-REVIEW REQUIRED` — Local account switching occasionally logs Supabase
  `Invalid Refresh Token: Refresh Token Not Found`; sign-in recovered and no
  user-visible flow failed. Re-test with production cookie/session settings.
- `BLOCKED` — Production email/SMTP and deployment-only configuration cannot be
  verified in this local environment; the four fixture-dependent tests above
  require seeded live fixtures.

### Exact continuation point

If this QA pass resumes, first run the Support submission + attachment upload
flow with explicit test-record authorization, then repeat the same ticket in a
mobile-capable browser viewport. Re-run the four fixture-dependent tests against
their seeded fixtures and investigate refresh-token noise only if it reproduces
as a user-visible failure. Preserve the fixed Support server-action form and do
not alter unrelated design or behavior.

### PASS 21 status

`RE-REVIEW REQUIRED` — All authorized desktop user/staff flows exercised and
the only reproduced application warning in scope was fixed. Mobile viewport,
fresh support upload, production email/session behavior, and four pre-existing
fixture-dependent tests remain for a later targeted pass.

### PASS 22 — COPY PASS 1

Scope: user-facing voice and terminology across the existing site. No layout,
styling, functionality, backend, or product behavior changes were made.

- `VERIFIED` — Reviewed the rendered Discover, Introductions, Messages,
  Notifications, Settings, and Support screens plus the related authentication,
  profile, account, messaging, and staff copy in source.
- `FIXED` → `VERIFIED` — Reworded the stale Staff Support Inbox empty state to
  describe incoming requests accurately; broadened the Notifications subtitle
  from “important requests” to “important updates”; changed “Reverify” to
  “Verify again”; and clarified inactive-account, age-correction, and Snail
  Mail wording.
- `FIXED` → `VERIFIED` — Replaced terse messaging, photo-access, introduction,
  letter, and profile-action fallback errors with calm, direct guidance that is
  easier to understand and safely URL-encoded.
- `VERIFIED` — `pnpm typecheck` and `pnpm lint` passed after the copy edits.
- `VERIFIED` — Browser re-checks showed the updated Notifications and Support
  copy, Settings terminology, and Discover rendering; browser console errors
  and warnings were empty.

### PASS 22 status

`VERIFIED` — Copy baseline pass complete. No known copy-only blockers remain in
the reviewed flows; broader content rewrites remain intentionally out of scope.

### PASS 23 — COPY PASS 2

Scope: headings, subheadings, and introductory copy across the existing
user-facing and staff-facing flows. No layout, styling, functionality,
backend, or product behavior changes were made.

- `FIXED` → `VERIFIED` — Replaced vague landing, Discover, Admin Center, and
  analytics headings with descriptive wording that makes each page's purpose
  clear when scanned.
- `FIXED` → `VERIFIED` — Clarified Support and Notifications section headings
  and explanatory copy, including the preferences panel and request form.
- `FIXED` → `VERIFIED` — Clarified profile setup section hierarchy and nested
  labels (About you, spoken and learning languages, interests, connection
  preferences, and connection destinations).
- `FIXED` → `VERIFIED` — Removed the repeated interest-catalogue paragraph
  inside the reusable profile interest selector so the section no longer
  presents the same instruction twice.
- `VERIFIED` — `pnpm typecheck` passed after the copy edits.
- `VERIFIED` — `pnpm lint` passed after the copy edits.
- `VERIFIED` — Browser screenshots and accessibility-tree checks confirmed the
  updated landing, Discover, Support, Notifications, and Profile Setup copy
  fits the existing layout. Browser error and warning logs were empty.

### PASS 23 status

`VERIFIED` — Headings and content hierarchy pass complete. The existing visual
system, routes, functionality, and backend behavior remain unchanged.

### PASS 24 — COPY PASS 3

Scope: body copy across existing user-facing, staff-facing, onboarding, and
public SEO surfaces. No layout, styling, functionality, backend, or product
behavior changes were made.

- `FIXED` → `VERIFIED` — Shortened authentication, recovery, onboarding,
  settings, support, messaging, Snail Mail, notifications, and Discover copy
  while preserving the existing instructions and product meaning.
- `FIXED` → `VERIFIED` — Removed repeated or overly promotional phrasing in
  profile setup, notification fallback text, support guidance, and the
  introductions explainer.
- `FIXED` → `VERIFIED` — Simplified public SEO community descriptions and
  statistic explanations without changing the underlying data or claims.
- `FIXED` → `VERIFIED` — Tightened staff queue descriptions for faster scanning
  while retaining the same routes and permissions.
- `VERIFIED` — `pnpm typecheck` passed after the copy edits.
- `VERIFIED` — `pnpm lint` passed after the copy edits.
- `VERIFIED` — Browser screenshots and accessibility-tree checks confirmed the
  updated Support, Settings, Messages, Introductions, Sign in, Sign up, and
  Profile Setup copy fits the existing layout. Browser error and warning logs
  were empty.

### PASS 24 status

`VERIFIED` — Body copy pass complete. No known copy-only blockers remain in the
reviewed flows; no design, routing, data, or functionality changes were made.

### PASS 25 — COPY PASS 4

Scope: microcopy across buttons, navigation labels, links, tabs, menus,
placeholders, confirmations, and other short user-facing and staff-facing
interface text. No layout, styling, routing, functionality, backend, or data
behavior changes were made.

- `FIXED` → `VERIFIED` — Clarified report actions and optional-detail
  placeholders so profile, introduction, and message reports name the thing
  being reported and explain the optional field.
- `FIXED` → `VERIFIED` — Changed the conversation overflow label to “More
  actions,” made the photo control read “Revoke access,” and made the
  onboarding progress labels name the required language and interest steps.
- `FIXED` → `VERIFIED` — Replaced generic staff actions with specific labels
  (“Apply filters,” “Apply date range,” “All statuses,” and “Reject
  correction”), clarified the support-ticket search placeholder, and
  capitalized the Discover CTA consistently.
- `VERIFIED` — `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed after the
  copy edits.
- `VERIFIED` — The focused support submission test passed. The full legacy
  `pnpm test` suite still has unrelated pre-existing fixture and exact-copy
  expectation failures from earlier review passes; those are recorded as
  `RE-REVIEW REQUIRED` rather than treated as verified regressions from this
  pass.
- `VERIFIED` — Browser screenshots and accessibility-tree checks confirmed the
  updated introductions, profile report, conversation actions, support form,
  staff Users, staff Support Inbox, staff Analytics, and onboarding screens.
  Browser error and warning logs were empty.

### PASS 25 status

`VERIFIED` — Microcopy pass complete. The reviewed controls now use specific,
consistent everyday wording while preserving their existing placement,
behavior, and visual system. The unrelated full-suite test failures remain
`RE-REVIEW REQUIRED` in the validation notes above.

### PASS 26 — COPY PASS 5 — FORMS + GUIDANCE

Scope: form labels, onboarding/profile-edit guidance, validation and error
messages, placeholders, and staff filtering instructions. No required fields,
validation rules, onboarding logic, privacy behavior, routes, layout, styling,
backend, or data behavior were changed.

- `FIXED` → `VERIFIED` — Profile writing guidance now gives a concrete,
  conversation-friendly prompt (what the member enjoys, is curious about, or
  wants to discuss) while keeping the bio optional.
- `FIXED` → `VERIFIED` — Optional profile selectors now say “Select an option
  (optional)” instead of the vague “Choose if you’d like”; destination removal
  now identifies the exact item action as “Remove destination”.
- `FIXED` → `VERIFIED` — Profile-save and malformed-selection errors now name
  the affected profile data and tell the member how to recover (try again or
  choose the values again), without changing server validation.
- `FIXED` → `VERIFIED` — Support submission/reply controls and prompts now
  identify the support request/team directly; email-confirmation resend copy
  identifies the address to enter; administrator reason fields explain that a
  change must be justified.
- `FIXED` → `VERIFIED` — Staff queue controls now identify the filter being
  applied (inbox, case, report, status, or audit filters), and the Settings
  save action names the privacy/display settings it updates.
- `VERIFIED` — Browser checks covered the rendered Support form, user-facing
  Support ticket reply, Profile Setup basics/language/interests/preferences,
  Settings, Sign up, Check email, Staff Support ticket, and Staff Reports
  screens. Required-field submission blocking remained active and the updated
  copy appeared in the accessibility tree/screenshots.
- `VERIFIED` — Targeted form/profile/support/admin tests passed (23/23),
  `pnpm typecheck` passed, `pnpm lint` passed, and `pnpm build` passed.
- `VERIFIED` — A preliminary attempt to pass an unsupported test-name filter
  through the package test script was discarded; the intended targeted test
  files were then run directly with `node --test` and passed.
- `VERIFIED` — Final browser checks showed no runtime errors. A pre-existing
  Next.js LCP warning for the profile avatar appeared while viewing setup;
  it is performance guidance outside this copy-only scope and was not changed.

### PASS 26 status

`VERIFIED` — Forms and guidance copy pass complete. The full legacy test suite
still contains the previously recorded fixture/exact-copy failures and remains
`RE-REVIEW REQUIRED`; no new behavior or validation regression was introduced
by this pass.

### PASS 27 — COPY PASS 6 — TRUST + SAFETY COPY

Scope: privacy, reporting, blocking, moderation, verification, account
controls, safety, and related user/staff-facing trust copy. This pass changed
copy only; moderation, verification, privacy, security, permissions, routes,
backend behavior, and data behavior were not changed.

- `FIXED` → `VERIFIED` — Profile, introduction, and message report controls
  now name the reported item, explain the optional details field, and use
  specific submit labels. Existing report values and actions are unchanged.
- `FIXED` → `VERIFIED` — Blocking controls now say “Block user” / “Unblock
  user”; the confirmation state explains that the person will no longer be
  able to view the profile or make contact and can be unblocked later.
- `FIXED` → `VERIFIED` — Settings, reactivation, verification, data-export,
  and account controls now state the consequence or recovery path directly,
  including permanent deletion and administrator-account limits.
- `FIXED` → `VERIFIED` — Administrator account-status, role, profile-content
  removal, and age-appeal confirmations now explain the access or moderation
  consequence before the existing confirmation is accepted.
- `VERIFIED` — Browser accessibility-tree and screenshot checks covered the
  live Settings, profile action menu/report form, blocked-users page, Admin
  user detail, and Age appeals queue. The updated wording fits the existing
  layout; no trust/safety browser console errors or warnings were observed.
- `VERIFIED` — Targeted trust/safety tests passed (59/60 tests across
  the selected files). The single failure is the previously known local
  database-guard check (`direct profile UPDATE unexpectedly succeeded`), an
  environment/schema-state blocker unrelated to these copy edits.
- `VERIFIED` — `pnpm typecheck`, `pnpm lint`, and `pnpm build` all passed after
  the final copy change.
- `RE-REVIEW REQUIRED` — Two older exact-copy tests still expect text changed
  in earlier copy passes (`external-verification-providers` and
  `introductions-presentation`); they were already failing before this pass
  and were not reverted because doing so would undo the earlier approved copy
  improvements.

### PASS 27 status

`VERIFIED` — Trust and safety copy pass complete. No logic or backend changes
were made. The next session should begin with PASS 28 and re-review any
remaining copy surfaces only if the scope explicitly includes them.

### PASS 28 — COPY PASS 7 — PEOPLE-FIRST SEO COPY

Scope: natural SEO alignment for existing public and user-facing copy. No
routing, technical SEO infrastructure, design, layout, functionality,
backend, or data behavior changed.

- `FIXED` → `VERIFIED` — Updated the shared public title and social metadata
  to clearly describe finding pen pals and international friends while
  retaining the Pen-Pals.net brand.
- `FIXED` → `VERIFIED` — Added “international pen pals” to the homepage and
  sign-up descriptions where it accurately explains the service, without
  changing the existing headline or layout.
- `FIXED` → `VERIFIED` — Added a short, natural shared-interests cue to the
  Discover description; the original “Browse member profiles from around the
  world.” sentence remains intact for continuity.
- `VERIFIED` — Existing public SEO surface titles, headings, provenance copy,
  related links, and calls to action already use accurate “pen pals,”
  “language,” “interest,” and Pen-Pals.net community wording; no filler or
  keyword-stuffed copy was added there.
- `VERIFIED` — Browser accessibility-tree and screenshot checks covered the
  homepage, Discover, and sign-up pages after the changes. The new title and
  descriptions fit the current layout, and browser error/warning logs were
  empty.
- `VERIFIED` — SEO graph tests passed. The broader frontend consistency suite
  still reports two previously known exact-copy expectations from earlier
  passes (Discover and friendship-destination wording); they are not caused
  by this pass and remain `RE-REVIEW REQUIRED`.
- `VERIFIED` — `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed after the
  final copy edits.

### PASS 28 status

`VERIFIED` — People-first SEO copy pass complete. The next session should
begin with PASS 29 at the next explicitly requested copy or review scope.

### PASS 29 — COPY PASS 8 — FINAL COPY QA

Scope: final site-wide copy QA only. This pass reviewed rendered user and
staff/admin surfaces plus source copy for terminology drift, duplicated text,
unclear actions, inconsistent capitalization, awkward wording, and leftover
development placeholders. No layout, styling, routing, backend, or product
behavior was changed.

- `FIXED` → `VERIFIED` — Introductions now uses one concise explanation for
  first notes; the repeated sentence was removed while the workflow remains
  unchanged.
- `FIXED` → `VERIFIED` — Report-reason choices across introduction, message,
  and profile report forms now display clear title-cased labels while keeping
  their existing submitted values and behavior.
- `FIXED` → `VERIFIED` — Staff case/report filters and visible report labels
  now use human-readable title case instead of raw lowercase enum values.
- `FIXED` → `VERIFIED` — Staff Support Inbox category labels now match the
  user-facing support terminology (for example, “Account & login” and
  “Messages”).
- `FIXED` → `VERIFIED` — Admin Inbox empty-state copy now explains the
  escalation requirement plainly and avoids internal jargon.
- `FIXED` → `VERIFIED` — The moderation case evidence error state no longer
  repeats its heading; it gives one direct recovery instruction.
- `VERIFIED` — Browser checks covered the homepage, sign-in/sign-up and
  recovery screens, Discover, Introductions, Messages, Support, notifications,
  profile/settings/setup, SEO routes, and staff/admin overview, case, report,
  support, analytics, user, age-appeal, audit, and Admin Inbox screens. The
  updated wording fit the existing layouts; representative browser error and
  warning logs were empty.
- `VERIFIED` — Source scan found no leftover user-facing lorem ipsum,
  development placeholder, “coming soon,” or similar unfinished copy.
- `VERIFIED` — `pnpm typecheck`, `pnpm lint`, `pnpm build`, and the SEO graph
  tests passed after the copy edits.
- `RE-REVIEW REQUIRED` — Three legacy exact-copy assertions still expect
  wording intentionally changed in earlier copy passes (Discover headline /
  subtitle and the public destination heading). They are stale test fixtures,
  not runtime failures, and were not reverted.

### PASS 29 status

`VERIFIED` — Final copy QA complete. No backend, data, permission, or visual
redesign changes were made. The next session should begin with PASS 30 and
re-review only the explicitly requested next scope; retain the three stale
copy-test expectations above for later test-fixture review.

### PASS 30 — FRONT PAGE DESIGN PASS 1 — HERO FOUNDATION

Scope: public front page hero composition only. Existing header/navigation,
copy, routing, SEO metadata, backend behavior, and unrelated pages were left
unchanged.

- `FIXED` → `VERIFIED` — Added a lightweight decorative bird carrying the
  existing Pen-Pals envelope/globe/heart mark, with a dashed flight path and
  brand navy/sky palette. The motif is aria-hidden, pointer-free, and uses
  transform-based motion with the existing reduced-motion fallback.
- `FIXED` → `VERIFIED` — Tightened the hero's vertical rhythm and desktop
  column balance to create the requested upper-middle breathing room while
  preserving the existing headline, CTA pair, stats, and conversation preview.
- `VERIFIED` — Browser screenshot and accessibility checks at the available
  1238×912 viewport show the new motif clearly without overlap or horizontal
  overflow. The page still exposes the same navigation and actions, and
  browser error/warning logs are empty.
- `VERIFIED` — `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed after
  the hero changes.

### PASS 30 status

`VERIFIED` — Hero foundation complete. No backend, routing, SEO, or unrelated
page changes were made. The next session should begin with PASS 31 only if a
newly scoped front-page design or visual review is requested.

### PASS 31 — FRONT PAGE DESIGN PASS 2 — BIRD MOTIF

Scope: refinement of the public front-page bird-and-letter motif only. No
navigation, copy, routing, SEO, backend, or unrelated page changes were made.

- `FIXED` → `VERIFIED` — Refined the SVG bird silhouette with a subtle body
  outline, restrained drop shadow, and lighter visual weight so it reads as an
  elegant flourish rather than a mascot.
- `FIXED` → `VERIFIED` — Reduced and shifted the motif slightly right so the
  flight path leads toward the conversation card while preserving clear space
  around the headline, CTAs, navigation, and card.
- `VERIFIED` — Browser screenshot and geometry checks show a 9px visual gap
  above the card and zero horizontal overflow at the available 1238×912
  viewport. Browser error/warning logs are empty.
- `VERIFIED` — `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed after
  the refinement.

### PASS 31 status

`VERIFIED` — Bird motif refinement complete. The next session should begin with
PASS 32 only if a new front-page scope is explicitly requested.

### PASS 32 — FRONT PAGE DESIGN PASS 3 — HERO POLISH

Scope: public front-page hero and conversation-preview composition only. No
copy, routing, SEO, backend, or unrelated page changes were made.

- `FIXED` → `VERIFIED` — Refined the conversation card's proportions, border
  treatment, radii, warm glow, and shadow while retaining all existing content.
- `FIXED` → `VERIFIED` — Aligned the CTA row vertically and kept the bird,
  headline, and card in a clear visual sequence.
- `VERIFIED` — Browser screenshot and geometry checks show the card, bird, and
  headline balanced with no overlap or horizontal overflow at the available
  1238×912 viewport. Browser error/warning logs are empty.
- `VERIFIED` — `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed after
  the refinement.

### PASS 32 status

`VERIFIED` — Hero polish complete. The next session should begin with PASS 33
only if a new front-page scope is explicitly requested.

### PASS 33 — FRONT PAGE DESIGN PASS 4 — MOTION + RESPONSIVE

Scope: public front-page hero motion and responsive behavior only. No
navigation, copy, routing, SEO, backend, or unrelated page changes were made.

- `FIXED` → `VERIFIED` — Added a separate, low-amplitude animation for the
  decorative dashed flight trail. The existing bird float remains
  transform-based, and the trail uses only dash-offset and opacity so the
  composition stays calm without changing layout.
- `VERIFIED` — The bird remains `pointer-events: none`, is positioned outside
  document flow, and stays hidden below the existing large-screen breakpoint;
  this preserves the clean stacked mobile/tablet composition without adding
  decorative crowding or horizontal overflow. Reduced-motion behavior remains
  covered by the existing global `prefers-reduced-motion` fallback.
- `VERIFIED` — Browser screenshot, geometry, motion-over-time, and diagnostic
  checks at the available 1238×912 viewport show no obstruction, layout shift,
  or overflow. The bird and trail are visible and moving subtly; browser
  error/warning logs are empty. Narrower layouts continue to use the existing
  breakpoint-based simplification (the browser tool exposed only this desktop
  viewport for direct rendering in this pass).
- `VERIFIED` — `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed after the
  motion/responsive changes.

### PASS 33 status

`VERIFIED` — Motion and responsive polish complete. The next session should
begin with PASS 34 only if a new front-page scope is explicitly requested.

### PASS 34 — FRONT PAGE DESIGN PASS 5 — FINAL VISUAL QA

Scope: final design-only QA of the public front page. No backend, SEO,
authentication, application logic, or unrelated page changes were made.

- `VERIFIED` — Reviewed the complete rendered composition in the browser:
  header alignment, hero spacing, headline wrapping, CTA hierarchy, bird
  placement/scale, envelope visibility, flight-path restraint, card
  proportions, typography, borders, shadows, glow, and visual balance all
  remain coherent with the approved concept and current brand.
- `VERIFIED` — Browser geometry checks at the available 1238×912 viewport show
  zero horizontal or vertical overflow; the decorative bird stays clear of
  text and controls. The existing breakpoint continues to hide the motif on
  narrower layouts, preserving the stacked responsive interpretation.
- `VERIFIED` — Confirmed the bird and trail animations remain subtle over time,
  the existing reduced-motion stylesheet rule is present, the branded
  envelope asset renders, and keyboard focus produces the intended visible
  navy outline without affecting layout.
- `VERIFIED` — Browser error/warning logs are empty. No further visual
  correction was warranted in this pass.

### PASS 34 status

`VERIFIED` — Final front-page visual QA complete. The next session should begin
with PASS 35 only if a new front-page scope is explicitly requested.

### PASS 35 — FRONT PAGE DESIGN PASS 6 — SUBTLE MOTION

Scope: front-page animation and interaction polish only. No page structure,
copy, backend, SEO, authentication, or unrelated functionality was changed.

- `FIXED` → `VERIFIED` — Added a short, transform/opacity-only entrance for
  the hero copy and conversation card with a restrained stagger (80ms / 180ms)
  and eased timing. The final layout boxes remain unchanged after entrance.
- `FIXED` → `VERIFIED` — Added a very small independent bob/tilt to the
  carried branded letter and a 1px motion-safe hover lift for the primary CTA.
  The existing bird drift and trail motion remain slow and low-amplitude.
- `VERIFIED` — Watched the composition across multiple animation cycles in
  the browser. Motion stayed calm, the letter remained legible, no element
  intercepted decorative interactions, and geometry/overflow stayed stable at
  the available 1238×912 viewport.
- `VERIFIED` — Added explicit reduced-motion overrides for every new
  front-page animation; reduced-motion users receive a static hero. Browser
  error/warning logs are empty after reload.
- `VERIFIED` — `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed after the
  motion changes.

### PASS 35 status

`VERIFIED` — Subtle motion and interaction polish complete. The next session
should begin with PASS 36 only if a new front-page scope is explicitly
requested.

### PASS 36 — BIRD MOTIF VISUAL CORRECTION — SCREENSHOT-DRIVEN QA

Scope: the decorative bird, branded letter, and flight path on the public
front page only. Hero copy, CTAs, conversation-card content, navigation,
backend, SEO, routing, and application logic were left unchanged.

- `ISSUE FOUND` → `FIXED` → `VERIFIED` — The previous assembled SVG read as
  clip-art: its body was too bulky, the head/body transition was abrupt, the
  wings and tail did not share a clear silhouette, and the envelope dominated
  the mark.
- `FIXED` → `VERIFIED` — Reconstructed the bird as a lightweight flowing
  silhouette with two tapered wings, a compact tapered tail, a slimmer curved
  body, and a cleaner integrated head/beak transition. The official
  envelope/globe/heart icon remains in use as a secondary carried mark.
- `ISSUE FOUND` → `FIXED` → `VERIFIED` — The original trail/spiral felt
  accidental. Replaced it with one smooth dashed flight arc and one restrained
  heart accent, with no overlapping scribble.
- `FIXED` → `VERIFIED` — Increased only the carried icon modestly after the
  second screenshot so the globe/heart remains recognizable at normal size
  without becoming the focal point.
- `VERIFIED` — Completed three screenshot-driven refinement iterations after
  the baseline capture (silhouette redraw, trail simplification, envelope
  scale adjustment), plus a final settled screenshot. Each meaningful revision
  was rendered and visually inspected in the browser against the approved
  reference and surrounding Pen-Pals composition.
- `VERIFIED` — Final browser screenshot shows a balanced bird/path position in
  the hero whitespace, a readable but secondary envelope, no obstruction of
  the headline or card, and zero horizontal/vertical overflow at the available
  1238×912 viewport. Browser error/warning logs are empty.
- `VERIFIED` — `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed after the
  final SVG revision.

### PASS 36 status

`VERIFIED` — Screenshot-driven bird motif correction complete. The next session
should begin with PASS 37 only if a new front-page scope is explicitly
requested.

### PASS 37 — PASS 2 — IMPLEMENT PROFILE BUILDER

Scope: automatic graded Profile Builder badge integration only. The existing
Penpal Veteran, Verified, and manually assigned badge behavior remains in
place; no unrelated application features were changed.

- `FIXED` → `VERIFIED` — Removed the retired `Looking for` field from the
  authoritative TypeScript completion percentage and preferences predicate.
  Current completion now uses the ten active product fields: username,
  display name, birth date, gender, location, bio, quote, languages,
  interests, and photo.
- `FIXED` → `VERIFIED` — Added centralized Profile Builder grade metadata to
  `profile_badge_definitions`, including the enforced entry predicate for
  Bronze and 75/90/100 completion thresholds for Silver, Gold, and Platinum.
- `FIXED` → `VERIFIED` — Added private server-side entry/completion helpers and
  a highest-grade-only Profile Builder projection. Public and staff badge RPCs
  now include at most one derived Profile Builder grade alongside existing
  derived and manual badges.
- `FIXED` → `VERIFIED` — Added the four Profile Builder keys, labels, and a
  native shared visual tone to `ProfileBadge`.
- `VERIFIED` — Targeted boundary tests cover below minimum, minimum only,
  below 75%, exact 75%, exact 90%, exact 100%, and a complete seeded profile
  with the legacy field blank; the projection returns exactly one Profile
  Builder grade.
- `VERIFIED` — `pnpm schema:verify`, `pnpm typecheck`, `pnpm lint`, and
  `pnpm build` all passed. Schema lint retains only the two pre-existing
  unused-variable warnings in activity-rank and Snail Mail helpers.
- `BLOCKED` — The full `pnpm test` suite still reports 20 unrelated existing
  failures (deactivation, Discover, verification, notifications, moderation,
  photo, and Snail Mail fixtures). The new Profile Builder tests pass in the
  full run; no failure points to this pass.

### PASS 37 status

`VERIFIED` — Profile Builder implementation and targeted validation complete.
The next session should begin with PASS 38 only if a new badge scope is
explicitly requested; the unrelated full-suite failures remain recorded for
their own re-review.

### PASS 38 — PASS 3 — IMPLEMENT ACTIVE PENPAL

Scope: automatic graded Active Penpal badge integration only. Existing
Verified, Penpal Veteran, Profile Builder, manual badge behavior, and the
activity-rank system remain unchanged.

- `FIXED` → `VERIFIED` — Added centralized Active Penpal grade metadata to
  `profile_badge_definitions` for 30, 90, 365, and 730 distinct active days.
- `FIXED` → `VERIFIED` — Added private server-side helpers that count only
  distinct `activity_rank_events.occurred_at::date` rows where
  `event_type = 'active_day'`, preserving the activity system's date-keyed
  idempotency and excluding account age or other event types.
- `FIXED` → `VERIFIED` — Extended the existing public and staff badge
  projections with exactly one highest Active Penpal grade, preserving all
  previous badge families and manual-assignment protections.
- `FIXED` → `VERIFIED` — Added Active Penpal keys, labels, calendar icon, and
  shared visual tone to `ProfileBadge`.
- `VERIFIED` — Targeted tests cover 29/30, 89/90, 364/365, and 729/730
  boundaries, an actual 30-day activity projection, and a profile with no
  active-day events to confirm account age alone produces no badge.
- `VERIFIED` — `pnpm schema:verify`, `pnpm typecheck`, `pnpm lint`, and
  `pnpm build` all passed. Schema lint retains only the two pre-existing
  unused-variable warnings in activity-rank and Snail Mail helpers.
- `BLOCKED` — The full `pnpm test` run reports 525 tests with 505 passing and
  the same 20 unrelated failures recorded in the prior pass; Active Penpal,
  Profile Builder, and related activity-rank tests pass.

### PASS 38 status

`VERIFIED` — Active Penpal implementation and targeted validation complete.
The next session should begin with PASS 39 only if another badge scope is
explicitly requested.

### PASS 39 — PASS 4 — IMPLEMENT CORRESPONDENT

Scope: automatic graded Correspondent badge integration only. Existing
Verified, Penpal Veteran, Profile Builder, Active Penpal, manual badge
behavior, and introduction lifecycle behavior remain in scope for regression
protection but are not redesigned.

`IN PROGRESS` — Traced `conversation_introductions`: the current schema has
`pending`, `replied`, `declined`, and `expired` states; `reply_to_introduction`
atomically creates the conversation and changes a pending introduction to
`replied`. This `replied` transition is the authoritative acceptance state.

- `FIXED` → `VERIFIED` — Added centralized Correspondent grade metadata to
  `profile_badge_definitions` for 10, 30, 150, and 500 successful outgoing
  introductions/conversations, plus a sender/status index for the projection
  query.
- `FIXED` → `VERIFIED` — Added private server-side helpers that count only
  distinct `conversation_introductions` sent by the target user whose current
  lifecycle status is `accepted` or `replied` (the live schema currently uses
  `replied` for acceptance). Duplicate rows sharing a conversation id count
  once; incoming rows are excluded.
- `FIXED` → `VERIFIED` — Extended both secure public and staff profile-badge
  projections with exactly one highest Correspondent grade, preserving the
  existing Verified, Veteran, Profile Builder, Active Penpal, and manual
  badge paths.
- `FIXED` → `VERIFIED` — Added Correspondent definitions and a shared visual
  tone to `ProfileBadge`; manual staff assignment remains limited to the
  existing non-derived badge keys.
- `VERIFIED` — Targeted tests cover 9/10, 29/30, 149/150, 499/500, above
  Platinum, incoming accepted rows, duplicate same-conversation rows, an
  actual ten-row projection, and helper permission boundaries.
- `VERIFIED` — Local migration push, `pnpm schema:verify`, `pnpm typecheck`,
  `pnpm lint`, and `pnpm build` all passed. Schema lint retains only the two
  pre-existing unused-variable warnings in activity-rank and Snail Mail
  helpers.
- `BLOCKED` — The full `pnpm test` run reports 529 tests with 509 passing and
  20 unrelated pre-existing failures (the same deactivation, Discover,
  verification, notifications, moderation, photo, and Snail Mail/intro
  fixture failures recorded in earlier passes). Correspondent and all prior
  badge tests pass.
- `VERIFIED` — The final full-suite rerun after the compatibility migration
  produced the same 529/509/20 result; no new failure is attributable to this
  pass.

### PASS 39 status

`VERIFIED` — Correspondent implementation and targeted validation complete.
The next session should begin with PASS 40 only if another badge scope is
explicitly requested; the unrelated full-suite failures remain recorded for
their own re-review.

### PASS 40 — PASS 6 — IMPLEMENT CONNECTOR

Scope: automatic graded Connector badge integration only. Existing Verified,
Penpal Veteran, Profile Builder, Active Penpal, Correspondent, manual badge
behavior, and conversation membership behavior remain in scope for regression
protection but are not redesigned.

`IN PROGRESS` — Traced the authoritative `conversation_participants` primary
key and existing membership paths. A contact is any distinct participant in a
conversation with the target user other than the target; messages and total
conversation count are not used.

- `FIXED` → `VERIFIED` — Added centralized Connector metadata to
  `profile_badge_definitions` for 25, 75, 150, and 300 unique contacts.
- `FIXED` → `VERIFIED` — Added a private server-side count over conversation
  memberships using distinct other user ids, plus a `(user_id,
  conversation_id)` index for the target lookup.
- `FIXED` → `VERIFIED` — Added a highest-grade helper and extended both secure
  public and staff profile-badge projections while preserving all previous
  derived and manual badge families.
- `FIXED` → `VERIFIED` — Added Connector keys, people icon, and shared visual
  tone to `ProfileBadge`.
- `VERIFIED` — Targeted tests cover 24/25, 74/75, 149/150, and 299/300
  boundaries, repeated conversations with one contact, and a second distinct
  contact.
- `VERIFIED` — Local migration push, `pnpm schema:verify`, `pnpm typecheck`,
  `pnpm lint`, and `pnpm build` all passed. Schema lint retains only the two
  pre-existing unused-variable warnings in activity-rank and Snail Mail
  helpers.
- `BLOCKED` — The full `pnpm test` run reports 533 tests with 513 passing and
  20 unrelated pre-existing failures (the same deactivation, Discover,
  verification, notifications, moderation, photo, and Snail Mail/intro
  fixture failures recorded in earlier passes). Connector and all prior badge
  tests pass.
- `VERIFIED` — The final full-suite rerun produced the same 533/513/20 result;
  no new failure is attributable to Connector.

### PASS 40 status

`VERIFIED` — Connector implementation and targeted validation complete.
The next session should begin with PASS 41 only if another badge scope is
explicitly requested; the unrelated full-suite failures remain recorded for
their own re-review.

### PASS 41 — PASS 7 — IMPLEMENT SNAIL MAILER

Scope: automatic graded Snail Mailer badge integration only. Existing Verified,
Penpal Veteran, Profile Builder, Active Penpal, Correspondent, Connector,
manual badge behavior, secure projections, and Snail Mail lifecycle behavior
remain in scope for regression protection but are not redesigned.

`IN PROGRESS` — Tracing the authoritative `snail_mail_letters` lifecycle and
delivery/read semantics before adding the centralized thresholds and private
server-side metric.

- `FIXED` → `VERIFIED` — Added centralized Snail Mailer metadata to
  `profile_badge_definitions` for 15, 30, 100, and 250 unique delivered
  letters, marked system-derived and excluded from manual assignment.
- `FIXED` → `VERIFIED` — Added a private server-side count over the existing
  `snail_mail_letters` lifecycle, scoped to `sender_id`, `delivered_at is not
  null`, and `cancelled_at is null`; `count(distinct id)` ensures a delivered
  and later read letter is counted once. A partial sender/delivery index keeps
  projection reads bounded to terminal letters.
- `FIXED` → `VERIFIED` — Added the highest-grade helper and extended both
  secure public and staff profile-badge projections without changing Verified,
  the five existing graded families, or manual badge behavior.
- `FIXED` → `VERIFIED` — Added Snail Mailer keys, heart icon, and the shared
  visual tone to `src/app/components/ProfileBadge.tsx`.
- `VERIFIED` — Targeted tests cover 14/15, 29/30, 99/100, 249/250, above
  Platinum, a delivered-and-read letter counted once, an undelivered letter
  ignored, the live public projection, and exactly-one projected grade.
- `VERIFIED` — The six existing graded-badge suites (Veteran, Profile Builder,
  Active Penpal, Correspondent, Connector, and Snail Mailer) pass together: 24
  tests passed. Existing Verified/manual projection behavior remains covered by
  the prior badge and security suites.
- `VERIFIED` — `pnpm schema:verify`, `pnpm typecheck`, `pnpm lint`, and
  `pnpm build` all passed. Schema lint retains only the two pre-existing
  unused-variable warnings in activity-rank and Snail Mail helpers.
- `BLOCKED` — The full `pnpm test` run reports 537 tests with 517 passing and
  the same 20 unrelated pre-existing failures recorded in prior passes
  (deactivation, Discover, verification, notifications, moderation, photo,
  and Snail Mail/intro fixtures). No failure is attributable to Snail Mailer
  or any badge suite.
- `RE-REVIEW REQUIRED` — The current repository has six automatic graded badge
  families (Veteran, Profile Builder, Active Penpal, Correspondent, Connector,
  and Snail Mailer); no Reliable Replier implementation or tests are present
  to validate as a seventh graded family. That separate earlier scope was not
  reintroduced during this Snail Mailer-only pass.

### PASS 41 status

`VERIFIED` — Snail Mailer implementation and badge regression validation
complete. The next session should begin with a newly requested scope; the
unrelated full-suite failures remain recorded for their own re-review.

### PASS 42 — PASS 5 — IMPLEMENT RELIABLE REPLIER

Scope: automatic graded Reliable Replier badge integration only. Existing
Verified, Penpal Veteran, Profile Builder, Active Penpal, Correspondent,
Connector, Snail Mailer, manual badge behavior, secure projections, and
response-statistics behavior remain in scope for regression protection.

- `FIXED` → `VERIFIED` — Added centralized Reliable Replier metadata to
  `profile_badge_definitions` for 70%, 80%, 90%, and 95% response rates, each
  requiring the existing five completed opportunities.
- `FIXED` → `VERIFIED` — Added a private highest-grade helper that reuses
  `get_response_stats`, preserving its first-response timing, seven-day window,
  privacy/report exclusions, and minimum sample semantics.
- `FIXED` → `VERIFIED` — Extended both secure public and staff projections with
  one highest Reliable Replier grade while preserving all earlier families and
  manual assignment protections.
- `FIXED` → `VERIFIED` — Added Reliable Replier keys, people icon, and shared
  visual tone to `src/app/components/ProfileBadge.tsx`.
- `VERIFIED` — Targeted tests cover below 70%, exactly 70/80/90/95%, above
  95%, below-sample suppression, live 5-opportunity/80% statistics, and a
  single projected grade.
- `VERIFIED` — All seven automatic badge-related suites now pass together:
  28/28 targeted tests across Veteran, Profile Builder, Active Penpal,
  Correspondent, Reliable Replier, Connector, and Snail Mailer.
- `VERIFIED` — `pnpm schema:verify`, `pnpm typecheck`, `pnpm lint`, and
  `pnpm build` all passed. Schema lint retains only the two pre-existing
  unused-variable warnings in activity-rank and Snail Mail helpers.

### PASS 42 status

`VERIFIED` — Reliable Replier implementation and seven-family badge
regression validation complete. The next session should begin with a newly
requested scope; unrelated full-suite failures remain recorded above.

### PASS 43 — PASS 6 — IMPLEMENT CONNECTOR (RE-VERIFICATION)

Scope: re-verify the Connector automatic graded badge against the current
post-Pass-5 badge architecture. No new migration or application change was
needed because the Connector implementation is already present in
`20260905270000_connector_badge.sql` and the shared `ProfileBadge` component.

- `VERIFIED` — Centralized system-derived Connector definitions remain seeded
  at 25, 75, 150, and 300 distinct contacts.
- `VERIFIED` — The server-side metric joins authoritative
  `conversation_participants` rows and counts distinct other `user_id` values;
  repeated conversations with the same person count once.
- `VERIFIED` — The secure public and staff badge projections return at most the
  highest qualifying Connector grade and preserve Verified, manual badges, and
  all earlier automatic families.
- `VERIFIED` — Connector targeted tests pass 4/4, including 24/25, 74/75,
  149/150, 299/300 boundaries and repeated-contact behavior.
- `VERIFIED` — The complete seven-family badge suite passes 28/28.
- `VERIFIED` — `pnpm schema:verify`, `pnpm typecheck`, `pnpm lint`, and
  `pnpm build` all pass. Schema lint reports only the two pre-existing
  unused-variable warnings in the activity-rank and Snail Mail helpers.

### PASS 43 status

`VERIFIED` — Connector implementation and regression validation are complete;
no code changes were required in this re-verification pass.

### PASS 44 — PASS 7 — IMPLEMENT SNAIL MAILER (RE-VERIFICATION)

Scope: re-verify the Snail Mailer automatic graded badge against the current
post-Pass-6 badge architecture. No new migration or application change was
needed because the implementation is already present in
`20260905280000_snail_mailer_badge.sql` and the shared `ProfileBadge`
component.

- `VERIFIED` — Centralized system-derived Snail Mailer definitions remain
  seeded at 15, 30, 100, and 250 delivered/read letters.
- `VERIFIED` — The server-side metric uses authoritative `snail_mail_letters`
  rows for the sending user, requires delivered state, excludes cancelled
  letters, and counts distinct letter ids so delivered-and-read letters count
  once.
- `VERIFIED` — The secure public and staff badge projections return at most the
  highest qualifying Snail Mailer grade and preserve Verified, manual badges,
  and all earlier automatic families.
- `VERIFIED` — Snail Mailer targeted tests pass 4/4, including 14/15, 29/30,
  99/100, 249/250 boundaries and delivered/read deduplication.
- `VERIFIED` — The complete seven-family badge suite passes 28/28.
- `VERIFIED` — `pnpm schema:verify`, `pnpm typecheck`, `pnpm lint`, and
  `pnpm build` all pass. Schema lint reports only the two pre-existing
  unused-variable warnings in the activity-rank and Snail Mail helpers.

### PASS 44 status

`VERIFIED` — Snail Mailer implementation and regression validation are
complete; no code changes were required in this re-verification pass.

### PASS 45 — PASS 8 — IMPLEMENT EARLY MEMBER

Scope: automatic graded Early Member badge integration using the centralized
official launch anchor and the Auth account creation timestamp. Existing
manual `early-member`, Verified, and all previous automatic badge families
remain preserved.

- `FIXED` → `VERIFIED` — Added the private centralized
  `penpals_official_launch_at()` helper with the official launch anchor
  `2026-09-01T00:00:00Z` and a positive `maximum_launch_age` definition field.
- `FIXED` → `VERIFIED` — Added system-derived Early Member definitions for
  Platinum (30 days), Gold (3 months), Silver (6 months), and Bronze (12
  months), returning only the highest qualifying window for accounts created
  on or after launch.
- `FIXED` → `VERIFIED` — Added server-side helpers that read
  `auth.users.created_at`, then extended both secure public and staff badge
  projections with one derived Early Member grade while retaining manual
  assignment behavior.
- `FIXED` → `VERIFIED` — Added shared `ProfileBadge` keys, labels, and tone
  metadata for all four Early Member grades.
- `VERIFIED` — Targeted tests cover inside and exactly at the 30-day, 3-month,
  6-month, and 12-month boundaries, the between-window cases, before-launch
  and after-12-month suppression, highest-grade selection, centralized launch
  configuration, and public/staff projection wiring (4/4 passed).
- `VERIFIED` — All eight automatic badge suites pass together: 32/32 tests
  across Early Member, Veteran, Profile Builder, Active Penpal, Correspondent,
  Connector, Snail Mailer, and Reliable Replier.
- `VERIFIED` — `pnpm schema:verify`, `pnpm typecheck`, `pnpm lint`, and
  `pnpm build` all pass. Schema lint retains only the two pre-existing
  unused-variable warnings in the activity-rank and Snail Mail helpers.

### PASS 45 status

`VERIFIED` — Early Member implementation and regression validation complete.
The existing ungraded `early-member` manual key remains available for staff;
automatic graded keys are system-derived and cannot be manually assigned.

### PASS 46 — PASS 9 — IMPLEMENT QUICK REPLIER

Scope: automatic graded Quick Replier badge integration using the existing
incoming response-opportunity population and response-statistics privacy/sample
rules. Existing Verified, manual, and all prior automatic badge families
remain preserved.

- `FIXED` → `VERIFIED` — Added centralized Quick Replier thresholds for
  maximum average first-response latency of 72, 24, 8, and 2 hours, each using
  the existing five completed-opportunity minimum.
- `FIXED` → `VERIFIED` — Added private server-side latency calculation over
  the same `conversation_introductions` population used by
  `get_response_stats`, including visibility, block/report exclusions,
  `replied`/`declined` handling, and immutable `handled_at - created_at`
  timing semantics.
- `FIXED` → `VERIFIED` — Extended secure public and staff badge projections
  with only the highest qualifying Quick Replier grade; no badge assignment
  rows are created.
- `FIXED` → `VERIFIED` — Added Quick Replier keys, labels, icon, and shared
  visual tone to `src/app/components/ProfileBadge.tsx`.
- `ISSUE FOUND` → `FIXED` — The first post-migration typecheck caught the new
  `quick-replier` tone missing from the shared `BadgeTone` union; the union and
  tone map were completed and the affected checks reran successfully.
- `ISSUE FOUND` → `FIXED` — Focused threshold review found the latency helper
  rounded averages before comparison, which could admit a value just above a
  threshold. It now returns the unrounded average for exact grade decisions;
  the targeted suite was rerun successfully.
- `VERIFIED` — Targeted tests cover exact and just-over 72/24/8/2-hour
  boundaries, insufficient samples, a live five-opportunity 72-hour average,
  highest-grade selection, projection count, and response-statistics wiring
  (4/4 passed).
- `VERIFIED` — All nine automatic badge suites pass together: 36/36 tests
  across Quick Replier, Early Member, Veteran, Profile Builder, Active
  Penpal, Correspondent, Connector, Snail Mailer, and Reliable Replier.
- `VERIFIED` — `pnpm schema:verify`, `pnpm typecheck`, `pnpm lint`, and
  `pnpm build` all pass. Schema lint retains only the two pre-existing
  unused-variable warnings in the activity-rank and Snail Mail helpers.

### PASS 46 status

`VERIFIED` — Quick Replier implementation and regression validation complete.

### PASS 47 — PASS 10 — IMPLEMENT ICEBREAKER

Scope: automatic graded Icebreaker badge integration using the existing
conversation introduction lifecycle records. Existing Verified, manual, and
all prior automatic badge families remain preserved.

- `FIXED` → `VERIFIED` — Added centralized Icebreaker definitions for Bronze,
  Silver, Gold, and Platinum at 10, 50, 200, and 500 introductions.
- `FIXED` → `VERIFIED` — Added private server-side counting over distinct
  `conversation_introductions.id` rows where the user is `sender_id`.
  Pending, replied, declined, and expired statuses—and acceptance—do not alter
  the raw sent count.
- `FIXED` → `VERIFIED` — Extended the secure public and staff profile-badge
  projections to return only the highest qualifying Icebreaker grade while
  preserving Verified, manual badges, and all earlier automatic families.
- `FIXED` → `VERIFIED` — Added shared ProfileBadge keys, labels, icon, and
  visual tone for all four Icebreaker grades.
- `VERIFIED` — Documented the Icebreaker metric and thresholds in `AGENTS.md`
  and `README.md` alongside the existing badge architecture notes.
- `ISSUE FOUND` → `FIXED` — The initial live fixture reused one recipient and
  hit the existing `one_active_introduction` uniqueness rule; the test now
  selects ten distinct recipients and passes without changing application
  behavior.
- `ISSUE FOUND` → `FIXED` — The first post-migration typecheck caught the new
  Icebreaker tone missing from the shared `BadgeTone` union; the union and tone
  map were completed and the affected checks reran successfully.
- `VERIFIED` — Icebreaker targeted tests pass 4/4, covering all requested
  9/10, 49/50, 199/200, and 499/500 boundaries, highest-grade selection,
  status-independent counting, deduplication, and secure projection count.
- `VERIFIED` — All ten automatic badge suites pass 40/40 together, including
  the prior nine families and existing projection/manual-badge regression
  coverage.
- `VERIFIED` — Schema verification, typecheck, lint, and production build
  pass after the final code fix. Schema lint retains only the two pre-existing
  unused-variable warnings in the activity-rank and Snail Mail helpers.

### PASS 47 status

`VERIFIED` — Icebreaker implementation and regression validation complete.

### PASS 48 — PASS 11 — IMPLEMENT CONVERSATION STARTER

Scope: automatic graded Conversation Starter badge integration using the
server-recorded conversation creation path. Existing Verified, manual, and
all prior automatic badge families remain preserved.

- `FIXED` → `VERIFIED` — Added centralized Conversation Starter definitions
  for Bronze, Silver, Gold, and Platinum at 10, 50, 200, and 500 started
  conversations.
- `FIXED` → `VERIFIED` — Added a private server-side metric over distinct
  `response_opportunities.conversation_id` values scoped to the recorded
  `initiator_id`, with a supporting initiator index. The conversation foreign
  key and distinct count ensure one conversation contributes once.
- `FIXED` → `VERIFIED` — Extended secure public and staff profile-badge
  projections to return only the highest qualifying Conversation Starter
  grade while preserving Verified, manual badges, and earlier derived families.
- `FIXED` → `VERIFIED` — Added shared ProfileBadge keys, labels, icon, and
  visual tone for all four Conversation Starter grades.
- `VERIFIED` — Added targeted tests covering 9/10, 49/50, 199/200, and
  499/500 boundaries, highest-grade selection, incoming-opportunity exclusion,
  duplicate-introduction protection for one conversation, and projected-grade
  count (4/4 passed).
- `VERIFIED` — All eleven automatic badge suites pass together: 44/44 tests.
- `VERIFIED` — Documented the Conversation Starter metric and thresholds in
  `AGENTS.md` and `README.md` alongside the existing badge architecture notes.
- `VERIFIED` — `pnpm schema:verify`, `pnpm typecheck`, `pnpm lint`, and
  `pnpm build` all pass. Schema lint retains only the two pre-existing
  unused-variable warnings in the activity-rank and Snail Mail helpers.

### PASS 48 status

`VERIFIED` — Conversation Starter implementation and regression validation
complete.

### PASS 49 — PASS 12 — IMPLEMENT LETTER WRITER

Scope: automatic graded Letter Writer badge integration using authoritative
message sender rows and existing moderation/account-erasure semantics. Existing
Verified, manual, and all prior automatic badge families remain preserved.

- `FIXED` → `VERIFIED` — Added centralized Letter Writer definitions for
  Bronze, Silver, Gold, and Platinum at 100, 500, 2,500, and 10,000 messages.
- `FIXED` → `VERIFIED` — Added a private server-side count of `messages` rows
  where `sender_id` is the target user, with a sender index. Existing
  moderation flags leave the authoritative row intact; account-erasure
  redaction sets `sender_id` to null and therefore removes ownership from the
  metric.
- `FIXED` → `VERIFIED` — Extended secure public and staff profile-badge
  projections to return only the highest qualifying Letter Writer grade while
  preserving Verified, manual badges, and all prior derived families.
- `FIXED` → `VERIFIED` — Added shared ProfileBadge keys, labels, icon, and
  visual tone for all four Letter Writer grades.
- `ISSUE FOUND` → `FIXED` — The first live fixture printed silent JWT setup
  values into the expected output; the test now sets those claims inside a
  `DO` block and passes.
- `VERIFIED` — Added targeted tests covering 99/100, 499/500, 2,499/2,500,
  and 9,999/10,000 boundaries, highest-grade selection, incoming-message
  exclusion, secure projection count, and sender redaction (4/4 passed).
- `VERIFIED` — All twelve automatic badge suites pass together: 48/48 tests.
- `VERIFIED` — Documented the Letter Writer metric and thresholds in `AGENTS.md`
  and `README.md` alongside the existing badge architecture notes.
- `VERIFIED` — `pnpm schema:verify`, `pnpm typecheck`, `pnpm lint`, and
  `pnpm build` all pass. Schema lint retains only the two pre-existing
  unused-variable warnings in the activity-rank and Snail Mail helpers.

### PASS 49 status

`VERIFIED` — Letter Writer implementation and regression validation complete.

### PASS 50 — PASS 13 — IMPLEMENT STEADY PENPAL

Scope: automatic graded Steady Penpal badge integration using the existing
`activity_rank_events` `active_day` records. Existing Verified, manual, and all
previous automatic badge families remain preserved.

- `FIXED` → `VERIFIED` — Added centralized Steady Penpal definitions for
  Bronze, Silver, Gold, and Platinum at 3, 6, 12, and 24 distinct active
  months.
- `FIXED` → `VERIFIED` — Added private server-side month aggregation using
  `count(distinct date_trunc('month', occurred_at::date))` over the target
  user's `active_day` events. Multiple days in one calendar month count once.
- `FIXED` → `VERIFIED` — Extended the secure public and staff profile-badge
  projections to return only the highest qualifying Steady Penpal grade while
  preserving Verified, manual badges, and all earlier derived families.
- `FIXED` → `VERIFIED` — Added shared ProfileBadge keys, labels, calendar icon,
  and visual tone for all four Steady Penpal grades.
- `VERIFIED` — Added targeted boundary and live deduplication tests covering
  2/3, 5/6, 11/12, and 23/24 months, highest-grade selection, repeated days
  in one month, and secure projection count (4/4 passed).
- `VERIFIED` — All thirteen automatic badge suites pass together: 52/52 tests.
- `VERIFIED` — Documented the Steady Penpal metric and thresholds in
  `AGENTS.md` and `README.md` alongside the existing badge architecture notes.
- `VERIFIED` — `pnpm schema:verify`, `pnpm typecheck`, `pnpm lint`, and
  `pnpm build` all pass. Schema lint retains only the two pre-existing
  unused-variable warnings in the activity-rank and Snail Mail helpers.

### PASS 50 status

`VERIFIED` — Steady Penpal implementation and regression validation complete.

### PASS 51 — PASS 14 — IMPLEMENT MYSTERY EXPLORER

Scope: automatic graded Mystery Explorer badge integration using the existing
private Mystery Pick session/card/exposure data. Existing Verified, manual,
and all previous automatic badge families remain preserved.

- `FIXED` → `VERIFIED` — Added centralized Mystery Explorer definitions for
  Bronze, Silver, Gold, and Platinum at 10, 50, 200, and 500 selections.
- `FIXED` → `VERIFIED` — Added private server-side counting over distinct
  `mystery_pick_cards.id` rows for the target viewer where `selected_at` is
  set. Exposure-only rows and exposure counts do not contribute.
- `FIXED` → `VERIFIED` — Extended the secure public and staff profile-badge
  projections to return only the highest qualifying Mystery Explorer grade
  while preserving Verified, manual badges, and all earlier derived families.
- `FIXED` → `VERIFIED` — Added shared ProfileBadge keys, labels, globe icon,
  and visual tone for all four Mystery Explorer grades.
- `VERIFIED` — Added targeted boundary and live fixture tests covering 9/10,
  49/50, 199/200, and 499/500 selections, highest-grade selection, selected
  card counting, exposure-only non-counting, and secure projection count
  (4/4 passed).
- `VERIFIED` — All fourteen automatic badge suites pass together: 56/56 tests.
- `VERIFIED` — Documented the Mystery Explorer metric and thresholds in
  `AGENTS.md` and `README.md` alongside the existing badge architecture notes.
- `VERIFIED` — `pnpm schema:verify`, `pnpm typecheck`, `pnpm lint`, and
  `pnpm build` all pass. Schema lint retains only the two pre-existing
  unused-variable warnings in the activity-rank and Snail Mail helpers.

### PASS 51 status

`VERIFIED` — Mystery Explorer implementation and regression validation
complete.

### PASS 52 — PASS 15 — IMPLEMENT ACROSS BORDERS

Scope: automatic graded Across Borders badge integration using immutable
Snail Mail recipient-country route snapshots. Existing Verified, manual, and
all previous automatic badge families remain preserved.

- `FIXED` → `VERIFIED` — Added centralized Across Borders definitions for
  Bronze, Silver, Gold, and Platinum at 5, 15, 30, and 60 unique countries.
- `FIXED` → `VERIFIED` — Added private server-side counting over distinct
  non-null `snail_mail_letters.recipient_country_code` snapshots scoped to the
  sender, delivered, and non-cancelled letters. The helper never joins the
  recipient's mutable profile location.
- `FIXED` → `VERIFIED` — Extended the secure public and staff profile-badge
  projections to return only the highest qualifying Across Borders grade
  while preserving Verified, manual badges, and all earlier derived families.
- `FIXED` → `VERIFIED` — Added shared ProfileBadge keys, labels, globe icon,
  and visual tone for all four Across Borders grades.
- `VERIFIED` — Added targeted boundary and live fixture tests covering 4/5,
  14/15, 29/30, and 59/60 countries, highest-grade selection, duplicate
  country snapshots counting once, and secure projection count (4/4 passed).
- `VERIFIED` — All fifteen automatic badge suites pass together: 60/60 tests.
- `VERIFIED` — Documented the Across Borders metric and thresholds in
  `AGENTS.md` and `README.md` alongside the existing badge architecture notes.
- `VERIFIED` — `pnpm schema:verify`, `pnpm typecheck`, `pnpm lint`, and
  `pnpm build` all pass. Schema lint retains only the two pre-existing
  unused-variable warnings in the activity-rank and Snail Mail helpers.

### PASS 52 status

`VERIFIED` — Across Borders implementation and regression validation complete.

### PASS 53 — PASS 16 — IMPLEMENT REGIONAL EXPLORER

Scope: automatic graded Regional Explorer badge integration using immutable
Snail Mail recipient country/region route snapshots. Existing Verified,
manual, and all previous automatic badge families remain preserved.

- `FIXED` → `VERIFIED` — Added centralized Regional Explorer definitions for
  Bronze, Silver, Gold, and Platinum at 10, 30, 75, and 150 unique regions.
- `FIXED` → `VERIFIED` — Added private server-side counting over distinct
  `(recipient_country_code, recipient_region_code)` snapshots scoped to the
  sender, delivered, and non-cancelled letters. The helper never joins the
  recipient's mutable profile location.
- `FIXED` → `VERIFIED` — Extended the secure public and staff profile-badge
  projections to return only the highest qualifying Regional Explorer grade
  while preserving Verified, manual badges, and all earlier derived families.
- `FIXED` → `VERIFIED` — Added shared ProfileBadge keys, labels, pin icon,
  and visual tone for all four Regional Explorer grades.
- `VERIFIED` — Added targeted boundary and live fixture tests covering 9/10,
  29/30, 74/75, and 149/150 regions, highest-grade selection, duplicate
  region snapshots counting once, and secure projection count (4/4 passed).
- `VERIFIED` — All sixteen automatic badge suites pass together: 64/64 tests.
- `VERIFIED` — Documented the Regional Explorer metric and thresholds in
  `AGENTS.md` and `README.md` alongside the existing badge architecture notes.
- `VERIFIED` — `pnpm schema:verify`, `pnpm typecheck`, `pnpm lint`, and
  `pnpm build` all pass. Schema lint retains only the two pre-existing
  unused-variable warnings in the activity-rank and Snail Mail helpers.

### PASS 53 status

`VERIFIED` — Regional Explorer implementation and regression validation
complete.

### PASS 54 — PASS 17 — IMPLEMENT MAIL READER

Scope: automatic graded Mail Reader badge integration using the existing
incoming Snail Mail delivery/read lifecycle. Existing Verified, manual, and
all previous automatic badge families remain preserved.

- `FIXED` → `VERIFIED` — Added centralized Mail Reader definitions for
  Bronze, Silver, Gold, and Platinum at 15, 30, 100, and 250 read letters.
- `FIXED` → `VERIFIED` — Added private server-side counting over distinct
  Snail Mail letter IDs scoped to the recipient with delivered state,
  non-null `recipient_read_at`, and non-cancelled lifecycle state. Unread
  incoming letters do not contribute.
- `FIXED` → `VERIFIED` — Extended the secure public and staff profile-badge
  projections to return only the highest qualifying Mail Reader grade while
  preserving Verified, manual badges, and all earlier derived families.
- `FIXED` → `VERIFIED` — Added shared ProfileBadge keys, labels, heart icon,
  and existing Snail Mail visual tone for all four Mail Reader grades.
- `VERIFIED` — Added targeted boundary and live fixture tests covering 14/15,
  29/30, 99/100, and 249/250 read letters, highest-grade selection, unread
  incoming exclusion, and secure projection count (4/4 passed).
- `VERIFIED` — All seventeen automatic badge suites pass together: 68/68 tests.
- `VERIFIED` — Documented the Mail Reader metric and thresholds in `AGENTS.md`
  and `README.md` alongside the existing badge architecture notes.
- `VERIFIED` — `pnpm schema:verify`, `pnpm typecheck`, `pnpm lint`, and
  `pnpm build` all pass. Schema lint retains only the two pre-existing
  unused-variable warnings in the activity-rank and Snail Mail helpers.

### PASS 54 status

`VERIFIED` — Mail Reader implementation and regression validation complete.

### PASS 55 — PASS 18 — IMPLEMENT MULTILINGUAL

Scope: automatic graded Multilingual badge integration using the current
`profile_languages` state. Existing Verified, manual, and all previous
automatic badge families remain preserved.

- `FIXED` → `VERIFIED` — Added centralized Multilingual definitions for
  Bronze, Silver, Gold, and Platinum at 2, 3, 4, and 5 languages.
- `FIXED` → `VERIFIED` — Added a private server-side count of distinct
  `profile_languages.language_id` rows for a target profile, so one language
  declared for multiple purposes counts once.
- `FIXED` → `VERIFIED` — Added highest-grade selection and extended the shared
  secure public/staff profile-badge projection without exposing helper access.
- `FIXED` → `VERIFIED` — Added ProfileBadge keys, labels, globe icon, and the
  existing language-exchange visual tone for all four grades.
- `VERIFIED` — Targeted tests cover profile counts of 1, 2, 3, 4, and 5+,
  highest-grade selection, duplicate purpose representations, and secure
  projection count (4/4 passed).
- `VERIFIED` — All eighteen automatic badge suites pass together: 72/72.
- `VERIFIED` — `pnpm schema:verify`, `pnpm typecheck`, `pnpm lint`, and
  `pnpm build` all pass. Schema lint retains only the two pre-existing unused
  variable/parameter warnings in the activity-rank and Snail Mail helpers.
- `VERIFIED` — `AGENTS.md` and `README.md` document the distinct-language
  metric and thresholds.

### PASS 55 status

`VERIFIED` — Multilingual implementation and full regression validation
complete.

### PASS 56 — PASS 19 — IMPLEMENT LANGUAGE LEARNER

Scope: automatic graded Language Learner badge integration using current
`profile_languages` rows with purpose `learning`. Existing Verified, manual,
Multilingual, and all previous automatic badge families remain preserved.

- `FIXED` → `VERIFIED` — Added centralized Language Learner definitions for
  Bronze, Silver, Gold, and Platinum at 1, 2, 3, and 4 learning languages.
- `FIXED` → `VERIFIED` — Added private server-side counting over distinct
  `profile_languages.language_id` rows filtered to `purpose = 'learning'`;
  speaks-only rows cannot increase the metric.
- `FIXED` → `VERIFIED` — Extended both secure public and staff profile-badge
  projections to return only the highest qualifying Language Learner grade.
- `FIXED` → `VERIFIED` — Added shared ProfileBadge keys, labels, globe icon,
  and the existing language-exchange visual tone for all four grades.
- `VERIFIED` — Targeted tests cover 0, 1, 2, 3, and 4+ learning languages,
  highest-grade selection, speaks-only exclusion, and secure projection count
  (4/4 passed).
- `VERIFIED` — All nineteen automatic badge suites pass together: 76/76.
- `VERIFIED` — `pnpm schema:verify`, `pnpm typecheck`, `pnpm lint`, and
  `pnpm build` all pass. Schema lint retains only the two pre-existing unused
  variable/parameter warnings in the activity-rank and Snail Mail helpers.
- `VERIFIED` — `AGENTS.md` and `README.md` document the purpose-filtered
  learning-language metric and thresholds.

### PASS 56 status

`VERIFIED` — Language Learner implementation and full regression validation
complete.

### PASS 57 — PASS 20 — IMPLEMENT INTEREST EXPLORER

Scope: automatic graded Interest Explorer badge integration using current
`profile_interests` rows. Existing Verified, manual, Language Learner,
Multilingual, and all previous automatic badge families remain preserved.

- `FIXED` → `VERIFIED` — Added centralized Interest Explorer definitions for
  Bronze, Silver, Gold, and Platinum at 5, 10, 20, and 30 interests.
- `FIXED` → `VERIFIED` — Added private server-side counting over distinct
  `profile_interests.interest_id` rows for the target profile.
- `FIXED` → `VERIFIED` — Extended both secure public and staff profile-badge
  projections to return only the highest qualifying Interest Explorer grade.
- `FIXED` → `VERIFIED` — Added shared ProfileBadge keys, labels, globe icon,
  and the existing language-exchange visual tone for all four grades.
- `VERIFIED` — Targeted tests cover 4/5, 9/10, 19/20, and 29/30 boundaries,
  actual 4/5/9/10/19/20/29/30 profile counts, duplicate inserts, highest-grade
  selection, and secure projection count (4/4 passed).
- `VERIFIED` — All twenty automatic badge suites pass together: 80/80.
- `VERIFIED` — Profile interests/languages, profile rendering, and local
  Supabase integration tests pass: 7/7.
- `VERIFIED` — `pnpm schema:verify`, `pnpm typecheck`, `pnpm lint`, and
  `pnpm build` all pass. Schema lint retains only the two pre-existing unused
  variable/parameter warnings in the activity-rank and Snail Mail helpers.
- `VERIFIED` — `AGENTS.md` and `README.md` document the distinct-interest
  metric and thresholds.

### PASS 57 status

`VERIFIED` — Interest Explorer implementation and full regression validation
complete.

### PASS 58 — BADGE ASSET PACK INTEGRATION AND TOOLTIP QA

Scope: integrate the supplied Pen-Pals.net SVG badge artwork into the existing
profile badge component without changing server-side eligibility, assignment,
Verified behavior, or highest-grade projection rules.

- `FIXED` → `VERIFIED` — Imported the supplied production SVG full-badge and
  icon assets, manifest, and token reference into `public/badges`.
- `FIXED` → `VERIFIED` — ProfileBadge now maps implemented badge keys directly
  to matching SVG artwork; the manual Early Member key uses its icon-only asset
  because the pack defines Early Member as a graded family.
- `FIXED` → `VERIFIED` — Added viewer-facing explanations for every graded and
  non-graded badge. Graded explanations include the current grade and the
  implemented threshold, and all use the “This user has…” perspective.
- `FIXED` → `VERIFIED` — Added keyboard-focusable, hover-visible tooltips,
  accessible labels, native title fallback, and responsive asset sizing.
- `FIXED` → `VERIFIED` — Preserved the existing Verified question control and
  tooltip as an accessible nested action while adding the asset-backed badge
  explanation.
- `VERIFIED` — Captured live browser screenshots for the normal admin profile,
  a multi-badge QA profile, and a zero-badge route state. The rendered
  accessibility tree exposes badge labels and explanations without changing
  the profile layout or secure data path.
- `VERIFIED` — Asset, badge, profile, and local Supabase integration tests pass:
  90/90.
- `VERIFIED` — Final asset/profile/Supabase recheck passes: 10/10.
- `VERIFIED` — `pnpm typecheck`, `pnpm lint`, and `pnpm build` pass.

### PASS 58 status

`VERIFIED` — Badge asset integration and browser QA complete.
