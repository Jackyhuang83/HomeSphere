#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/homesphere"
ENV_FILE="$APP_DIR/.env"

[ -f "$ENV_FILE" ] || { echo "HomeSphere .env 不存在" >&2; exit 1; }

secret="$(grep -m1 '^PROXY_SECRET=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- | sed "s/^'//;s/'$//")"
[ -n "$secret" ] || { echo "PROXY_SECRET 未配置" >&2; exit 1; }

curl -fsS --max-time 1800 -X POST   -H "x-homesphere-internal-key: $secret"   http://127.0.0.1:8080/api/internal/library/sync
echo
