#!/usr/bin/env bash
set -euo pipefail

STATUS_DIR=/var/backups/penpals/.status
MAX_AGE_SECONDS=$((36 * 60 * 60))
SUCCESS_FILE="$STATUS_DIR/last-success"
EPOCH_FILE="$STATUS_DIR/last-success-epoch"
PATH_FILE="$STATUS_DIR/last-success-path"

fail() { echo "Pen-Pals backup health: $*" >&2; exit 1; }
[[ -s "$SUCCESS_FILE" ]] || fail "no successful-backup marker"
[[ -s "$EPOCH_FILE" ]] || fail "no successful-backup epoch marker"
[[ -s "$PATH_FILE" ]] || fail "no successful-backup path marker"

stamp=$(cat "$SUCCESS_FILE")
backup_path=$(cat "$PATH_FILE")
backup_epoch=$(cat "$EPOCH_FILE")
[[ "$backup_epoch" =~ ^[0-9]+$ ]] || fail "invalid success epoch marker"
now_epoch=$(date -u +%s)
age=$((now_epoch - backup_epoch))
(( age >= 0 && age <= MAX_AGE_SECONDS )) || fail "last successful backup is ${age}s old"
[[ -d "$backup_path" ]] || fail "recorded backup directory is missing"
[[ -s "$backup_path/SHA256SUMS" ]] || fail "recorded backup checksum manifest is missing"
systemctl is-active --quiet penpals-backup.timer || fail "backup timer is not active"

echo "Pen-Pals backup health OK: last success $stamp (${age}s ago)"
