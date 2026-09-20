#!/usr/bin/env bash
# Install this POS on a Debian/Ubuntu VPS without Docker.
# Serves the SPA + API on one HTTPS hostname via nginx, MySQL, and systemd.
#
# Usage (as root, from a clone of this repo or after copying it onto the box):
#   ./scripts/deploy-bare-metal.sh --domain pos.example.com --email you@example.com
#
# Later code/schema updates (does not reseed or rewrite env/nginx):
#   ./scripts/update-bare-metal.sh
#
# Optional:
#   --admin-email     Platform login (defaults to --email)
#   --admin-password  Platform password (generated if omitted)
#   --admin-name      Display name (default: Platform)
#   --skip-tls        HTTP only; skip Let's Encrypt
#   --staging         Let's Encrypt staging certificates
#   --install-dir     App path (default: /opt/restaurant-pos)

set -euo pipefail

DOMAIN=""
LE_EMAIL=""
ADMIN_EMAIL=""
ADMIN_PASSWORD=""
ADMIN_NAME="Platform"
SKIP_TLS=0
STAGING=0
INSTALL_DIR="/opt/restaurant-pos"
ENV_FILE="/etc/restaurant-pos.env"
APP_USER="pos"
API_PORT=3000

usage() {
  sed -n '2,16p' "$0" | sed 's/^# \?//'
  exit "${1:-0}"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      DOMAIN="${2:-}"
      shift 2
      ;;
    --email)
      LE_EMAIL="${2:-}"
      shift 2
      ;;
    --admin-email)
      ADMIN_EMAIL="${2:-}"
      shift 2
      ;;
    --admin-password)
      ADMIN_PASSWORD="${2:-}"
      shift 2
      ;;
    --admin-name)
      ADMIN_NAME="${2:-}"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="${2:-}"
      shift 2
      ;;
    --skip-tls)
      SKIP_TLS=1
      shift
      ;;
    --staging)
      STAGING=1
      shift
      ;;
    -h | --help)
      usage 0
      ;;
    --*)
      echo "Unknown flag: $1" >&2
      usage 1
      ;;
    *)
      if [[ -z "$DOMAIN" ]]; then
        DOMAIN="$1"
      elif [[ -z "$LE_EMAIL" ]]; then
        LE_EMAIL="$1"
      else
        echo "Unexpected argument: $1" >&2
        usage 1
      fi
      shift
      ;;
  esac
done

