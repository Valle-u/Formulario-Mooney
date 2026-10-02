# Contexto maestro — GATE

> Última actualización: 2026-06-29
> Repo: `C:\Users\lauta\Desktop\Programa Comprobantes` · GitHub: `MartinLope369/Programa-Comprobantes`

## Qué es

**GATE** — servicio **aislado** (Node/TS + Express) que procesa comprobantes
(imagen/PDF) de terceros **antes** de que lleguen al PAM o se registren como depósito.

Corre en un **host sacrificable**: si un exploit del parser (PDF/imagen) consigue shell,
el atacante cae en una caja vacía, **no** en el servidor del PAM (dinero, credenciales, BD).

## Por qué un programa aparte (no CRM, no PAM)

| Motivo | Detalle |
|--------|---------|
| **Seguridad** | Parsers (poppler, sharp/libvips, ClamAV) leen binarios maliciosos → superficie RCE. **No** en el PAM. |
| **Multi-cliente** | Lo llaman **CRM** (livechat, WhatsApp) y **PAM** (subida directa plataforma) de igual a igual. |
| **Dedup centralizado** | Un solo store de pHash → mismo comprobante por distintos canales se detecta una vez. |
| **Deploy independiente** | Imagen Docker propia, hardening, CI, sin mezclar con el cerebro del CRM. |

## Historia de decisiones (cronológica)

1. **2026-06 (inicio)** — Capa 1 vive **dentro del CRM** (`app/backend/src/receipt-gate/`).
   Capa 2 (forense: monto, banco, edición) vive en el **PAM** (`receipt-reader` / Gemini).

2. **2026-06-28** — Auditoría F1–F14 del gate del CRM; endurecimiento implementado y verde
   (ver `04_AUDITORIA_F1_F14.md`). Handoff al dev PAM en `CRM/docs/pam/05_CAPA_1_COMPROBANTES.md`.

3. **2026-06-28/29** — Tres ingresos de comprobante identificados:
   - Livechat → ✅ pasa Capa 1 (data URL)
   - WhatsApp (Kommo) → ⚠️ falta descargar media URL
   - Plataforma (directo PAM) → ❌ sin Capa 1

4. **Opciones evaluadas** para unificar los 3 canales:
   - **A:** CRM expone `/internal/receipt-gate` → PAM lo llama
   - **B:** Paquete npm compartido → PAM corre in-process (deps duplicadas, sin dedup cruzado)
   - **C (elegida):** Servicio **GATE** propio → CRM y PAM lo llaman por HTTP

5. **Preocupación de seguridad (usuario):** no correr parsers en el servidor del PAM.
   → Gate en **servidor aislado**; al PAM solo cruza **JPEG re-generado + pHash + veredicto**.

6. **2026-06-29** — Repo GATE creado (carpeta `Programa Comprobantes`). Capa 1 portada + `POST /scan`.
   Smoke verde (4/4). Commit `c7b132c`.

7. **2026-06-29 (decisión confirmada)** — La **Capa 2 (E3 forense + E3b banco) vive en el gate**,
   sobre el JPEG ya limpio (IA, sin parsers = sin RCE). El gate ahora devuelve `extraction`,
   `bank`, `sha256` y `view_url`; el PAM **sigue dueño del dinero** (match PSP + acreditación).
   OCR multi-proveedor **Claude (primario) → OpenAI → Gemini**, testeado con 43 comprobantes
   reales (42/42 extracciones, ~86% acierto de banco). Sinergia detallada en `05_INTEGRACION_CRM_PAM.md`.

## Objetivo actual vs objetivo futuro

### Implementado hoy (Capa 1 = etapas E0–E2)

```
Archivo crudo → E0 ClamAV → E1 validación → E2 sanitización/defang
             → E2b semántica (pHash dedup + clasificador stub)
             → E2c rate-limit → JPEG limpio + pHash
```

Ver `02_CAPA_1.md` y código en `src/gate/`.

### Objetivo discutido: incluir Capa 2 en este programa

En la conversación se planteó un **pipeline único** (E0–E4) dueño de un solo sistema.
Tras el análisis de seguridad, la división acordada es:

| Etapa | Nombre | ¿Dónde? | Estado |
|-------|--------|---------|--------|
| E0–E2 | Capa 1 (portero) | **Este programa** (host aislado) | ✅ implementado |
| E3 | Capa 2 (forense IA: monto/fecha/cuentas) | **Este programa** (sobre JPEG limpio) | ✅ implementado |
| E3b | Detección de banco (catálogo AR) | **Este programa** | ✅ implementado |
| E4 | Vista segura (view_url + token HMAC) | **Este programa** | ✅ implementado |
| E5 | Match PSP + acreditación + bonos | **PAM** (decide el dinero) | fuera de alcance |

**Decisión tomada:** la extracción (E3) y detección de banco (E3b) corren en el gate porque IA
sobre un JPEG ya saneado no es superficie RCE. El gate **extrae y detecta**; el PAM **decide y
acredita**. Ver `03_CAPA_2.md` y la sinergia completa en `05_INTEGRACION_CRM_PAM.md`.

## Regla de oro

> Al PAM (y a cualquier cliente) **nunca** vuelve el archivo original.
> Solo un **JPEG re-encodeado** (píxeles nuevos, sin metadata) + pHash + veredicto.
