#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/homesphere"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.bridge.yml)

say() { printf '\n==> %s\n' "$*"; }
fail() { printf '\n[错误] %s\n' "$*" >&2; exit 1; }

[ "${EUID}" -eq 0 ] || fail "请先在 SSH 中执行 sudo -i，再重新运行本命令。"
[ -f "$APP_DIR/.env" ] || fail "没有检测到 HomeSphere。请先运行一键安装命令。"
command -v docker >/dev/null 2>&1 || fail "Docker 不存在，请先运行一键安装。"

echo
read -r -p "请输入 HomeSphere 域名（例如 media.example.com，不要带 http://）： " DOMAIN
DOMAIN="${DOMAIN#http://}"
DOMAIN="${DOMAIN#https://}"
DOMAIN="${DOMAIN%%/*}"
[ -n "$DOMAIN" ] || fail "域名不能为空。"

if ! getent ahosts "$DOMAIN" >/dev/null 2>&1; then
  fail "当前还解析不到 $DOMAIN。请先把域名 DNS 指向这台 VPS，然后重新运行本命令。"
fi

say "检查 80/443 端口"
for PORT in 80 443; do
  if ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]$PORT$"; then
    fail "$PORT 端口已经被其他程序占用。请把 'ss -ltnp | grep :$PORT' 的结果发给我。"
  fi
done

say "生成 HTTPS 配置"
mkdir -p "$APP_DIR/caddy"
cat > "$APP_DIR/caddy/Caddyfile" <<EOF
$DOMAIN {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8080
    header {
        Strict-Transport-Security "max-age=31536000"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}
EOF
chmod 600 "$APP_DIR/caddy/Caddyfile"

docker rm -f homesphere-caddy >/dev/null 2>&1 || true
docker pull caddy:2-alpine

say "启动 HTTPS 入口"
docker run -d   --name homesphere-caddy   --restart unless-stopped   --network host   -v "$APP_DIR/caddy/Caddyfile:/etc/caddy/Caddyfile:ro"   -v homesphere-caddy-data:/data   -v homesphere-caddy-config:/config   caddy:2-alpine >/dev/null

cd "$APP_DIR"
if grep -q '^COOKIE_SECURE=' .env; then
  sed -i 's/^COOKIE_SECURE=.*/COOKIE_SECURE=true/' .env
else
  printf '\nCOOKIE_SECURE=true\n' >> .env
fi

docker compose "${COMPOSE_FILES[@]}" up -d homesphere >/dev/null

sleep 3
say "HTTPS 状态"
docker ps --filter name=homesphere-caddy --format 'table {{.Names}}\t{{.Status}}'
docker logs --tail 20 homesphere-caddy 2>&1 || true

cat <<EOF

如果 VPS 服务商有独立防火墙/安全组，请确保 TCP 80 和 443 可以访问。
服务器上的配置已经自动完成，不需要你编辑任何文件。

浏览器访问：
https://$DOMAIN

确认 HTTPS 正常后，就可以把这个地址给家人或朋友使用。
EOF
