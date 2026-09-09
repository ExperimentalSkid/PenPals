# Penpal

Next.js App Router foundation with Supabase SSR authentication. Keep secrets server-side, use `@supabase/ssr`, and verify authorization in Server Components. Do not add product tables or features without updating this file and the README.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Data rights

Personal-data exports and account deletion are implemented through the protected data-rights migration, server-only export route, and settings action. Keep service credentials server-side and update `docs/data-inventory.md` when data categories or retention behavior changes.

Optional external-account verification keeps provider identities, subject fingerprints, capability signals, and policy configuration server-side; expose only the public `is_verified` boolean. The provider contract is capability-based (ownership, stable subject, account-created timestamp, token revocation, re-verification, plus namespaced extensions), requests minimum scopes, and treats access tokens as transient by default. The server-only registry currently contains only the explicitly approved Facebook, Instagram, TikTok, and Google adapters; database policy rows remain disabled until an operator configures them. Do not add OAuth tokens, provider UI, or client-readable verification tables without a separately reviewed integration.

Activity ranks use private `activity_rank_state` and `activity_rank_events` tables with centralized rank definitions. The user-facing `profiles.inactive_mode` pause is distinct from `deactivated_at`: pause freezes rank state and suppresses discovery, contact, presence, and activity earning while preserving account data. Keep rank metrics admin-only and never expose raw scores or event history publicly.

Communication modes use `profiles.allow_instant_messages` and `profiles.allow_snail_mail`, defaulting existing accounts to both. At least one mode is required. The preferences govern newly established contact only: existing conversations and Snail Mail letters remain intact. Server-side pair/letter guards enforce the recipient and sender modes; the public profile exposes only the derived preference label.

Normalized base locations use canonical country, optional region, optional locality, and an explicit precision. Friendship destinations are separate country/region targets selected through the protected profile-save RPC; their owner-only table must not be writable directly by clients, and public display must use the guarded canonical-name projection. Destinations never alter Discover ordering or ranking.

The SEO data foundation reuses those profile dimensions rather than copying member rows into an SEO table. `country_aliases` is private reference metadata for canonical country-code resolution, and the server-only `seo_profile_dimensions()` function exposes only normalized IDs/names and aggregate-ready eligibility flags to trusted callers. Keep ordinary client roles revoked from both the alias catalogue and normalized source; any future public SEO surface must use a separately reviewed, thresholded aggregate function.

SEO community aggregates are materialized in the private `seo_community_aggregates` cache. Relevant profile, selection, destination, and catalogue writes mark `seo_community_aggregate_state.dirty`; a service-only refresh rebuilds only real country/region/language/interest/goal dimensions and their bounded country/language/interest pairs under an advisory lock. The default minimum cohort is five, and future public reads must apply the stored `sufficient` flag rather than exposing small cohorts or the cache tables directly.

SEO eligibility is a separate private decision cache in `seo_community_aggregate_eligibility`, governed by the single-row `seo_aggregate_eligibility_config` policy. It defaults to public indexing disabled and requires the privacy floor, useful related information, freshness, and distinction from a broader parent aggregate; `evaluate_seo_community_eligibility()` and `get_seo_community_eligibility()` are service-only. Aggregate cache writes (including a direct trusted refresh) invalidate the decision cache. Future public routes must use only `is_indexable` rows and a bounded canonical route contract, never arbitrary query parameters or direct cache-table access.

The public SEO layer uses only the three dynamic route families `/country/[slug]`, `/language/[slug]`, and `/interest/[slug]`, rendered by the shared `src/app/seo/SeoSurfacePage.tsx` template. `get_public_seo_surface(text,text)` is an allow-listed anonymous, read-only projection that resolves canonical catalogue entities and returns only `eligible_indexable` aggregate counts and qualifying related communities; its internal graph projection filters every related link to an independently qualified, unambiguous base surface and caps each relation to 12 items. It fails closed while trusted refresh/evaluation is pending or stale. Unknown, stale, suppressed, duplicate, or policy-disabled datasets resolve to no surface. Canonical aliases, case variants, and query/filter variants permanently redirect to the clean canonical slug. The runtime `/sitemap.xml` reads only eligible canonical routes through `get_public_seo_sitemap()`, while `/robots.txt` excludes private app/auth paths. Keep these projections aggregate-only and do not add combinatorial route families or build-time pre-rendering.

Private SEO history uses `seo_community_aggregate_snapshots`, which stores only nonzero, privacy-sufficient aggregate rows at the configured cadence (default one day) with bounded retention (default 730 days). The existing one-shot background worker refreshes the aggregate cache, evaluates the service-only eligibility decision cache, then calls `capture_seo_community_aggregate_snapshots()`, which enforces snapshot cadence under an advisory lock and prunes expired snapshots. No individual profile rows or historical public pages are created; future historical statements must apply the same eligibility/privacy policy before publication.

