# Frontend - Mooney Maker

Interfaz de usuario para el sistema de auditoría de egresos. HTML + CSS + JavaScript vanilla (sin frameworks).

## 📁 Estructura

```
frontend/
└── public/
    ├── index.html           # Login (landing page)
    ├── egreso.html          # Formulario nuevo egreso
    ├── consulta-egresos.html  # Búsqueda y filtros
    ├── usuarios.html        # Gestión de usuarios (admin)
    ├── logs.html            # Audit logs (admin)
    ├── app.js               # Lógica principal
    └── styles.css           # Estilos globales
```

## 🎨 Características

- ✅ **Diseño responsivo** - Funciona en desktop y mobile
- ✅ **Dark mode** nativo
- ✅ **Validación en tiempo real** - Feedback inmediato en formularios
- ✅ **Modal de confirmación** - Antes de crear egresos
- ✅ **Toast notifications** - Mensajes color-coded (error/success/warning)
- ✅ **Paginación** - Manejo de grandes volúmenes de datos
- ✅ **Export CSV** - Con filtros aplicados
- ✅ **Accesibilidad** - ARIA labels, keyboard navigation, ESC para cerrar modals

## 🚀 Uso Local

### Opción 1: Live Server (VS Code)

1. Instalar extensión "Live Server"
2. Abrir `public/index.html`
3. Click derecho → "Open with Live Server"
4. Navegar a `http://localhost:5500`

### Opción 2: Python

```bash
cd public
python -m http.server 5500
```

### Opción 3: Node.js (npx serve)

```bash
cd public
npx serve -p 5500
```

## ⚙️ Configuración

### Cambiar URL del backend

Editar `app.js` línea 1:

```javascript
const API_BASE = "http://localhost:4000";  // Cambiar a tu URL de API
```

En producción:
```javascript
const API_BASE = "https://tu-api.render.com";
```

## 🔐 Autenticación

El sistema usa JWT almacenado en `localStorage`:

- **Token**: `mm_token`
- **User**: `mm_user` (JSON con id, username, role, full_name)

### Logout

El logout simplemente limpia localStorage y redirige a login:

```javascript
function logout() {
  localStorage.removeItem("mm_token");
  localStorage.removeItem("mm_user");
  window.location.href = "index.html";
}
```

## 📱 Páginas

### index.html (Login)

- Formulario de login
- Rate limiting visual feedback
- Redirección automática a egreso.html tras login exitoso

### egreso.html (Nuevo Egreso)

Formulario completo con:
- Validación en tiempo real (cambio de color en campos)
- Modal de confirmación antes de enviar
- Upload de comprobante (PDF/imagen, max 10MB)
- Campos condicionales (según etiqueta seleccionada)
- Cálculo automático de monto mínimo para premios

### consulta-egresos.html (Búsqueda)

- Filtros avanzados (fecha, empresa, etiqueta, monto, etc.)
- Paginación (50 resultados por página, configurable)
- Botón "Descargar CSV" que respeta filtros
- Ver detalle en modal (click en fila)
- Solo admin ve todos, users ven solo sus registros

### usuarios.html (Admin)

- Listar usuarios
- Crear nuevo usuario
- Editar usuario (cambiar contraseña)
- Eliminar usuario
- Solo accesible para role="admin"

### logs.html (Admin)

- Listar audit logs
- Filtros por fecha, acción, entidad, usuario
- Paginación
- Solo accesible para role="admin"

## 🎨 Estilos

### Variables CSS (Dark Mode)

```css
:root {
  --bg: #0f0f0f;
  --bg-card: #1a1a1a;
  --text: #e0e0e0;
  --muted: #a0a0a0;
  --border: #333;
  --primary: #10b981;
  --green: #22c55e;
  --red: #ef4444;
  --orange: #f97316;
}
```

### Componentes principales

- `.navbar` - Barra de navegación superior
- `.card` - Contenedores de contenido
- `.field` - Campos de formulario con labels
- `.btn` - Botones (.btn-primary, .btn-ghost, .btn-danger)
- `.toast` - Notificaciones (.toast-error, .toast-success, etc.)
- `.modal` - Modales con backdrop
- `.table-container` - Tablas con scroll horizontal

## 🛡️ Seguridad Frontend

### XSS Protection

Todos los datos dinámicos se sanitizan con `escapeHtml()` antes de insertar en DOM:

```javascript
function escapeHtml(unsafe) {
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
```

### Validación Client-Side

NO se confía en validación frontend únicamente. El backend también valida todo.

Frontend valida para UX:
- Campos requeridos
- Formatos (fecha, hora, números)
- Rangos (monto mínimo, fecha no futura)
- Longitud de campos

## 📊 Funciones Principales (app.js)

### Autenticación

```javascript
async function login(username, password)
async function logout()
function isAuthenticated()
function getUser()
```

### API Helpers

```javascript
async function api(endpoint, options)
// Maneja automáticamente:
// - Headers Authorization
// - Errores HTTP
// - Redirección a login si 401
```

### Validación

```javascript
function validarCampo(campo)              // Validación individual
function validarFormularioCompleto()       // Validación de todo el form
function mostrarError(campo, mensaje)      // Mostrar error visual
function mostrarExito(campo)               // Mostrar success visual
```

### Modales

```javascript
function mostrarModalConfirmacion(payload, monto, file)
function cerrarModalConfirmacion()
function handleModalEscape(e)   // ESC key para cerrar
```

### Toast Notifications

```javascript
function toast(title, msg, type = "error")
// Tipos: "error", "success", "warning", "info"
```

## 🌐 Deploy Frontend

### Opción 1: Netlify

```bash
# Desde root del proyecto
cd frontend/public
drag-and-drop a netlify.app
```

### Opción 2: Vercel

```bash
npm install -g vercel
cd frontend/public
vercel
```

### Opción 3: GitHub Pages

1. Push a GitHub
2. Settings → Pages
3. Source: `/frontend/public`

### Configuración Post-Deploy

Actualizar `API_BASE` en `app.js` a la URL de tu backend en producción:

```javascript
const API_BASE = "https://mooney-api.render.com";
```

## 📝 Personalización

### Cambiar colores

Editar variables CSS en `styles.css`:

```css
:root {
  --primary: #10b981;  /* Color principal */
  --green: #22c55e;    /* Success */
  --red: #ef4444;      /* Error */
}
```

### Cambiar empresas o etiquetas

Editar arrays en `app.js`:

```javascript
const EMPRESAS_SALIDA = ["Telepagos", "Copter", "Palta"];

const ETIQUETAS = [
  "Premio Pagado",
  "Pago de servidor",
  // ...
];
```

⚠️ **Importante**: También actualizar en backend (`src/utils/validators.js`)

## 🐛 Troubleshooting

### CORS Error

Verificar que el backend tenga `CORS_ORIGIN` configurado:

```env
# Backend .env
CORS_ORIGIN=http://localhost:5500
```

### "Failed to fetch" en login

1. Verificar que backend esté corriendo
2. Verificar URL en `API_BASE`
3. Abrir DevTools → Network para ver error exacto

### Imágenes no cargan

Verificar que:
1. Usuario esté autenticado
2. Token JWT sea válido
3. Backend endpoint `/api/egresos/:id/comprobante` esté funcionando

## 📄 Licencia

Uso interno - Mooney Maker Casino
