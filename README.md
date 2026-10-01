# Sistema de Auditoría de Egresos - Mooney Maker

Sistema completo de auditoría para transferencias bancarias salientes de un casino virtual. Incluye registro de egresos, gestión de usuarios, logs de auditoría y exportación de datos.

## 📋 Características

- ✅ **Registro de Egresos**: Formulario completo con validación en tiempo real
- ✅ **Búsqueda y Filtros**: Sistema avanzado de filtros con paginación
- ✅ **Exportación CSV**: Descarga de egresos con filtros aplicados
- ✅ **Gestión de Usuarios**: CRUD completo con roles (admin/user)
- ✅ **Audit Logs**: Registro inmutable de todas las acciones
- ✅ **Autenticación JWT**: Sistema seguro con rate limiting
- ✅ **Validación de Contraseñas**: Requisitos de seguridad estrictos
- ✅ **Archivos Adjuntos**: Subida de comprobantes (PDF/imágenes) con protección
- ✅ **Optimizado para Alto Volumen**: 1000+ transacciones diarias

## 🏗️ Arquitectura

```
Formulario-Mooney/
├── backend/                 # API Node.js + Express
│   ├── src/
│   │   ├── config/         # Configuración (db)
│   │   ├── middleware/     # Auth, rate limiting
│   │   ├── routes/         # Endpoints API
│   │   ├── utils/          # Utilidades y validators
│   │   ├── migrations/     # SQL migrations
│   │   └── server.js       # Entry point
│   ├── frontend/
│   │   └── public/         # HTML + CSS + JS vanilla (servido por Express)
│   ├── scripts/            # Mantenimiento
│   ├── uploads/            # Archivos (gitignored)
│   └── package.json
├── docs/                   # Documentación técnica
└── README.md
```

> El frontend no tiene build ni servidor propio: `backend/src/server.js` lo sirve
> como estático desde `backend/frontend/public`, así que backend y frontend
> comparten origen y puerto.

## 🚀 Instalación y Configuración

### Backend

1. **Instalar dependencias**
```bash
cd backend
npm install
```

2. **Configurar variables de entorno**

Copiar `.env.example` a `.env` y configurar:

```env
# Server
PORT=4000
BASE_URL=http://localhost:4000
NODE_ENV=development

# Database (PostgreSQL)
DATABASE_URL=postgresql://usuario:contraseña@localhost:5432/mooney_db

# Security
JWT_SECRET=tu_secreto_super_largo_de_al_menos_32_caracteres_aqui

# CORS (vacío = mismo origen que el backend)
CORS_ORIGIN=http://localhost:5500

# Uploads
UPLOAD_DIR=uploads

# Almacenamiento externo de comprobantes (si está vacío se usa UPLOAD_DIR)
IMGBB_API_KEY=
```

La lista completa y comentada está en `backend/.env.example`.

3. **Crear base de datos**

```bash
# Usando psql
createdb mooney_db

# O usando SQL
CREATE DATABASE mooney_db;
```

4. **Crear usuario administrador**

Definir primero las credenciales en `.env` (`SEED_ADMIN_USERNAME`,
`SEED_ADMIN_PASSWORD`, `SEED_ADMIN_FULLNAME`) y después:

```bash
npm run seed:admin
```

⚠️ **IMPORTANTE**: Si no se define `SEED_ADMIN_PASSWORD`, el script cae a una
contraseña por defecto débil y pública. Definirla siempre, y cambiarla desde la
app después del primer login.

5. **Iniciar servidor**

```bash
# Desarrollo
npm run dev

# Producción
npm start
```

El servidor arrancará en `http://localhost:4000` y ejecutará las migraciones automáticamente.

### Frontend

No requiere pasos aparte: el mismo proceso de Node sirve las páginas estáticas.
Con el backend levantado, abrir `http://localhost:4000` en el navegador.

Los archivos viven en `backend/frontend/public/`. Al editarlos basta con
recargar el navegador (los `<script>` usan un parámetro de versión que el
servidor reescribe para evitar caché vieja).

## 🔐 Seguridad

El sistema implementa:

- ✅ **JWT con expiración**: Tokens de 12 horas (HS256)
- ✅ **Rate Limiting**: 100 intentos de login por minuto y por IP
- ✅ **Contraseñas fuertes**: Mínimo 8 caracteres, mayúsculas, números, especiales
- ✅ **Bcrypt**: Hash de contraseñas con salt rounds 12
- ✅ **XSS Protection**: Escapado de todo dato del servidor antes de inyectarlo en el DOM, más CSP sin `unsafe-inline` en `script-src`
- ✅ **Validación por magic numbers**: El contenido del archivo subido debe coincidir con JPG, PNG o PDF
- ✅ **Archivos protegidos**: Solo usuarios autenticados pueden descargar comprobantes guardados en disco local
- ✅ **Sin DDL por HTTP**: Ningún endpoint modifica el esquema; los cambios van solo por migraciones versionadas
- ✅ **Validación de variables de entorno**: El servidor no arranca si faltan variables críticas
- ✅ **CORS configurado**: Solo orígenes permitidos
- ✅ **Audit logs**: Registro inmutable de todas las acciones

