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

tmdb_state() {
  if grep -Eq "^TMDB_API_TOKEN='?[^']+'?$" "$APP_DIR/.env" 2>/dev/null; then
    printf '已配置'
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
  printf "Bridge 镜像:    %s\n" "$(docker inspect -f '{{.Config.Image}}' media-bridge 2>/dev/null || printf '未创建')"
  printf "STRM 数量:      %s\n" "$(find "$APP_DIR/media" -type f -iname '*.strm' 2>/dev/null | wc -l | tr -d ' ')"
  printf "TMDB:           %s\n" "$(tmdb_state)"
  printf "Cloudflare:     %s\n" "$(tunnel_state)"
  echo
  docker compose "${COMPOSE_FILES[@]}" ps 2>/dev/null || true
}

tmdb_menu() {
  while true; do
    clear
    cat <<EOF
TMDB 元数据

当前状态: $(tmdb_state)

1. 配置 / 更换 Token
2. 清除 Token
0. 返回
EOF
    printf "\n请选择: "
    read -r choice
    case "$choice" in
      1)
        echo
        read -r -s -p "请输入 TMDB API Read Access Token: " token
        echo
        [ -n "$token" ] || { echo "Token 不能为空。"; pause; continue; }
        [[ "$token" != *"'"* ]] || { echo "Token 格式不正确。"; pause; continue; }

        printf "正在验证 Token..."
        http_code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 12 \
          -H "Authorization: Bearer $token" \
          -H "Accept: application/json" \
          https://api.themoviedb.org/3/configuration || true)"
        if [ "$http_code" != "200" ]; then
          echo
          echo "Token 验证失败（HTTP ${http_code:-network error}），没有修改现有配置。"
          pause
          continue
        fi
        echo " 通过"

        umask 077
        tmp="$(mktemp "$APP_DIR/.env.tmp.XXXXXX")"
        grep -v '^TMDB_API_TOKEN=' "$APP_DIR/.env" > "$tmp" || true
        printf "TMDB_API_TOKEN='%s'\n" "$token" >> "$tmp"
        chmod 600 "$tmp"
        mv "$tmp" "$APP_DIR/.env"
        unset token

        say "重启 HomeSphere"
        docker compose "${COMPOSE_FILES[@]}" up -d --force-recreate homesphere
        echo "TMDB 已配置。刷新 HomeSphere 后，详情页会自动补充简介、年份和背景图。"
        pause
        ;;
      2)
        umask 077
        tmp="$(mktemp "$APP_DIR/.env.tmp.XXXXXX")"
        grep -v '^TMDB_API_TOKEN=' "$APP_DIR/.env" > "$tmp" || true
        printf "TMDB_API_TOKEN=''\n" >> "$tmp"
        chmod 600 "$tmp"
        mv "$tmp" "$APP_DIR/.env"
        docker compose "${COMPOSE_FILES[@]}" up -d --force-recreate homesphere
        echo "TMDB Token 已清除。"
        pause
        ;;
      0) return ;;
      *) ;;
    esac
  done
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

