# docs/historial — historia de GATE

**Historia cerrada, por mes. No se edita.** Se lee a demanda, cuando hace falta el "por qué" de algo
viejo; no forma parte del arranque de sesión.

| Archivo | Contenido |
|---------|-----------|
| [2026-07.md](2026-07.md) | OCR de glifos ambiguos y char-loss (PTMUAT-414), dedup global cross-user (#258), issue casinodragon #220, auditoría Qase, el P0 de ClamAV en gate-test y todo lo hecho en el repo |
| [2026-08.md](2026-08.md) | PAM sale a plata real: auditoría de aislamiento prod ↔ test, la regla de 48 h que nunca se aplicó, el residuo pre-live en la base de dedup y los puntos ciegos de `/health` |

## Dónde va cada cosa

| Si es… | Va a |
|--------|------|
| Estado actual, pendientes, mensajes, qué está live | [../ESTADO.md](../ESTADO.md) — se sobrescribe |
| Qué se hizo, ya cerrado | **Acá**, en el mes que corresponda |
| Decisiones de fondo, gate de calidad | [../06_PENDIENTES.md](../06_PENDIENTES.md) |
| Contrato con CRM y PAM | [../05_INTEGRACION_CRM_PAM.md](../05_INTEGRACION_CRM_PAM.md) |
| Algo que cruza a otra instancia | `E:\credenciales\docs\PLAN_ACCION.md` |

**Un hecho, un lugar.** Si un dato está en `ESTADO.md`, ningún otro archivo lo repite: lo linkea. Lo
que más caro sale romper es el **outbox** de mensajes: es la única fuente de verdad sobre si algo se
envió. El 28/07/2026 PAM estuvo bloqueado esperando una respuesta de GATE a un mensaje que su propio
registro daba por no enviado, mientras GATE ya había actuado sobre él.
