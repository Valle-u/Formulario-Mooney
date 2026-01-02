# 📸 Guía Completa: ImgBB para Almacenamiento de Archivos

## ¿Qué es ImgBB?

ImgBB es un servicio **gratuito** de hosting de imágenes y archivos con una API super simple.

### ✅ Ventajas para tu proyecto:
- **Gratis para siempre** (hasta 10GB/mes - más que suficiente)
- **API súper simple** (solo necesitas 1 API Key)
- **Sin problemas SSL** (funciona en cualquier servidor)
- **Soporta PDFs** (no solo imágenes)
- **URLs públicas instantáneas**
- **Sin configuración compleja**

### ⚠️ Limitaciones (mínimas):
- Máximo 32MB por archivo (tu límite es 10MB, así que está bien)
- No puedes eliminar archivos via API (solo manualmente desde el dashboard)
- 10GB/mes de almacenamiento (más que suficiente para tu caso)

---

## 📋 Paso 1: Crear Cuenta en ImgBB

### 1.1 Registro
1. Ve a https://imgbb.com
2. Click en **"Sign up"** (arriba derecha)
3. Opciones de registro:
   - Email + Password
   - Cuenta de Google
   - Cuenta de Facebook

### 1.2 Confirmar Email
1. Revisa tu email
2. Click en el link de confirmación
3. ¡Cuenta activada!

---

## 🔑 Paso 2: Obtener tu API Key

### 2.1 Ir a la página de API
1. Inicia sesión en ImgBB
2. Ve a https://api.imgbb.com/
3. O desde tu dashboard: Click en tu perfil → API

