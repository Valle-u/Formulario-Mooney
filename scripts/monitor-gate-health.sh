#!/usr/bin/env bash
# Monitor continuo del GATE: logea /health + estado de ClamAV cada INTERVAL seg y, si el servicio
# se degrada, EMPUJA el aviso al endpoint de PAM (MSG-PAM-20260812-8 §8).
#
# Reparto acordado con PAM: este push distingue "ClamAV se cayó" con el host vivo — el caso que
# el sondeo de PAM no puede ver, porque desde afuera el host sigue contestando. El silencio total
# lo nota PAM.
#
# No repara nada (eso es watch-clamav.sh / gate-clamav-watch.timer).
#
# Config (todo opcional; sin GATE_ALERT_URL solo logea, no avisa):
#   GATE_MONITOR_INTERVAL  segundos entre muestras (default 60)
#   GATE_HEALTH_URL        de dónde leer el health (default http://127.0.0.1:4100/health).
#                          Parametrizado para poder ejercitar el camino de alarma sin degradar
#                          el servicio de verdad: una vía de aviso que nunca se probó no es una vía.
#   GATE_ALERT_URL         endpoint de PAM
#   GATE_ALERT_TOKEN       token propio de aviso (NO es INTERNAL_API_KEY)
#   GATE_ALERT_UMBRAL      muestras malas seguidas antes de avisar (default 2)

set -euo pipefail

INTERVAL="${GATE_MONITOR_INTERVAL:-60}"
UMBRAL="${GATE_ALERT_UMBRAL:-2}"
DIR="${GATE_DIR:-$HOME/gate}"
[[ -f "$DIR/docker-compose.yml" ]] || DIR="$HOME/receipt-gate"
LOG="${GATE_MONITOR_LOG:-$DIR/health-monitor.log}"
ESTADO="${GATE_MONITOR_STATE:-$DIR/.health-monitor-state}"
ALERT_URL="${GATE_ALERT_URL:-}"
ALERT_TOKEN="${GATE_ALERT_TOKEN:-}"
HEALTH_URL="${GATE_HEALTH_URL:-http://127.0.0.1:4100/health}"

mkdir -p "$(dirname "$LOG")"

# --- estado entre muestras ---------------------------------------------------------------------
# racha   = muestras malas seguidas
# avisado = 1 si ya empujamos el aviso de esta racha (la recuperación se avisa igual siempre)
# visto   = epoch de la última muestra
# caida   = qué evento avisamos, para que la recuperación diga qué se recuperó y no otra cosa
racha=0; avisado=0; visto=0; caida=""
if [[ -f "$ESTADO" ]]; then
  # shellcheck disable=SC1090
  source "$ESTADO" 2>/dev/null || true
fi

# Aporte de PAM (su §8) que aplica igual acá: una racha que sobrevive al reinicio tiene que
# preguntarse CUÁNDO se escribió. Si el monitor estuvo detenido, esos fallos describen un rato que
# ya pasó y no pueden sumar para el umbral de ahora. Se conserva "ya avisé" para no repetir.
ahora_epoch=$(date +%s)
if (( visto > 0 )) && (( ahora_epoch - visto > INTERVAL * 3 )); then
  echo "$(date -Is) level=warn msg=monitor_estuvo_detenido segundos=$((ahora_epoch - visto)) racha_descartada=$racha" >> "$LOG"
  racha=0
fi

guardar_estado() {
  printf 'racha=%s\navisado=%s\nvisto=%s\ncaida=%s\n' "$racha" "$avisado" "$(date +%s)" "$caida" > "$ESTADO"
}

