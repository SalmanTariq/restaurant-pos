#!/usr/bin/env bash
# Update an existing bare-metal POS install.
# Pulls git, syncs code, builds, runs pending migrations, restarts services.
# Does not reseed menus, rewrite /etc/restaurant-pos.env, or recreate nginx/MySQL.
#
# Usage (as root, from a checkout of this repo):
#   ./scripts/update-bare-metal.sh
#
# Optional:
#   --install-dir   App path (default: /opt/restaurant-pos)
#   --env-file      Environment file (default: /etc/restaurant-pos.env)
#   --skip-pull     Do not git fetch/merge; use the files already on disk

set -euo pipefail

INSTALL_DIR="/opt/restaurant-pos"
ENV_FILE="/etc/restaurant-pos.env"
APP_USER="pos"
API_PORT=3000
SKIP_PULL=0

usage() {
  sed -n '2,14p' "$0" | sed 's/^# \?//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-dir)
      INSTALL_DIR="${2:-}"
      shift 2
      ;;
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --skip-pull)
      SKIP_PULL=1
      shift
      ;;
    -h | --help)
      usage 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage 1
      ;;
  esac
done

log() { printf '\n==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || die "Run as root (sudo)."
[[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE. Use scripts/deploy-bare-metal.sh for first install."
[[ -d "$INSTALL_DIR/backend" ]] || die "Missing $INSTALL_DIR/backend. This is not an installed POS."
id "$APP_USER" >/dev/null 2>&1 || die "System user '$APP_USER' is missing."
systemctl cat restaurant-pos.service >/dev/null 2>&1 || \
  die "systemd unit restaurant-pos.service is missing."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
[[ -d "$REPO_ROOT/backend" && -d "$REPO_ROOT/frontend" ]] || \
  die "Run this from a full checkout (missing backend/ or frontend/)."

env_value() {
  local key="$1"
  awk -F= -v k="$key" '$1 == k { sub(/^[^=]+=/, ""); print; exit }' "$ENV_FILE"
}

PUBLIC_ORIGIN="$(env_value PUBLIC_ORIGIN)"
[[ -n "$PUBLIC_ORIGIN" ]] || die "$ENV_FILE has no PUBLIC_ORIGIN (needed to build the SPA)."

pull_repo() {
  [[ "$SKIP_PULL" -eq 0 ]] || {
    log "Skipping git pull"
    return
  }
  if [[ ! -d "$REPO_ROOT/.git" ]]; then
    log "No git checkout at $REPO_ROOT; using files on disk"
    return
  fi
  log "Pulling latest commits in $REPO_ROOT"
  if [[ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]]; then
    die "Checkout has uncommitted changes. Commit, stash, or pass --skip-pull."
  fi
  git -C "$REPO_ROOT" fetch --prune origin
  if git -C "$REPO_ROOT" rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    git -C "$REPO_ROOT" merge --ff-only '@{u}'
  else
    git -C "$REPO_ROOT" merge --ff-only origin/main
  fi
  git -C "$REPO_ROOT" log -1 --oneline
}

sync_app() {
  if [[ "$REPO_ROOT" == "$INSTALL_DIR" ]]; then
    log "Checkout is the install dir; no rsync"
    return
  fi
  log "Syncing app to $INSTALL_DIR"
  rsync -a \
    --exclude '.git/' \
    --exclude 'node_modules/' \
    --exclude 'dist/' \
    --exclude '*.tsbuildinfo' \
    --exclude 'coverage/' \
    --exclude '.env' \
    --exclude 'frontend/src-tauri/' \
    --exclude 'src-tauri/' \
    "$REPO_ROOT/" "$INSTALL_DIR/"
}

ensure_ownership() {
  chown -R "$APP_USER:$APP_USER" "$INSTALL_DIR"
}

build_app() {
  log "Building backend and frontend as $APP_USER"
  sudo -u "$APP_USER" -H bash -lc "
    set -euo pipefail
    export npm_config_audit=false
    export npm_config_fund=false
    export NODE_OPTIONS='--max-old-space-size=512'
    cd '$INSTALL_DIR/backend'
    rm -rf dist tsconfig.build.tsbuildinfo tsconfig.tsbuildinfo
    npm ci --no-audit --no-fund
    npm run build
    if [[ ! -f dist/main.js && ! -f dist/src/main.js ]]; then
      echo 'Nest build produced no main.js. dist contains:' >&2
      ls -la dist >&2 || true
      exit 1
    fi
    cd '$INSTALL_DIR/frontend'
    npm ci --no-audit --no-fund
    VITE_API_URL='$PUBLIC_ORIGIN' npm run build
  "
}

run_migrations() {
  log "Running pending migrations (no catalog seed)"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  sudo -u "$APP_USER" -H env \
    NODE_ENV="${NODE_ENV:-production}" \
    MYSQL_HOST="$MYSQL_HOST" \
    MYSQL_PORT="$MYSQL_PORT" \
    MYSQL_USER="$MYSQL_USER" \
    MYSQL_PASSWORD="$MYSQL_PASSWORD" \
    MYSQL_DATABASE="$MYSQL_DATABASE" \
    BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-}" \
    BETTER_AUTH_URL="${BETTER_AUTH_URL:-$PUBLIC_ORIGIN}" \
    PUBLIC_ORIGIN="$PUBLIC_ORIGIN" \
    CORS_ORIGINS="${CORS_ORIGINS:-$PUBLIC_ORIGIN}" \
    bash -lc "cd '$INSTALL_DIR/backend' && npm run migrate"
}

restart_services() {
  log "Restarting restaurant-pos and reloading nginx"
  systemctl restart restaurant-pos.service
  if command -v nginx >/dev/null 2>&1 && [[ -d /etc/nginx ]]; then
    nginx -t
    systemctl reload nginx
  fi
}

wait_for_api() {
  local i
  for i in $(seq 1 40); do
    if curl -fsS "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  journalctl -u restaurant-pos.service -n 80 --no-pager >&2 || true
  die "API did not become healthy on 127.0.0.1:${API_PORT}."
}

pull_repo
sync_app
ensure_ownership
build_app
run_migrations
restart_services
wait_for_api

cat <<EOF

Update finished.

  Commit:  $(git -C "$REPO_ROOT" log -1 --oneline 2>/dev/null || echo 'not a git checkout')
  Health:  ${PUBLIC_ORIGIN}/health
  Service: restaurant-pos.service

Menus and tickets were not reseeded.
EOF
