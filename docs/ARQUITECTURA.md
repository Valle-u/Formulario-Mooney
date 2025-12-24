# Arquitectura del Proyecto - Mooney Maker

Documentación técnica de la arquitectura del sistema de auditoría de egresos.

## 📁 Estructura de Directorios

```
Formulario-Mooney/
├── backend/                         # API Node.js + Express
│   ├── src/
│   │   ├── config/
│   │   │   └── db.js               # Pool PostgreSQL + query helper
│   │   ├── middleware/
│   │   │   ├── auth.js             # JWT verification
│   │   │   ├── requireAdmin.js     # Role-based access control
│   │   │   └── rateLimiter.js      # Express rate limiter config
│   │   ├── routes/
│   │   │   ├── auth.js             # POST /api/auth/login
│   │   │   ├── users.js            # CRUD /api/users (admin)
│   │   │   ├── egresos.js          # CRUD /api/egresos + CSV
│   │   │   └── logs.js             # GET /api/logs (admin, readonly)
│   │   ├── utils/
│   │   │   ├── audit.js            # auditLog(req, {...}) helper
│   │   │   ├── validators.js       # Business logic validation
│   │   │   ├── csv.js              # CSV export helpers
│   │   │   └── validateEnv.js      # Env vars validation at startup
│   │   ├── migrations/
│   │   │   ├── runMigrations.js    # Auto migration runner
│   │   │   ├── 001_initial.sql     # Users + egresos tables
│   │   │   ├── 002_audit_logs.sql  # Audit logs table
│   │   │   ├── 003_unique_id.sql   # Unique constraint
│   │   │   ├── 004_time_campos.sql # Time fields
│   │   │   ├── 005_indexes.sql     # Performance indexes
│   │   │   ├── 006_optimize_indexes.sql  # GIN trigram
│   │   │   └── 007_audit_logs_optimization.sql  # Retention
│   │   └── server.js               # Express app + startup
│   ├── scripts/
│   │   ├── seed_admin.js           # npm run seed:admin
│   │   └── cleanup-old-files.js    # Limpieza archivos antiguos
│   ├── uploads/                    # User-uploaded files (gitignored)
│   ├── .env.example                # Template variables
│   ├── .gitignore
│   ├── package.json
│   ├── render.yaml                 # Render.com deploy config
│   └── README.md
│
├── frontend/
│   ├── public/
│   │   ├── index.html              # Login page
│   │   ├── egreso.html             # Crear egreso (form + modal)
│   │   ├── consulta-egresos.html   # Búsqueda + filtros + pagination
│   │   ├── usuarios.html           # CRUD usuarios (admin)
│   │   ├── logs.html               # Audit logs (admin)
│   │   ├── app.js                  # Frontend logic (vanilla JS)
│   │   └── styles.css              # Global styles (dark theme)
│   └── README.md
│
├── docs/
│   ├── OPTIMIZACION.md             # Performance tuning guide
│   ├── LIMPIEZA_AUTOMATICA.md      # File cleanup guide
│   ├── DEPLOY_GUIDE.md             # Deploy instructions
│   └── ARQUITECTURA.md             # Este archivo
│
├── .gitignore                      # Git ignore rules
└── README.md                       # Main documentation
```

---

## 🏗️ Arquitectura Backend

### Flujo de Request

```
Cliente HTTP Request
    ↓
Express App
    ↓
CORS Middleware ──→ Si falla: 403 Forbidden
    ↓
JSON Parser
    ↓
Rate Limiter ──────→ Si excede: 429 Too Many Requests
    ↓
Rutas (/api/*)
    ↓
Auth Middleware ───→ Si falla: 401 Unauthorized
    ↓
requireAdmin ──────→ Si falla: 403 Forbidden (solo si ruta admin)
    ↓
Route Handler
    ├─→ Validators (utils/validators.js)
    ├─→ Database Query (config/db.js)
    ├─→ Audit Log (utils/audit.js)
    └─→ Response JSON
    ↓
Global Error Handler ─→ 500 Internal Server Error
    ↓
Cliente recibe response
```

### Database Schema

