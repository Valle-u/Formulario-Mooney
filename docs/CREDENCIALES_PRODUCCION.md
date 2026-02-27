# 🔐 CREDENCIALES DE ACCESO - SISTEMA MOONEY

**Fecha de entrega:** 03/01/2026
**Estado:** PRODUCCIÓN - Listo para operar

---

## 🌐 ACCESO AL SISTEMA

**URL de Producción:**
```
https://web-5u1r2nxoi92m.up-de-fra1-k8s-1.apps.run-on-seenode.com
```

---

## 👤 CREDENCIALES DE ADMINISTRADOR

**Usuario:** `admin`
**Contraseña:** `MooneyAdmin2025!`

⚠️ **IMPORTANTE:**
- Esta es la cuenta de **ADMINISTRADOR PRINCIPAL**
- Tiene acceso TOTAL al sistema
- **CAMBIAR LA CONTRASEÑA** después del primer acceso
- NO compartir estas credenciales con empleados

---

## 📋 CONFIGURACIÓN INICIAL

### Paso 1: Primer Acceso
1. Acceder a la URL de producción
2. Iniciar sesión con las credenciales de admin
3. El sistema te redirigirá al formulario de egresos

### Paso 2: Crear Usuarios del Negocio
1. Hacer clic en el botón **"⚙️ Admin"** (esquina superior derecha)
2. Seleccionar **"Gestión de Usuarios"**
3. Crear cuentas para cada empleado/encargado/directivo

#### Roles Disponibles:

| Rol | Permisos | ¿Para quién? |
|-----|----------|--------------|
| **admin** | Acceso total, crear/editar/eliminar usuarios, anular egresos, exportar CSV, ver todos los logs | Administradores del sistema |
| **direccion** | Igual que admin pero distinguible en logs | Directores, Gerentes |
| **encargado** | Ver egresos de empleados y encargados, ver logs (sin editar) | Supervisores, Encargados de turno |
| **empleado** | Crear egresos, ver solo egresos de empleados | Cajeros, Operadores |

### Paso 3: Entregar Credenciales
- Crear un usuario para cada persona
- Enviar las credenciales de forma **SEGURA** (no por WhatsApp/email)
- Pedir que cambien la contraseña en el primer acceso

---

## 🎯 FUNCIONALIDADES DEL SISTEMA

### Para EMPLEADOS:
- ✅ Crear nuevos egresos (transferencias)
- ✅ Ver historial de egresos de empleados
- ✅ Adjuntar comprobantes (PDF, JPG, PNG)
- ✅ Buscar egresos por fecha, empresa, monto, etc.

### Para ENCARGADOS:
- ✅ Todo lo de empleados
- ✅ Ver egresos de encargados
- ✅ Ver logs de auditoría (quién hizo qué)

### Para DIRECCIÓN:
- ✅ Todo lo de encargados
- ✅ Ver TODOS los egresos (incluidos los de admin)
- ✅ Editar egresos existentes
- ✅ Exportar reportes a CSV/Excel
- ✅ Ver logs completos de auditoría

### Para ADMIN:
- ✅ Todo lo de dirección
- ✅ Crear/editar/eliminar usuarios
- ✅ Anular egresos (marcarlos como inválidos)
- ✅ Cambiar roles de usuarios
- ✅ Resetear contraseñas

---

## 📊 CATÁLOGO DE ETIQUETAS

El sistema viene pre-cargado con estas categorías de egresos:

### Premios y Pagos
- Premio Pagado *(monto mínimo $3,000 ARS)*
- Pago Servidor
- Pago Encargado
- Pago Contador
- Pago Publicidad
- Fichas Regaladas

### Servicios
- Pago Servicio (Luz, Gas, Agua, Internet)
- Pago Mantenimiento

### Compras
- Compra Materiales
- Compra Equipos

### Transferencias
- Transferencia Entre Cuentas
- Cambio USD
- Retiro Efectivo
- Depósito Efectivo

### Otros
- Devolución Cliente
- Alquiler
- Impuestos
- Multa
- Comisión
- Gastos Varios
- Otro

---

## 🏦 EMPRESAS DE SALIDA

El sistema soporta estas empresas para las transferencias:

- **Telepagos**
- **Copter**
- **Palta**

Cada transferencia debe tener un **ID de Transferencia único** por empresa.

---

## 💱 MONEDAS SOPORTADAS

- **ARS** (Pesos Argentinos)
- **USD** (Dólares Estadounidenses)

---

## 🔒 SEGURIDAD

### Sesiones
- Timeout por inactividad: **30 minutos**
- Advertencia 2 minutos antes del logout automático
- Tokens JWT válidos por **12 horas**

### Contraseñas
Requisitos mínimos:
- Mínimo 8 caracteres
- Al menos 1 mayúscula
- Al menos 1 minúscula
- Al menos 1 número
- Al menos 1 carácter especial (@, #, $, %, &, etc.)

Ejemplo de contraseña válida: `Mooney2025!`

### Auditoría
- **TODAS** las acciones quedan registradas
- Se guarda: quién, cuándo, qué hizo, IP, navegador
- Los logs son permanentes (no se pueden eliminar)
- Accesibles desde el panel de administración

---

## 📱 SOPORTE TÉCNICO

### ¿Problemas para acceder?
1. Verificar que la URL es correcta
2. Verificar que el usuario y contraseña están bien escritos
3. Probar en modo incógnito / navegador privado
4. Limpiar caché y cookies
5. Probar con otro navegador (Chrome, Firefox, Edge)

### ¿Olvidaste tu contraseña?
- Contactar al **administrador** para que la resetee
- El admin puede resetear cualquier contraseña desde "Gestión de Usuarios"

### ¿El sistema está caído?
- Verificar conexión a internet
- Verificar que Seenode no esté en mantenimiento
- Contactar al equipo de desarrollo

---

## 📞 CONTACTO

**Desarrollador/Proveedor:**
[Completar con tus datos de contacto]

**Hosting:**
Seenode (https://www.seenode.com)

**Repositorio:**
GitHub - Valle-u/Formulario-Mooney

---

## ⚠️ NOTAS IMPORTANTES

### Backups
- El sistema NO hace backups automáticos de la base de datos
- Se recomienda hacer backup manual periódico
- Contactar al desarrollador para asistencia con backups

### Comprobantes
- Los archivos se almacenan en **ImgBB** (servicio externo)
- Límite: 10 GB/mes (plan gratuito)
- Si se excede, contactar al desarrollador

### Límites
- Tamaño máximo de archivo: **10 MB**
- Formatos soportados: **PDF, JPG, PNG**
- Paginación: máximo **200 registros** por página

### Rendimiento
- Optimizado para hasta **10,000 egresos** en la base de datos
- Si se supera, puede haber lentitud en búsquedas
- Recomendación: exportar y archivar datos antiguos periódicamente

---

## ✅ CHECKLIST DE ENTREGA

- [ ] Acceso a la URL de producción verificado
- [ ] Login con credenciales de admin exitoso
- [ ] Base de datos reseteada (sin datos de prueba)
- [ ] Usuario admin configurado
- [ ] Usuarios del negocio creados
- [ ] Credenciales entregadas de forma segura
- [ ] Tutorial/capacitación realizada
- [ ] Contacto de soporte técnico proporcionado

---

**🎉 ¡El sistema está listo para operar!**

**Última actualización:** 03/01/2026
