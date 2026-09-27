#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/homesphere"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.bridge.yml)

say() { printf '\n==> %s\n' "$*"; }
fail() { printf '\n[错误] %s\n' "$*" >&2; exit 1; }

[ "${EUID}" -eq 0 ] || fail "请先在 SSH 中执行 sudo -i，再重新运行更新命令。"
[ -d "$APP_DIR/.git" ] || fail "没有检测到 HomeSphere。请先运行一键安装命令。"

say "更新 HomeSphere 代码"
git -C "$APP_DIR" fetch origin main
git -C "$APP_DIR" reset --hard origin/main

cd "$APP_DIR"

say "更新 Media Bridge 镜像"
docker compose "${COMPOSE_FILES[@]}" pull media-bridge

say "重新构建 HomeSphere"
docker compose "${COMPOSE_FILES[@]}" build homesphere

say "重启服务"
docker compose "${COMPOSE_FILES[@]}" up -d

if systemctl list-unit-files homesphere-cloudflared.service >/dev/null 2>&1; then
  systemctl restart homesphere-cloudflared.service >/dev/null 2>&1 || true
fi

docker builder prune -f >/dev/null 2>&1 || true

say "更新完成"
docker compose "${COMPOSE_FILES[@]}" ps
