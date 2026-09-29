#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/homesphere"
ENV_FILE="$APP_DIR/.env"

fail() { printf '\n[错误] %s\n' "$*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || fail "未找到 $ENV_FILE"

read_env() {
  local key="$1"
  sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n1 | sed -e "s/^'//" -e "s/'$//" -e 's/^"//' -e 's/"$//'
}

QMS_API_KEY="$(read_env QMS_API_KEY)"
QMS_DB="$(read_env QMS_POSTGRES_DB)"
QMS_USER="$(read_env QMS_POSTGRES_USER)"
QMS_PASSWORD="$(read_env QMS_POSTGRES_PASSWORD)"

[ -n "$QMS_API_KEY" ] || fail "QMS_API_KEY 为空"
[ -n "$QMS_DB" ] || QMS_DB="qmediasync"
[ -n "$QMS_USER" ] || QMS_USER="qmediasync"
[ -n "$QMS_PASSWORD" ] || fail "QMS_POSTGRES_PASSWORD 为空"

READY=0
for _ in $(seq 1 60); do
  TABLES="$(docker exec -e PGPASSWORD="$QMS_PASSWORD" qms-postgres \
    psql -U "$QMS_USER" -d "$QMS_DB" -Atc \
    "SELECT CASE WHEN to_regclass('public.api_keys') IS NOT NULL AND to_regclass('public.users') IS NOT NULL THEN 1 ELSE 0 END;" \
    2>/dev/null || true)"
  if [ "$TABLES" = "1" ]; then
    READY=1
    break
  fi
  sleep 2
done

if [ "$READY" -ne 1 ]; then
  echo "[警告] QMediaSync 数据表尚未就绪，暂未注册 HomeSphere 内部 API Key。"
  exit 0
fi

USER_ID="$(docker exec -e PGPASSWORD="$QMS_PASSWORD" qms-postgres \
  psql -U "$QMS_USER" -d "$QMS_DB" -Atc "SELECT id FROM users ORDER BY id LIMIT 1;" 2>/dev/null || true)"

if [ -z "$USER_ID" ]; then
  echo "[提示] QMediaSync 尚未完成首次用户设置，暂未注册内部 API Key。"
  exit 0
fi

KEY_HASH="$(printf '%s' "$QMS_API_KEY" | sha256sum | awk '{print $1}')"
KEY_PREFIX="${QMS_API_KEY:0:8}"
NOW="$(date +%s)"

docker exec -i -e PGPASSWORD="$QMS_PASSWORD" qms-postgres \
  psql -v ON_ERROR_STOP=1 -U "$QMS_USER" -d "$QMS_DB" >/dev/null <<SQL
DELETE FROM api_keys
WHERE name='HomeSphere playback resolver'
  AND key_hash <> '$KEY_HASH';

INSERT INTO api_keys
  (created_at, updated_at, user_id, name, key_hash, key_prefix, last_used_at, is_active)
VALUES
  ($NOW, $NOW, $USER_ID, 'HomeSphere playback resolver', '$KEY_HASH', '$KEY_PREFIX', 0, TRUE)
ON CONFLICT (key_hash)
DO UPDATE SET
  updated_at=EXCLUDED.updated_at,
  user_id=EXCLUDED.user_id,
  name=EXCLUDED.name,
  key_prefix=EXCLUDED.key_prefix,
  is_active=TRUE;
SQL

echo "QMediaSync 内部播放 API Key 已就绪。"
