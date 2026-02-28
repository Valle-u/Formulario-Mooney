# 🔑 GENERAR NUEVAS CREDENCIALES DE R2 - Paso a Paso

## ⚠️ El Problema

Las credenciales actuales en tu `.env` están **incorrectas o expiradas**. Por eso Cloudflare rechaza la conexión con error SSL.

## 📋 Pasos para Generar Nuevas Credenciales

### Paso 1: Ve a R2 API Tokens

1. Abre https://dash.cloudflare.com
2. Inicia sesión
3. En el menú lateral, haz clic en **R2**
4. En la parte superior derecha, haz clic en **"Manage R2 API Tokens"**

### Paso 2: Crear Nuevo Token

1. Haz clic en **"Create API Token"**
2. Aparecerá un formulario de configuración

### Paso 3: Configurar el Token

Completa el formulario:

**Token Name:**
```
MooneyMaker Formulario Token
```

**Permissions:**
- Selecciona: **"Admin Read & Write"**

**Specify bucket(s) (opcional pero recomendado):**
- Click en "Apply to specific buckets only"
- Selecciona: `mooneymaker-formulario-premios-comprobantes`

**TTL (Time to Live):**
- Selecciona: "Forever" (sin expiración)
- O si prefieres: 1 año

### Paso 4: Crear el Token

1. Haz clic en **"Create API Token"**
2. Cloudflare te mostrará una pantalla con las credenciales

### Paso 5: COPIAR las Credenciales (IMPORTANTE)

Cloudflare te mostrará algo como esto:

```
✅ API Token created successfully

Access Key ID:
a1b2c3d4e5f6g7h8i9j0k1l2

Secret Access Key:
m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3h4i5j6k7l8m9n0o1p2q3r4

⚠️ Important: This is the only time you'll be able to see the Secret Access Key
```

**⚠️ CRÍTICO**: Solo podrás ver el Secret Access Key UNA VEZ. Si no lo copias ahora, tendrás que crear otro token.

### Paso 6: Copiar Account ID

En la misma pantalla, o volviendo a R2, busca:

```
Use the following when creating an S3-compatible client:

Account ID: 5627e3f2c291921ace435f3cca4643c5
Jurisdiction: EU
```

El Account ID probablemente sea el mismo que ya tienes.

### Paso 7: Actualizar .env

Abre el archivo `backend/.env` y actualiza SOLO estas 2 líneas:

```bash
R2_ACCESS_KEY_ID=TU_NUEVO_ACCESS_KEY_AQUI
R2_SECRET_ACCESS_KEY=TU_NUEVO_SECRET_ACCESS_KEY_AQUI
```

**Ejemplo con credenciales reales (las tuyas serán diferentes):**
```bash
R2_ACCESS_KEY_ID=a1b2c3d4e5f6g7h8i9j0k1l2
R2_SECRET_ACCESS_KEY=m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3h4i5j6k7l8m9n0o1p2q3r4
```

### Paso 8: Probar

```bash
cd backend
node test-r2-fetch.js
```

**Si funciona, verás:**
```
✅ ¡ÉXITO! Archivo subido correctamente
🔗 URL pública: https://pub-811d975ee99d4c5591deec5c1faadb54.r2.dev/test-xxxxx.txt
✅ Archivo eliminado correctamente
🎉 ¡PRUEBA COMPLETADA CON ÉXITO!
```

---

## ✅ Checklist

- [ ] Ir a Cloudflare Dashboard → R2
- [ ] Click en "Manage R2 API Tokens"
- [ ] Click en "Create API Token"
- [ ] Configurar: Nombre, Permisos (Admin Read & Write), Bucket específico
- [ ] Click "Create API Token"
- [ ] **COPIAR** Access Key ID (inmediatamente)
- [ ] **COPIAR** Secret Access Key (inmediatamente - solo se muestra una vez)
- [ ] Actualizar `backend/.env` con las nuevas credenciales
- [ ] Probar con `node test-r2-fetch.js`

---

## 🔍 Si sigue sin funcionar

### Error: "HTTP 403: SignatureDoesNotMatch"
- Las credenciales son incorrectas
- Verifica que copiaste correctamente (sin espacios extras)
- Genera nuevas credenciales

### Error: "SSL handshake failure" (persiste)
- Las credenciales siguen siendo incorrectas
- Asegúrate de estar usando las NUEVAS credenciales, no las viejas
- Borra el token antiguo en Cloudflare y crea uno completamente nuevo

### Error: "HTTP 403: Access Denied"
- El token no tiene permisos suficientes
- Crea un nuevo token con "Admin Read & Write"

---

**Siguiente paso**: Genera las nuevas credenciales y avísame cuando las tengas listas para actualizar el .env
