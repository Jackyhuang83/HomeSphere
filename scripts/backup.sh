#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/homesphere"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.bridge.yml)
STAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT="${1:-/root/homesphere-migration-${STAMP}.tar.gz}"

say() { printf '\n==> %s\n' "$*"; }
fail() { printf '\n[错误] %s\n' "$*" >&2; exit 1; }

[ "${EUID}" -eq 0 ] || fail "请先执行 sudo -i，再运行备份。"
[ -d "$APP_DIR/.git" ] || fail "没有检测到 HomeSphere 安装目录。"
[ -f "$APP_DIR/.env" ] || fail "没有检测到 HomeSphere .env。"
command -v docker >/dev/null 2>&1 || fail "Docker 不可用。"
command -v tar >/dev/null 2>&1 || fail "tar 不可用。"

cd "$APP_DIR"

for container in homesphere media-bridge qms-postgres; do
  docker inspect "$container" >/dev/null 2>&1 || fail "容器 $container 不存在，请先确认 HomeSphere 正常安装。"
done

volume_for() {
  local container="$1" destination="$2"
  docker inspect -f '{{range .Mounts}}{{println .Destination .Name}}{{end}}' "$container" 2>/dev/null |
    awk -v target="$destination" '$1==target {print $2; exit}'
}

HS_VOLUME="$(volume_for homesphere /data)"
PG_VOLUME="$(volume_for qms-postgres /var/lib/postgresql/data)"
[ -n "$HS_VOLUME" ] || fail "无法识别 HomeSphere /data Docker volume。"
[ -n "$PG_VOLUME" ] || fail "无法识别 PostgreSQL Docker volume。"

HS_IMAGE="$(docker inspect -f '{{.Config.Image}}' homesphere)"
PG_IMAGE="$(docker inspect -f '{{.Config.Image}}' qms-postgres)"
[ -n "$HS_IMAGE" ] || fail "无法识别 HomeSphere 镜像。"
[ -n "$PG_IMAGE" ] || fail "无法识别 PostgreSQL 镜像。"

mkdir -p "$(dirname "$OUTPUT")"
[ ! -e "$OUTPUT" ] || fail "备份文件已经存在：$OUTPUT"

TMP_DIR="$(mktemp -d /root/.homesphere-migration.XXXXXX)"
chmod 700 "$TMP_DIR"
SERVICES_STOPPED=0

cleanup() {
  local rc=$?
  if [ "$SERVICES_STOPPED" -eq 1 ]; then
    cd "$APP_DIR" >/dev/null 2>&1 || true
    docker compose "${COMPOSE_FILES[@]}" up -d >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
  return "$rc"
}
trap cleanup EXIT

say "准备迁移清单"
VERSION="$(sed -n 's/.*"version":[[:space:]]*"\([^"]*\)".*/\1/p' package.json | head -n1)"
cat > "$TMP_DIR/manifest.env" <<EOF
HOMESPHERE_BACKUP_FORMAT=1
HOMESPHERE_VERSION=${VERSION:-unknown}
SOURCE_ARCH=$(uname -m)
CREATED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
chmod 600 "$TMP_DIR/manifest.env"

install -m 600 "$APP_DIR/.env" "$TMP_DIR/homesphere.env"

if [ -f /etc/homesphere/cloudflared.env ]; then
  mkdir -p "$TMP_DIR/cloudflare"
  chmod 700 "$TMP_DIR/cloudflare"
  install -m 600 /etc/homesphere/cloudflared.env "$TMP_DIR/cloudflare/cloudflared.env"
fi

say "短暂停止 HomeSphere / QMediaSync / PostgreSQL，制作一致性快照"
docker compose "${COMPOSE_FILES[@]}" stop homesphere media-bridge qms-postgres >/dev/null
SERVICES_STOPPED=1

tar -C "$APP_DIR" -czf "$TMP_DIR/app-files.tar.gz" bridge-config media

docker run --rm --user 0 --entrypoint tar \
  -v "$HS_VOLUME:/source:ro" "$HS_IMAGE" \
  -C /source -czf - . > "$TMP_DIR/homesphere-data.tar.gz"

docker run --rm --user 0 --entrypoint tar \
  -v "$PG_VOLUME:/source:ro" "$PG_IMAGE" \
  -C /source -czf - . > "$TMP_DIR/qms-postgres-data.tar.gz"

say "恢复当前服务器服务"
docker compose "${COMPOSE_FILES[@]}" up -d >/dev/null
SERVICES_STOPPED=0

say "生成 root-only 迁移包"
tar -C "$TMP_DIR" -czf "$OUTPUT" .
chmod 600 "$OUTPUT"

SIZE="$(du -h "$OUTPUT" | awk '{print $1}')"
SHA="$(sha256sum "$OUTPUT" | awk '{print $1}')"

cat <<EOF

迁移包已生成：

  $OUTPUT

大小：$SIZE
SHA256：$SHA

这个文件包含：
- HomeSphere .env（家庭密码 / 内部密钥 / TMDB 配置）
- HomeSphere SQLite（继续播放 / 最近观看 / 收藏 / 想看等）
- QMediaSync 配置与 STRM
- QMediaSync PostgreSQL 数据
$( [ -f "$TMP_DIR/cloudflare/cloudflared.env" ] && printf '%s' '- Cloudflare Tunnel root-only Token / 域名配置' || true )

迁移包包含敏感凭据，权限已设为 600。
只通过 SSH / SCP 传到新 VPS，不要上传到 GitHub、网盘或公开链接。
新 VPS 验证完成后，应删除两台 VPS 上不再需要的迁移包。
EOF
