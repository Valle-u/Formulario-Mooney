# 📁 Frontend del Proyecto

## ⚠️ IMPORTANTE

**Esta es la carpeta de frontend CORRECTA que se sirve en producción.**

### 📂 Estructura
```
backend/frontend/public/
├── index.html          # Página de login
├── egreso.html         # Formulario de retiros
├── consulta-egresos.html  # Historial de egresos
├── usuarios.html       # Gestión de usuarios (admin)
├── logs.html           # Logs de auditoría
├── app.js              # Lógica principal (2200+ líneas)
├── styles.css          # Estilos
└── app-2026010223.js   # Versión antigua (cache buster)
```

### ✅ Dónde Hacer Cambios

**SIEMPRE editar archivos en:**
```
backend/frontend/public/
```

**NUNCA crear una carpeta `frontend/` en la raíz del proyecto.**

### 🚀 Cómo se Sirve en Producción

El archivo `backend/src/server.js` sirve estos archivos:

```javascript
const frontendPath = path.join(__dirname, '../frontend/public');
app.use(express.static(frontendPath));
```

Seenode ejecuta el backend desde la carpeta `backend/`, por lo tanto:
- ✅ `backend/frontend/public` → Se sirve correctamente
- ❌ `frontend/public` (en raíz) → NO se sirve

### 📝 Recordatorio

Si haces cambios y no los ves en Seenode, verifica que estés editando:
```
backend/frontend/public/[archivo]
```

No:
```
frontend/public/[archivo]  ❌ (esta carpeta ya no existe)
```