### 2.2 Generar API Key
1. Verás un botón **"Get API key"**
2. Click ahí
3. Te mostrará tu API Key (algo como: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`)
4. **COPIA esta API Key** (la necesitarás en el siguiente paso)

📝 **IMPORTANTE**: Guarda esta API Key en un lugar seguro. Si la pierdes, puedes generar una nueva pero tendrás que actualizar tu app.

---

## ⚙️ Paso 3: Configurar en tu Proyecto

### 3.1 Agregar API Key al archivo .env

Abre el archivo `backend/.env` y busca la sección:

```bash
# OPCIÓN 1 (RECOMENDADA): ImgBB - Super simple, sin problemas SSL
# 1. Ve a https://api.imgbb.com/
# 2. Click en "Get API key"
# 3. Copia tu API Key y pégala aquí:
IMGBB_API_KEY=
```

Pega tu API Key:
```bash
IMGBB_API_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
```

### 3.2 Guardar cambios
1. Guarda el archivo `.env`
2. ¡Listo! Ya está configurado

---

## 🧪 Paso 4: Probar que Funciona

### 4.1 Ejecutar el script de prueba

Desde la terminal, en la carpeta `backend`:

```bash
cd backend
node test-imgbb.js
```

### 4.2 Resultados Esperados

**Si funciona correctamente:**
```
🧪 Probando ImgBB

✅ ImgBB configurado

📝 Archivo de prueba: test-1234567890.pdf
📦 Tamaño: 190 bytes

📤 Subiendo archivo a ImgBB...

☁️  Subiendo test-1234567890.pdf a ImgBB (0.19 KB)...
✅ Archivo subido exitosamente a ImgBB: https://i.ibb.co/xxxxx/test-1234567890.pdf

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎉 ¡ÉXITO! Archivo subido correctamente
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔗 URL pública: https://i.ibb.co/xxxxx/test-1234567890.pdf

✅ Tu configuración de ImgBB funciona correctamente
✅ Puedes deployar a SeeNode sin problemas
```

**Si falla:**
```
❌ ImgBB no está configurado

Pasos para configurar:
1. Ve a https://api.imgbb.com/
2. Click en "Get API key"
3. Copia tu API Key
4. Agrégala al archivo .env:
   IMGBB_API_KEY=tu_api_key_aqui
```

---

## 🚀 Paso 5: Deployar a SeeNode

### 5.1 Agregar Variable de Entorno en SeeNode

1. Ve al panel de SeeNode
2. Variables de entorno (Environment Variables)
3. Agrega:
   ```
   Key: IMGBB_API_KEY
   Value: a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
   ```
4. Guarda

### 5.2 Hacer Deploy

```bash
git add .
git commit -m "feat: Implementar almacenamiento con ImgBB"
git push origin main
```

SeeNode detectará los cambios y hará el deploy automáticamente.

### 5.3 Verificar en los Logs

Busca estos mensajes en los logs de SeeNode:

```
🔧 ImgBB configurado: true
☁️ Intentando subir a ImgBB: 1234567890_comprobante.pdf
✅ Comprobante subido a ImgBB: https://i.ibb.co/xxxxx/...
```

---

## 🎯 Cómo Funciona (Explicación Técnica Simple)

### Flujo de Subida de Archivos

1. **Usuario sube comprobante** desde el formulario
2. **Backend recibe el archivo** en memoria (Buffer)
3. **Backend convierte a Base64** (formato que ImgBB acepta)
4. **Backend envía a ImgBB** via fetch con tu API Key
5. **ImgBB guarda el archivo** y devuelve URL pública
6. **Backend guarda la URL** en la base de datos
7. **Usuario puede ver el comprobante** haciendo click en "Ver"

### Código Simplificado

```javascript
// 1. Convertir archivo a Base64
const base64 = fileBuffer.toString('base64');

// 2. Enviar a ImgBB
const response = await fetch('https://api.imgbb.com/1/upload', {
  method: 'POST',
  body: `key=${API_KEY}&image=${base64}&name=${fileName}`
});

// 3. Obtener URL pública
const data = await response.json();
const publicUrl = data.data.url;

// ¡Listo! URL guardada en la base de datos
```

---

## 🔍 Troubleshooting

### Error: "ImgBB API Key inválida o expirada"

**Solución:**
1. Ve a https://api.imgbb.com/
2. Genera una nueva API Key
3. Actualiza `IMGBB_API_KEY` en .env y SeeNode
4. Reinicia la aplicación

### Error: "Archivo demasiado grande"

**Causa**: El archivo supera 32MB

**Solución**:
- ImgBB acepta hasta 32MB
- Tu app tiene límite de 10MB (configurado en MAX_UPLOAD_MB)
- El límite de tu app es correcto, este error no debería aparecer

### Error: "fetch failed" o problemas de red

**Solución**:
- Verifica tu conexión a internet
- ImgBB podría estar en mantenimiento (raro)
- Prueba de nuevo en unos minutos

### Los archivos no se eliminan

**Esto es normal**: ImgBB no permite eliminar archivos via API en el plan gratuito.

**Opciones**:
1. Elimina manualmente desde https://imgbb.com/my-images
2. Actualiza a plan premium ($4/mes) que sí permite eliminación via API
3. No te preocupes - los PDFs son pequeños y el límite es generoso

---

## 💰 Costos

### Plan Gratuito (Recomendado para ti)
- ✅ **Gratis para siempre**
- ✅ 10GB de almacenamiento/mes
- ✅ URLs públicas ilimitadas
- ✅ API sin límite de requests
- ❌ No puedes eliminar via API

### Plan Premium ($4/mes)
- ✅ Todo lo del plan gratuito
- ✅ Eliminación de archivos via API
- ✅ Sin marca de agua
- ✅ Estadísticas avanzadas

**Para tu caso**: El plan gratuito es **más que suficiente**.

Con 100 transferencias/día y comprobantes de ~500KB:
- 100 archivos × 500KB = 50MB/día
- 50MB × 30 días = 1.5GB/mes
- **Solo usarías el 15% del límite gratuito**

---

## 📊 Monitoreo

### Ver tus archivos subidos

1. Inicia sesión en https://imgbb.com
2. Click en tu perfil → **"My images"**
3. Verás todos los archivos subidos
4. Puedes:
   - Ver el archivo
   - Copiar la URL
   - Eliminar manualmente
   - Ver estadísticas

### Ver uso de almacenamiento

ImgBB no muestra el uso exacto, pero puedes estimarlo:
- Cuenta cuántos archivos tienes
- Multiplica por el tamaño promedio
- Compara con el límite de 10GB/mes

---

## ✅ Checklist Final

Antes de deployar a production:

- [ ] Cuenta de ImgBB creada
- [ ] API Key obtenida
- [ ] `IMGBB_API_KEY` agregada a .env local
- [ ] Prueba local exitosa (`node test-imgbb.js`)
- [ ] `IMGBB_API_KEY` agregada a SeeNode
- [ ] Código subido a GitHub
- [ ] Deploy a SeeNode completado
- [ ] Prueba en production exitosa (subir comprobante)

---

## 🆘 Soporte

### Problemas con ImgBB
- Documentación oficial: https://api.imgbb.com/
- Soporte: https://imgbb.com/support

### Problemas con tu código
- Revisa los logs de SeeNode
- Verifica que `IMGBB_API_KEY` esté configurada
- Ejecuta `node test-imgbb.js` localmente para probar

---

## 🎉 ¡Todo Listo!

Con ImgBB configurado:
- ✅ Archivos se guardan en la nube (no en SeeNode)
- ✅ URLs públicas funcionan desde cualquier lugar
- ✅ Sin problemas SSL
- ✅ Gratis y confiable
- ✅ Setup en 5 minutos

**¡Felicidades! Tu app ya puede guardar comprobantes en la nube.** 🚀
