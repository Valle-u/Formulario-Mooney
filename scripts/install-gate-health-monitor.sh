#!/usr/bin/env bash
# Instala el monitor continuo del GATE (systemd, log en $DIR/health-monitor.log).
#   bash scripts/install-gate-health-monitor.sh
#
# Si existe $DIR/.gate-alert.env (chmod 600, con GATE_ALERT_URL y GATE_ALERT_TOKEN), el monitor
# además EMPUJA el aviso a PAM cuando el gate se degrada. El token va en ese archivo y no en la
# unit de systemd, que es de lectura general.

set -euo pipefail

DIR="${1:-}"
for d in ~/gate ~/receipt-gate; do
  [[ -z "$DIR" && -f "$d/docker-compose.yml" ]] && DIR="$d"
done
[[ -n "$DIR" && -f "$DIR/docker-compose.yml" ]] || { echo "No docker-compose.yml"; exit 1; }

MON="$DIR/scripts/monitor-gate-health.sh"
[[ -f "$MON" ]] || { echo "Falta $MON"; exit 1; }

# El repo declara *.sh eol=lf, pero eso normaliza el commit, no el tarball: un deploy empaquetado
# desde un working tree en Windows viaja con CRLF y el script muere en la primera línea. El
# monitor corre desatendido durante meses, así que se cura acá en vez de fallar en silencio.
if grep -qU $'\r' "$MON"; then
  sed -i 's/\r$//' "$MON"
  echo "Aviso: $MON tenía CRLF — normalizado a LF"
fi
chmod +x "$MON"

ALERTA="$DIR/.gate-alert.env"
if [[ -f "$ALERTA" ]]; then
  chmod 600 "$ALERTA"
  LINEA_ALERTA="EnvironmentFile=$ALERTA"
  echo "Aviso a PAM: ACTIVO (config en $ALERTA)"
else
  LINEA_ALERTA="# sin $ALERTA: el monitor solo logea, no avisa"
  echo "Aviso a PAM: inactivo (no existe $ALERTA)"
fi

sudo tee /etc/systemd/system/gate-health-monitor.service > /dev/null << EOF
[Unit]
Description=GATE health monitor (ClamAV + /health, con aviso a PAM)
After=docker.service

[Service]
Type=simple
User=ec2-user
WorkingDirectory=$DIR
Environment=GATE_DIR=$DIR
Environment=GATE_MONITOR_LOG=$DIR/health-monitor.log
Environment=GATE_MONITOR_STATE=$DIR/.health-monitor-state
Environment=GATE_MONITOR_INTERVAL=60
$LINEA_ALERTA
ExecStart=$MON
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now gate-health-monitor.service
sudo systemctl status gate-health-monitor.service --no-pager || true
echo "Log: tail -f $DIR/health-monitor.log"
