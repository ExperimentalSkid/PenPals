# Production backup and recovery

Pen-Pals production backups are created by `penpals-backup.timer` using `deploy/penpals-backup.sh`.

## Schedule and retention

- Runs daily at 03:30 UTC with up to 15 minutes of randomized delay.
- Uses a non-blocking lock so two backups cannot run at once.
- Stores backups under `/var/backups/penpals/<UTC timestamp>/`.
- Keeps 14 days of local backups.
- Local backups are root-only and remain on the VPS; an encrypted off-host copy is still required for full disaster recovery.

## Backup contents

Each backup contains the PostgreSQL custom-format dump, Supabase Storage files, runtime configuration, TLS/nginx/firewall/SSH configuration, the live source tree, Git state/diffs, and SHA-256 checksums.

## Recovery rule

Always restore into an isolated database/container first. The production Supabase Postgres image uses a restricted `postgres` role; full archive restoration was validated with `supabase_admin`. Validate schema/data and Storage before any production recovery.

Never overwrite a running production database as the first restore test.