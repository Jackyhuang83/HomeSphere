#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/homesphere"
ENV_FILE="$APP_DIR/.env"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.bridge.yml)

say() { printf '\n==> %s\n' "$*"; }
fail() { printf '\n[错误] %s\n' "$*" >&2; exit 1; }

[ "${EUID}" -eq 0 ] || fail "请先在 SSH 中执行 sudo -i，再重新运行本命令。"
[ -f "$ENV_FILE" ] || fail "没有检测到 HomeSphere。请先运行一键安装命令。"
command -v docker >/dev/null 2>&1 || fail "Docker 不存在，请先运行一键安装。"
command -v systemctl >/dev/null 2>&1 || fail "当前系统没有 systemd，暂不支持此 Cloudflare Tunnel 启动方式。"
command -v systemd-run >/dev/null 2>&1 || fail "当前系统没有 systemd-run，暂不支持无落盘 Token 模式。"

cat <<'EOF'

HomeSphere 将使用 Cloudflare Tunnel 提供公网 HTTPS。

安全原则：
- Tunnel Token 不写入任何持久化文件；
- 不写入 /etc、/opt、Docker volume 或 GitHub；
- 不出现在 shell 历史；
- Token 只存在当前系统运行时和 cloudflared 进程内存中；
- VPS 重启后需要重新运行本脚本并再次输入 Token。

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

say "清理旧版持久化 Tunnel Token（如果存在）"
systemctl disable --now homesphere-cloudflared.service >/dev/null 2>&1 || true
rm -f /etc/systemd/system/homesphere-cloudflared.service
rm -f /etc/homesphere/cloudflared.env
rm -f "$APP_DIR/run-cloudflared.sh"
rmdir /etc/homesphere >/dev/null 2>&1 || true
systemctl daemon-reload >/dev/null 2>&1 || true
systemctl reset-failed homesphere-cloudflared.service >/dev/null 2>&1 || true

say "清理旧的 Caddy 入口（如果存在）"
docker rm -f homesphere-caddy >/dev/null 2>&1 || true
docker volume rm homesphere-caddy-data homesphere-caddy-config >/dev/null 2>&1 || true
docker image rm caddy:2-alpine >/dev/null 2>&1 || true
rm -rf "$APP_DIR/caddy" >/dev/null 2>&1 || true

say "启动无落盘 Cloudflare Tunnel"
# 使用 transient systemd unit：
# - Token 通过运行时环境变量传给 cloudflared；
# - transient unit 只存在 /run（tmpfs）和 systemd 运行时内存；
# - 不创建持久化 unit / env 文件；
# - 当前启动周期内若 cloudflared 异常退出，systemd 会自动重启；
# - VPS 重启后 unit 和 Token 都消失，需要重新运行本脚本。
systemd-run   --unit=homesphere-cloudflared   --description="HomeSphere Cloudflare Tunnel (volatile token)"   --property=Restart=always   --property=RestartSec=5   --property=NoNewPrivileges=yes   --property=PrivateTmp=yes   --property=ProtectHome=yes   --property=ProtectSystem=strict   --property=ProtectKernelTunables=yes   --property=ProtectKernelModules=yes   --property=ProtectControlGroups=yes   --property=RestrictSUIDSGID=yes   --property=LockPersonality=yes   --setenv=TUNNEL_TOKEN="$TUNNEL_TOKEN"   /usr/local/bin/cloudflared tunnel --no-autoupdate run >/dev/null

# 尽快从当前 shell 变量中移除。
unset TUNNEL_TOKEN

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
  systemctl stop homesphere-cloudflared.service >/dev/null 2>&1 || true
  systemctl reset-failed homesphere-cloudflared.service >/dev/null 2>&1 || true
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

Tunnel Token：
- 未写入持久化文件
- 未保存到 HomeSphere 配置
- 未保存到 Docker
- 未保存到 GitHub
- VPS 重启后会消失

因此 VPS 每次重启后，需要重新执行：
bash <(curl -fsSL https://raw.githubusercontent.com/Jackyhuang83/HomeSphere/main/scripts/https.sh)

并重新输入 Tunnel Token。

VPS 不需要开放：
- TCP 80
- TCP 443
- TCP 8080
- TCP 12333

查看当前启动周期内的 Tunnel 状态：
systemctl status homesphere-cloudflared.service --no-pager

查看 Tunnel 日志：
journalctl -u homesphere-cloudflared -n 100 --no-pager
EOF
