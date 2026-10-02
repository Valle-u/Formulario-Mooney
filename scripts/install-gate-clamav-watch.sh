#!/usr/bin/env bash
# Instala watchdog ClamAV (systemd timer cada 5 min) + swap 2G en gate prod.
# Ejecutar EN el EC2 gate prod como ec2-user (sudo para systemd/swap):
#   bash scripts/install-gate-clamav-watch.sh

set -euo pipefail

DIR="${1:-}"
for d in ~/gate ~/receipt-gate; do
  [[ -z "$DIR" && -f "$d/docker-compose.yml" ]] && DIR="$d"
done
[[ -n "$DIR" && -f "$DIR/docker-compose.yml" ]] || { echo "No docker-compose.yml"; exit 1; }

WATCH="$DIR/scripts/watch-clamav.sh"
[[ -x "$WATCH" ]] || { echo "Falta $WATCH"; exit 1; }

echo "==> systemd timer gate-clamav-watch"
sudo tee /etc/systemd/system/gate-clamav-watch.service > /dev/null << EOF
[Unit]
Description=GATE ClamAV watchdog
After=docker.service

[Service]
Type=oneshot
User=ec2-user
WorkingDirectory=$DIR
ExecStart=$WATCH
EOF

sudo tee /etc/systemd/system/gate-clamav-watch.timer > /dev/null << 'EOF'
[Unit]
Description=GATE ClamAV watchdog every 5 min

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now gate-clamav-watch.timer
sudo systemctl status gate-clamav-watch.timer --no-pager || true

echo "==> swap 2G (si no existe)"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
fi
free -h
echo "==> OK — timer activo; logs: $DIR/clamav-watch.log (si cron) o journalctl -u gate-clamav-watch.service"