log() { printf '\n==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || die "Run as root (sudo)."
[[ -n "$DOMAIN" && -n "$LE_EMAIL" ]] || die "Need --domain FQDN and --email for Let's Encrypt."
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || die "Domain looks invalid: $DOMAIN"
[[ "$LE_EMAIL" == *@* ]] || die "Let's Encrypt email looks invalid: $LE_EMAIL"

ADMIN_EMAIL="${ADMIN_EMAIL:-$LE_EMAIL}"
[[ "$ADMIN_EMAIL" == *@* ]] || die "Admin email looks invalid: $ADMIN_EMAIL"

if [[ -f /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
else
  die "Cannot detect OS. This script supports Debian and Ubuntu."
fi
[[ "${ID:-}" == "ubuntu" || "${ID:-}" == "debian" ]] || \
  die "Unsupported OS '$ID'. Use Debian or Ubuntu (no Docker)."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
[[ -d "$REPO_ROOT/backend" && -d "$REPO_ROOT/frontend" ]] || \
  die "Run this from a full checkout (missing backend/ or frontend/)."

SCHEME="https"
if [[ "$SKIP_TLS" -eq 1 ]]; then
  SCHEME="http"
fi
PUBLIC_ORIGIN="${SCHEME}://${DOMAIN}"

rand_hex() { openssl rand -hex "${1:-24}"; }

wait_for_mysql() {
  local i
  for i in $(seq 1 60); do
    if mysqladmin ping --silent >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  die "MySQL/MariaDB did not become ready."
}

mysql_root() {
  mysql --protocol=socket "$@"
}

ensure_swap() {
  local mem_kb swap_kb
  mem_kb="$(awk '/MemTotal:/ {print $2}' /proc/meminfo)"
  swap_kb="$(awk '/SwapTotal:/ {print $2}' /proc/meminfo)"
  if [[ "${swap_kb:-0}" -ge 1048576 ]]; then
    return 0
  fi
  if [[ "${mem_kb:-0}" -ge 2097152 ]]; then
    return 0
  fi
  log "Adding 2G swap (this host has under 2G RAM)"
  if [[ ! -f /swapfile ]]; then
    fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile 2>/dev/null || true
  if ! grep -q '^/swapfile ' /etc/fstab 2>/dev/null; then
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
}

install_packages() {
  log "Installing packages (nginx, mysql, certbot, build tools)"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg rsync git openssl \
    build-essential python3 \
    nginx ufw \
    certbot

  if ! dpkg -s mysql-server >/dev/null 2>&1 && ! dpkg -s mariadb-server >/dev/null 2>&1; then
    if apt-get install -y mysql-server; then
      :
    else
      apt-get install -y mariadb-server
    fi
  fi

  local node_major=0
  if command -v node >/dev/null 2>&1; then
    node_major="$(node -p 'process.versions.node.split(".")[0]')"
  fi
  if [[ "$node_major" -lt 20 ]]; then
    log "Installing Node.js 20"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  fi
  node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' \
    || die "Node.js 20+ is required. Found: $(command -v node >/dev/null && node -v || echo none)"
}

sync_app() {
  log "Syncing app to $INSTALL_DIR"
  mkdir -p "$INSTALL_DIR"
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

ensure_app_user() {
  if ! id "$APP_USER" >/dev/null 2>&1; then
    useradd --system --home "$INSTALL_DIR" --shell /usr/sbin/nologin "$APP_USER"
  fi
  chown -R "$APP_USER:$APP_USER" "$INSTALL_DIR"
}

write_env_file() {
  if [[ -f "$ENV_FILE" ]]; then
    log "Keeping existing $ENV_FILE"
    return
  fi
  log "Writing $ENV_FILE (new MySQL user and auth secret)"
  local mysql_password auth_secret
  mysql_password="$(rand_hex 24)"
  auth_secret="$(rand_hex 32)"

  wait_for_mysql
  mysql_root <<SQL
CREATE DATABASE IF NOT EXISTS pos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'pos'@'localhost' IDENTIFIED BY '${mysql_password}';
ALTER USER 'pos'@'localhost' IDENTIFIED BY '${mysql_password}';
GRANT ALL PRIVILEGES ON pos.* TO 'pos'@'localhost';
FLUSH PRIVILEGES;
SQL

  umask 077
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=${API_PORT}
LISTEN_HOST=127.0.0.1
TRUST_PROXY=1
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=pos
MYSQL_PASSWORD=${mysql_password}
MYSQL_DATABASE=pos
BETTER_AUTH_SECRET=${auth_secret}
BETTER_AUTH_URL=${PUBLIC_ORIGIN}
PUBLIC_ORIGIN=${PUBLIC_ORIGIN}
CORS_ORIGINS=${PUBLIC_ORIGIN}
EOF
  chmod 600 "$ENV_FILE"
  chown root:root "$ENV_FILE"
}

refresh_public_origin() {
  if [[ ! -f "$ENV_FILE" ]]; then
    return
  fi
  sed -i \
    -e "s|^BETTER_AUTH_URL=.*|BETTER_AUTH_URL=${PUBLIC_ORIGIN}|" \
    -e "s|^PUBLIC_ORIGIN=.*|PUBLIC_ORIGIN=${PUBLIC_ORIGIN}|" \
    -e "s|^CORS_ORIGINS=.*|CORS_ORIGINS=${PUBLIC_ORIGIN}|" \
    "$ENV_FILE"
}

harden_mysql() {
  local cnf="/etc/mysql/mysql.conf.d/z-pos-bind.cnf"
  mkdir -p "$(dirname "$cnf")"
  if [[ -d /etc/mysql/mariadb.conf.d ]]; then
    cnf="/etc/mysql/mariadb.conf.d/z-pos-bind.cnf"
  fi
  cat > "$cnf" <<'EOF'
[mysqld]
bind-address = 127.0.0.1
innodb_buffer_pool_size = 128M
max_allowed_packet = 64M
performance_schema = OFF
EOF
  systemctl restart mysql 2>/dev/null || systemctl restart mariadb
  wait_for_mysql
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

write_systemd() {
  log "Installing systemd unit"
  local node_bin main_js
  node_bin="$(command -v node)"
  main_js="${INSTALL_DIR}/backend/dist/main.js"
  if [[ ! -f "$main_js" ]]; then
    main_js="${INSTALL_DIR}/backend/dist/src/main.js"
  fi
  [[ -f "$main_js" ]] || die "Backend build is missing ($main_js)."
  cat > /etc/systemd/system/restaurant-pos.service <<EOF
[Unit]
Description=Restaurant POS API
After=network.target mysql.service mariadb.service
Wants=mysql.service

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${INSTALL_DIR}/backend
EnvironmentFile=${ENV_FILE}
ExecStart=${node_bin} ${main_js}
Restart=on-failure
RestartSec=3
StartLimitBurst=5
StartLimitIntervalSec=60
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl reset-failed restaurant-pos.service 2>/dev/null || true
  systemctl enable --now restaurant-pos.service
}

write_proxy_snippet() {
  mkdir -p /etc/nginx/snippets
  cat > /etc/nginx/snippets/restaurant-pos-proxy.conf <<'EOF'
proxy_pass http://127.0.0.1:3000;
proxy_http_version 1.1;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Authorization $http_authorization;
proxy_set_header Cookie $http_cookie;
proxy_hide_header set-auth-token;
add_header set-auth-token $upstream_http_set_auth_token always;
EOF
}

nginx_locations() {
  cat <<'EOF'
    client_max_body_size 32m;
    root INSTALL_DIR_PLACEHOLDER/frontend/dist;
    index index.html;

    location = /me { include /etc/nginx/snippets/restaurant-pos-proxy.conf; }
    location = /health { include /etc/nginx/snippets/restaurant-pos-proxy.conf; }
    location ^~ /api/ { include /etc/nginx/snippets/restaurant-pos-proxy.conf; }
    location ^~ /till { include /etc/nginx/snippets/restaurant-pos-proxy.conf; }
    location ^~ /staff { include /etc/nginx/snippets/restaurant-pos-proxy.conf; }
    location ^~ /platform { include /etc/nginx/snippets/restaurant-pos-proxy.conf; }

    location /assets/ {
        expires 7d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
EOF
}

write_nginx() {
  log "Writing nginx site for $DOMAIN"
  write_proxy_snippet
  local site="/etc/nginx/sites-available/restaurant-pos"
  local locations
  locations="$(nginx_locations | sed "s|INSTALL_DIR_PLACEHOLDER|${INSTALL_DIR}|")"
  mkdir -p /var/www/letsencrypt

  if [[ "$SKIP_TLS" -eq 1 ]]; then
    cat > "$site" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
${locations}
}
EOF
  elif [[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
    cat > "$site" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
    }
    location / {
        return 301 https://\$host\$request_uri;
    }
}
server {
    listen 443 ssl http2;
    server_name ${DOMAIN};
    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
${locations}
}
EOF
  else
    cat > "$site" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
    }
${locations}
}
EOF
  fi

  ln -sfn "$site" /etc/nginx/sites-enabled/restaurant-pos
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx
}

issue_cert() {
  [[ "$SKIP_TLS" -eq 0 ]] || return 0
  if [[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
    log "TLS certificate already present for $DOMAIN"
    return 0
  fi
  log "Requesting Let's Encrypt certificate for $DOMAIN"
  local extra=(--non-interactive --agree-tos --email "$LE_EMAIL" --no-eff-email)
  if [[ "$STAGING" -eq 1 ]]; then
    extra+=(--staging)
  fi
  certbot certonly --webroot -w /var/www/letsencrypt -d "$DOMAIN" "${extra[@]}"
  mkdir -p /etc/letsencrypt/renewal-hooks/deploy
  cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'EOF'
#!/bin/sh
nginx -t && systemctl reload nginx
EOF
  chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
}

open_firewall() {
  if command -v ufw >/dev/null 2>&1; then
    log "Allowing OpenSSH, HTTP, and HTTPS through ufw"
    ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null 2>&1 || true
    ufw allow 80/tcp >/dev/null 2>&1 || true
    ufw allow 443/tcp >/dev/null 2>&1 || true
    if ufw status | grep -qi inactive; then
      ufw --force enable >/dev/null 2>&1 || true
    fi
  fi
}

warn_dns() {
  [[ "$SKIP_TLS" -eq 0 ]] || return 0
  local resolved="" public_ip=""
  resolved="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1}' | head -1)" || true
  public_ip="$(curl -4 -fsS --max-time 8 https://api.ipify.org 2>/dev/null)" || true
  if [[ -n "$resolved" && -n "$public_ip" && "$resolved" != "$public_ip" ]]; then
    echo "warning: $DOMAIN resolves to $resolved, this host reports $public_ip" >&2
    echo "Let's Encrypt will fail until the A record points here." >&2
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

create_admin() {
  if [[ -z "$ADMIN_PASSWORD" ]]; then
    ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)"
    GENERATED_ADMIN=1
  else
    GENERATED_ADMIN=0
  fi
  log "Creating platform admin ${ADMIN_EMAIL}"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  sudo -u "$APP_USER" -H env \
    NODE_ENV=production \
    MYSQL_HOST="$MYSQL_HOST" \
    MYSQL_PORT="$MYSQL_PORT" \
    MYSQL_USER="$MYSQL_USER" \
    MYSQL_PASSWORD="$MYSQL_PASSWORD" \
    MYSQL_DATABASE="$MYSQL_DATABASE" \
    BETTER_AUTH_SECRET="$BETTER_AUTH_SECRET" \
    BETTER_AUTH_URL="$BETTER_AUTH_URL" \
    ADMIN_EMAIL="$ADMIN_EMAIL" \
    ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    ADMIN_NAME="$ADMIN_NAME" \
    bash -lc "cd '$INSTALL_DIR/backend' && npm run create-admin -- --email \"\$ADMIN_EMAIL\" --password \"\$ADMIN_PASSWORD\" --name \"\$ADMIN_NAME\""
}

print_summary() {
  cat <<EOF

Deploy finished.

  URL:     ${PUBLIC_ORIGIN}
  Health:  ${PUBLIC_ORIGIN}/health
  Login:   ${ADMIN_EMAIL}
EOF
  if [[ "${GENERATED_ADMIN:-0}" -eq 1 ]]; then
    cat <<EOF
  Password (save this; it is not stored in the env file): ${ADMIN_PASSWORD}

This is the platform control-panel user, not a restaurant cashier.
EOF
  fi
}

# --- run ---
ensure_swap
install_packages
systemctl enable --now nginx
systemctl enable --now mysql 2>/dev/null || systemctl enable --now mariadb
sync_app
ensure_app_user
harden_mysql
write_env_file
refresh_public_origin
build_app
write_systemd
wait_for_api
open_firewall
write_nginx
warn_dns
issue_cert
write_nginx
nginx -t
systemctl reload nginx
create_admin
print_summary
