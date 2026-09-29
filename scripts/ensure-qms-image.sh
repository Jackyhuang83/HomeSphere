#!/usr/bin/env bash
set -Eeuo pipefail

IMAGE="homesphere-qms:v0.14.23-frozen"
UPSTREAM_DIGEST="sha256:ee74ff4edcbc6b3e949404286951b7a9d21977203099dceb2fdea36c2840f82d"
RELEASE_BASE="https://github.com/Jackyhuang83/HomeSphere/releases/download/qms-v0.14.23-frozen"
ARCHIVE="qmediasync-v0.14.23-amd64.tar.gz"
CHECKSUM="${ARCHIVE}.sha256"

say() { printf '\n==> %s\n' "$*"; }
fail() { printf '\n[错误] %s\n' "$*" >&2; exit 1; }

if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "QMediaSync 冻结镜像已存在：$IMAGE"
  exit 0
fi

# 如果 VPS 上已经有刚刚实机验证过的上游镜像，并且 digest 完全一致，
# 直接在本机重新打冻结标签，不需要重新下载数百 MB 镜像。
for candidate in qicfan/qmediasync:v0.14.23 qicfan/qmediasync:latest; do
  if ! docker image inspect "$candidate" >/dev/null 2>&1; then
    continue
  fi
  if docker image inspect "$candidate" --format '{{json .RepoDigests}}' 2>/dev/null | grep -q "$UPSTREAM_DIGEST"; then
    say "复用 VPS 上已验证的 QMediaSync 镜像"
    docker tag "$candidate" "$IMAGE"
    docker image inspect "$IMAGE" >/dev/null 2>&1 || fail "本地冻结标签创建失败"
    echo "QMediaSync 冻结镜像已就绪：$IMAGE"
    exit 0
  fi
done

say "从 HomeSphere Release 恢复冻结的 QMediaSync 镜像"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

curl -fsSL --retry 3 --retry-delay 2 "$RELEASE_BASE/$ARCHIVE" -o "$TMP_DIR/$ARCHIVE" ||
  fail "QMediaSync 冻结镜像下载失败"
curl -fsSL --retry 3 --retry-delay 2 "$RELEASE_BASE/$CHECKSUM" -o "$TMP_DIR/$CHECKSUM" ||
  fail "QMediaSync 冻结镜像校验文件下载失败"

(
  cd "$TMP_DIR"
  sha256sum -c "$CHECKSUM"
) || fail "QMediaSync 冻结镜像校验失败"

gzip -dc "$TMP_DIR/$ARCHIVE" | docker load >/dev/null

docker image inspect "$IMAGE" >/dev/null 2>&1 ||
  fail "QMediaSync 冻结镜像载入后未找到预期标签 $IMAGE"

echo "QMediaSync 冻结镜像已就绪：$IMAGE"
