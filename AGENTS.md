# AGENTS.md — Protocolo de trabajo (GATE)

> Servicio **GATE** — seguridad de comprobantes (Capa 1+2). Mismo protocolo que CRM y PAM:
> `main` → rama → PR + review → merge.

## Ciclo obligatorio

```
main actualizado → rama → PR + review (gate verde) → merge a main → deploy
```

### Git
- Partir de `main` actualizado: `git pull --ff-only`
- Rama: `feat|fix|chore/<dominio>/<descripcion>` o `cursor/<descripcion>`
- Dominios: `gate` · `http` · `db` · `infra` · `docs` · `scripts`
- **Nunca** push directo a `main`
- No commitear `.env` ni secretos — vault local: `Desktop\credenciales\` (ver `docs/07_CREDENCIALES.md`)

### Gate de calidad (local, antes de PR)

```bash
npm run typecheck
npm run build
npm run dev   # otra terminal
node scripts/smoke.mjs http://localhost:4100
```

### Deploy
- Host **sacrificable**, separado de PAM y CRM
- Docker: `docker compose up --build` (gate + ClamAV sidecar)
- Ver `docs/01_ARQUITECTURA.md` § Hardening

## Guardrails

- Este servicio **no decide dinero** — solo sanea archivos y devuelve veredicto + JPEG + pHash
- Al cliente **nunca** devolver el archivo original
- `failClosed` para ClamAV en prod
- Tokens obligatorios en production (`RECEIPT_GATE_TOKENS`)
- Cambios en parsers/sandbox = **riesgo alto** → review cuidadoso

## Documentación

Empezar por **`docs/ESTADO.md`** (punto actual, pendientes con dueño, outbox de mensajes, qué está
live: ~95 líneas y alcanza). Después `docs/README.md` si hace falta el índice. El por qué de lo ya
resuelto está en `docs/historial/`; `docs/06_PENDIENTES.md` quedó como decisiones cerradas y gate de
calidad, **no** como estado.

## Repos relacionados

| Repo | Path |
|------|------|
| CRM | `C:\Users\lauta\Desktop\CRM` |
| PAM (Black Dragon) | (repo separado del dueño) |