playback_safety_check() {
  clear
  echo "播放链路安全自检"
  echo "================"
  echo
  echo "检查目标：HomeSphere 只做控制面，115 视频字节不经过 VPS / Cloudflare Tunnel。"
  echo

  local failed=0
  local warned=0
  local hs_port bridge_port domain code

  hs_port="$(docker port homesphere 8080/tcp 2>/dev/null || true)"
  if printf '%s\n' "$hs_port" | grep -qx '127\.0\.0\.1:8080'; then
    echo "[通过] HomeSphere 仅监听 127.0.0.1:8080"
  else
    echo "[失败] HomeSphere 8080 端口不是仅本机监听：${hs_port:-未检测到}"
    failed=$((failed+1))
  fi

  bridge_port="$(docker port media-bridge 12333/tcp 2>/dev/null || true)"
  if printf '%s\n' "$bridge_port" | grep -qx '127\.0\.0\.1:12333'; then
    echo "[通过] Media Bridge 仅监听 127.0.0.1:12333"
  else
    echo "[失败] Media Bridge 12333 端口不是仅本机监听：${bridge_port:-未检测到}"
    failed=$((failed+1))
  fi

  if grep -q "status:302" "$APP_DIR/src/app/api/play/[id]/route.ts" 2>/dev/null \
    && grep -q "Location:target" "$APP_DIR/src/app/api/play/[id]/route.ts" 2>/dev/null; then
    echo "[通过] 115 点播接口固定返回 302 到最终 CDN"
  else
    echo "[失败] 未确认 115 点播接口的 302 重定向保护"
    failed=$((failed+1))
  fi

  if grep -q "Media Bridge 必须返回 3xx" "$APP_DIR/src/lib/library/bridge.ts" 2>/dev/null; then
    echo "[通过] Media Bridge 返回 200/媒体字节时会被拒绝"
  else
    echo "[失败] 未确认 Bridge 禁止代理媒体字节的保护"
    failed=$((failed+1))
  fi

  if grep -q "rejects bridges that proxy media bytes instead of redirecting" "$APP_DIR/src/lib/library/bridge.test.ts" 2>/dev/null; then
    echo "[通过] CI 单元测试覆盖“禁止 Bridge 代理视频字节”"
  else
    echo "[警告] 未找到对应自动化回归测试"
    warned=$((warned+1))
  fi

  if [ ! -f "$APP_DIR/src/app/api/live/stream/[url]/route.ts" ] \
    && ! grep -q "/api/live/stream/" "$APP_DIR/src/components/live-player.tsx" 2>/dev/null; then
    echo "[通过] 直播为 Direct-only，服务端视频代理端点不存在"
  else
    echo "[失败] 检测到直播服务端代理能力，可能导致视频字节经过 VPS / Cloudflare"
    failed=$((failed+1))
  fi

  if systemctl is-active --quiet "$TUNNEL_SERVICE" 2>/dev/null; then
    domain="$(sed -n "s/^HOMESPHERE_DOMAIN='\(.*\)'/\1/p" /etc/homesphere/cloudflared.env 2>/dev/null | head -n1)"
    if [ -n "$domain" ]; then
      code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 "https://$domain/api/auth" 2>/dev/null || true)"
      if [ "$code" = "200" ]; then
        echo "[通过] Cloudflare Tunnel 仅作为 HomeSphere Web/API 入口"
      else
        echo "[警告] Tunnel 正在运行，但公网 /api/auth 验证返回 HTTP ${code:-网络错误}"
        warned=$((warned+1))
      fi
    else
      echo "[警告] Tunnel 正在运行，但未读取到 HomeSphere 域名"
      warned=$((warned+1))
    fi
  else
    echo "[提示] Cloudflare Tunnel 尚未启用；不影响 115 点播 302 架构"
  fi

  echo
  if [ "$failed" -eq 0 ]; then
    echo "结论：通过"
    echo "115 点播链路保持：页面/API -> HomeSphere；视频 -> 最终 CDN。"
    echo "HomeSphere/VPS 不接收、缓存、转发 115 视频字节。"
  else
    echo "结论：不通过（${failed} 项失败，${warned} 项警告）"
    echo "请先修复失败项，不建议继续扩大公网使用。"
  fi

  echo
  echo "说明：115 STRM 点播必须 302 到最终 CDN；M3U 直播必须 Direct-only。"
}


strm_check() {
  clear
  echo "115 / STRM 检查"
  echo "=============="
  echo
  local total=0 checked=0 invalid=0 sample=""
  total="$(find "$APP_DIR/media" -type f -iname '*.strm' 2>/dev/null | wc -l | tr -d ' ')"
  echo "STRM 总数: ${total:-0}"
  echo "共享目录:  $APP_DIR/media -> /media"
  echo
  if [ "${total:-0}" -eq 0 ]; then
    echo "当前还没有 STRM。请先在 QMediaSync 中完成 115 授权并同步一个小目录。"
    return
  fi

  while IFS= read -r -d '' file; do
    sample="$(awk 'NF { gsub(/\r/,""); print; exit }' "$file" 2>/dev/null || true)"
    checked=$((checked+1))
    if ! printf '%s\n' "$sample" | grep -Eq '^https?://media-bridge:12333/'; then
      invalid=$((invalid+1))
      if [ "$invalid" -le 5 ]; then
        echo "[异常] ${file#$APP_DIR/media/}"
        echo "       ${sample:-空文件}"
      fi
    fi
    [ "$checked" -ge 100 ] && break
  done < <(find "$APP_DIR/media" -type f -iname '*.strm' -print0 2>/dev/null)

  echo
  if [ "$invalid" -eq 0 ]; then
    echo "[通过] 抽检 $checked 个 STRM，均指向 http(s)://media-bridge:12333/"
    echo "下一步：进入 HomeSphere → 片库 → 同步STRM → 测试播放链路。"
  else
    echo "[失败] 抽检 $checked 个 STRM，其中 $invalid 个没有指向 HomeSphere 内网 Bridge。"
    echo "请在 QMediaSync 的同步目录中把 STRM 直连地址设置为：http://media-bridge:12333"
  fi
}

