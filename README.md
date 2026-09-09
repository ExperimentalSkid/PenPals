# Penpal

Penpal is a Next.js App Router foundation for international friendship and people discovery, using Supabase Auth with cookie-based SSR sessions.

## Setup

Use Node.js 24 (as in CI) and the pinned pnpm 11.19.0. The minimum supported
Node.js version is 22.13.0; pnpm 11 cannot run on Node.js 20.

1. Create a Supabase project and copy `.env.example` to `.env.local`.
2. Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the Supabase dashboard.
3. For local development, leave `NEXT_PUBLIC_SITE_URL` unset (the app uses `http://localhost:3000/auth/confirm`) or set it to the local origin explicitly.
4. In local Supabase Auth URL Configuration, keep the local email callback `http://localhost:3000/auth/confirm` and the alternate `http://127.0.0.1:3000/auth/confirm` allow-listed, plus the Google Auth callback `http://localhost:3000/auth/callback` and its `127.0.0.1` equivalent when used. Do not add HTTPS-local or production URLs to the local configuration.
5. In Supabase Auth → Email, turn on **Confirm email**. Local development uses the Supabase local SMTP inbox; it does not deliver mail externally.
6. Ensure email confirmation is enabled, then run:

```bash
pnpm install
pnpm dev
```

Visit `http://localhost:3000`. Sign-up sends a confirmation email; confirmed users are redirected to protected profile setup before entering `/app`. Ordinary account/profile flows use the publishable key with user-scoped sessions. The optional external verification integration and background worker additionally require a server-only service-role key; never expose it to browser code.

Unconfirmed signups are held at `/check-email` and cannot receive an application session through the app boundary. The confirmation link exchanges its Supabase token at `/auth/confirm`, after which the existing age gate and profile setup continue. The app never displays a public email-verified badge.

### Profile setup signals

Profile setup uses the same database-backed catalogues as Discover. Interests are searched inline from the comprehensive `public.interests` catalogue (rather than a fixed option wall) and selected by stable IDs; at least three are required for Discover eligibility. Languages use the shared language catalogue with proficiency and purpose. The optional Personality & lifestyle and connection-goal fields map to the existing profile columns used by public profile presentation and Mystery Pick relevance, and are saved through the authenticated profile-save RPC.

### Google login (separate from profile verification)

The sign-in and sign-up pages offer **Continue with Google** through Supabase Auth. The login flow requests only `openid email`, uses Supabase's PKCE/state handling, and returns through the separate `/auth/callback` route. A first-time Google Auth user is sent through the existing age gate and profile setup; an existing user returns to the same Penpal UUID. Enable Google in Supabase Auth and allow the exact local callback (`http://localhost:3000/auth/callback`, plus the `127.0.0.1` equivalent when used) or exact production callback (`https://<site-origin>/auth/callback`). For local Auth, the provider is enabled in `supabase/config.toml` and requires `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` plus `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET` from the local secret manager at startup; no credentials belong in this repository.

Sign-in accepts either the canonical email or the existing profile username/configured alias. Username and alias resolution is password-gated and protected by per-identifier and server-derived client throttles; failures remain generic. **Forgot password?** uses Supabase's recovery email and sends the user through `/update-password`; Settings also supports changing a password with the current password and signing out other active sessions. Existing demo accounts are preserved while new passwords require at least eight characters at the Penpal form boundary.

Profile verification can additionally use a Supabase Auth TOTP factor. The Settings verification module enrolls one authenticator, confirms a 6-digit challenge, and stores only the factor id plus a 30-day badge window. A seven-day grace window keeps the public badge visible while an in-app re-verification notification is issued; profile Pause freezes and resumes both deadlines. TOTP enrollment/verification is enabled in the checked-in local `supabase/config.toml`; hosted projects must enable the corresponding Auth MFA TOTP settings.

Profile badges are defined centrally in `profile_badge_definitions` and read
through secure public/staff projections. `Verified` remains tied to the
existing verification flow, manual community badges remain staff-assigned,
and the automatic `Penpal Veteran` and `Profile Builder` families expose only
their highest currently earned grade. Veteran uses the Auth account creation
timestamp; Profile Builder uses the current ten-field profile completion
calculation and the enforced minimum onboarding predicate for Bronze. Derived
grades are calculated server-side and are never stored as manual assignments.

`Active Penpal` grades use only distinct calendar dates represented by the
existing `activity_rank_events` rows with `event_type = 'active_day'`. The
activity system's date-keyed idempotency and server-side event guard remain the
source of truth; account tenure does not increase this badge.

