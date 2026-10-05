# Backend - API Mooney Maker

API REST para el sistema de auditoría de egresos bancarios.

## 🚀 Stack Tecnológico

- **Node.js** 22+ con ES Modules
- **Express.js** - Framework web
- **PostgreSQL** - Base de datos
- **JWT** - Autenticación
- **Bcrypt** - Hash de contraseñas
- **Multer** - Upload de archivos
- **express-rate-limit** - Rate limiting

## 📁 Estructura

```
backend/
├── src/
│   ├── config/
│   │   └── db.js              # Configuración PostgreSQL
│   ├── middleware/
│   │   ├── auth.js            # JWT authentication + checks de rol
│   │   ├── fileValidator.js   # Validación de uploads por magic numbers
│   │   └── rateLimiter.js     # Rate limiting
│   ├── routes/
│   │   ├── auth.js            # POST /api/auth/login
│   │   ├── users.js           # CRUD usuarios
│   │   ├── egresos.js         # CRUD egresos + CSV + saldos + cierres
│   │   ├── notifications.js   # Stream SSE de notificaciones
│   │   ├── options.js         # Opciones de selects (select_options)
│   │   └── logs.js            # Audit logs (readonly)
│   ├── utils/
│   │   ├── audit.js           # Helper para audit logs
│   │   ├── validators.js      # Validación de datos
│   │   ├── csv.js             # Export CSV
│   │   └── validateEnv.js     # Validación env vars
│   ├── migrations/
│   │   ├── runMigrations.js   # Sistema de migraciones
│   │   ├── 001_*.sql          # Migraciones SQL
│   │   ├── 002_*.sql
│   │   └── ...
│   └── server.js              # Entry point
├── frontend/
│   └── public/                # HTML + CSS + JS vanilla servido por Express
├── scripts/
│   ├── seed_admin.js          # Crear usuario admin
│   └── cleanup-old-files.js   # Limpieza de archivos
├── uploads/                   # Archivos (gitignored)
├── .env.example               # Template variables
├── .gitignore
├── package.json
├── render.yaml                # Config Render.com
└── README.md
```

## 🔧 Variables de Entorno

Crear archivo `.env` basado en `.env.example`:

```bash
# Server
PORT=4000
BASE_URL=http://localhost:4000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/mooney_db
PGSSL=false

# Security (MÍNIMO 32 caracteres)
JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6

# CORS (separar con comas si hay múltiples; vacío = mismo origen)
CORS_ORIGIN=http://localhost:5500

# Uploads
UPLOAD_DIR=uploads
IMGBB_API_KEY=
```

`.env.example` tiene la lista completa con los defaults reales de cada variable.

### Generar JWT_SECRET seguro

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 📡 API Endpoints

### Autenticación

```
POST /api/auth/login
Body: { username, password }
Response: { token, user: { id, username, role, full_name } }
```

### Usuarios (requiere autenticación)

```
GET    /api/users                   # Listar
GET    /api/users/for-filter        # Listar para combos de filtro
POST   /api/users                   # Crear (admin / direccion)
PUT    /api/users/:id               # Editar (admin / direccion)
POST   /api/users/:id/reset-password # Resetear password (admin / direccion)
```

### Egresos (requiere autenticación)

```
GET    /api/egresos                    # Listar con filtros + paginación
POST   /api/egresos                    # Crear egreso (multipart, campo "comprobante")
PUT    /api/egresos/:id                # Editar egreso
POST   /api/egresos/:id/anular         # Anular egreso
DELETE /api/egresos/:id                # Deshabilitado (405) — usar POST /:id/anular
GET    /api/egresos/:id/history        # Historial de cambios
GET    /api/egresos/:id/comprobante    # Descargar comprobante
GET    /api/egresos/csv                # Exportar CSV (admin / direccion)
GET    /api/egresos/cuentas            # Opciones de empresas y etiquetas
GET    /api/egresos/distinct-empresas  # Empresas con egresos cargados
GET    /api/egresos/check-id-transferencia # Validar duplicado antes de guardar
GET    /api/egresos/saldos             # Saldos por cuenta (admin only)
GET    /api/egresos/saldos/csv         # Exportar saldos (admin only)
GET    /api/egresos/cierres/kpi        # KPIs de cierre de caja
GET    /api/egresos/cierres/resumen-dia # Totales ARS/USDT de cierres por usuario/fecha
GET    /api/egresos/cierres/csv        # Exportar cierres de caja
```

### Notificaciones (requiere autenticación)

```
GET    /api/notifications/stream       # Server-Sent Events (token por ?token=)
```

**Filtros GET /api/egresos**:
- `fecha_desde` / `fecha_hasta`
- `empresa_salida`
- `etiqueta`
- `usuario_casino` (ILIKE)
- `id_transferencia` (ILIKE)
- `monto_min` / `monto_max`
- `created_by` (user ID)
- `page` (default: 1)
- `limit` (default: 50, max: 200)

### Logs (requiere admin)

```
GET    /api/logs               # Listar audit logs
```

**Filtros**:
- `fecha_desde` / `fecha_hasta`
- `action`
- `entity`
- `actor_username`
- `success` (true/false)
- `page` / `limit`

### Health Check

```
GET /health
Response: { ok: true }
```

## 🔐 Seguridad

