#!/usr/bin/env bash
# Dump MySQL for restaurant-pos, keep a rolling local archive, and optionally
# upload to Backblaze B2.
#
# Secrets live ONLY on the server (never in git):
#   /etc/restaurant-pos.env          — MySQL + app
#   /etc/restaurant-pos-backup.env   — Backblaze B2 (see config/restaurant-pos-backup.env.example)
#
# Install once on the POS server:
#   sudo mkdir -p /var/backups/restaurant-pos
#   sudo install -m 750 scripts/backup-mysql.sh /usr/local/sbin/restaurant-pos-backup-mysql
#   sudo install -m 600 config/restaurant-pos-backup.env.example /etc/restaurant-pos-backup.env
#   sudo nano /etc/restaurant-pos-backup.env   # paste B2_KEY_ID + B2_APPLICATION_KEY
#   sudo apt-get install -y rclone            # only needed for B2 upload
#   sudo crontab -e
#   # daily 02:15:
#   15 2 * * * /usr/local/sbin/restaurant-pos-backup-mysql >>/var/log/restaurant-pos-backup.log 2>&1
#
# Manual run:
#   sudo /usr/local/sbin/restaurant-pos-backup-mysql

set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/restaurant-pos.env}"
BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-/etc/restaurant-pos-backup.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/restaurant-pos}"
KEEP_DAYS="${KEEP_DAYS:-14}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
RSYNC_TARGET="${RSYNC_TARGET:-}"

die() { printf 'error: %s\n' "$*" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE"
command -v mysqldump >/dev/null || die "mysqldump is not installed"
command -v gzip >/dev/null || die "gzip is not installed"

env_value() {
  local file="$1"
  local key="$2"
  [[ -f "$file" ]] || return 0
  awk -F= -v k="$key" '$1 == k { sub(/^[^=]+=/, ""); print; exit }' "$file"
}

# Load optional backup secrets (B2_*). Prefer dedicated file; fall back to app env.
load_backup_env() {
  B2_KEY_ID="$(env_value "$BACKUP_ENV_FILE" B2_KEY_ID)"
  B2_APPLICATION_KEY="$(env_value "$BACKUP_ENV_FILE" B2_APPLICATION_KEY)"
  B2_BUCKET="$(env_value "$BACKUP_ENV_FILE" B2_BUCKET)"
  B2_PREFIX="$(env_value "$BACKUP_ENV_FILE" B2_PREFIX)"
  local keep
  keep="$(env_value "$BACKUP_ENV_FILE" KEEP_DAYS)"
  [[ -n "$keep" ]] && KEEP_DAYS="$keep"
  local remote
  remote="$(env_value "$BACKUP_ENV_FILE" RCLONE_REMOTE)"
  [[ -n "$remote" ]] && RCLONE_REMOTE="$remote"
  local rsync
  rsync="$(env_value "$BACKUP_ENV_FILE" RSYNC_TARGET)"
  [[ -n "$rsync" ]] && RSYNC_TARGET="$rsync"

  if [[ -z "$B2_KEY_ID" ]]; then
    B2_KEY_ID="$(env_value "$ENV_FILE" B2_KEY_ID)"
  fi
  if [[ -z "$B2_APPLICATION_KEY" ]]; then
    B2_APPLICATION_KEY="$(env_value "$ENV_FILE" B2_APPLICATION_KEY)"
  fi
  if [[ -z "$B2_BUCKET" ]]; then
    B2_BUCKET="$(env_value "$ENV_FILE" B2_BUCKET)"
  fi
  if [[ -z "$B2_PREFIX" ]]; then
    B2_PREFIX="$(env_value "$ENV_FILE" B2_PREFIX)"
  fi

  B2_BUCKET="${B2_BUCKET:-restaurant-pos-st}"
  B2_PREFIX="${B2_PREFIX:-mysql}"
}

MYSQL_HOST="$(env_value "$ENV_FILE" MYSQL_HOST)"
MYSQL_PORT="$(env_value "$ENV_FILE" MYSQL_PORT)"
MYSQL_USER="$(env_value "$ENV_FILE" MYSQL_USER)"
MYSQL_PASSWORD="$(env_value "$ENV_FILE" MYSQL_PASSWORD)"
MYSQL_DATABASE="$(env_value "$ENV_FILE" MYSQL_DATABASE)"
load_backup_env

[[ -n "$MYSQL_USER" && -n "$MYSQL_DATABASE" ]] || die "MYSQL_USER / MYSQL_DATABASE missing in $ENV_FILE"
MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${MYSQL_PORT:-3306}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
tmp="$(mktemp "$BACKUP_DIR/.dump.XXXXXX.sql")"
out="$BACKUP_DIR/${MYSQL_DATABASE}-${stamp}.sql.gz"

cleanup() { rm -f "$tmp"; }
trap cleanup EXIT

export MYSQL_PWD="$MYSQL_PASSWORD"
mysqldump \
  --protocol=TCP \
  --host="$MYSQL_HOST" \
  --port="$MYSQL_PORT" \
  --user="$MYSQL_USER" \
  --single-transaction \
  --no-tablespaces \
  --routines \
  --triggers \
  --events \
  --default-character-set=utf8mb4 \
  --databases "$MYSQL_DATABASE" \
  >"$tmp"
unset MYSQL_PWD

gzip -c "$tmp" >"$out"
chmod 600 "$out"
printf 'wrote %s (%s)\n' "$out" "$(du -h "$out" | awk '{print $1}')"

# Drop dumps older than KEEP_DAYS (local only).
find "$BACKUP_DIR" -maxdepth 1 -type f -name "${MYSQL_DATABASE}-*.sql.gz" -mtime "+${KEEP_DAYS}" -delete

upload_b2() {
  if [[ -z "$B2_KEY_ID" || -z "$B2_APPLICATION_KEY" ]]; then
    if [[ -f "$BACKUP_ENV_FILE" ]]; then
      printf 'skip B2 upload: set B2_KEY_ID and B2_APPLICATION_KEY in %s\n' "$BACKUP_ENV_FILE"
    else
      printf 'skip B2 upload: create %s from config/restaurant-pos-backup.env.example\n' "$BACKUP_ENV_FILE"
    fi
    return 0
  fi
  command -v rclone >/dev/null || die "rclone is not installed (apt install rclone) but B2 keys are set"

  # Inline B2 remote — no rclone.conf needed; keys stay in the env file.
  local dest=":b2,account=${B2_KEY_ID},key=${B2_APPLICATION_KEY}:${B2_BUCKET}/${B2_PREFIX}"
  rclone copy "$out" "$dest" --checksum --b2-hard-delete=false
  printf 'uploaded to b2://%s/%s/\n' "$B2_BUCKET" "$B2_PREFIX"
}

if [[ -n "$RCLONE_REMOTE" ]]; then
  command -v rclone >/dev/null || die "rclone not installed but RCLONE_REMOTE is set"
  rclone copy "$out" "$RCLONE_REMOTE" --checksum
  printf 'copied to rclone remote %s\n' "$RCLONE_REMOTE"
else
  upload_b2
fi

if [[ -n "$RSYNC_TARGET" ]]; then
  command -v rsync >/dev/null || die "rsync not installed but RSYNC_TARGET is set"
  rsync -a "$out" "$RSYNC_TARGET/"
  printf 'rsynced to %s\n' "$RSYNC_TARGET"
fi