```sql
-- Users (administradores y usuarios)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(100),
  role VARCHAR(20) DEFAULT 'user',  -- 'admin' | 'user'
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Egresos (transferencias bancarias)
CREATE TABLE egresos (
  id SERIAL PRIMARY KEY,
  fecha DATE NOT NULL,
  hora TIME,
  turno VARCHAR(50),
  hora_solicitud_cliente TIME,
  hora_quema_fichas TIME,
  monto NUMERIC(15,2) NOT NULL,
  monto_transferencia_raw TEXT,
  cuenta_receptora TEXT NOT NULL,
  usuario_casino TEXT,
  cuenta_salida TEXT NOT NULL,
  empresa_salida VARCHAR(50) NOT NULL,
  id_transferencia VARCHAR(50) NOT NULL,
  etiqueta VARCHAR(100) NOT NULL,
  etiqueta_otro TEXT,
  notas TEXT,
  comprobante_filename TEXT,
  comprobante_mime VARCHAR(100),
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_empresa_id UNIQUE (empresa_salida, id_transferencia)
);

-- Audit Logs (inmutables)
CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id INTEGER,
  actor_username VARCHAR(50),
  actor_role VARCHAR(20),
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(50),
  entity_id INTEGER,
  success BOOLEAN DEFAULT true,
  status_code INTEGER,
  ip VARCHAR(100),
  user_agent TEXT,
  details JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Schema Migrations (control de versiones)
CREATE TABLE schema_migrations (
  id SERIAL PRIMARY KEY,
  filename TEXT UNIQUE NOT NULL,
  executed_at TIMESTAMP DEFAULT NOW()
);
```

### Índices para Performance

```sql
-- Egresos
CREATE INDEX idx_egresos_fecha ON egresos(fecha DESC);
CREATE INDEX idx_egresos_empresa_salida ON egresos(empresa_salida);
CREATE INDEX idx_egresos_created_by ON egresos(created_by);
CREATE INDEX idx_egresos_etiqueta ON egresos(etiqueta);

-- Trigram para ILIKE searches
CREATE EXTENSION pg_trgm;
CREATE INDEX idx_egresos_usuario_casino_trgm
  ON egresos USING gin(usuario_casino gin_trgm_ops);
CREATE INDEX idx_egresos_id_transferencia_trgm
  ON egresos USING gin(id_transferencia gin_trgm_ops);

-- Audit Logs
CREATE INDEX idx_audit_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_actor_username ON audit_logs(actor_username);
CREATE INDEX idx_audit_action ON audit_logs(action);
```

---

## 🎨 Arquitectura Frontend

### Patrón de Diseño

**No usa frameworks** - Vanilla JavaScript puro con:

- **State**: `localStorage` para JWT y user data
- **Routing**: Navegación tradicional (diferentes HTML pages)
- **Data Fetching**: `fetch()` API con helper `api(endpoint, options)`
- **Rendering**: Template strings + `innerHTML` (con sanitización XSS)
- **Validation**: Client-side + server-side (no confía solo en cliente)

### Flujo de Autenticación

```
1. Usuario abre index.html (login)
2. Ingresa username + password
3. POST /api/auth/login
4. Backend valida, genera JWT
5. Frontend guarda en localStorage:
   - mm_token: "eyJhbGc..."
   - mm_user: '{"id":1,"username":"admin",...}'
6. Redirección a egreso.html
7. Todas las páginas verifican isAuthenticated() al cargar
8. Si no hay token → redirect a index.html
9. Cada request incluye header: Authorization: Bearer <token>
```

### Componentes UI

```javascript
// Toast Notifications
toast(title, message, type)
// Tipos: "error", "success", "warning", "info"
// Se auto-oculta después de 2-4 segundos

// Modales
mostrarModalConfirmacion(payload, monto, file)
cerrarModalConfirmacion()
// ESC key para cerrar
// Focus trap (no se puede salir del modal con TAB)

// Validación
validarCampo(campo)           // Validación individual
validarFormularioCompleto()    // Validación total
mostrarError(campo, mensaje)   // UI feedback rojo
mostrarExito(campo)            // UI feedback verde
```

### Sanitización XSS

```javascript
function escapeHtml(unsafe) {
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Uso en modales
body.innerHTML = `<div>${escapeHtml(userInput)}</div>`;
```

---

## 🔐 Seguridad

### Capas de Seguridad

1. **Transporte**: HTTPS (manejado por plataforma hosting)

2. **Autenticación**:
   - JWT con expiración de 24 horas
   - Bcrypt con 12 salt rounds
   - Rate limiting: 5 intentos login / 15 min

3. **Autorización**:
   - Middleware `auth` verifica JWT
   - Middleware `requireAdmin` verifica role
   - Row-level security en queries (users ven solo sus egresos)

4. **Validación**:
   - Frontend: UX y feedback inmediato
   - Backend: Source of truth, valida TODO

5. **XSS Prevention**:
   - `escapeHtml()` en frontend
   - CSP headers (recomendado para futuro)

6. **SQL Injection Prevention**:
   - Parameterized queries siempre (`query(sql, [params])`)
   - NUNCA string concatenation

7. **File Upload**:
   - Whitelist MIME types: PDF, JPG, JPEG, PNG
   - Max size: 10MB
   - Filename sanitization
   - Files no son públicos (requieren auth)

8. **Environment**:
   - Variables sensibles en `.env` (gitignored)
   - Validación at startup (`validateEnv.js`)
   - JWT_SECRET mínimo 32 caracteres

### Attack Vectors Mitigados

