# Auditoría F1–F14 (origen: CRM Receipt Gate)

> Auditoría del gate cuando vivía en el CRM. **Implementación completada en CRM** (commit `8316bf4`)
> y **portada a este repo** (commit `c7b132c`).
> Fuente original: `CRM/docs/04_CAPA_SEGURIDAD_COMPROBANTES/AUDITORIA.md`

## Decisiones (dueño)

| # | Sev | Hallazgo | Decisión | Estado en gate |
|---|-----|----------|----------|----------------|
| F1 | 🔴 | `mime_mismatch` rechazaba `octet-stream` legítimo | Confiar MIME sniffeado | ✅ |
| F2 | 🔴 | `username` vacío al PAM | Guarda defensiva en CRM brain (no en gate) | ✅ CRM |
| F3 | 🟠 | Rate-limit solo al final | Doble: intentos (inicio) + aceptados (final) | ✅ |
| F4 | 🟠 | `pdftoppm` sin sandbox | Aislar en contenedor efímero (infra) | ⏳ infra |
| F5 | 🟠 | ClamAV caído silencioso | failClosed + healthcheck + alerta | ✅ |
| F6 | 🟠 | base64 antes de chequeo tamaño | Límite body + guard pre-decode | ✅ |
| F7 | 🟡 | Clasificador stub | PAM = juez único; stub documentado | ✅ doc |
| F8 | 🟡 | HEIC sin libheif | Check capacidades al boot | ✅ |
| F9 | 🔵 | Ejemplo contrato con `data:` prefix | base64 crudo en docs | ✅ doc |
| F10 | 🔵 | PDF solo 1ª página | Confirmar con dev PAM | ⏳ handoff |
| F11 | ⚪ | Ops huérfanas | `client_op_id` + reconciliación scheduler | ✅ CRM |
| F12 | ⚪ | Observabilidad parcial | `/stats` + contadores | ✅ |
| F13 | ⚪ | Harness incompleto | smoke.mjs extendido | ✅ |
| F14 | ⚪ | pHash O(n) | TTL/cap historial | ✅ |

## Notas

### F2
El gate no conoce `username`. La guarda vive en `CRM/app/backend/src/core/brain.ts` (`csCargaComprobante`).

### F7 (economía mismo dueño)
No duplicar visión/IA en el gate. Volumen de basura en flujo depósito es bajo.
Si miden mucha basura → heurístico OCR-lite sin LLM.

### F11
Idempotencia en contrato PAM (`client_op_id`); reconciliación de ops huérfanas en scheduler CRM.

## Pendiente de host/infra (no bloquea MVP)

- F4: sandbox efímero por archivo (poppler + decoders)
- F8-host: instalar libheif + poppler en prod
- F5-host: clamd + freshclam operativos

Ver `01_ARQUITECTURA.md` § Hardening.

## Orden de implementación (histórico)

1. MVP: F1, F2, F9
2. Robustez: F14, F6, F3, F12, F11, F13
3. Prod/infra: F5, F4, F8
4. Handoff PAM: F10, F7

Todo el código F1–F14 aplicable al gate está en `src/gate/`.
