#!/usr/bin/env bash
set -euo pipefail
umask 077

BACKUP_ROOT=/var/backups/penpals
PROJECT=/var/www/pen-pals.net
STORAGE=/opt/supabase/docker/volumes/storage
RETENTION_DAYS=14
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DEST="$BACKUP_ROOT/$STAMP"
LOCK=/run/lock/penpals-backup.lock

exec 9>"$LOCK"
flock -n 9 || { echo "backup already running" >&2; exit 0; }
mkdir -p "$DEST"
STATUS_DIR="$BACKUP_ROOT/.status"
mkdir -p "$STATUS_DIR"
backup_failed() {
  rc=$?
  rm -rf "$DEST"
  printf '%s\n' "$STAMP" > "$STATUS_DIR/last-failure"
  exit "$rc"
}
trap backup_failed ERR

# Database: custom-format PostgreSQL archive.
docker exec supabase-db pg_dump -U postgres -d postgres -Fc > "$DEST/postgres.dump"
docker cp "$DEST/postgres.dump" supabase-db:/tmp/penpals-backup-verify.dump >/dev/null
docker exec supabase-db pg_restore -l /tmp/penpals-backup-verify.dump >/dev/null
docker exec supabase-db rm -f /tmp/penpals-backup-verify.dump

# Private Storage buckets.
tar -C "$(dirname "$STORAGE")" -czf "$DEST/storage.tgz" "$(basename "$STORAGE")"

# Runtime/deployment configuration required to rebuild the service.
tar -czf "$DEST/runtime-config.tgz" \
  /etc/penpals \
  /etc/systemd/system/penpals.service \
  /etc/systemd/system/penpals.service.d \
  /etc/systemd/system/penpals-jobs.service \
  /etc/systemd/system/penpals-jobs.timer \
  /etc/systemd/system/penpals-email-notifications.service \
  /etc/systemd/system/penpals-email-notifications.timer \
  /etc/systemd/system/penpals-snail-photo-cleanup.service \
  /etc/systemd/system/penpals-snail-photo-cleanup.timer \
  /etc/systemd/system/penpals-backup.service \
  /etc/systemd/system/penpals-backup.timer \
  /usr/local/sbin/penpals-backup \
  /etc/nginx/sites-available/pen-pals.net \
  /etc/nginx/sites-enabled/pen-pals.net \
  /etc/nginx/sites-available/supabase.pen-pals.net \
  /etc/nginx/sites-enabled/supabase.pen-pals.net \
  /etc/letsencrypt \
  /etc/ufw \
  /etc/fail2ban \
  /etc/ssh/sshd_config \
  /etc/ssh/sshd_config.d \
  /opt/supabase/docker/.env \
  /opt/supabase/docker/docker-compose.yml \
  2>/dev/null

cd "$PROJECT"
git rev-parse HEAD > "$DEST/git-head.txt"
git status --short --branch > "$DEST/git-status.txt"
git diff > "$DEST/worktree.diff"
git diff --cached > "$DEST/index.diff"
docker inspect supabase-db --format '{{.Config.Image}}' > "$DEST/database-image.txt"

# Keep the live source/worktree as well as the Git commit pointer. This protects
# deploy-time edits that have not been pushed yet without copying build/dependency caches.
tar --exclude='./.git' --exclude='./node_modules' --exclude='./.next' \
  --exclude='./.agents' --exclude='./.claude' --exclude='./.env.local' \
  -czf "$DEST/source-tree.tgz" .

cat > "$DEST/restore-notes.txt" <<'EOF'
Database restore was validated with the matching Supabase Postgres image.
Use the supabase_admin database role for a full restore; the restricted postgres
role cannot recreate every Supabase-owned object. Restore only into a fresh, isolated
database/container first and validate before any production recovery.
EOF

printf 'created_utc=%s\nretention_days=%s\n' "$STAMP" "$RETENTION_DAYS" > "$DEST/manifest.txt"
(
  cd "$DEST"
  find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
  sha256sum -c SHA256SUMS >/dev/null
)
chmod -R go-rwx "$DEST"
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -exec rm -rf -- {} +
printf '%s\n' "$STAMP" > "$STATUS_DIR/last-success"
date -u +%s > "$STATUS_DIR/last-success-epoch"
printf '%s\n' "$DEST" > "$STATUS_DIR/last-success-path"
rm -f "$STATUS_DIR/last-failure"
echo "Pen-Pals backup complete: $DEST"