`Correspondent` grades count distinct successful outgoing introductions. In the
current introduction lifecycle, a `replied` status is the acceptance transition
that creates the conversation; incoming replies and duplicate rows for one
conversation do not increase the sender's count. The highest qualifying grade
is projected server-side and is never stored as a manual assignment.

`Early Member` grades use one centralized official launch timestamp
(`2026-09-01T00:00:00Z`) and the Auth account creation timestamp. The
highest qualifying launch-window grade is 30 days (Platinum), three months
(Gold), six months (Silver), or 12 months (Bronze); accounts created before
or after that window receive no derived Early Member grade.

`Connector` grades count distinct other users in the existing
`conversation_participants` membership data, so repeated conversations with
one person count once. The highest qualifying 25, 75, 150 or 300-contact grade
is projected server-side and is never stored as a manual assignment.

`Snail Mailer` grades count distinct letters sent by the user that have reached
the existing `delivered_at` lifecycle state. A letter that is also read still
counts once, while cancelled or in-transit letters do not count. The highest
qualifying 15, 30, 100 or 250-letter grade is projected server-side and is
never stored as a manual assignment.

`Reliable Replier` reuses the existing response-statistics implementation. It
requires at least five completed incoming opportunities and preserves the
current seven-day first-response window; its highest qualifying response-rate
grade is 70%, 80%, 90% or 95% and follows the existing response-rate privacy
visibility policy.

`Quick Replier` uses the same privacy-safe incoming response population and
five-opportunity minimum, deriving average `handled_at - created_at` latency
server-side. Its highest qualifying average-latency grade is 72 hours
(Bronze), 24 hours (Silver), 8 hours (Gold), or 2 hours (Platinum); the grade
is never stored as a manual assignment.

`Icebreaker` counts each introduction record sent by the user once,
regardless of lifecycle status or acceptance. Its highest qualifying
10/50/200/500-introduction grade is projected server-side and is never stored
as a manual assignment.

`Conversation Starter` counts distinct conversations created with the user as
the server-recorded initiator. Its highest qualifying 10/50/200/500-conversation
grade is projected server-side and incoming conversations do not count.
`Letter Writer` counts authoritative message rows sent by the user. Account
erasure redacts `sender_id` and therefore removes that row from the user count;
moderation flags do not create duplicate messages. Its highest qualifying
100/500/2,500/10,000-message grade is projected server-side.
`Steady Penpal` counts distinct calendar months containing the user's recorded
`active_day` activity, so repeated active days in one month count once. Its
highest qualifying 3/6/12/24-month grade is projected server-side.
`Mystery Explorer` counts Mystery Pick cards selected by the user (`selected_at`
is set), not exposure-only rows. Its highest qualifying 10/50/200/500-selection
grade is projected server-side.
`Across Borders` counts distinct recipient-country snapshots on delivered,
non-cancelled Snail Mail letters sent by the user, not recipients' current
profile locations. Its highest qualifying 5/15/30/60-country grade is projected
server-side.
`Regional Explorer` counts distinct stored country-and-region route snapshots
on delivered, non-cancelled Snail Mail letters, so repeated mail to one region
counts once. Its highest qualifying 10/30/75/150-region grade is projected
server-side.
`Mail Reader` counts distinct delivered incoming Snail Mail letters with a
non-null `recipient_read_at`; unread incoming letters do not count. Its highest
qualifying 15/30/100/250-letter grade is projected server-side.
`Multilingual` counts distinct current profile languages, not purpose rows, so
one language declared for speaking and learning counts once. Its highest
qualifying 2/3/4/5-language grade is projected server-side.
`Language Learner` counts distinct current profile languages marked `learning`;
`speaks`-only rows do not count. Its highest qualifying 1/2/3/4-learning-
language grade is projected server-side.
`Interest Explorer` counts distinct current profile interests. Its highest
qualifying 5/10/20/30-interest grade is projected server-side.

Settings → Login methods can link Google to an already authenticated account using Supabase's manual identity-linking flow (enable **Allow manual linking** in Supabase Auth). Supabase rejects identities already linked to another account; Penpal never merges accounts from a matching email alone. Disconnecting Google is allowed only when Supabase reports another login identity, so it cannot remove the sole usable login method. The short-lived link intent is signed with server-only `GOOGLE_LOGIN_STATE_SECRET` (at least 32 characters) and is unrelated to the provider-neutral Profile Verification callbacks and records. Connecting or disconnecting Google login never sets, revokes, or changes `is_verified`.

