#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/homesphere"
ENV_FILE="$APP_DIR/.env"
COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.bridge.yml)

fail() { printf '\n[错误] %s\n' "$*" >&2; exit 1; }

[ "${EUID}" -eq 0 ] || fail "请先在 SSH 中执行 sudo -i，再重新运行密码管理命令。"
[ -f "$ENV_FILE" ] || fail "没有检测到 HomeSphere 配置。请先完成 HomeSphere 安装。"
command -v openssl >/dev/null 2>&1 || fail "系统缺少 openssl，请把这个报错发给我。"
command -v docker >/dev/null 2>&1 || fail "系统缺少 Docker，请把这个报错发给我。"

get_password() {
  local value
  value="$(grep '^PASSWORD=' "$ENV_FILE" | head -n1 || true)"
  value="${value#PASSWORD=}"
  if [[ "$value" == \'*\' ]] || [[ "$value" == \"*\" ]]; then
    value="${value:1:${#value}-2}"
  fi
  printf '%s' "$value"
}

validate_password() {
  local value="$1"
  [ "${#value}" -ge 8 ] || return 1
  [[ "$value" =~ ^[A-Za-z0-9@._%+=:!,-]+$ ]]
}

write_setting() {
  local key="$1"
  local value="$2"
  local quoted="${3:-no}"
  local tmp
  tmp="$(mktemp)"

  if [ "$quoted" = "yes" ]; then
    awk -v k="$key" -v v="$value" '
      BEGIN { done=0 }
      $0 ~ "^" k "=" {
        print k "='\''" v "'\''"
        done=1
        next
      }
      { print }
      END {
        if (!done) print k "='\''" v "'\''"
      }
    ' "$ENV_FILE" > "$tmp"
  else
    awk -v k="$key" -v v="$value" '
      BEGIN { done=0 }
      $0 ~ "^" k "=" {
        print k "=" v
        done=1
        next
      }
      { print }
      END {
        if (!done) print k "=" v
      }
    ' "$ENV_FILE" > "$tmp"
  fi

  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
}

apply_new_password() {
  local new_password="$1"
  local new_secret

  new_secret="$(openssl rand -hex 32)"
  write_setting "PASSWORD" "$new_password" "yes"
  write_setting "PROXY_SECRET" "$new_secret" "no"

  cd "$APP_DIR"
  docker compose "${COMPOSE_FILES[@]}" up -d --force-recreate homesphere >/dev/null

  echo
  echo "密码已更新。"
  echo "为了安全，旧的登录会话已失效，所有设备需要用新密码重新登录。"
  echo
  echo "当前家庭访问密码："
  echo
  echo "    $new_password"
  echo
}

while true; do
  echo
  echo "=============================="
  echo " HomeSphere 家庭密码管理"
  echo "=============================="
  echo "1. 查看当前密码"
  echo "2. 重新生成 20 位随机密码"
  echo "3. 设置自己的密码"
  echo "0. 退出"
  echo
  read -r -p "请选择 [0-3]： " CHOICE

  case "$CHOICE" in
    1)
      CURRENT_PASSWORD="$(get_password)"
      [ -n "$CURRENT_PASSWORD" ] || fail "没有读取到当前密码，请把这个情况发给我。"
      echo
      echo "当前家庭访问密码："
      echo
      echo "    $CURRENT_PASSWORD"
      echo
      ;;
    2)
      NEW_PASSWORD="$(openssl rand -hex 10)"
      apply_new_password "$NEW_PASSWORD"
      ;;
    3)
      while true; do
        read -r -s -p "请输入新密码（至少 8 位，只支持字母、数字和 @ . _ % + = : ! , -）： " NEW_PASSWORD
        echo
        validate_password "$NEW_PASSWORD" || {
          echo "密码格式不符合要求，请重新输入。"
          continue
        }

        read -r -s -p "请再输入一次： " NEW_PASSWORD2
        echo
        [ "$NEW_PASSWORD" = "$NEW_PASSWORD2" ] || {
          echo "两次密码不一致，请重新输入。"
          continue
        }
        break
      done
      apply_new_password "$NEW_PASSWORD"
      ;;
    0)
      exit 0
      ;;
    *)
      echo "请输入 0、1、2 或 3。"
      ;;
  esac
done
