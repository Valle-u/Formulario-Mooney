# 🚀 Plan de Deploy a Main (Producción)

## 📊 Resumen de Cambios en Staging

### Commits a Mergear (12 commits):
1. `b6dad25` - Fix: Resolver botón de confirmación trabado en "Guardando..."
2. `ceac828` - Fix: Arreglar validación de ID duplicado - orden de rutas en Express
3. `0234cb2` - Fix: Arreglar sistema de notificaciones toast - unificar y limpiar
4. `d1e1b6d` - Feat: Mejorar robustez del servidor para mantenerlo activo 24/7
5. `181f56c` - Feat: Agregar Lemoncash y NaranjaX + botón anular en historial
6. `2ccc964` - Fix: Corregir nombre de función para botón Editar
7. `50b0157` - Feat: Cambiar anular por eliminar - borrado permanente de egresos
8. `e0f03f9` - Fix: Arreglar botones de Editar/Eliminar con event listeners
9. `a553df2` - Fix: Agregar 'editada' al constraint de status en egresos
10. `65c0a3b` - Feat: Ordenar egresos por fecha de subida (created_at)
11. `3987abc` - Feat: Agregar TrustWallet y mejorar notificación CSV
12. `2d5359b` - Refactor: Reorganizar arquitectura del proyecto

---

## ⚠️ IMPORTANTE: Sobre la Base de Datos

### ❌ El merge NO afecta la base de datos automáticamente

- Las migraciones SQL son solo archivos
- NO se ejecutan automáticamente al hacer deploy
- La base de datos de producción NO cambiará hasta que ejecutes las migraciones manualmente

### ✅ Migraciones Nuevas que Deberás Ejecutar DESPUÉS del Deploy:

1. **014_add_lemoncash_naranjax.sql** (OPCIONAL - si querés usar estas empresas)
2. **015_fix_status_constraint.sql** (⚠️ CRÍTICA - necesaria para editar egresos)
3. **016_add_trustwallet.sql** (OPCIONAL - si querés usar TrustWallet)

---

## 🔍 Checklist Pre-Merge

### Código (Backend):
- ✅ Rutas de importación actualizadas
- ✅ Estructura de carpetas organizada
- ✅ Sin archivos sueltos en raíz
- ✅ Endpoint DELETE para eliminar egresos
- ✅ Endpoint PUT con status 'editada' soportado
- ✅ ORDER BY por created_at en lugar de fecha/hora
- ✅ Validación de empresas actualizada
- ✅ Pool de PostgreSQL con keepAlive
- ✅ Graceful shutdown implementado
- ✅ Health check mejorado

### Código (Frontend):
- ✅ EMPRESAS_SALIDA actualizado (7 empresas)
- ✅ Event listeners para botones de acción
- ✅ Notificación CSV como success
- ✅ Cache busting (versión 2026010522)
- ✅ Toast system unificado
- ✅ Botones Editar/Eliminar/Ver Historial funcionando

### Migraciones SQL (NO EJECUTADAS AÚN):
- 📄 014_add_lemoncash_naranjax.sql
- 📄 015_fix_status_constraint.sql (⚠️ CRÍTICA)
- 📄 016_add_trustwallet.sql

---

## 📝 Plan de Deploy Paso a Paso

### Paso 1: Verificar que Staging Funciona Correctamente
- [ ] Probaste crear egresos en staging
- [ ] Probaste editar egresos en staging
- [ ] Probaste eliminar egresos en staging
- [ ] Probaste descargar CSV en staging
- [ ] Los botones funcionan correctamente
- [ ] No hay errores en consola del navegador

### Paso 2: Hacer Merge a Main
```bash
git checkout main
git pull origin main
git merge staging
git push origin main
```

### Paso 3: Esperar Deploy Automático en Seenode
- Seenode detectará el push a main
- Hará deploy automático del código
- El servidor se reiniciará con el código nuevo

### Paso 4: Ejecutar Migraciones en Base de Datos de Producción (MANUAL)

⚠️ **IMPORTANTE**: Solo ejecutá las migraciones que necesites. Si no vas a usar Lemoncash/NaranjaX/TrustWallet, no ejecutes esas migraciones.

