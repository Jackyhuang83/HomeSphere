#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/homesphere"
SERVICE="/etc/systemd/system/homesphere-strm-sync.service"
TIMER="/etc/systemd/system/homesphere-strm-sync.timer"

[ "${EUID}" -eq 0 ] || { echo "需要 root 权限" >&2; exit 1; }
[ -x "$APP_DIR/scripts/strm-index-sync.sh" ] || chmod +x "$APP_DIR/scripts/strm-index-sync.sh"

cat > "$SERVICE" <<'EOF'
[Unit]
Description=HomeSphere local STRM index sync
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/opt/homesphere/scripts/strm-index-sync.sh
Nice=10
IOSchedulingClass=idle
EOF

cat > "$TIMER" <<'EOF'
[Unit]
Description=HomeSphere low-frequency STRM index timer

[Timer]
OnBootSec=45min
OnUnitActiveSec=6h
AccuracySec=5min
Unit=homesphere-strm-sync.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now homesphere-strm-sync.timer >/dev/null