## 📊 Base de Datos

PostgreSQL con las siguientes tablas:

- `users`: Usuarios del sistema (roles: `admin`, `direccion`, `encargado`, `empleado`)
- `egresos`: Registro de transferencias salientes
- `egresos_history`: Historial de cambios por egreso (lo escribe un trigger)
- `audit_logs`: Logs de auditoría
- `select_options`: Empresas y etiquetas de los desplegables
- `health_log`: Chequeos de salud
- `schema_migrations`: Control de migraciones

### Optimizaciones

- Índices B-tree en campos de búsqueda frecuente
- Índices GIN trigram para búsquedas ILIKE
- Pool de conexiones configurable por `PG_POOL_MIN` / `PG_POOL_MAX` (default: 2 / 20)
- Constraint único compuesto (empresa + ID transferencia)

## 🌐 Deploy a Producción

### Seenode (plataforma en uso)

1. **Conectar repositorio GitHub** y apuntar al directorio `backend/`
2. **Build Command**: `npm install` · **Start Command**: `npm start`
3. **Variables de entorno**: `DATABASE_URL`, `JWT_SECRET`, `PGSSL=true`,
   `NODE_ENV=production`, `BASE_URL`, `CORS_ORIGIN`, `IMGBB_API_KEY`

El filesystem es efímero: sin `IMGBB_API_KEY` los comprobantes guardados en
`UPLOAD_DIR` se pierden en cada deploy. Guías detalladas en
`docs/DEPLOYMENT_SEENODE_FINAL.md` y `docs/DEPLOYMENT_IMGBB_SEENODE.md`.

### Render.com

1. **Conectar repositorio GitHub**
2. **Configurar servicio web**:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: Node

3. **Configurar variables de entorno** en el dashboard

4. **Crear base de datos PostgreSQL** en Render

5. **(Opcional)** Usar `render.yaml` incluido para deploy automático

### Railway.app

1. **Crear nuevo proyecto**
2. **Agregar PostgreSQL** desde el marketplace
3. **Deploy desde GitHub**
4. **Configurar variables** automáticamente

### Otras plataformas

El proyecto es compatible con:
- Heroku
- Fly.io
- DigitalOcean App Platform
- AWS (EC2 + RDS)

## 📝 Uso

### Roles

Jerarquía: `admin` > `direccion` > `encargado` > `empleado`.

**Administrador** (`admin`):
- Todo lo de Dirección
- Saldos y su exportación (`/api/egresos/saldos`)
- Diagnóstico de uploads y endpoints de mantenimiento

**Dirección** (`direccion`):
- Crear, editar y resetear contraseñas de usuarios
- Ver, editar y eliminar cualquier egreso
- Exportar el CSV de egresos
- Ver logs de auditoría

**Encargado** (`encargado`):
- Crear y editar egresos
- Ver logs de auditoría

**Empleado** (`empleado`):
- Crear egresos
- Ver, editar y eliminar sus propios egresos
- Descargar comprobantes propios

### Flujo de trabajo

1. **Login** con credenciales
2. **Crear egreso** desde "Nuevo Egreso"
3. **Consultar** desde "Consulta Egresos"
4. **Exportar CSV** con filtros aplicados
5. **Ver logs** (solo admin)

## 🛠️ Mantenimiento

### Limpieza automática de archivos antiguos

Ver documentación completa en `docs/LIMPIEZA_AUTOMATICA.md`

Ejecutar manualmente:
```bash
cd backend
node scripts/cleanup-old-files.js --months 6 --dry-run
```

### Optimización de índices

Ver `docs/OPTIMIZACION.md` para detalles sobre:
- Análisis de queries lentas
- Recreación de índices
- Monitoreo de performance

## 📚 Documentación Adicional

- [Auditoría técnica y mejoras pendientes](docs/AUDITORIA_2026-10.md)
- [Arquitectura](docs/ARQUITECTURA.md)
- [Optimización para Alto Volumen](docs/OPTIMIZACION.md)
- [Guía de Limpieza Automática](docs/LIMPIEZA_AUTOMATICA.md)

## 🐛 Troubleshooting

### Error: "JWT_SECRET debe tener al menos 32 caracteres"

Solución: Actualizar `JWT_SECRET` en `.env` con un string más largo:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Error: "EADDRINUSE ::4000"

Solución: Puerto 4000 ya está en uso. Cambiar `PORT` en `.env` o matar el proceso:
```bash
# Windows
netstat -ano | findstr :4000
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:4000 | xargs kill -9
```

### Migraciones no se aplican

Solución: Verificar que la carpeta `src/migrations/` tenga los archivos `.sql`

## 📄 Licencia

Proyecto privado - Uso interno únicamente

## 👨‍💻 Autor

Sistema desarrollado para Mooney Maker Casino Virtual