Profile setup uses the shared database-backed language and comprehensive interest catalogues. Interests are selected by stable catalogue IDs through an inline searchable control (the same interaction pattern as Discover), with the existing minimum-count eligibility rule preserved. Optional personality/lifestyle and connection-goal fields are saved through the authenticated extended profile-save overload and remain independent of public communication-mode settings.

Google Auth login is separate from optional external-account verification. Sign-in/sign-up use Supabase Auth OAuth/PKCE through `/auth/callback` with only `openid email`; the callback performs the existing email, age, deactivation, and profile-setup checks but never writes `is_verified` or verification records. Settings identity linking uses Supabase's authenticated `linkIdentity`/`unlinkIdentity` APIs, a short-lived server-signed intent, and never merges accounts by email alone. Keep the login callback/state/cookie names separate from `src/app/auth/verification` and never expose Auth credentials or provider verification metadata publicly.

Password recovery uses the public `/forgot-password` request page, Supabase's generic reset-email response, `/auth/confirm?type=recovery`, and the public `/update-password` form. Password changes from Settings require the current password; users can revoke other sessions without ending the current browser session. Username/alias login resolution is password-gated and protected by server-side per-identifier throttling plus a trusted-proxy client bucket; do not expose the rate-limit table or resolver internals to clients.

Profile verification also supports a Supabase Auth TOTP factor. `profile_totp_verifications` stores only the Auth factor id and server-controlled 30-day/grace timing; the Auth service retains the secret. The public projection exposes only the existing boolean badge, and voluntary Pause shifts both deadlines by the paused duration. Keep Google Login and external-account verification separate from this profile badge flow.

Profile badges use the private `profile_badge_definitions` vocabulary and
secure public/staff projections. `Verified` remains controlled by the existing
verification flow; manual badges remain staff-assigned. Automatic graded
`Penpal Veteran` badges use `auth.users.created_at`, while graded `Profile
Builder` badges use the current ten-field profile completion calculation and
the server-enforced onboarding-entry predicate for Bronze. Derived badges are
never stored as assignments, and only the highest grade in each automatic
family is projected. `Active Penpal` grades count distinct dates from the
existing `activity_rank_events` `active_day` events, whose date-keyed event
keys make retries idempotent; account age and other activity signals do not
contribute to this badge.
`Correspondent` grades count distinct successful outgoing introductions from
`conversation_introductions`: the current `replied` status is the acceptance
transition that establishes a conversation. Incoming introductions and
duplicate rows for one conversation do not increase the sender's count; only
the highest qualifying grade is projected.
`Connector` grades count distinct other users represented in
`conversation_participants`, so multiple conversations or messages with one
person count once. The count and highest qualifying 25/75/150/300-contact grade
are projected server-side.
`Snail Mailer` grades count distinct letters sent by the user whose existing
Snail Mail lifecycle has reached `delivered_at`; a later `recipient_read_at`
does not count the same letter again, and cancelled/in-transit letters are
excluded. The highest qualifying 15/30/100/250-letter grade is projected
server-side and is never stored as a manual assignment.
`Reliable Replier` reuses the existing server-side response-statistics
semantics, including the five completed-opportunity minimum and seven-day
first-response window. Its highest qualifying 70/80/90/95% incoming response
rate grade is projected server-side and remains privacy-gated by the existing
response-rate visibility policy.
`Early Member` grades use the single official launch anchor
`2026-09-01T00:00:00Z` with `auth.users.created_at`: the highest qualifying
30-day, three-month, six-month, or 12-month window yields Platinum, Gold,
Silver, or Bronze respectively. The existing ungraded `early-member` key
remains manual for backwards compatibility; graded keys are system-derived
and never manually assigned.
`Quick Replier` uses the same privacy-safe incoming response population and
five-opportunity minimum as `Reliable Replier`, deriving average
`handled_at - created_at` latency server-side. Its highest qualifying
72/24/8/2-hour grade is projected server-side and is never manually assigned.

`Icebreaker` grades count distinct `conversation_introductions.id` rows where
the user is `sender_id`, regardless of pending/replied/declined/expired status
or acceptance. Its highest qualifying 10/50/200/500-introduction grade is
projected server-side and never manually assigned.