### Production authentication email

Start with the [first VPS deployment checklist](docs/production-deployment.md)
for the app, database migrations, private environment, worker and live checks.
A GitHub push publishes source; it does not provision or deploy the VPS.

For a fresh production database, the checklist includes the explicit,
terminal-only `pnpm setup:owner` command. It securely creates the initial owner
account, waits for normal browser onboarding, then grants the first admin role
once. It is intentionally not run by `pnpm install`, a build, CI, or a later
deployment.

Production uses **self-hosted Supabase Auth with Resend custom SMTP**. Supabase continues to own tokens and every authentication flow; no Resend SDK or parallel application sender is used. Local `supabase/config.toml`, Mailpit, and `.env.local` remain unchanged.

The VPS loads the existing Supabase Docker environment plus the secret values below. Use the real externally reachable self-hosted Supabase URL; the repository does not guess it:

```text
NEXT_PUBLIC_SITE_URL=https://pen-pals.net
NEXT_PUBLIC_SUPABASE_URL=https://<your-supabase-api-origin>
SUPABASE_AUTH_CONFIRM_REDIRECT_URL=https://pen-pals.net/auth/confirm
SUPABASE_AUTH_URI_ALLOW_LIST=https://pen-pals.net/auth/confirm,https://pen-pals.net/auth/callback,https://pen-pals.net/auth/callback?mode=login,https://pen-pals.net/auth/callback?mode=link
SUPABASE_AUTH_SMTP_HOST=smtp.resend.com
SUPABASE_AUTH_SMTP_PORT=465
SUPABASE_AUTH_SMTP_USER=resend
RESEND_API_KEY=<secret-from-Resend>
SUPABASE_AUTH_SMTP_ADMIN_EMAIL=no-reply@pen-pals.net
SUPABASE_AUTH_SMTP_SENDER_NAME=Pen-Pals
PENPALS_REPOSITORY_PATH=/srv/penpals
```

The sender domain must be verified in Resend with link/open tracking disabled. Use the actual deployed HTTPS site origin if it differs from the example above.

Validate the secret environment before deploying:

```bash
pnpm check:production-email
```

Apply `deploy/supabase/docker-compose.auth-email.yml` as an override to the official self-hosted Supabase Compose stack. It configures the existing `auth` service and a private template service; it does not publish another port or replace the Auth image, database, OAuth settings, sessions, rate limits, or security-notification switches. Production templates live in `supabase/templates/production`. Signup/resend and recovery use the existing `/auth/confirm` handler with explicit flow types; other authentication emails keep Supabase's lifecycle URL or reauthentication code.

See [Production email deployment](docs/production-email.md) for the exact GitHub-to-VPS command, secret separation, DNS, verification and activation checklist. Production email configuration is separate from local development and normal builds.

### Production background jobs

Permanent account deletion queues private avatar objects for asynchronous cleanup, pending introductions are expired by the existing lifecycle function, and configured moderation retention is purged by a one-shot server-only worker. Run `pnpm jobs:run` from a scheduler with `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set in the worker environment. The service-role key must never be sent to the browser or committed to source control. The worker is safe to run concurrently: database claiming uses row locks, retries use the outbox backoff, and successful jobs are removed only after Storage deletion. Configure the platform scheduler and failure alerting for the desired cadence; this repository does not assume a provider or invent retention periods.

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm build
```

## Data rights

Signed-in users can use **Settings → Your data** to download a ZIP containing their account, profile, settings, language and interest selections, introductions, conversations and messages, notifications, photo-access records, blocks, owned photo metadata, authentication activity available to the app, and reports they submitted. The export includes both JSON and CSV files plus a README. It omits passwords, tokens, service credentials, private third-party profile fields, and moderator-only evidence. Export generation is limited to once every 48 hours and request/download events are audited.

Deactivation is reversible. Permanent deletion requires typing `DELETE` after a recent sign-in and removes the account, profile, owned data, notifications, photo permissions, blocks, and avatar objects. Shared conversations may survive for the other participant: messages remain available in that surviving conversation, while the deleted sender is anonymized as `Deleted user`; conversations with no remaining participant are removed. Standalone introductions are removed. Existing Supabase authentication audit entries and immutable moderator audit records remain governed by their current provider/schema retention rules; a deleted moderator's actor reference is severed so erasure is not blocked. Export generation includes any private external-account verification link records belonging to the requester; public profiles expose only an `is_verified` boolean and never provider/account details. See [`docs/data-inventory.md`](docs/data-inventory.md) for the complete inventory and open retention decisions.

