# Backend - API Mooney Maker

API REST para el sistema de auditoría de egresos bancarios.

## 🚀 Stack Tecnológico

- **Node.js** 18+ con ES Modules
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
│   │   ├── auth.js            # JWT authentication
│   │   ├── requireAdmin.js    # Role check
│   │   └── rateLimiter.js     # Rate limiting
│   ├── routes/
│   │   ├── auth.js            # POST /api/auth/login
│   │   ├── users.js           # CRUD usuarios
│   │   ├── egresos.js         # CRUD egresos + CSV
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

# Security (MÍNIMO 32 caracteres)
JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6

# CORS (separar con comas si hay múltiples)
CORS_ORIGIN=http://localhost:5500

# Uploads
UPLOAD_DIR=uploads
```

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
GET    /api/users              # Listar (admin only)
POST   /api/users              # Crear (admin only)
PUT    /api/users/:id          # Editar (admin only)
DELETE /api/users/:id          # Eliminar (admin only)
```

### Egresos (requiere autenticación)

```
GET    /api/egresos            # Listar con filtros + paginación
POST   /api/egresos            # Crear egreso
GET    /api/egresos/csv        # Exportar CSV (admin only)
GET    /api/egresos/:id/comprobante  # Descargar comprobante
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

- **Login**: 5 intentos por 15 minutos (por IP)
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

- Solo usuarios autenticados pueden descargar
- Los usuarios normales solo pueden ver sus propios comprobantes
- Los admins pueden ver todos
- Formatos permitidos: PDF, JPG, JPEG, PNG
- Tamaño máximo: 10MB

## 🗄️ Migraciones

El sistema ejecuta migraciones automáticamente al iniciar:

1. Lee archivos `.sql` de `src/migrations/`
2. Verifica cuáles ya fueron aplicadas (tabla `schema_migrations`)
3. Ejecuta solo las nuevas en orden alfabético

### Crear nueva migración

```bash
cd src/migrations
touch 008_descripcion.sql
```

Contenido ejemplo:
```sql
-- 008_descripcion.sql
ALTER TABLE egresos ADD COLUMN nuevo_campo TEXT;
```

## 🛠️ Scripts

### Crear usuario administrador

```bash
npm run seed:admin
```

Variables opcionales en `.env`:
```env
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=admin123
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

Configuración optimizada para alto volumen:

```javascript
{
  min: 10,          // Mínimo conexiones activas
  max: 40,          // Máximo conexiones
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
}
```

## 🚀 Deploy

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
JWT_SECRET=<generate-random-64-chars>
CORS_ORIGIN=https://tu-frontend.com
UPLOAD_DIR=uploads
```

## 🧪 Testing

```bash
# Health check
curl http://localhost:4000/health

# Login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

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
