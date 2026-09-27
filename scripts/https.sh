#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/homesphere"
ENV_FILE="$APP_DIR/.env"
CF_ENV_DIR="/etc/homesphere"
CF_ENV_FILE="$CF_ENV_DIR/cloudflared.env"
CF_RUNNER="$APP_DIR/run-cloudflared.sh"
CF_SERVICE="/etc/systemd/system/homesphere-cloudflared.service"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.bridge.yml)

say() { printf '\n==> %s\n' "$*"; }
fail() { printf '\n[错误] %s\n' "$*" >&2; exit 1; }

[ "${EUID}" -eq 0 ] || fail "请先在 SSH 中执行 sudo -i，再重新运行本命令。"
[ -f "$ENV_FILE" ] || fail "没有检测到 HomeSphere。请先运行一键安装命令。"
command -v docker >/dev/null 2>&1 || fail "Docker 不存在，请先运行一键安装。"
command -v systemctl >/dev/null 2>&1 || fail "当前系统没有 systemd，暂不支持自动配置 Cloudflare Tunnel。"

cat <<'EOF'

HomeSphere 将使用 Cloudflare Tunnel 提供公网 HTTPS。

安全规则与 MiniProbe 对齐：
- Tunnel Token 只保存在 VPS 本机；
- 保存位置：/etc/homesphere/cloudflared.env
- 目录权限：0750
- Token 文件权限：0600
- 只有 root 可以读取；
- Token 不写入 HomeSphere .env；
- 不写入 Docker volume；
- 不上传 GitHub；
- 不显示在网页中。

这样 VPS 重启后，systemd 可以自动恢复 Tunnel，不需要重新输入 Token。

VPS 不需要开放 80 / 443 / 8080 / 12333。

请先在 Cloudflare 控制台完成：
1. 创建 Remotely-managed Tunnel；
2. 添加 Public Hostname，例如 media.example.com；
3. Service 填：
      http://127.0.0.1:8080
4. 复制 Tunnel Token（以 eyJ... 开头）。
EOF

echo
read -r -p "请输入 HomeSphere 域名（例如 media.example.com）： " DOMAIN
DOMAIN="${DOMAIN#http://}"
DOMAIN="${DOMAIN#https://}"
DOMAIN="${DOMAIN%%/*}"
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || fail "域名格式不正确。"

read -r -s -p "请输入 Cloudflare Tunnel Token： " TUNNEL_TOKEN
echo
[ "${#TUNNEL_TOKEN}" -ge 20 ] || fail "Tunnel Token 看起来无效。"

say "安装 / 检查 cloudflared"
if ! command -v cloudflared >/dev/null 2>&1 || ! cloudflared --version >/dev/null 2>&1; then
  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64|amd64) ASSET="cloudflared-linux-amd64" ;;
    aarch64|arm64) ASSET="cloudflared-linux-arm64" ;;
    *) fail "当前 CPU 架构 $ARCH 暂不支持自动安装 cloudflared。" ;;
  esac

  TMP="/usr/local/bin/.cloudflared.homesphere.tmp"
  curl -fL --retry 3 --connect-timeout 10     "https://github.com/cloudflare/cloudflared/releases/latest/download/$ASSET"     -o "$TMP"
  chmod 755 "$TMP"
  "$TMP" --version >/dev/null
  mv -f "$TMP" /usr/local/bin/cloudflared
fi
cloudflared --version

say "清理旧的 transient Tunnel / Caddy（如果存在）"
systemctl stop homesphere-cloudflared.service >/dev/null 2>&1 || true
systemctl disable homesphere-cloudflared.service >/dev/null 2>&1 || true
rm -f "$CF_SERVICE"
systemctl daemon-reload >/dev/null 2>&1 || true
systemctl reset-failed homesphere-cloudflared.service >/dev/null 2>&1 || true

docker rm -f homesphere-caddy >/dev/null 2>&1 || true
docker volume rm homesphere-caddy-data homesphere-caddy-config >/dev/null 2>&1 || true
docker image rm caddy:2-alpine >/dev/null 2>&1 || true
rm -rf "$APP_DIR/caddy" >/dev/null 2>&1 || true

say "保存本机 root-only Tunnel 凭据"
mkdir -p "$CF_ENV_DIR"
chmod 750 "$CF_ENV_DIR"

cat > "$CF_ENV_FILE" <<EOF
TUNNEL_TOKEN='$TUNNEL_TOKEN'
HOMESPHERE_DOMAIN='$DOMAIN'
EOF
chmod 600 "$CF_ENV_FILE"

# 当前 shell 不再保留 Token。
unset TUNNEL_TOKEN

cat > "$CF_RUNNER" <<'EOF'
#!/bin/sh
set -eu
. /etc/homesphere/cloudflared.env
exec /usr/local/bin/cloudflared tunnel --no-autoupdate run --token "$TUNNEL_TOKEN"
EOF
chmod 700 "$CF_RUNNER"

cat > "$CF_SERVICE" <<EOF
[Unit]
Description=HomeSphere Cloudflare Tunnel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$CF_RUNNER
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now homesphere-cloudflared >/dev/null

say "验证 Cloudflare Tunnel"
OK=0
for _ in $(seq 1 30); do
  CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 "https://$DOMAIN/api/auth" 2>/dev/null || true)"
  if [ "$CODE" = "200" ]; then
    OK=1
    break
  fi
  sleep 2
done

if [ "$OK" -ne 1 ]; then
  echo
  echo "Cloudflare Tunnel 暂未验证成功。"
  echo "请确认 Cloudflare 的 Public Hostname Service 是否准确填写："
  echo
  echo "    http://127.0.0.1:8080"
  echo
  echo "查看 Tunnel 日志："
  echo
  echo "    journalctl -u homesphere-cloudflared -n 100 --no-pager"
  echo
  echo "如果 VPS 限制出站流量，还需要允许 cloudflared 访问 Cloudflare 的 7844 端口。"
  exit 1
fi

say "启用 Secure Cookie"
cd "$APP_DIR"
if grep -q '^COOKIE_SECURE=' "$ENV_FILE"; then
  sed -i 's/^COOKIE_SECURE=.*/COOKIE_SECURE=true/' "$ENV_FILE"
else
  printf '\nCOOKIE_SECURE=true\n' >> "$ENV_FILE"
fi
docker compose "${COMPOSE_FILES[@]}" up -d --force-recreate homesphere >/dev/null

say "Cloudflare Tunnel 状态"
systemctl --no-pager --full status homesphere-cloudflared.service | sed -n '1,12p' || true

cat <<EOF

配置完成。

HomeSphere 公网地址：
https://$DOMAIN

当前网络边界：
Cloudflare -> Tunnel -> 127.0.0.1:8080 -> HomeSphere

Tunnel Token 只保存在：
$CF_ENV_FILE

安全属性：
- root-only
- chmod 600
- 不进 HomeSphere .env
- 不进 Docker
- 不进 GitHub
- VPS 重启后 systemd 自动恢复 Tunnel

VPS 不需要开放：
- TCP 80
- TCP 443
- TCP 8080
- TCP 12333

查看 Tunnel 状态：
systemctl status homesphere-cloudflared.service --no-pager

查看 Tunnel 日志：
journalctl -u homesphere-cloudflared -n 100 --no-pager
EOF
