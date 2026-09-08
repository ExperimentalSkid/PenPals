# Pen-Pals.net Badge Metrics Audit

## ChatGPT-ready context

You are helping define an automated badge system for the existing Pen-Pals.net application. Use only the evidence in this document and the referenced repository files. Do not invent tables, events, product behavior, or user data.

The application is a Supabase-backed Pen-Pals community. Any community statistic must describe Pen-Pals.net members only; it must never be presented as a statistic about the general population.

The audit is inventory-only. No application or database changes were made while producing this document.

## Source of truth

Repository: the Pen-Pals project root

Primary references:

- `docs/data-inventory.md`
- `supabase/migrations/20260901000000_create_profiles.sql`
- `supabase/migrations/20260901010000_add_languages_interests.sql`
- `supabase/migrations/20260901030000_add_messaging.sql`
- `supabase/migrations/20260901040000_add_response_rate.sql`
- `supabase/migrations/20260901080000_refactor_introductions.sql`
- `supabase/migrations/20260901090000_tighten_icebreaker_validation.sql`
- `supabase/migrations/20260901100000_add_reports.sql`
- `supabase/migrations/20260903000000_activity_ranks_and_inactive_mode.sql`
- `supabase/migrations/20260903020000_snail_mail.sql`
- `supabase/migrations/20260903150000_communication_anti_spam_guards.sql`
- `supabase/migrations/20260903160000_add_personality_lifestyle_profile.sql`
- `supabase/migrations/20260903170000_add_connection_preferences_profile.sql`
- `supabase/migrations/20260904250000_profile_totp_verification.sql`
- `supabase/migrations/20260904200000_staff_analytics.sql`
- `supabase/migrations/20260905110000_onboarding_entry_minimum.sql`
- `supabase/migrations/20260905120000_seo_data_normalization.sql`
- `supabase/migrations/20260905130000_seo_community_aggregation.sql`
- `supabase/migrations/20260905140000_seo_aggregate_eligibility.sql`
- `supabase/migrations/20260905170000_seo_aggregate_history.sql`
- `supabase/migrations/20260905220000_profile_badges.sql`
- `src/lib/profile-completeness.ts`
- `src/lib/supabase/proxy.ts`
- `src/app/app/layout.tsx`

## Classification meanings

- **Ready to use directly**: the underlying server-authoritative value or event is already stored.
- **Reliably derivable**: a useful metric can be calculated from existing authoritative rows, joins, or existing database functions.
- **Available only with additional tracking**: the product does not currently store enough evidence for a reliable metric.

“Historical” means row-level or timestamp history exists. A current mutable value with only `updated_at` is not a full history.

## 1. Ready to use directly

