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
│   ├── scripts/            # Mantenimiento
│   ├── uploads/            # Archivos (gitignored)
│   └── package.json
├── frontend/
│   └── public/             # HTML + CSS + JS vanilla
├── docs/                   # Documentación técnica
└── README.md
```

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

# CORS
CORS_ORIGIN=http://localhost:5500

# Uploads
UPLOAD_DIR=uploads
```

3. **Crear base de datos**

```bash
# Usando psql
createdb mooney_db

# O usando SQL
CREATE DATABASE mooney_db;
```

4. **Crear usuario administrador**

```bash
npm run seed:admin
```

Por defecto crea:
- Usuario: `admin`
- Contraseña: `admin123`

⚠️ **IMPORTANTE**: Cambiar la contraseña inmediatamente después del primer login.

5. **Iniciar servidor**

```bash
# Desarrollo
npm run dev

# Producción
npm start
```

El servidor arrancará en `http://localhost:4000` y ejecutará las migraciones automáticamente.

### Frontend

1. **Abrir con Live Server**

Si usás VS Code:
- Instalar extensión "Live Server"
- Clic derecho en `frontend/public/index.html`
- Seleccionar "Open with Live Server"

2. **O usar cualquier servidor estático**

```bash
cd frontend/public
python -m http.server 5500
# O
npx serve
```

3. **Acceder a la aplicación**

Abrir navegador en `http://localhost:5500`

## 🔐 Seguridad

El sistema implementa:

- ✅ **JWT con expiración**: Tokens de 24 horas
- ✅ **Rate Limiting**: 5 intentos de login por 15 minutos
- ✅ **Contraseñas fuertes**: Mínimo 8 caracteres, mayúsculas, números, especiales
- ✅ **Bcrypt**: Hash de contraseñas con salt rounds 12
- ✅ **XSS Protection**: Sanitización de inputs en frontend
- ✅ **Archivos protegidos**: Solo usuarios autenticados pueden descargar comprobantes
- ✅ **Validación de variables de entorno**: El servidor no arranca si faltan variables críticas
- ✅ **CORS configurado**: Solo orígenes permitidos
- ✅ **Audit logs**: Registro inmutable de todas las acciones

## 📊 Base de Datos

PostgreSQL con las siguientes tablas:

- `users`: Usuarios del sistema (admin/user)
- `egresos`: Registro de transferencias salientes
- `audit_logs`: Logs de auditoría (retención 6 meses)
- `schema_migrations`: Control de migraciones

### Optimizaciones

- Índices B-tree en campos de búsqueda frecuente
- Índices GIN trigram para búsquedas ILIKE
- Pool de conexiones optimizado (min: 10, max: 40)
- Constraint único compuesto (empresa + ID transferencia)

## 🌐 Deploy a Producción

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

**Administrador**:
- Crear/editar/eliminar usuarios
- Ver todos los egresos
- Exportar CSV
- Ver logs de auditoría

**Usuario**:
- Crear egresos
- Ver sus propios egresos
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