strm_setup_guide() {
  clear
  cat <<'EOF'
QMediaSync / 115 首次配置
========================

1. 在你自己的 Mac 终端建立管理隧道：

   ssh -L 12333:127.0.0.1:12333 root@你的VPS_IP

2. 浏览器打开：

   http://127.0.0.1:12333

3. QMediaSync 中只做这几件事：

   - 完成 115 OAuth 授权；
   - 只添加真实媒体目录，不要扫描 115 根目录；
   - 电影、电视剧分开建同步目录；
   - STRM 本地根目录使用：/media
   - STRM 直连地址使用：http://media-bridge:12333
   - 本地代理 / 115 下载链接代理：关闭
   - 元数据下载：关闭
   - 元数据上传：关闭
   - 联动删除网盘文件：关闭
   - 不配置 Emby / Jellyfin / Plex；
   - 定时同步建议：每 6 小时一次。

4. 第一次不要同步整个 50TB。
   先选一个很小的电影目录，生成少量 STRM，验证播放链路。

正确播放路径：

   HomeSphere -> QMediaSync 12333 -> 302 -> 115 CDN
                                      |
                                      +-> 视频字节不经过 VPS

EOF
}

strm_menu() {
  while true; do
    clear
    cat <<EOF
115 / STRM

QMediaSync:   $(container_state media-bridge)
镜像:         $(docker inspect -f '{{.Config.Image}}' media-bridge 2>/dev/null || printf '未创建')
STRM 数量:    $(find "$APP_DIR/media" -type f -iname '*.strm' 2>/dev/null | wc -l | tr -d ' ')
自动索引:      $(systemctl is-active homesphere-strm-sync.timer 2>/dev/null || printf '未启用')

1. 首次配置说明
2. 检查 STRM
3. 立即同步 HomeSphere STRM 索引
4. 重启 QMediaSync
5. 查看 QMediaSync 日志
0. 返回
EOF
    printf "\n请选择: "
    read -r choice
    case "$choice" in
      1) strm_setup_guide; pause ;;
      2) strm_check; pause ;;
      3)
        clear
        if bash "$APP_DIR/scripts/strm-index-sync.sh"; then
          echo
          echo "HomeSphere STRM 本地索引同步完成。"
        else
          echo
          echo "同步失败，请查看 HomeSphere 日志。"
        fi
        pause
        ;;
      4)
        docker compose "${COMPOSE_FILES[@]}" restart media-bridge
        docker compose "${COMPOSE_FILES[@]}" ps media-bridge
        pause
        ;;
      5)
        clear
        docker logs --tail 160 media-bridge 2>&1 || true
        pause
        ;;
      0) return ;;
      *) ;;
    esac
  done
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

migration_menu() {
  while true; do
    clear
    cat <<'EOF'
备份 / VPS 迁移
================

1. 创建完整迁移包
2. 查看 /root 下的迁移包
3. 从迁移包恢复
0. 返回

说明：
- 迁移包包含家庭密码、115/QMediaSync 授权相关本地数据和 Tunnel Token（如已配置）；
- 文件权限为 root-only 600；
- 只通过 SSH / SCP 传输，不要上传到 GitHub、网盘或公开链接；
- 恢复前会自动为新 VPS 当前状态再做一个回退快照。
EOF
    printf "\n请选择: "
    read -r choice
    case "$choice" in
      1)
        clear
        bash "$APP_DIR/scripts/backup.sh"
        pause
        ;;
      2)
        clear
        echo "HomeSphere 迁移包："
        echo
        ls -lh /root/homesphere-migration-*.tar.gz /root/homesphere-pre-restore-*.tar.gz 2>/dev/null || echo "暂无迁移包。"
        pause
        ;;
      3)
        clear
        echo "请输入迁移包完整路径。"
        echo "例如：/root/homesphere-migration-20261002-010203.tar.gz"
        echo
        read -r -p "迁移包路径: " backup_path
        [ -f "$backup_path" ] || { echo "文件不存在：$backup_path"; pause; continue; }
        echo
        echo "恢复会覆盖当前 HomeSphere / QMediaSync 本地数据。"
        read -r -p "输入 RESTORE 确认继续: " confirm
        if [ "$confirm" = "RESTORE" ]; then
          bash "$APP_DIR/scripts/restore.sh" "$backup_path"
        else
          echo "已取消。"
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
7. TMDB 元数据
8. Cloudflare Tunnel
9. 查看日志
10. 系统资源
11. 播放链路安全自检
12. 115 / STRM
13. 备份 / VPS 迁移
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
    7) tmdb_menu ;;
    8) tunnel_menu ;;
    9) logs_menu ;;
    10) show_resources; pause ;;
    11) playback_safety_check; pause ;;
    12) strm_menu ;;
    13) migration_menu ;;
    0) exit 0 ;;
    *) ;;
  esac
done
