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
chmod +x scripts/*.sh 2>/dev/null || true
cat > /usr/local/bin/homesphere <<'EOF'
#!/usr/bin/env bash
exec bash /opt/homesphere/scripts/manage.sh "$@"
EOF
chmod 755 /usr/local/bin/homesphere

MIGRATED_BRIDGE=0
CURRENT_BRIDGE_IMAGE="$(docker inspect -f '{{.Config.Image}}' media-bridge 2>/dev/null || true)"
if [[ "$CURRENT_BRIDGE_IMAGE" == qicfan/115strm:* ]]; then
  say "备份旧 Media Bridge 配置"
  mkdir -p "$APP_DIR/backups"
  BACKUP_FILE="$APP_DIR/backups/bridge-config-pre-qmediasync-$(date +%Y%m%d-%H%M%S).tar.gz"
  tar -C "$APP_DIR" -czf "$BACKUP_FILE" bridge-config
  chmod 600 "$BACKUP_FILE"
  MIGRATED_BRIDGE=1
  echo "已备份：$BACKUP_FILE"
fi

say "更新 HomeSphere 镜像"
docker compose "${COMPOSE_FILES[@]}" pull homesphere || fail "HomeSphere 镜像下载失败。当前运行版本未被替换，请检查 VPS 网络以及 GHCR 镜像是否可正常拉取。"

say "更新 Media Bridge 镜像"
docker compose "${COMPOSE_FILES[@]}" pull media-bridge || fail "Media Bridge 镜像下载失败。当前运行版本未被替换，请检查 VPS 网络后重试。"

say "重启服务"
docker compose "${COMPOSE_FILES[@]}" up -d

if [ "$MIGRATED_BRIDGE" -eq 1 ]; then
  say "确认 QMediaSync 已启动"
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 2 http://127.0.0.1:12333/ >/dev/null 2>&1; then
      echo "QMediaSync 管理页面已就绪。"
      break
    fi
    sleep 2
  done
  if ! curl -fsS --max-time 3 http://127.0.0.1:12333/ >/dev/null 2>&1; then
    echo "[警告] QMediaSync 尚未通过 HTTP 就绪检查。旧配置备份已保留，请先查看 Media Bridge 日志。"
  fi
fi

say "配置低频 STRM 本地索引"
bash "$APP_DIR/scripts/install-strm-timer.sh"

if systemctl list-unit-files homesphere-cloudflared.service >/dev/null 2>&1; then
  systemctl restart homesphere-cloudflared.service >/dev/null 2>&1 || true
fi

if [ "$MIGRATED_BRIDGE" -eq 0 ]; then
  docker image prune -f >/dev/null 2>&1 || true
else
  echo "本次为 Bridge 迁移，暂不清理旧镜像，便于必要时回退。"
fi

say "更新完成"
docker compose "${COMPOSE_FILES[@]}" ps
