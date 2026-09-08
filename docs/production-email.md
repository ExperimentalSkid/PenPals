# Production Auth email

Pen-Pals uses Resend as the SMTP transport for its self-hosted Supabase Auth
service. Supabase—not application code—continues to create tokens and send
signup, resend, recovery, invitation, email-change, magic-link and
reauthentication messages. The Resend REST API was used only for a one-off
provider delivery check; no Resend runtime package or parallel sender exists.

## Local and production separation

| Environment | Email path |
| --- | --- |
| Local | Existing Supabase CLI configuration and Mailpit on port 54324. |
| VPS | Existing official Supabase Docker stack plus `deploy/supabase/docker-compose.auth-email.yml`; Resend SMTP and a private template service. |
| Next.js | Uses the public self-hosted Supabase URL and publishable key. SMTP and Resend secrets never reach browser code. |

The local `.env.local` and `supabase/config.toml` were deliberately not changed.
Do not copy local JWTs, database passwords, localhost URLs or Mailpit settings to
the VPS.

## GitHub to VPS

The VPS must already have the official self-hosted Supabase Docker stack and its
private environment. Clone this repository to a stable absolute path, for
example `/srv/penpals`. Copy the variables in
`deploy/supabase/.env.email.example` into the VPS's private Supabase environment
and set the real Resend key. Keep that populated file outside Git and readable
only by the deployment account.

The official Supabase environment must also set its real `SUPABASE_PUBLIC_URL`
and `API_EXTERNAL_URL`. The Next.js build/runtime must set
`NEXT_PUBLIC_SUPABASE_URL` to the corresponding public API gateway origin and
`NEXT_PUBLIC_SITE_URL=https://pen-pals.net`. Use the generated production
publishable and secret/service credentials from that self-hosted stack; do not
reuse local values.

Apply application migrations through the documented database release process.
Do not run `supabase/seed.sql` on the VPS: it creates local demonstration
accounts with known development passwords.

Validate the Pen-Pals email variables in the environment used by the deployment:

```sh
pnpm install --frozen-lockfile
pnpm check:production-email
```

The validator reads process environment variables. If the settings are in a
private environment file instead, load that file explicitly with Node:

```sh
node --env-file=/path/to/private/penpals-email.env scripts/validate-production-email-config.mjs
```

Then merge the email overlay with the existing official Compose file. Run from
the Supabase Docker directory so its normal `.env` and volumes remain active:

```sh
docker compose \
  -f docker-compose.yml \
  -f /srv/penpals/deploy/supabase/docker-compose.auth-email.yml \
  config --quiet

docker compose \
  -f docker-compose.yml \
  -f /srv/penpals/deploy/supabase/docker-compose.auth-email.yml \
  up -d --no-deps penpals-auth-templates auth
```

`PENPALS_REPOSITORY_PATH` must be the actual absolute checkout path. The
template directory is mounted read-only with automatic host-path creation
disabled. Caddy listens only inside the Compose network; the overlay publishes
no port. Supabase Auth requires templates over HTTP and does not read mounted
template files directly.

After every template or Auth-image change, validate the merged configuration and
recreate `penpals-auth-templates` and `auth`. Do not run a destructive database
reset. The overlay extends the existing `auth` service, preserving its image,
database dependency, API origin, signing keys, OAuth providers and other current
environment values.

## Required private settings

- `SUPABASE_AUTH_SMTP_HOST=smtp.resend.com`
- `SUPABASE_AUTH_SMTP_PORT=465` (implicit TLS; Resend also supports 587 with STARTTLS)
- `SUPABASE_AUTH_SMTP_USER=resend`
- `RESEND_API_KEY=<sending key>`
- `SUPABASE_AUTH_SMTP_ADMIN_EMAIL=no-reply@pen-pals.net`
- `SUPABASE_AUTH_SMTP_SENDER_NAME=Pen-Pals`
- `NEXT_PUBLIC_SITE_URL=https://pen-pals.net`
- the exact full `SUPABASE_AUTH_URI_ALLOW_LIST` from the example, merged with any other reviewed production callbacks
- `PENPALS_REPOSITORY_PATH=<absolute VPS checkout path>`

The sender therefore renders as `Pen-Pals <no-reply@pen-pals.net>`. Never name a
secret with `NEXT_PUBLIC_`. `.env*` is ignored except for explicit placeholder
examples, but the staged Git content must still be scanned before every push.
Rotate any key exposed in chat before the final production deployment.

## Templates and preserved behavior

Six production templates are kept in `supabase/templates/production` and served
to Auth over the private Compose network:

- confirmation/resend → `/auth/confirm?token_hash=…&type=signup`
- recovery → `/auth/confirm?token_hash=…&type=recovery`, then the existing password update page
- invite, magic-link and email-change → Supabase's full `ConfirmationURL`
- reauthentication → Supabase's one-time `Token`

The existing confirmation handler continues to support token hashes, PKCE codes,
and session fragments. Age checks, onboarding, sessions and provider login are
unchanged. The callback allow-list includes the email confirmation route and the
existing Google login/link routes. Existing security-notification enabled states
and default templates are not changed; any already-enabled notification uses the
same Resend SMTP transport. Do not enable product flows merely to test mail.

## Resend and DNS

The requested `pen-pals.net` sender was accepted by Resend's API after the user
added the correct domain. The supplied sending-only key cannot list the domain,
read its DNS records, or query delivery status. That is expected least privilege,
but it means DNS values and tracking state cannot be audited through that key.

In the Resend dashboard, ensure `pen-pals.net` is **Verified**, not merely added.
Publish the exact DKIM and sending SPF/MX records Resend displays; preserve
existing inbound mail records and do not use guessed values. Disable click/open
tracking for Auth email because link rewriting can damage one-use confirmation
links. Review the existing DMARC policy rather than overwriting it blindly.

## Launch verification

Repository checks prove wiring and templates, not the not-yet-deployed VPS. Once
the HTTPS app and self-hosted Supabase are online:

1. Create a controlled new account and confirm the signup message reaches its inbox.
2. Open the confirmation link and verify onboarding begins.
3. Resend confirmation and verify the replacement message works.
4. Request password recovery and verify the link reaches the password form.
5. Exercise only the invitation, magic-link, email-change, reauthentication and
   security-notification flows that the deployed product already enables.
6. Inspect links: no localhost, Mailpit or tracking redirect may appear.
7. Confirm local signup still arrives in Mailpit after production deployment.

The production email system is code-complete but cannot be called operational
until the VPS exists and these real Auth delivery/callback checks pass.

Authoritative references: [Supabase self-hosting with Docker](https://supabase.com/docs/guides/self-hosting/docker),
[Supabase self-hosted Auth configuration](https://supabase.com/docs/guides/self-hosting/auth/config),
[Supabase self-hosted email templates](https://supabase.com/docs/guides/self-hosting/custom-email-templates),
[Resend SMTP for Supabase](https://resend.com/docs/send-with-supabase-smtp), and
[Resend Auth deliverability guidance](https://resend.com/docs/knowledge-base/how-do-i-maximize-deliverability-for-supabase-auth-emails).
