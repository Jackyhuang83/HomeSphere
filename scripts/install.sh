#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/homesphere"
REPO_URL="https://github.com/Jackyhuang83/HomeSphere.git"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.bridge.yml)

say() { printf '\n==> %s\n' "$*"; }
fail() { printf '\n[错误] %s\n' "$*" >&2; exit 1; }

[ "${EUID}" -eq 0 ] || fail "请先在 SSH 中执行 sudo -i，再重新运行安装命令。"

if [ ! -f /etc/os-release ]; then
  fail "无法识别系统。当前一键安装仅支持 Debian/Ubuntu。"
fi
. /etc/os-release
case "${ID:-}" in
  debian|ubuntu) ;;
  *) fail "当前系统是 ${ID:-unknown}，一键安装仅支持 Debian/Ubuntu。" ;;
esac

say "安装基础工具"
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git openssl

if ! command -v docker >/dev/null 2>&1; then
  say "安装 Docker"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null 2>&1 || true
docker compose version >/dev/null 2>&1 || fail "Docker Compose 不可用，请把报错发给我。"

say "检查 1GB VPS 的 swap"
if ! swapon --show --noheadings | grep -q .; then
  FREE_KB="$(df --output=avail / | tail -1 | tr -d ' ')"
  if [ "${FREE_KB:-0}" -ge 2097152 ]; then
    if ! fallocate -l 1G /swapfile 2>/dev/null; then
      dd if=/dev/zero of=/swapfile bs=1M count=1024 status=progress
    fi
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo "已创建 1GB swap。"
  else
    echo "磁盘剩余空间不足 2GB，跳过自动创建 swap。"
  fi
else
  echo "系统已经有 swap，不重复创建。"
fi

say "准备 HomeSphere"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin main
  git -C "$APP_DIR" reset --hard origin/main
elif [ -e "$APP_DIR" ]; then
  fail "$APP_DIR 已存在但不是 HomeSphere Git 仓库。请把这个情况发给我处理。"
else
  git clone --depth 1 "$REPO_URL" "$APP_DIR"
fi

cd "$APP_DIR"
mkdir -p bridge-config media
chmod 700 bridge-config

if [ ! -f .env ]; then
  say "设置家庭登录密码"
  RANDOM_PASSWORD="$(openssl rand -hex 10)"
  echo "系统已自动生成 20 位随机密码："
  echo
  echo "    $RANDOM_PASSWORD"
  echo
  echo "直接回车即可使用这个随机密码；如果想用自己的密码，也可以现在输入。"

  while true; do
    read -r -s -p "自定义密码（至少 8 位；不修改就直接回车）： " CUSTOM_PASSWORD
    echo

    if [ -z "$CUSTOM_PASSWORD" ]; then
      PASSWORD="$RANDOM_PASSWORD"
      break
    fi

    [ "${#CUSTOM_PASSWORD}" -ge 8 ] || { echo "密码至少 8 位，请重新输入。"; continue; }
    [[ "$CUSTOM_PASSWORD" =~ ^[A-Za-z0-9@._%+=:!,-]+$ ]] || { echo "密码只支持字母、数字和 @ . _ % + = : ! , -"; continue; }

    read -r -s -p "请再输入一次自定义密码： " PASSWORD2
    echo
    [ "$CUSTOM_PASSWORD" = "$PASSWORD2" ] || { echo "两次密码不一致，请重新输入。"; continue; }

    PASSWORD="$CUSTOM_PASSWORD"
    break
  done

  echo
  read -r -p "TMDB API Read Access Token（没有就直接回车，之后也能再配置）： " TMDB_TOKEN
  SESSION_SECRET="$(openssl rand -hex 32)"

  umask 077
  cat > .env <<EOF
PASSWORD='$PASSWORD'
PROXY_SECRET=$SESSION_SECRET
COOKIE_SECURE=false

HOMESPHERE_IMAGE=homesphere:local
HOMESPHERE_STRM_ROOT=/media
HOMESPHERE_STRM_PATH=./media
HOMESPHERE_STRM_ALLOWED_HOSTS=media-bridge

HOMESPHERE_BRIDGE_TIMEOUT_MS=12000
HOMESPHERE_BRIDGE_MAX_REDIRECTS=3
HOMESPHERE_BRIDGE_MIN_INTERVAL_MS=1000
HOMESPHERE_BRIDGE_CACHE_TTL_MS=60000
HOMESPHERE_BRIDGE_CIRCUIT_MS=60000
HOMESPHERE_SYNC_MAX_ENTRIES=30000
HOMESPHERE_SYNC_MAX_DIRS=5000

TMDB_API_TOKEN='$TMDB_TOKEN'
TMDB_LANGUAGE=zh-CN
REQUEST_TIMEOUT=8000
MAX_RETRIES=1
DEBUG=false
EOF
  chmod 600 .env
else
  echo "检测到已有 .env，保留现有账号配置。"
fi

say "拉取 Media Bridge"
docker compose "${COMPOSE_FILES[@]}" pull media-bridge

say "构建 HomeSphere"
docker compose "${COMPOSE_FILES[@]}" build homesphere

say "启动 HomeSphere 与 Media Bridge"
docker compose "${COMPOSE_FILES[@]}" up -d

docker builder prune -f >/dev/null 2>&1 || true

say "部署结果"
docker compose "${COMPOSE_FILES[@]}" ps

cat <<'EOF'

安装完成。

为了安全，HomeSphere 的 8080 和 Media Bridge 的 12333 都只监听 VPS 本机，
不会直接暴露到公网。

下一步有两种访问方式：

1. 先自己测试：
   在你自己的电脑终端执行：
   ssh -L 8080:127.0.0.1:8080 -L 12333:127.0.0.1:12333 root@你的VPS_IP

   然后浏览器打开：
   HomeSphere:   http://127.0.0.1:8080
   Media Bridge: http://127.0.0.1:12333

2. 准备给家人/朋友长期使用：
   使用 Cloudflare Tunnel 提供 HTTPS，不需要把域名直接解析到 VPS，也不需要开放 80/443。
   先在 Cloudflare 创建 Remotely-managed Tunnel，并把 Public Hostname 的 Service 指向：
   http://127.0.0.1:8080

   然后在 SSH 中运行：
   bash <(curl -fsSL https://raw.githubusercontent.com/Jackyhuang83/HomeSphere/main/scripts/https.sh)

Media Bridge 默认账号通常为 admin / admin123。
首次登录后请立即修改管理密码，再完成 115 开放平台授权。

HomeSphere 家庭密码忘记后，不需要找配置文件。
SSH 登录 VPS 后运行：
bash <(curl -fsSL https://raw.githubusercontent.com/Jackyhuang83/HomeSphere/main/scripts/password.sh)

即可查看当前密码、生成新的随机密码或设置自己的密码。
EOF

if [ -f .env ]; then
  CURRENT_PASSWORD="$(grep '^PASSWORD=' .env | head -n1 || true)"
  CURRENT_PASSWORD="${CURRENT_PASSWORD#PASSWORD=}"
  if [[ "$CURRENT_PASSWORD" == \'*\' ]] || [[ "$CURRENT_PASSWORD" == \"*\" ]]; then
    CURRENT_PASSWORD="${CURRENT_PASSWORD:1:${#CURRENT_PASSWORD}-2}"
  fi
  if [ -n "$CURRENT_PASSWORD" ]; then
    echo
    echo "HomeSphere 当前家庭访问密码："
    echo
    echo "    $CURRENT_PASSWORD"
    echo
  fi
fi