#### Migración CRÍTICA (ejecutar SÍ o SÍ):
```sql
-- 015_fix_status_constraint.sql
-- SIN ESTA MIGRACIÓN, EDITAR EGRESOS DARÁ ERROR 500

ALTER TABLE egresos DROP CONSTRAINT IF EXISTS egresos_status_check;

ALTER TABLE egresos ADD CONSTRAINT egresos_status_check
  CHECK (status IN ('activo', 'anulado', 'pendiente', 'editada'));

COMMENT ON CONSTRAINT egresos_status_check ON egresos IS 'Estados permitidos: activo, anulado, pendiente, editada';
```

#### Migraciones Opcionales:
```sql
-- 014_add_lemoncash_naranjax.sql (solo si vas a usar estas empresas)
ALTER TABLE egresos DROP CONSTRAINT IF EXISTS egresos_empresa_salida_check;
ALTER TABLE egresos ADD CONSTRAINT egresos_empresa_salida_check
  CHECK (empresa_salida IN ('Telepagos', 'Copter', 'Palta', 'Personal Pay', 'Lemoncash', 'NaranjaX'));

-- 016_add_trustwallet.sql (solo si vas a usar TrustWallet)
ALTER TABLE egresos DROP CONSTRAINT IF EXISTS egresos_empresa_salida_check;
ALTER TABLE egresos ADD CONSTRAINT egresos_empresa_salida_check
  CHECK (empresa_salida IN ('Telepagos', 'Copter', 'Palta', 'Personal Pay', 'Lemoncash', 'NaranjaX', 'TrustWallet'));
```

### Paso 5: Verificar Producción
- [ ] El sitio carga correctamente
- [ ] Podés crear egresos
- [ ] Podés editar egresos (SIN ERROR 500)
- [ ] Podés eliminar egresos
- [ ] Las notificaciones funcionan
- [ ] Los botones responden

---

## 🛡️ Plan de Rollback (Si Algo Sale Mal)

Si hay algún problema después del deploy:

```bash
# Volver a la versión anterior de main
git checkout main
git reset --hard origin/main~12  # Vuelve 12 commits atrás
git push --force origin main      # ⚠️ Solo hacer si es necesario

# O simplemente hacer un revert
git revert HEAD~12..HEAD
git push origin main
```

---

## ✅ Confirmación Final

### Preguntas de Seguridad:

**¿El merge afectará la base de datos automáticamente?**
❌ NO. Las migraciones solo son archivos, no se ejecutan solas.

**¿Se perderán datos al hacer el merge?**
❌ NO. El merge solo cambia código, no datos.

**¿Puedo probar en producción antes de ejecutar las migraciones?**
✅ SÍ. El sitio funcionará, pero:
- Editar egresos dará error 500 (hasta ejecutar migración 015)
- No podrás usar Lemoncash/NaranjaX/TrustWallet (hasta ejecutar sus migraciones)

**¿Qué pasa si no ejecuto las migraciones?**
- Sin 015: ❌ Editar egresos = ERROR 500
- Sin 014/016: ⚠️ Solo no podrás usar las nuevas empresas

**¿Es reversible?**
✅ SÍ. Podés hacer rollback del código en cualquier momento.

---

## 🎯 Recomendación

**Orden sugerido:**
1. ✅ Verificar staging completamente
2. ✅ Hacer merge a main
3. ✅ Esperar deploy automático
4. ✅ Ejecutar migración 015 (CRÍTICA)
5. ✅ Probar editar un egreso
6. ✅ Ejecutar migraciones 014 y 016 (si las necesitás)

**Horario sugerido:**
- Hacerlo cuando haya POCO tráfico de usuarios
- Tener 10-15 minutos disponibles para verificar
- No hacerlo en hora pico del casino

---

## 📞 Checklist Final Antes de Mergear

- [ ] Staging funciona perfectamente
- [ ] Todas las funcionalidades probadas
- [ ] Plan de rollback entendido
- [ ] Migraciones SQL preparadas para ejecutar
- [ ] Acceso a base de datos de producción disponible
- [ ] Horario apropiado (poco tráfico)
- [ ] Backup de base de datos hecho (recomendado)

**¿Todo listo?** → Ejecutá el merge! 🚀