| Metric | What it measures | Exact source | Stored/derived | Historical data | Per-user | Reliable server-side | Limitations |
|---|---|---|---|---|---|---|---|
| Account creation | When the auth account was created | `auth.users.created_at`; `public.profiles.created_at` | Stored | Creation timestamp only | Yes | Yes, with auth/admin access | Profile creation can lag account creation. |
| Email/provider identity state | Email confirmation and linked providers | `auth.users.email_confirmed_at`; `auth.identities.provider`, `provider_id`, `created_at`, `last_sign_in_at` | Stored | Partial provider-managed history | Yes | Yes | Provider retention and linking behavior apply. |
| Latest sign-in | Most recent successful sign-in | `auth.users.last_sign_in_at` | Stored | No complete login ledger | Yes | Yes | Only the latest value is application-visible. |
| Current profile identity/location | Display name, birth date, country, region, locality, city, availability, role, activity/privacy state | `public.profiles` fields including `display_name`, `birth_date`, `country_code`, `region_code`, `locality_id`, `availability`, `role`, `inactive_mode`, `deactivated_at` | Stored | Current state only | Yes | Yes | Users can edit or remove values. |
| Declared languages | Languages spoken or learned, purpose, proficiency | `public.profile_languages` joined to `public.languages`; `purpose` is `speaks` or `learning` | Stored | Current rows only | Yes | Yes | Declared preference/ability is not demonstrated behavior. |
| Declared interests | User-selected interests | `public.profile_interests` joined to `public.interests` | Stored | Current rows only | Yes | Yes | Self-selected only. |
| Connection goals | What type of connection the user wants | `profiles.connection_goals` | Stored array | Current state only | Yes | Yes | No goal-change history. |
| Current verification state | Whether the profile currently qualifies for the verification projection | `profile_totp_verifications`; `external_account_verifications`; `is_profile_verified(target_user)` | Stored/projection | Current timing/status only | Yes | Yes | TOTP renewal overwrites the same row. |
| Activity/rank state | Current and lifetime activity score, active days/months, meaningful activity, freeze state | `activity_rank_state` | Stored state | State plus event history | Yes | Yes | Only the defined activity events contribute. |
| Activity events | Recorded active days, accepted conversations, healthy responses | `activity_rank_events.event_type` and `occurred_at` | Stored events | Yes | Yes | Yes | This is not a general-purpose event stream. |
| Message events | Message sender, conversation, timestamp, moderation state | `messages.sender_id`, `conversation_id`, `created_at`, `moderation_status` | Stored events | Yes | Yes through joins | Yes | `sender_id` may be null after account deletion. |
| Conversation membership | Participants and read position | `conversations`; `conversation_participants.user_id`, `last_read_at` | Stored | Yes | Yes | Yes | Membership alone does not prove meaningful exchange. |
| Introduction lifecycle | Introduction body, sender/recipient, status and timestamps | `conversation_introductions.status`, `sender_id`, `recipient_id`, `created_at`, `handled_at`, `expires_at` | Stored | Yes | Yes | Yes | Workflow state is not relationship quality. |
| Response opportunities | Whether the recipient responded and when | `response_opportunities.responded_at` | Stored | Yes | Yes | Yes | One opportunity per conversation. |
| Snail Mail lifecycle | Sent, delivery, read, cancellation and route snapshots | `snail_mail_letters.sent_at`, `deliver_at`, `delivered_at`, `recipient_read_at`, `cancelled_at`, sender/recipient country/region/locality fields | Stored | Yes | Yes | Yes | Delivery/read is not equivalent to a reply. |
| Reports/moderation events | Reports, cases, notes, flags, assignments and actions | `reports`; `moderation_cases`; `moderation_case_notes`; `moderation_audit_log`; `moderation_content_flags` | Stored | Yes, subject to retention/redaction | Yes where authorized | Yes | Safety operations are not positive contribution evidence. |
| Notifications | Notification creation and read state | `notifications.created_at`, `read_at`, `type`, `user_id` | Stored | Stored notification history | Yes | Yes | No complete click/action history. |
| Privacy interactions | Blocks and photo-access requests/grants | `profile_blocks`; `profile_photo_access_requests`; `profile_photo_access_grants` | Stored | Yes | Yes | Yes | These should not be interpreted as positive badges. |
| Mystery Pick usage | Candidate exposure and selection activity | `mystery_pick_sessions`, `mystery_pick_cards`, `mystery_pick_exposures` | Stored | Yes | Yes | Yes | Selection creates no contact by itself. |
| Manual badge assignment | Current manually assigned badge and assigning staff member | `profile_badges.user_id`, `badge_key`, `assigned_by`, `assigned_at` | Stored | Assignment timestamp; audit history for staff action | Yes | Yes | No automatic earning criteria are attached. |

## 2. Reliably derivable from existing data

| Metric | Derivation and exact source | Historical data | Per-user/server-side | Limitations |
|---|---|---|---|---|
| Account tenure | `now() - auth.users.created_at` | Yes | Yes / Yes | Distinguish account age from profile age. |
| Profile completion | `onboardingEntryComplete` and `profileCompletionProgress` in `src/lib/profile-completeness.ts`; enforcement/counts in `src/lib/supabase/proxy.ts`, `src/app/app/layout.tsx`, and `save_profile` in `20260905110000_onboarding_entry_minimum.sql` | Current only | Yes / Yes | Entry completion requires username, display name, birth date, country, at least one language and three interests. Progress also includes gender, location, bio, quote, legacy `looking_for`, languages/interests and photo, so predicates are not identical. |
| Messages sent | Count `messages` by `sender_id` | Yes | Yes / Yes | Deleted accounts can leave null senders. |
| Messages received | Join `messages` to `conversation_participants` and exclude the sender | Yes | Yes / Yes | Recipient is inferred from membership. |
| Unique contacts | Count distinct other participant IDs in `conversation_participants` | Partial after deletion/anonymization | Yes / Yes | Historical identity can disappear. |
| Conversations started | Count `conversations.created_at`, introduction-created conversations, or accepted-conversation events | Yes | Yes / Yes | Creation does not prove sustained exchange. |
| Introduction acceptance | `conversation_introductions.status = 'replied'` or `activity_rank_events.event_type = 'accepted_conversation'` | Yes | Yes / Yes | Measures acceptance, not long-term success. |
| First-response rate/latency | Existing `get_response_stats()` over `response_opportunities` | Yes | Yes / Yes | First reply only, within seven days; rate is withheld below five completed opportunities. |
| Conversation duration proxy | Minimum/maximum `messages.created_at` and `conversations.updated_at` | Yes | Yes / Yes | Not a true duration or continuity measure; `updated_at` depends on caller behavior. |
| Active days/months | Count `activity_rank_events.event_type = 'active_day'`; use rank-state totals | Yes | Yes / Yes | One active-day event per date via `touch_activity()`; inactive/paused users are suppressed. |
| Interacted countries/regions | Join conversation participants to current normalized profile locations; use Snail Mail immutable route snapshots where available | Partial | Yes / Yes | Ordinary message geography changes when profiles change or are deleted. |
| Language/interest/goal distribution | `seo_profile_dimensions()` and `seo_community_aggregates` across country, region, language, interest, goal and selected pairs | Current plus aggregate snapshots | Community-level / Yes | These are Pen-Pals member statistics, not general-population statistics and not user interaction evidence. |
| Snail Mail counts | Count sent, delivered, read and cancelled letters in `snail_mail_letters` | Yes | Yes / Yes | Delivery timing and cancellation affect interpretation. |
| Reports submitted/about a user | Count `reports.reporter_id` or target fields | Partial | Yes / Yes | Redaction/deletion policies may remove records. |
| Moderation involvement | Count cases, flags and audit actions involving a user | Partial | Yes for authorized staff | Indicates moderation activity, not merit. |
| Notification read rate | Compare `notifications.created_at` and `read_at` | Yes for stored notifications | Yes / Yes | It is not a complete engagement or click-through measure. |
| Mystery Pick usage | Count exposures and cards with `selected_at` | Yes | Yes / Yes | Measures feature use only. |
| Photo-access activity | Count requests, grants and response timing | Yes | Yes / Yes | Indicates privacy interactions, not trustworthiness. |
| Platform-period engagement | `admin_analytics_summary()` in `20260904200000_staff_analytics.sql` | Period aggregates | No / Staff-only | Useful for platform health, not individual earning rules. |