`Conversation Starter` grades count distinct server-recorded conversations
whose `response_opportunities.initiator_id` is the user. Its highest qualifying
10/50/200/500-conversation grade is projected server-side and never manually
assigned; incoming opportunities do not count.
`Letter Writer` grades count message rows whose `sender_id` is the user. The
existing account-erasure redaction (`sender_id` set to null) naturally removes
those rows from the user metric, while moderation flags do not duplicate or
rewrite message ownership. Its highest qualifying 100/500/2,500/10,000-message
grade is projected server-side and never manually assigned.
`Steady Penpal` grades count distinct calendar months represented by the user's
existing `activity_rank_events` `active_day` records. Multiple active days in
one month count once; the highest qualifying 3/6/12/24-month grade is projected
server-side and never manually assigned.
`Mystery Explorer` grades count distinct selected Mystery Pick cards from the
private `mystery_pick_cards` rows where `selected_at` is set for the user.
Exposure rows without a selection do not count; the highest qualifying
10/50/200/500-selection grade is projected server-side and never manually
assigned.
`Across Borders` grades count distinct non-null `recipient_country_code`
snapshots on delivered, non-cancelled Snail Mail letters sent by the user.
The route snapshot is used instead of the recipient's current profile; the
highest qualifying 5/15/30/60-country grade is projected server-side and never
manually assigned.
`Regional Explorer` grades count distinct `(recipient_country_code,
recipient_region_code)` snapshots on delivered, non-cancelled Snail Mail
letters sent by the user. Repeated letters to one region count once; the
highest qualifying 10/30/75/150-region grade is projected server-side and
never manually assigned.
`Mail Reader` grades count distinct delivered incoming Snail Mail letters where
the existing `recipient_read_at` lifecycle timestamp is set for the user.
Unread letters do not count; the highest qualifying 15/30/100/250-letter grade
is projected server-side and never manually assigned.
`Multilingual` grades count distinct current `profile_languages.language_id`
rows for the profile, so one language declared for multiple purposes counts
once. The highest qualifying 2/3/4/5-language grade is projected server-side
and never manually assigned.
`Language Learner` grades count distinct current `profile_languages.language_id`
rows whose purpose is `learning`; `speaks`-only rows do not count. The highest
qualifying 1/2/3/4-learning-language grade is projected server-side and never
manually assigned.
`Interest Explorer` grades count distinct current `profile_interests.interest_id`
rows for the profile. The highest qualifying 5/10/20/30-interest grade is
projected server-side and never manually assigned.

Snail Mail letters are immutable after send. `cancel_snail_mail(uuid)` is the only sender-authorized cancellation path while a letter is still travelling; it records internal `cancelled_at` state and exposes only a shared `lost_in_transit` outcome to the recipient. Cancelled letters never transition to delivered/read, and the delivery worker rechecks cancellation under its row lock.

Moderation escalations use the existing `moderation_cases` and immutable audit records. Moderators can request administrator attention only through the reason-gated, active-claim action; the request is idempotent and does not enforce punishment. The administrator-only `/app/admin/inbox` route reads a server-filtered escalation projection and reuses the existing case detail, claim, reassignment, status, evidence, and audit paths. Do not expose the Admin Inbox or its RPC to moderators or ordinary users.

Support is a separate staff-only workflow backed by `support_tickets`, `support_ticket_messages`, and private `support_ticket_attachments`. The `/app/admin/support` inbox and `/app/admin/support/[id]` ticket view use the server-authorized `staff_list_support_tickets` and `staff_get_support_ticket` projections; moderators and administrators may read support data, while ordinary users have no table access. Ticket detail signs attachment paths only after the staff check and renders them through the authorized client viewer; the storage bucket remains private. Users can submit requests at `/app/support`, review their own history at `/app/support/requests`, and open an owner-scoped detail at `/app/support/requests/[id]`; `get_my_support_tickets` and `get_my_support_ticket` enforce ownership, return public messages in chronological order, and filter `is_internal` notes server-side. Owners can append public replies through the owner-checked, idempotent `reply_to_support_ticket` RPC; active tickets move to `waiting_staff`, while resolved tickets reject replies. Public pre-login contact uses the same ticket tables but the separate `public_contact` ticket type, anonymous-safe `submit_public_contact_ticket` RPC, and dedicated `/app/admin/contact` staff queue; it stores only submitted contact details plus hashed request metadata, never grants table access to anonymous users, and keeps normal Support Inbox counts separate from Contact Inbox counts. Staff lifecycle actions use separate claim/release, public-reply/email-reply, internal-note, and status RPCs; moderators must claim before mutating an assigned ticket, authenticated support replies move to `waiting_user`, Contact Inbox replies send email through the server-only Resend API before being recorded on the ticket, internal notes remain staff-only, and resolved tickets can only be reopened as `open`. The existing notification stream announces new support/contact tickets and requester replies to active staff, and public replies, waiting-for-user requests, resolutions, and reopenings to signed-in requesters; public contact tickets have no requester notification because they have no requester account. User confirmation details come from `get_my_support_ticket_confirmation`, and submission tokens make repeated POSTs idempotent. Keep support ticket statuses/categories independent from moderation cases so future intake types (including appeals) can be added without rebuilding the queue.
