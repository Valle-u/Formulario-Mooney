# 🚀 Configuración de Entorno de Staging en Seenode

## ✅ Paso 1: Crear rama staging (YA HECHO)

La rama `staging` ya fue creada y pusheada a GitHub. Podés verla en:
https://github.com/Valle-u/Formulario-Mooney/tree/staging

---

## 📦 Paso 2: Crear Base de Datos de Staging en Seenode

1. **Ingresá a Seenode**: https://seenode.com
2. **Navegá a PostgreSQL**: En el menú izquierdo, clickeá "Databases" → "PostgreSQL"
3. **Crear nueva database**:
   - Click en "Create Database" o "New Database"
   - Nombre: `mooneymaker-staging` (o el nombre que prefieras)
   - Region: La misma que tu base de producción (probablemente Frankfurt)
   - Plan: El más básico (si tenés espacio en tu plan actual)
4. **Guardar credenciales**: Una vez creada, Seenode te mostrará:
   - Host
   - Port
   - Database name
   - Username
   - Password
   - Connection URL completa

   **IMPORTANTE**: Copiá la "Connection URL" completa, la vas a necesitar en el Paso 4.

---

## 🌐 Paso 3: Crear Servicio Web de Staging en Seenode

1. **Navegá a Services**: En el menú de Seenode, clickeá "Services" o "Web Services"
2. **Crear nuevo servicio**:
   - Click en "Create Service" o "New Web Service"
   - Nombre: `mooneymaker-staging`
3. **Configuración del servicio**:
   - **Repository**: Valle-u/Formulario-Mooney (tu repo actual)
   - **Branch**: `staging` ← **MUY IMPORTANTE** seleccioná la rama staging, NO main
   - **Root Directory**: Dejalo vacío o `.`
   - **Build Command**: `npm install` (o dejalo en automático)
   - **Start Command**: `npm start` o `node backend/src/server.js`
   - **Port**: 4000 (o el puerto que use tu app)

---

## 🔐 Paso 4: Configurar Variables de Entorno de Staging

Una vez creado el servicio, tenés que configurar las variables de entorno:

1. **En tu servicio staging**, buscá la sección "Environment" o "Environment Variables"
2. **Agregá TODAS estas variables** (copiá las de producción pero cambiá la DB):

```bash
# Base de datos (USA LA NUEVA DB DE STAGING)
DATABASE_URL=postgresql://user:password@host:port/mooneymaker-staging

# Puerto
PORT=4000

# JWT Secret (podés usar el mismo de producción o uno nuevo)
JWT_SECRET=tu_jwt_secret_aqui

# CORS (la URL de staging que te dará Seenode)
CORS_ORIGIN=https://mooneymaker-staging.up-de-fra1-k8s-1.apps.run-on-seenode.com

# ImgBB (podés usar la misma API key de producción)
IMGBB_API_KEY=tu_api_key_de_imgbb

# Upload directory
UPLOAD_DIR=uploads

# Node environment
NODE_ENV=staging
```

**IMPORTANTE**:
- Para `DATABASE_URL`, usá la Connection URL que copiaste en el Paso 2
- Para `CORS_ORIGIN`, Seenode te va a dar una URL cuando crees el servicio. Algo como: `https://mooneymaker-staging.up-de-fra1-k8s-1.apps.run-on-seenode.com`

---

## 🎯 Paso 5: Deploy y Migrar la Base de Datos

1. **Hacer deploy**:
   - Seenode debería hacer el deploy automáticamente
   - Si no, buscá un botón "Deploy" o "Redeploy"

2. **Esperar que el deploy termine**: Mirá los logs para asegurarte que no haya errores