## 3. Available only with additional tracking

1. **Recurring verification history** — renewal count, streaks, prior verification periods and revocations. `profile_totp_verifications` has one row per user and overwrites timing values; `auth.mfa_challenges` is Supabase-managed.
2. **Complete login/session behavior** — login count, session duration, return frequency, device history and reliable active-session history.
3. **Profile-completeness history** — only the current profile state is stored; there are no completeness snapshots.
4. **True conversation quality** — continuity, mutual engagement, dwell time, follow-up quality, churn or relationship outcomes.
5. **Immutable geography for ordinary messaging** — regular messages do not snapshot location; only Snail Mail stores route snapshots.
6. **Helpful/community recognition** — no tables or RPCs were found for thanks, reactions, endorsements, helpful votes or peer recognition.
7. **Events** — no event/calendar model was found for attendance, hosting or participation.
8. **Discovery funnel metrics** — profile views, likes, search impressions, referrals and invite conversions are not tracked as durable user events. Mystery Pick exposure is limited to that feature.
9. **Positive staff/community contribution** — moderation audit data records staff operations, not a general contribution metric suitable for member badges.
10. **Per-message read state** — only participant-level `last_read_at` exists, not message-level receipts.
11. **Notification actions** — notification clicks and completed actions are not stored.
12. **Automated badge evidence history** — assignment timestamps exist, but not automatic earning evidence, threshold snapshots or per-badge revocation reasons.
13. **Content quality/kindness/report accuracy** — requires explicit labels, policy definitions and likely additional review signals.
14. **Historical profile dimensions** — language, interest, goal and location changes are not versioned.

## Strongest current candidates for automated badges

These have the clearest server-authoritative evidence today:

- account tenure (`auth.users.created_at`)
- current minimum profile completion
- active days/months and lifetime rank state
- accepted conversations
- first-response behavior, with the existing sample-size and seven-day limits
- distinct conversation contacts
- Snail Mail letters delivered/read

The current data does **not** justify automatic “Helpful Penpal”, “Community Contributor”, or “Event Host” rules without additional tracking or an explicit manual-assignment policy.

## Constraints for any future badge rules

- Calculate on the server from authoritative rows or trusted database functions.
- Never trust a client-supplied count or badge state.
- Define minimum sample sizes before awarding behavioral badges.
- Account for deletion, anonymization, redaction and retention behavior.
- Do not treat declared profile data as proof of activity.
- Keep verification meaning tied to the existing TOTP/external verification system.
- Do not expose private records or infer sensitive traits.
- Keep aggregate SEO statistics explicitly scoped to Pen-Pals.net members.
- Note that the legacy `profiles.looking_for` column and some backend completeness/discovery predicates still exist even though parts of the UI were removed.

## Prompt for the next ChatGPT pass

Using this inventory, propose a small, permission-safe automated badge ruleset for the existing eight badge definitions (Verified, Early Member, Helpful Penpal, Community Contributor, Language Exchange, Local Guide, Event Host, Kind Presence).

For every proposed rule:

1. Use only metrics classified as ready or reliably derivable.
2. State the exact source query/data path.
3. Identify the minimum sample size and anti-gaming considerations.
4. Explain whether the rule is automatic or must remain manual.
5. Explain how deletion, inactivity, privacy settings and data retention affect it.
6. Do not add schema, tracking, UI or product behavior unless explicitly requested.

If a badge cannot be justified from existing data, say so plainly instead of inventing a criterion.