# --- push a PAM --------------------------------------------------------------------------------
# El contrato devuelve 200 aunque NO avise (campo `notified`), con anti-repetición de 10 min del
# lado de PAM. Por eso empujar en cada muestra mala es seguro: si un POST se pierde, el siguiente
# lo cubre, y la campana no se llena.
avisar() {
  local evento="$1" detalle="$2"
  [[ -n "$ALERT_URL" && -n "$ALERT_TOKEN" ]] || return 0
  # `detail` se guarda y se muestra en el panel de PAM: nada de secretos ni de valores de token.
  local body
  body=$(printf '{"event":"%s","detail":"%s"}' "$evento" "$(printf '%s' "$detalle" | tr -d '"\\' | cut -c1-200)")
  local resp
  resp=$(curl -s -m 15 -w '\n%{http_code}' -X POST "$ALERT_URL" \
    -H 'Content-Type: application/json' \
    -H "X-Gate-Alert-Token: $ALERT_TOKEN" \
    -d "$body" 2>&1 || true)
  local code="${resp##*$'\n'}"
  local cuerpo="${resp%$'\n'*}"
  echo "$(date -Is) level=info msg=alerta_empujada event=$evento http=$code resp=\"$(printf '%s' "$cuerpo" | tr -d '\n' | cut -c1-160)\"" >> "$LOG"
}

while true; do
  ts="$(date -Is)"
  if [[ ! -f "$DIR/docker-compose.yml" ]]; then
    echo "$ts level=error msg=no_compose dir=$DIR" >> "$LOG"
    sleep "$INTERVAL"
    continue
  fi

  cd "$DIR"
  clamav_status="$(docker compose ps clamav --format '{{.Status}}' 2>/dev/null || echo unknown)"
  health_json="$(curl -sf --max-time 10 "$HEALTH_URL" 2>/dev/null || echo '{}')"

  # veredicto=sano|arrancando|degradado|inalcanzable  (checkedAt=null es ARRANCANDO, no caída:
  # el refresco de ClamAV es perezoso y el valor frío arranca en false — MSG-GATE-20260812-2 §2)
  parsed="$(printf '%s' "$health_json" | python3 -c "
import json,sys
try:
  j=json.load(sys.stdin)
  if not j:
    print('veredicto=inalcanzable ok=? clamav_ok=? clamav_err=sin_respuesta'); raise SystemExit
  c=j.get('clamav') or {}
  f=j.get('forensic') or {}
  ok=j.get('ok'); cok=c.get('ok'); chk=c.get('checkedAt'); ai=f.get('ai_configured')
  if cok is not True and chk is None: v='arrancando'
  elif ok is True and cok is True and ai is True: v='sano'
  else: v='degradado'
  print(f\"veredicto={v} ok={ok} clamav_ok={cok} clamav_checked={chk} ai={ai} clamav_err={c.get('error')}\")
except SystemExit:
  pass
except Exception as e:
  print(f'veredicto=inalcanzable parse_error={e}')
" 2>/dev/null || echo 'veredicto=inalcanzable parse_error=1')"

  veredicto="$(printf '%s' "$parsed" | sed -n 's/.*veredicto=\([a-z]*\).*/\1/p')"
  [[ -n "$veredicto" ]] || veredicto=inalcanzable

  case "$veredicto" in
    sano)
      level=info
      if (( avisado == 1 )); then
        # La recuperación SIEMPRE se avisa, aunque caiga dentro de la ventana de anti-repetición:
        # el que vio la caída no puede quedarse esperando una novedad que ya pasó.
        # El nombre espeja la caída: avisar "clamav_up" cuando lo que falló fue el health es
        # decirle a PAM que se recuperó algo distinto de lo que se había roto.
        if [[ "$caida" == "health_unreachable" ]]; then
          avisar "health_recovered" "el /health local volvió a responder; clamav ok y ai configurada"
        else
          avisar "clamav_up" "gate recuperado; clamav ok y ai configurada"
        fi
        avisado=0
      fi
      caida=""
      racha=0
      ;;
    arrancando)
      level=info
      racha=0
      ;;
    *)
      level=warn
      racha=$((racha + 1))
      if (( racha >= UMBRAL )); then
        if [[ "$veredicto" == "inalcanzable" ]]; then
          caida="health_unreachable"
          avisar "health_unreachable" "el /health local no responde; racha=$racha; clamav=$clamav_status"
        else
          caida="clamav_down"
          avisar "clamav_down" "$(printf '%s' "$parsed" | cut -c1-160); racha=$racha"
        fi
        avisado=1
      fi
      ;;
  esac

  echo "$ts level=$level clamav_status=\"$clamav_status\" $parsed racha=$racha avisado=$avisado" >> "$LOG"
  guardar_estado

  # Rotación simple: truncar >5000 líneas
  if [[ $(wc -l < "$LOG") -gt 5000 ]]; then
    tail -n 2500 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"
  fi

  sleep "$INTERVAL"
done