### Optional external-account verification foundation

The database includes a private, provider-neutral verification model with approved server-side adapters for Facebook, Instagram, TikTok, and Google. It stores only a provider name, a one-way provider-subject fingerprint, internal status/capability signals, and verification timestamps—never OAuth tokens or public social-account details. Provider policies are disabled and unset until an operator explicitly configures them; no provider or age/reverification duration is enabled by this repository. Ordinary clients cannot read verification records, and one active external identity can be linked to only one Penpal account. The capability contract can represent ownership, a stable account identifier, a trustworthy account-created timestamp, token revocation, re-verification, and explicitly namespaced provider extensions without assuming every provider supports each signal. Provider policies declare minimum OAuth scopes and default to discarding token material after verification; the approved registry and OAuth callbacks are server-only.

### Activity ranks and voluntary pause

Penpal maintains lightweight participation ranks in private `activity_rank_state` and `activity_rank_events` tables using centralized rank definitions. Public profiles expose only the rank name and short flavor text; raw scores and event history remain administrator-only. Settings includes a voluntary **Pause participation** mode backed by `profiles.inactive_mode`. Pausing is separate from account deactivation: it preserves the account and existing conversations, freezes the current rank with no earning or decay, removes the account from discovery and new contact, and suppresses presence until resumed. Resuming continues from the frozen score; `deactivated_at` lifecycle behavior is unchanged.

### Communication modes

Each profile can allow **Instant Messaging**, **Snail Mail**, or **Both** (at least one is required). Existing profiles default to both. These preferences affect only new contact establishment and new letters; existing conversations and sent letters remain intact. Eligibility is enforced server-side, while public profiles show only a derived preference label and never internal fields.

Profiles can also list up to the configured number of **friendship destinations**: a country or an optional region where they would like to meet people. Destinations are separate from the home location, use the protected profile-save path for add/remove/duplicate/limit validation, and are shown on public profiles only as canonical country/region names. They do not affect Discover ordering or ranking. Legacy free-text locations that cannot be matched to the catalogue remain editable and are preserved until the profile owner chooses a canonical location.

The SEO data foundation keeps these dimensions canonical without duplicating profile records. A private `country_aliases` reference maps localized or abbreviated country names to immutable ISO country codes, and unambiguous existing locations are backfilled to the existing country/region/locality catalogue. The server-only `seo_profile_dimensions()` source returns normalized IDs, labels, language/interest IDs, connection goals, and eligibility flags for a later thresholded aggregate API; ordinary clients cannot read it and no individual profile data is exposed.

`seo_community_aggregates` is the private data cache for the next SEO layer. It materializes only dimensions backed by actual eligible public members (country, region, spoken/learning language, interest, connection goal, and selected country/language/interest pairs). Profile and catalogue writes mark the cache dirty; a service-only refresh rebuilds it transactionally under a lock. Each row stores the matched member/cohort count, calculation time, dimension payload, configured minimum cohort size, and a `sufficient` flag (default privacy floor: five members). No aggregate cache table or refresh/read function is available to ordinary clients.

The SEO eligibility engine is a second private layer over that cache. `seo_aggregate_eligibility_config` centralizes the privacy, usefulness, freshness, parent-distinction, and public-indexing policy (public indexing is off by default), while `seo_community_aggregate_eligibility` records a decision state and reason for each real aggregate. Aggregate writes, including a direct trusted refresh, invalidate the decision cache. Service-only evaluation marks rows `eligible_indexable`, `available_non_indexable`, `insufficient_data`, `suppressed_for_privacy`, `duplicate_redundant`, or `stale`; public SEO work must expose only explicitly indexable rows through bounded canonical routes.

Public SEO surfaces use three reusable dynamic templates: `/country/[slug]`, `/language/[slug]`, and `/interest/[slug]`. They resolve canonical entities through the allow-listed, read-only `get_public_seo_surface` projection and render only explicitly `eligible_indexable` aggregate rows; the projection fails closed while trusted refresh/evaluation is pending or stale. Its internal discovery graph only returns related countries, languages, and interests whose own base aggregate is independently eligible and unambiguous, with at most 12 links per relation. Disabled, insufficient, stale, suppressed, or duplicate datasets produce no page. Canonical aliases and case/query variants redirect to the clean slug, while `/sitemap.xml` is generated at runtime from the separate eligible-only `get_public_seo_sitemap` projection (and `/robots.txt` excludes private app/auth paths). The pages state that every number describes Pen-Pals.net members, include only qualifying related communities, and link into the existing sign-up/discovery experience. There are no per-combination files, arbitrary filter parameters, or build-time page expansion.

