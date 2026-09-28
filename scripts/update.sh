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

[ -f .env ] || fail "未找到 .env，无法安全生成 QMediaSync 数据库配置。请先确认 HomeSphere 安装完整。"

QMS_DB_CREATED=0
if ! grep -q '^QMS_POSTGRES_DB=' .env; then
  printf '\nQMS_POSTGRES_DB=qmediasync\n' >> .env
fi
if ! grep -q '^QMS_POSTGRES_USER=' .env; then
  printf 'QMS_POSTGRES_USER=qmediasync\n' >> .env
fi
if ! grep -Eq '^QMS_POSTGRES_PASSWORD=.+$' .env; then
  sed -i '/^QMS_POSTGRES_PASSWORD=/d' .env
  QMS_POSTGRES_PASSWORD="$(openssl rand -hex 24)"
  printf 'QMS_POSTGRES_PASSWORD=%s\n' "$QMS_POSTGRES_PASSWORD" >> .env
  QMS_DB_CREATED=1
fi
chmod 600 .env

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

say "更新 QMediaSync PostgreSQL 镜像"
docker compose "${COMPOSE_FILES[@]}" pull qms-postgres || fail "PostgreSQL 镜像下载失败。当前运行版本未被替换，请检查 VPS 网络后重试。"

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

if [ "$QMS_DB_CREATED" -eq 1 ]; then
  echo
  echo "已为 QMediaSync 新建 PostgreSQL，并生成独立随机密码。"
  echo "请在 QMediaSync 配置向导选择 PostgreSQL，然后填写："
  echo
  echo "    主机：qms-postgres"
  echo "    端口：5432"
  echo "    数据库：qmediasync"
  echo "    用户名：qmediasync"
  echo "    密码：$QMS_POSTGRES_PASSWORD"
  echo
  echo "请把这个数据库密码保存到密码管理器；以后更新不会覆盖它。"
fi
