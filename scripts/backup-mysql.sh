#!/usr/bin/env bash
# Dump MySQL for restaurant-pos and keep a rolling local archive.
# Designed for the bare-metal box that already has /etc/restaurant-pos.env.
#
# Install once:
#   sudo mkdir -p /var/backups/restaurant-pos
#   sudo install -m 750 scripts/backup-mysql.sh /usr/local/sbin/restaurant-pos-backup-mysql
#   sudo crontab -e
#   # daily 2:15 AM:
#   15 2 * * * /usr/local/sbin/restaurant-pos-backup-mysql >>/var/log/restaurant-pos-backup.log 2>&1
#
# Optional env (or override on the command line):
#   ENV_FILE=/etc/restaurant-pos.env
#   BACKUP_DIR=/var/backups/restaurant-pos
#   KEEP_DAYS=14
#   RCLONE_REMOTE=   # e.g. b2:pos-backups/mictronicx  (requires rclone)
#   RSYNC_TARGET=    # e.g. backup@otherhost:/backups/pos

set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/restaurant-pos.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/restaurant-pos}"
KEEP_DAYS="${KEEP_DAYS:-14}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
RSYNC_TARGET="${RSYNC_TARGET:-}"

die() { printf 'error: %s\n' "$*" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE"
command -v mysqldump >/dev/null || die "mysqldump is not installed"
command -v gzip >/dev/null || die "gzip is not installed"

env_value() {
  local key="$1"
  awk -F= -v k="$key" '$1 == k { sub(/^[^=]+=/, ""); print; exit }' "$ENV_FILE"
}

MYSQL_HOST="$(env_value MYSQL_HOST)"
MYSQL_PORT="$(env_value MYSQL_PORT)"
MYSQL_USER="$(env_value MYSQL_USER)"
MYSQL_PASSWORD="$(env_value MYSQL_PASSWORD)"
MYSQL_DATABASE="$(env_value MYSQL_DATABASE)"

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

if [[ -n "$RCLONE_REMOTE" ]]; then
  command -v rclone >/dev/null || die "rclone not installed but RCLONE_REMOTE is set"
  rclone copy "$out" "$RCLONE_REMOTE" --checksum
  printf 'copied to rclone remote %s\n' "$RCLONE_REMOTE"
fi

if [[ -n "$RSYNC_TARGET" ]]; then
  command -v rsync >/dev/null || die "rsync not installed but RSYNC_TARGET is set"
  rsync -a "$out" "$RSYNC_TARGET/"
  printf 'rsynced to %s\n' "$RSYNC_TARGET"
fi