SEO history is private and aggregate-only. The existing background worker refreshes the aggregate cache, re-evaluates the eligibility decision cache, and calls `capture_seo_community_aggregate_snapshots()` at a guarded default daily cadence, storing only nonzero privacy-sufficient aggregate rows with source/capture timestamps and retaining them for a bounded default of 730 days. The service-only history read is available for later analytics, but no historical public pages are exposed in the current pass and no profile records are snapshotted.

### Moderation workspaces

The **Mod Inbox** (`/app/admin/cases`) remains the shared moderator/admin case queue. A moderator can request administrator attention from an actively claimed case by submitting a reason; the existing case, preserved evidence, and audit history are retained and the request is idempotent. Administrators have an additional **Admin Inbox** (`/app/admin/inbox`) backed by the admin-only `admin_list_escalated_moderation_cases` projection. It lists open or resolved escalations with the recorded reason, requester, ownership, priority, and status, then links into the same case workstation for evidence review and resolution. Route guards and the database function both require administrator authorization.

### Support Inbox

The separate **Support Inbox** (`/app/admin/support`) is a staff-only queue for user support tickets. It uses the `support_tickets`, `support_ticket_messages`, and private `support_ticket_attachments` model with server-side status, category, assignment, search, sort, and pagination filters. Authenticated users can submit a general request at `/app/support`, receive an owner-scoped confirmation with a ticket ID, status, subject, submitted time, and request link, then review their own history at `/app/support/requests` and a dedicated request view at `/app/support/requests/[id]`. The history/detail RPCs enforce requester ownership, return chronological public messages and linked attachments, and filter internal notes before data reaches the user. Owners can append public replies to active requests through the owner-checked `reply_to_support_ticket` RPC; replies transition the request to **Waiting for staff** and use submission tokens for idempotent retries. Staff use separate claim, public-reply, internal-note, and status RPCs in `/app/admin/support/[id]`; public replies transition tickets to **Waiting for user**, internal notes remain staff-only, and resolved tickets can be reopened as **Open**. Support queue activity is delivered through the existing owner-scoped notification stream: staff are notified about new tickets and requester replies, while requesters receive public-reply, waiting-for-user, resolved, and reopened updates with links to the appropriate ticket view. Clicking a staff row opens the dedicated ticket workstation with the full conversation, secure attachment previews, assignment controls, and status actions. Attachment previews use short-lived signed URLs generated only after the appropriate owner/staff authorization check; the bucket is never public. Future intake types can be added without changing the moderation queues.

### Mystery Pick

Discover includes a restrained **Mystery Pick** entry point. The server selects three currently eligible, communication-compatible profiles using private friendship-relevant signals (shared interests, language overlap, goals, destinations, and available modes), then returns only opaque, short-lived card tokens. The cards reveal no profile data before selection; resolving one token re-checks eligibility and opens the normal public profile route. The other candidates remain undisclosed, recent exposures are reduced for a short freshness window, and choosing a card never sends an introduction, message, notification, or other contact action. Gender and dating-style signals are not used, and the internal relevance score is never exposed.

Snail Mail letters are immutable after sending. A sender may cancel an undelivered letter through the server-authorized cancellation action; the shared history then records a neutral **lost in transit** outcome. The recipient never receives the body or learns that the sender cancelled it, while the sender retains their own copy. Delivery workers exclude cancelled letters and cancellation is race-safe with delivery.

## Repository entry points

The public front page is `src/app/page.tsx`; authenticated features live in
`src/app/app`. Shared domain rules and database clients live in `src/lib`.
`src/proxy.ts` is the single Next.js Proxy entry point beside `src/app`.
Badge display metadata and the staff-assignment vocabulary live in
`src/lib/profile-badges.ts`; the database remains authoritative for eligibility
and assignment permissions. The shared support attachment viewer serves both
member and staff screens without importing an admin feature into the member UI.

Background jobs isolate independent workloads and report a nonzero exit status
after attempting all of them if any fail. SEO refresh, eligibility evaluation,
and history capture remain an ordered dependency chain. See
`docs/database-validation.md` for the database release checks.