### Rate Limiting

- **Login**: 10 intentos por minuto y por IP (`loginLimiter`)
- **Lectura de la API**: 300 requests por minuto y por IP (`apiLimiter`)
- **Escrituras** (alta/edición/anulación/borrado): 60 por minuto (`writeLimiter`)
- **Exportaciones CSV**: 30 por 15 minutos (`exportLimiter`)
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`

### Validación de Contraseñas

Requisitos:
- Mínimo 8 caracteres
- Al menos 1 mayúscula
- Al menos 1 minúscula
- Al menos 1 número
- Al menos 1 carácter especial
- No puede ser contraseña común

### Archivos

- Formatos permitidos: PDF, JPG, JPEG, PNG — validados por extensión, MIME
  declarado y magic numbers del contenido real
- Tamaño máximo: `MAX_UPLOAD_MB` (default 10 MB)
- Con `IMGBB_API_KEY` configurada el archivo se sube a ImgBB y queda accesible
  por su URL pública (sin autenticación: es una limitación del proveedor)
- Sin `IMGBB_API_KEY` el archivo queda en `UPLOAD_DIR` y se sirve por
  `GET /api/egresos/:id/comprobante`, que exige token y que el usuario sea el
  dueño del egreso o admin/dirección

### Cambios de esquema

No hay endpoints HTTP que ejecuten DDL. Todo cambio de esquema va como archivo
`.sql` en `src/migrations/`, y el primer admin se crea con `npm run seed:admin`.

## 🗄️ Migraciones

El sistema ejecuta migraciones automáticamente al iniciar:

1. Lee archivos `.sql` de `src/migrations/`
2. Verifica cuáles ya fueron aplicadas (tabla `schema_migrations`)
3. Ejecuta solo las nuevas en orden alfabético, cada una dentro de una
   transacción junto con su registro en `schema_migrations`

### Crear nueva migración

```bash
cd src/migrations
touch 032_descripcion.sql
```

Contenido ejemplo:
```sql
-- 032_descripcion.sql
ALTER TABLE egresos ADD COLUMN nuevo_campo TEXT;
```

Las migraciones nunca se editan después de aplicadas: el runner las identifica
por nombre de archivo y no vuelve a ejecutarlas.

## 🛠️ Scripts

### Crear usuario administrador

```bash
npm run seed:admin
```

Variables en `.env` (definir siempre `SEED_ADMIN_PASSWORD`: el default del
script es una contraseña débil y pública):
```env
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=
SEED_ADMIN_FULLNAME=Administrador
```

### Limpieza de archivos antiguos

```bash
# Dry run (solo muestra qué se eliminaría)
node scripts/cleanup-old-files.js --months 6 --dry-run

# Eliminar realmente
node scripts/cleanup-old-files.js --months 6
```

## 📊 Database Pool

Defaults reales de `src/config/db.js` (ajustables por env):

```javascript
{
  min: Number(PG_POOL_MIN ?? 2),
  max: Number(PG_POOL_MAX ?? 20),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
  statement_timeout: 15000,
  keepAlive: true
}
```

## 🚀 Deploy

### Seenode (plataforma en uso)

1. Conectar el repo y apuntar la raíz al directorio `backend/`
2. Build: `npm install` · Start: `npm start`
3. Cargar las variables de la sección siguiente
4. El filesystem es efímero: configurar `IMGBB_API_KEY` o los comprobantes
   guardados en `UPLOAD_DIR` se pierden en cada deploy

### Render.com

1. Conectar repo GitHub
2. Crear PostgreSQL Database
3. Crear Web Service:
   - Build: `npm install`
   - Start: `npm start`
4. Agregar variables de entorno
5. Deploy automático en cada push

### Railway.app

1. New Project → Deploy from GitHub
2. Add Plugin → PostgreSQL
3. Variables se copian automáticamente
4. Deploy

### Variables requeridas en producción

```env
NODE_ENV=production
PORT=4000
DATABASE_URL=<provided-by-platform>
PGSSL=true
JWT_SECRET=<generate-random-64-chars>
BASE_URL=https://tu-dominio.com
CORS_ORIGIN=https://tu-dominio.com
UPLOAD_DIR=uploads
IMGBB_API_KEY=<key>
```

## 🧪 Testing

```bash
# Health check
curl http://localhost:4000/health

# Login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<password>"}'

# Listar egresos (con token)
curl http://localhost:4000/api/egresos \
  -H "Authorization: Bearer <TOKEN>"
```

## 📝 Logs

El servidor muestra:
- ✅ Migraciones aplicadas
- ✅ Puerto en uso
- 🔥 Errores globales
- 🔥 Errores de endpoints

## ⚠️ Troubleshooting

### "JWT_SECRET debe tener al menos 32 caracteres"

```bash
# Generar nuevo secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Actualizar .env
JWT_SECRET=<secret-generado>
```

### "Connection refused" PostgreSQL

1. Verificar que PostgreSQL esté corriendo
2. Verificar credenciales en `DATABASE_URL`
3. Verificar que la base de datos exista

```bash
createdb mooney_db
```

### Migraciones no se aplican

Verificar que los archivos `.sql` estén en `src/migrations/` y sean legibles

## 📄 Licencia

Uso interno - Mooney Maker Casino
