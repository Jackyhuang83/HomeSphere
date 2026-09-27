#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/homesphere"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.bridge.yml)
TUNNEL_SERVICE="homesphere-cloudflared.service"

say() { printf '\n==> %s\n' "$*"; }
fail() { printf '\n[错误] %s\n' "$*" >&2; exit 1; }
pause() { printf '\n按回车返回菜单...'; read -r _; }

[ "${EUID}" -eq 0 ] || fail "请先执行 sudo -i，再运行 homesphere。"
[ -d "$APP_DIR" ] || fail "没有检测到 HomeSphere，请先完成安装。"
[ -f "$APP_DIR/docker-compose.yml" ] || fail "HomeSphere 安装目录不完整。"

cd "$APP_DIR"

version() {
  local v
  v="$(sed -n 's/.*"version":[[:space:]]*"\([^"]*\)".*/\1/p' package.json 2>/dev/null | head -n1)"
  printf '%s' "${v:-unknown}"
}

container_state() {
  docker inspect -f '{{.State.Status}}' "$1" 2>/dev/null || printf '未创建'
}

tunnel_state() {
  if systemctl list-unit-files "$TUNNEL_SERVICE" >/dev/null 2>&1; then
    systemctl is-active "$TUNNEL_SERVICE" 2>/dev/null || true
  else
    printf '未配置'
  fi
}

show_status() {
  clear
  echo "HomeSphere 管理"
  echo "==============="
  echo
  printf "版本:           %s\n" "$(version)"
  printf "HomeSphere:     %s\n" "$(container_state homesphere)"
  printf "Media Bridge:   %s\n" "$(container_state media-bridge)"
  printf "Cloudflare:     %s\n" "$(tunnel_state)"
  echo
  docker compose "${COMPOSE_FILES[@]}" ps 2>/dev/null || true
}

restart_services() {
  say "重启 HomeSphere 与 Media Bridge"
  docker compose "${COMPOSE_FILES[@]}" restart
  docker compose "${COMPOSE_FILES[@]}" ps
}

start_services() {
  say "启动 HomeSphere 与 Media Bridge"
  docker compose "${COMPOSE_FILES[@]}" up -d
  docker compose "${COMPOSE_FILES[@]}" ps
}

stop_services() {
  say "停止 HomeSphere 与 Media Bridge"
  docker compose "${COMPOSE_FILES[@]}" stop
  docker compose "${COMPOSE_FILES[@]}" ps
}

show_resources() {
  clear
  echo "系统资源"
  echo "========"
  echo
  echo "[内存]"
  free -h
  echo
  echo "[磁盘]"
  df -h /
  echo
  echo "[Docker]"
  docker system df 2>/dev/null || true
  echo
  echo "[容器]"
  docker stats --no-stream homesphere media-bridge 2>/dev/null || true
}

logs_menu() {
  while true; do
    clear
    cat <<'EOF'
日志

1. HomeSphere
2. Media Bridge
3. Cloudflare Tunnel
0. 返回
EOF
    printf "\n请选择: "
    read -r choice
    case "$choice" in
      1)
        clear
        docker logs --tail 120 homesphere 2>&1 || true
        pause
        ;;
      2)
        clear
        docker logs --tail 120 media-bridge 2>&1 || true
        pause
        ;;
      3)
        clear
        if systemctl list-unit-files "$TUNNEL_SERVICE" >/dev/null 2>&1; then
          journalctl -u "$TUNNEL_SERVICE" -n 120 --no-pager
        else
          echo "Cloudflare Tunnel 尚未配置。"
        fi
        pause
        ;;
      0) return ;;
      *) ;;
    esac
  done
}

tunnel_menu() {
  while true; do
    clear
    cat <<EOF
Cloudflare Tunnel

当前状态: $(tunnel_state)

1. 配置 / 重新配置
2. 重启 Tunnel
3. 查看日志
0. 返回
EOF
    printf "\n请选择: "
    read -r choice
    case "$choice" in
      1)
        bash "$APP_DIR/scripts/https.sh"
        pause
        ;;
      2)
        if systemctl list-unit-files "$TUNNEL_SERVICE" >/dev/null 2>&1; then
          systemctl restart "$TUNNEL_SERVICE"
          systemctl --no-pager --full status "$TUNNEL_SERVICE" | sed -n '1,12p'
        else
          echo "Cloudflare Tunnel 尚未配置。"
        fi
        pause
        ;;
      3)
        clear
        if systemctl list-unit-files "$TUNNEL_SERVICE" >/dev/null 2>&1; then
          journalctl -u "$TUNNEL_SERVICE" -n 120 --no-pager
        else
          echo "Cloudflare Tunnel 尚未配置。"
        fi
        pause
        ;;
      0) return ;;
      *) ;;
    esac
  done
}

while true; do
  clear
  cat <<EOF
HomeSphere $(version)
==============================

1. 查看运行状态
2. 更新 HomeSphere
3. 重启服务
4. 启动服务
5. 停止服务
6. 家庭密码管理
7. Cloudflare Tunnel
8. 查看日志
9. 系统资源
0. 退出
EOF

  printf "\n请选择: "
  read -r choice

  case "$choice" in
    1) show_status; pause ;;
    2) bash "$APP_DIR/scripts/update.sh"; pause ;;
    3) restart_services; pause ;;
    4) start_services; pause ;;
    5) stop_services; pause ;;
    6) bash "$APP_DIR/scripts/password.sh"; pause ;;
    7) tunnel_menu ;;
    8) logs_menu ;;
    9) show_resources; pause ;;
    0) exit 0 ;;
    *) ;;
  esac
done