3. **Ejecutar migraciones** (IMPORTANTE):

   Hay dos formas de hacer esto:

   **Opción A: Desde tu computadora (más fácil)**
   ```bash
   # Exportá temporalmente la DATABASE_URL de staging
   export DATABASE_URL="postgresql://user:password@host:port/mooneymaker-staging"

   # Ejecutá las migraciones
   cd backend
   node src/migrate.js
   ```

   **Opción B: Desde la consola de Seenode**
   - En tu servicio staging, buscá "Console" o "Shell"
   - Ejecutá:
     ```bash
     cd backend
     node src/migrate.js
     ```

4. **Crear usuario admin de staging**:

   Podés usar el script de reset (modificado para staging):
   ```bash
   node backend/scripts/reset-production.js
   ```

   Esto te creará un usuario admin con:
   - Username: `admin`
   - Password: `Admin123!`

---

## ✅ Paso 6: Verificar que Todo Funcione

1. **Abrí la URL de staging**:
   - Seenode te dará una URL tipo: `https://mooneymaker-staging.up-de-fra1-k8s-1.apps.run-on-seenode.com`

2. **Intentá hacer login**:
   - Usuario: `admin`
   - Contraseña: `Admin123!`

3. **Probá crear un egreso de prueba** para verificar que todo funcione

---

## 🔄 Workflow de Trabajo con Staging

### **Para TESTEAR cambios nuevos:**

1. **Asegurate de estar en la rama staging**:
   ```bash
   git checkout staging
   ```

2. **Hacé tus cambios y commitealos**:
   ```bash
   git add .
   git commit -m "feat: nueva funcionalidad para testear"
   git push origin staging
   ```

3. **Seenode hace auto-deploy** de la rama staging al entorno de staging

4. **Testeá en la URL de staging**

5. **Si todo funciona bien**, mergeá staging a main:
   ```bash
   git checkout main
   git merge staging
   git push origin main
   ```

6. **Seenode hace auto-deploy** de main a producción

---

### **Para hacer HOTFIX en producción urgente:**

1. **Trabajá directo en main**:
   ```bash
   git checkout main
   # hacé tus cambios
   git add .
   git commit -m "fix: hotfix urgente"
   git push origin main
   ```

2. **Sincronizá staging con main**:
   ```bash
   git checkout staging
   git merge main
   git push origin staging
   ```

---

## 📊 Resumen de URLs

| Entorno | Rama | URL | Base de Datos |
|---------|------|-----|---------------|
| **Producción** | `main` | https://web-5u1r2nxoi92m... | mooneymaker (producción) |
| **Staging** | `staging` | (te la dará Seenode) | mooneymaker-staging |

---

## 🆘 Troubleshooting

### Error: "Cannot connect to database"
- Verificá que la `DATABASE_URL` en las variables de entorno sea correcta
- Verificá que la base de datos de staging esté corriendo en Seenode

### Error: "Table does not exist"
- Ejecutá las migraciones: `node backend/src/migrate.js`

### Los cambios no se ven en staging
- Verificá que pusheaste a la rama `staging`: `git push origin staging`
- Verificá en Seenode que el servicio de staging esté apuntando a la rama `staging`

### Error de CORS
- Actualizá la variable `CORS_ORIGIN` con la URL correcta que te dio Seenode

---

## 💡 Consejos

1. **Base de datos separada**: Siempre usá una base de datos diferente para staging. Así no afectás datos de producción.

2. **Datos de prueba**: Podés crear datos de prueba en staging sin miedo. Si la rompés, simplemente reseteás la DB de staging.

3. **Mantené staging actualizado**: Cada tanto, mergeá main a staging para que no se desincronicen:
   ```bash
   git checkout staging
   git merge main
   git push origin staging
   ```

4. **No testees en producción**: De ahora en más, SIEMPRE probá primero en staging antes de pushear a main.

---

## 📝 Próximos Pasos

1. Seguí los pasos 2-6 de este documento
2. Una vez que staging esté funcionando, avisame y te ayudo con cualquier duda
3. Empezá a usar staging para todos tus tests antes de mergear a main

¡Listo! Con esto tenés un entorno profesional de desarrollo separado de producción.
