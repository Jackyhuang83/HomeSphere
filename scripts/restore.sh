#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/homesphere"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.bridge.yml)
BACKUP="${1:-}"

say() { printf '\n==> %s\n' "$*"; }
fail() { printf '\n[错误] %s\n' "$*" >&2; exit 1; }

[ "${EUID}" -eq 0 ] || fail "请先执行 sudo -i，再运行恢复。"
[ -d "$APP_DIR/.git" ] || fail "新 VPS 还没有安装 HomeSphere。请先运行 HomeSphere 一键安装，再执行恢复。"
command -v docker >/dev/null 2>&1 || fail "Docker 不可用。"

if [ -z "$BACKUP" ]; then
  BACKUP="$(ls -1t /root/homesphere-migration-*.tar.gz 2>/dev/null | head -n1 || true)"
fi
[ -n "$BACKUP" ] || fail "没有找到迁移包。请把迁移包传到新 VPS，并把文件路径作为参数传入。"
[ -f "$BACKUP" ] || fail "迁移包不存在：$BACKUP"

# Reject absolute paths or parent traversal before extraction.
while IFS= read -r entry; do
  case "$entry" in
    /*|../*|*/../*|*/..) fail "迁移包包含不安全路径，已停止恢复。" ;;
  esac
done < <(tar -tzf "$BACKUP")

TMP_DIR="$(mktemp -d /root/.homesphere-restore.XXXXXX)"
chmod 700 "$TMP_DIR"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

tar -C "$TMP_DIR" -xzf "$BACKUP"

for required in manifest.env homesphere.env app-files.tar.gz homesphere-data.tar.gz qms-postgres-data.tar.gz; do
  [ -f "$TMP_DIR/$required" ] || fail "迁移包缺少 $required。"
done

# shellcheck disable=SC1091
. "$TMP_DIR/manifest.env"
[ "${HOMESPHERE_BACKUP_FORMAT:-}" = "1" ] || fail "不支持的迁移包格式。"
if [ "${SOURCE_ARCH:-unknown}" != "$(uname -m)" ]; then
  fail "旧 VPS 架构为 ${SOURCE_ARCH:-unknown}，新 VPS 为 $(uname -m)。当前物理 PostgreSQL 快照只允许同架构恢复。"
fi

cd "$APP_DIR"
for container in homesphere media-bridge qms-postgres; do
  docker inspect "$container" >/dev/null 2>&1 || fail "容器 $container 不存在。请先完成新 VPS 的 HomeSphere 一键安装。"
done

volume_for() {
  local container="$1" destination="$2"
  docker inspect -f '{{range .Mounts}}{{println .Destination .Name}}{{end}}' "$container" 2>/dev/null |
    awk -v target="$destination" '$1==target {print $2; exit}'
}

HS_VOLUME="$(volume_for homesphere /data)"
PG_VOLUME="$(volume_for qms-postgres /var/lib/postgresql/data)"
[ -n "$HS_VOLUME" ] || fail "无法识别新 VPS 的 HomeSphere /data volume。"
[ -n "$PG_VOLUME" ] || fail "无法识别新 VPS 的 PostgreSQL volume。"

HS_IMAGE="$(docker inspect -f '{{.Config.Image}}' homesphere)"
PG_IMAGE="$(docker inspect -f '{{.Config.Image}}' qms-postgres)"

PRE_RESTORE="/root/homesphere-pre-restore-$(date +%Y%m%d-%H%M%S).tar.gz"
if [ "${HOMESPHERE_SKIP_PRE_RESTORE:-0}" != "1" ]; then
  say "先备份新 VPS 当前状态，便于回退"
  bash "$APP_DIR/scripts/backup.sh" "$PRE_RESTORE"
fi

say "停止新 VPS 的 HomeSphere 服务"
docker compose "${COMPOSE_FILES[@]}" stop homesphere media-bridge qms-postgres >/dev/null

restore_volume() {
  local volume="$1" image="$2" archive="$3"
  docker run --rm --user 0 --entrypoint sh \
    -v "$volume:/target" \
    -v "$archive:/backup.tar.gz:ro" \
    "$image" -c 'find /target -mindepth 1 -maxdepth 1 -exec rm -rf {} + && tar -C /target -xzf /backup.tar.gz'
}

say "恢复 HomeSphere SQLite / 本地状态"
restore_volume "$HS_VOLUME" "$HS_IMAGE" "$TMP_DIR/homesphere-data.tar.gz"

say "恢复 QMediaSync PostgreSQL"
restore_volume "$PG_VOLUME" "$PG_IMAGE" "$TMP_DIR/qms-postgres-data.tar.gz"

say "恢复 QMediaSync 配置、STRM 与 HomeSphere 配置"
rm -rf "$APP_DIR/bridge-config" "$APP_DIR/media"
tar -C "$APP_DIR" -xzf "$TMP_DIR/app-files.tar.gz"
chmod 700 "$APP_DIR/bridge-config" 2>/dev/null || true
install -m 600 "$TMP_DIR/homesphere.env" "$APP_DIR/.env"

if [ -f "$TMP_DIR/cloudflare/cloudflared.env" ]; then
  mkdir -p /etc/homesphere
  chmod 750 /etc/homesphere
  install -m 600 "$TMP_DIR/cloudflare/cloudflared.env" /etc/homesphere/cloudflared.env
fi

say "启动恢复后的服务"
docker compose "${COMPOSE_FILES[@]}" up -d

say "重新确认内部密钥与 STRM 定时索引"
bash "$APP_DIR/scripts/ensure-qms-api-key.sh"
bash "$APP_DIR/scripts/install-strm-timer.sh"

if [ -f /etc/homesphere/cloudflared.env ]; then
  say "恢复 Cloudflare Tunnel"
  bash "$APP_DIR/scripts/https.sh" --restore-existing
fi

say "恢复结果"
docker compose "${COMPOSE_FILES[@]}" ps

cat <<EOF

HomeSphere 数据恢复完成。

来源版本：${HOMESPHERE_VERSION:-unknown}
当前版本：$(sed -n 's/.*"version":[[:space:]]*"\([^"]*\)".*/\1/p' "$APP_DIR/package.json" | head -n1)

请先验证：
1. HomeSphere 可以登录；
2. 片库、海报、收藏、想看、继续播放记录存在；
3. QMediaSync 管理页可以打开且 115 授权仍有效；
4. 随机播放一部电影和一集电视剧；
5. Cloudflare 域名可以访问。

验证全部通过后，再关闭旧 VPS。
不要在验证前删除旧 VPS。

$( [ -f "$PRE_RESTORE" ] && printf '新 VPS 恢复前快照：%s\n' "$PRE_RESTORE" || true )
EOF