| Attack | Mitigation |
|--------|-----------|
| SQL Injection | Parameterized queries |
| XSS | `escapeHtml()` + futuro CSP |
| CSRF | SameSite cookies (futuro) |
| Brute Force | Rate limiting (5/15min) |
| Weak Passwords | Validator: 8+ chars, upper, lower, number, special |
| JWT Theft | HTTPS only, 24h expiration |
| Unauthorized File Access | Auth middleware en endpoint |
| Mass Assignment | Explicit field extraction |

---

## 📊 Performance

### Database Optimizations

1. **Connection Pooling**:
   ```javascript
   {
     min: 10,   // Siempre 10 conexiones listas
     max: 40,   // Máximo 40 conexiones concurrentes
     idleTimeoutMillis: 30000,
     connectionTimeoutMillis: 5000
   }
   ```

2. **Índices Estratégicos**:
   - B-tree en columnas de filtro frecuente
   - GIN trigram en columnas de búsqueda texto

3. **Query Optimization**:
   ```sql
   -- ❌ MAL: 2 queries
   SELECT COUNT(*) FROM egresos WHERE ...;
   SELECT * FROM egresos WHERE ... LIMIT 50;

   -- ✅ BIEN: 1 query con window function
   SELECT *, COUNT(*) OVER() as total_count
   FROM egresos WHERE ... LIMIT 50;
   ```

4. **Paginación**:
   - Default: 50 registros/página
   - Max: 200 registros/página
   - OFFSET + LIMIT con COUNT() OVER()

### Frontend Optimizations

1. **Lazy Loading**: Solo carga datos cuando usuario navega a página
2. **Debouncing**: Búsqueda en tiempo real con 300ms delay
3. **Pagination**: Evita cargar 1000+ registros de una vez
4. **Client-side Caching**: User data en localStorage

### Escalabilidad

El sistema está diseñado para:
- **1000+ transacciones diarias**
- **10+ usuarios concurrentes**
- **100GB+ archivos uploads** (con disk storage)

Para escalar más:
1. **Separar file storage** a S3/Cloud Storage
2. **Redis** para rate limiting distribuido
3. **Read replicas** PostgreSQL para queries heavy
4. **CDN** para frontend estático

---

## 🔄 CI/CD (Futuro)

Configuración recomendada para automatización:

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: cd backend && npm install
      - run: cd backend && npm test  # cuando tengas tests
      - name: Deploy to Render
        uses: johnbeynon/render-deploy-action@v0.0.8
        with:
          service-id: ${{ secrets.RENDER_SERVICE_ID }}
          api-key: ${{ secrets.RENDER_API_KEY }}
```

---

## 📈 Monitoring (Recomendado)

### Métricas Importantes

1. **Uptime**: ¿El servidor está respondiendo?
2. **Response Time**: Latencia de API endpoints
3. **Error Rate**: % de requests con error 5xx
4. **Database Connections**: Pool usage
5. **Disk Usage**: Espacio de uploads/

### Tools

- **UptimeRobot** (gratis): Ping cada 5min
- **Render Metrics** (built-in): CPU, Memory, requests
- **PostgreSQL Stats**:
  ```sql
  -- Ver queries lentas
  SELECT * FROM pg_stat_statements
  ORDER BY total_exec_time DESC LIMIT 10;

  -- Ver conexiones
  SELECT count(*) FROM pg_stat_activity;
  ```

---

## 🧪 Testing Strategy (Futuro)

Recomendación de tests:

```javascript
// tests/api/auth.test.js
describe('POST /api/auth/login', () => {
  it('devuelve token con credenciales válidas', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('rechaza credenciales inválidas', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong' });

    expect(res.status).toBe(401);
  });

  it('aplica rate limiting después de 5 intentos', async () => {
    for(let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'wrong' });
    }

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin123' });

    expect(res.status).toBe(429);
  });
});
```

---

## 🔮 Futuras Mejoras

Posibles features para versiones futuras:

1. **Notificaciones en Tiempo Real**:
   - WebSockets para notificar nuevos egresos
   - Alertas de egresos grandes (>$500k)

2. **Dashboard Analytics**:
   - Gráficos de egresos por empresa
   - Tendencias mensuales
   - Top usuarios casino

3. **Export Avanzado**:
   - Excel (.xlsx) con múltiples hojas
   - PDF con formato profesional

4. **Búsqueda Avanzada**:
   - Full-text search
   - Búsqueda en notas
   - Saved filters

5. **Audit Trail Mejorado**:
   - Diff de cambios (antes/después)
   - Revert de cambios (soft delete)

6. **Mobile App**:
   - React Native
   - Push notifications

7. **API Pública**:
   - REST API documented con Swagger
   - API keys para integración externa

---

## 📞 Contacto

Para dudas sobre la arquitectura o contribuciones:

- Revisar este documento
- Consultar READMEs específicos en cada carpeta
- Ver código con comentarios inline

---

**Última actualización**: Diciembre 2025
**Versión**: 1.0.0
