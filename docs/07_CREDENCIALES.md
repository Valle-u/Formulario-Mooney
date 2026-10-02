# Credenciales — estrategia del vault local

> Instancia Cursor **credenciales** · Última actualización: 2026-06-29

## Problema

Secretos repartidos en `.env` por repo → fácil commitear por error, difícil rotar tokens
compartidos (CRM ↔ gate ↔ PAM), backup inconsistente.

## Solución: un vault fuera de git

```text
C:\Users\lauta\Desktop\credenciales\     ← NO está dentro de ningún repo
├── CRM/
│   ├── local.env              ← dev (hard link al repo CRM)
│   ├── prod.env
│   └── keys/SenderIO.pem
├── GATE/
│   ├── local.env              ← dev (hard link a Programa Comprobantes)
│   ├── prod.env
│   ├── test.env
│   └── keys/GateAI.pem
├── PAM/
│   ├── local.env              ← dev (hard link a Black Dragon)
│   └── keys/                  ← megamm-key.pem pendiente
├── TRAZABILIDAD/
├── INVENTARIO.md
├── README.md
└── scripts\
    ├── link-all.ps1
    └── new-dev-tokens.ps1
```

Cada repo sigue teniendo **`.env.example` en main** (nombres de variables, sin valores).

## Reglas

| Regla | Detalle |
|-------|---------|
| Nunca en main | `*.env` con valores, API keys, tokens |
| Un archivo por servicio | `CRM/local.env`, `GATE/local.env`, `PAM/local.env` |
| Tokens compartidos | CRM usa token[0] de `RECEIPT_GATE_TOKENS`; PAM token[1] |
| Etiqueta + scope | Las entradas van `etiqueta:token`. En prod hoy: `crm`·`pam`·`traza`. **`RECEIPT_GATE_SCOPES`** (`etiqueta=scope[,scope]`) acota qué rutas puede cada una — hoy sólo `traza=traza:feed,stats`. **Una etiqueta sin entrada queda COMPLETA**, así que un token nuevo sin scope puede todo: el arranque lo loguea (`GATE: alcance de cada token`). Ver [12_TRAZA_FEED.md](12_TRAZA_FEED.md) § 6 |
| Token de TRAZA | Mismo valor en `GATE\prod.env` (entrada `traza:`) y en `TRAZABILIDAD\backend.env` como **`GATE_TOKEN`** — el consumidor no recibe el valor por mensaje, lo lee del vault |
| Backup cifrado | Copia del folder `credenciales/`; no sync cloud sin cifrar |
| Prod | Mismos nombres; valores distintos en el host (env inject / secrets manager) |

## Cómo lo consume GATE

Cadena en `src/config/load-env.ts`:

1. `CREDENCIALES_FILE` — ruta absoluta
2. `%CREDENCIALES_ROOT%\GATE\local.env` (default: `Desktop\credenciales`)
3. `.env` en la raíz del repo

Setup recomendado (hard link Windows):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\use-credenciales.ps1
```

Alternativa sin link: el loader encuentra solo el archivo en `Desktop\credenciales\`.

## Docker

```powershell
docker compose --env-file "$env:USERPROFILE\Desktop\credenciales\GATE\local.env" up --build
```

Variables sensibles en compose siguen viniendo del env file, no del YAML en git.

## Enlazar todos los repos

```powershell
powershell -ExecutionPolicy Bypass -File $env:USERPROFILE\Desktop\credenciales\scripts\link-all.ps1
```

Inventario de secretos encontrados: `Desktop\credenciales\INVENTARIO.md`.

## Checklist nueva máquina / instancia

- [ ] Copiar vault `credenciales/` (cifrado) o recrear desde `.env.example`
- [ ] `scripts\use-credenciales.ps1` en GATE
- [ ] Completar `ANTHROPIC_API_KEY` (primario, misma key que el CRM) y/o `OPENAI_API_KEY` / `GEMINI_API_KEY` (fallback) si probás E3
- [ ] Alinear `RECEIPT_GATE_TOKEN` en CRM con primer token del gate
- [ ] Prod: generar tokens nuevos (`new-dev-tokens.ps1` o manual); no reutilizar dev

## Evolución (fuera de alcance MVP)

- **Cifrado age + Cursor Secrets** — ver `Desktop\credenciales\docs\10_CIFRADO_CURSOR.md`
- **SOPS / git-crypt** en repo privado solo para plantillas cifradas
- **Vault / Doppler / 1Password Connect** en prod
- Script único que propaga token CRM/PAM desde `receipt-gate.env`

Ver también: `Desktop\credenciales\README.md` (guía operativa del vault).
