# 🔧 Guía: Configurar Limpieza Automática con pg_cron

Esta guía te ayudará a configurar la limpieza automática de logs de auditoría usando **pg_cron**.

---

## 📌 ¿Qué es pg_cron?

Es una extensión de PostgreSQL que funciona como un "cron" (programador de tareas) dentro de la base de datos. Una vez configurado, PostgreSQL ejecutará automáticamente la limpieza de logs sin que vos tengas que hacer nada.

---

## 🚀 Paso a Paso

### **PASO 1: Verificar si pg_cron está instalado**

1. Abrí **pgAdmin** (o tu cliente de PostgreSQL favorito)
2. Conectate a tu base de datos `egresos_db`
3. Ejecutá esta query:

```sql
SELECT * FROM pg_available_extensions WHERE name = 'pg_cron';
```

**¿Qué debería pasar?**
- ✅ Si aparece una fila con `name = 'pg_cron'` → **Continuá al PASO 2**
- ❌ Si no aparece nada → **Seguí la sección "Instalar pg_cron" más abajo**

---

### **PASO 2: Activar la extensión pg_cron**

Ejecutá esta query en tu base de datos:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
```

**Resultado esperado:**
```
CREATE EXTENSION
```

---

### **PASO 3: Programar la limpieza automática**

Ahora vamos a decirle a PostgreSQL que ejecute la limpieza el día 1 de cada mes a las 3 AM:

```sql
SELECT cron.schedule(
  'cleanup-audit-logs-monthly',
  '0 3 1 * *',
  $$SELECT cleanup_old_audit_logs();$$
);
```

**Resultado esperado:**
```
 cron.schedule
---------------
             1
```

El número `1` es el ID de la tarea programada.

---

### **PASO 4: Verificar que se programó correctamente**

```sql
SELECT jobid, schedule, command, active
FROM cron.job;
```

**Deberías ver algo como:**

| jobid | schedule  | command                          | active |
|-------|-----------|----------------------------------|--------|
| 1     | 0 3 1 * * | SELECT cleanup_old_audit_logs(); | t      |

Si ves `active = t` (true), **¡listo! Ya está configurado!** 🎉

---

### **PASO 5: Probar que funciona (opcional)**

Para probar sin esperar al día 1 del mes, ejecutá manualmente:

```sql
SELECT cleanup_old_audit_logs();
```

**Resultado esperado:**
```
 cleanup_old_audit_logs
------------------------
                      0
```

El número indica cuántas filas se eliminaron (si es 0, es porque no hay logs viejos todavía, lo cual es normal en un sistema nuevo).

---

## 📥 Instalar pg_cron (si no está disponible)

### **En Windows:**

1. **Descargar pg_cron:**
   - Ir a: https://github.com/citusdata/pg_cron/releases
   - Descargar la versión que coincida con tu PostgreSQL (ej: si tenés PostgreSQL 16, descargar la versión para PG16)

2. **Instalar los archivos:**
   - Extraer el archivo descargado
   - Copiar `pg_cron.dll` a: `C:\Program Files\PostgreSQL\16\lib\`
   - Copiar los archivos `.sql` a: `C:\Program Files\PostgreSQL\16\share\extension\`

3. **Editar postgresql.conf:**
   - Abrir: `C:\Program Files\PostgreSQL\16\data\postgresql.conf`
   - Buscar la línea `#shared_preload_libraries = ''`
   - Cambiarla por: `shared_preload_libraries = 'pg_cron'`
   - Guardar el archivo

4. **Reiniciar PostgreSQL:**
   - Presionar `Win + R`
   - Escribir `services.msc` y Enter
   - Buscar el servicio "postgresql-x64-16" (o tu versión)
   - Click derecho → Reiniciar

5. **Volver al PASO 1** de esta guía

---

### **En Linux (Ubuntu/Debian):**

```bash
# Instalar pg_cron
sudo apt-get install postgresql-16-cron

# Editar postgresql.conf
sudo nano /etc/postgresql/16/main/postgresql.conf

# Agregar esta línea:
# shared_preload_libraries = 'pg_cron'

# Reiniciar PostgreSQL
sudo systemctl restart postgresql
```

Luego volver al PASO 1 de esta guía.

---

### **En macOS (con Homebrew):**

```bash
# Instalar pg_cron
brew install pg_cron

# Editar postgresql.conf (ubicación puede variar)
nano /usr/local/var/postgres/postgresql.conf

# Agregar esta línea:
# shared_preload_libraries = 'pg_cron'

# Reiniciar PostgreSQL
brew services restart postgresql
```

Luego volver al PASO 1 de esta guía.

---

## ✅ Comandos Útiles

### **Ver historial de ejecuciones:**

```sql
SELECT
  jobid,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;
```

### **Ver cuándo se ejecutará la próxima vez:**

pg_cron no tiene una función nativa para esto, pero podés calcular manualmente:
- Si configuraste `'0 3 1 * *'`, se ejecutará el próximo día 1 del mes a las 3:00 AM

### **Desactivar temporalmente (sin borrar):**

```sql
SELECT cron.unschedule(1);  -- Reemplazar 1 por tu jobid
```

### **Volver a activar:**

```sql
SELECT cron.schedule(
  'cleanup-audit-logs-monthly',
  '0 3 1 * *',
  $$SELECT cleanup_old_audit_logs();$$
);
```

### **Borrar permanentemente:**

```sql
DELETE FROM cron.job WHERE jobid = 1;  -- Reemplazar 1 por tu jobid
```

---

## 🎯 ¿Qué hace exactamente la limpieza?

Cuando se ejecuta `cleanup_old_audit_logs()`:

1. Busca todos los registros en `audit_logs` con más de 6 meses de antigüedad
2. Los elimina de la base de datos
3. Registra cuántas filas eliminó en un nuevo log de auditoría
4. Retorna la cantidad de filas eliminadas

**Ejemplo de ejecución:**

```sql
SELECT cleanup_old_audit_logs();

-- Resultado:
 cleanup_old_audit_logs
------------------------
                   1523
```

Esto significa que eliminó 1,523 registros viejos.

---

## 📊 Entender el Cron Expression

El patrón `'0 3 1 * *'` significa:

```
 0   3   1   *   *
 │   │   │   │   │
 │   │   │   │   └─ Día de la semana (0-7, 0=domingo) - * = cualquiera
 │   │   │   └───── Mes (1-12) - * = todos
 │   │   └───────── Día del mes (1-31) - 1 = día 1
 │   └───────────── Hora (0-23) - 3 = 3 AM
 └───────────────── Minuto (0-59) - 0 = en punto
```

**Otros ejemplos útiles:**

| Expression     | Significado                                    |
|----------------|------------------------------------------------|
| `0 2 * * *`    | Todos los días a las 2:00 AM                  |
| `0 0 * * 0`    | Todos los domingos a medianoche               |
| `0 4 1,15 * *` | Día 1 y 15 de cada mes a las 4:00 AM          |
| `*/30 * * * *` | Cada 30 minutos                               |
| `0 */6 * * *`  | Cada 6 horas (0:00, 6:00, 12:00, 18:00)       |

**Si querés cambiar el horario:**

Por ejemplo, para ejecutar todos los domingos a las 4 AM en vez de día 1:

```sql
-- Primero eliminar la tarea actual
SELECT cron.unschedule(1);

-- Crear nueva tarea con horario diferente
SELECT cron.schedule(
  'cleanup-audit-logs-weekly',
  '0 4 * * 0',
  $$SELECT cleanup_old_audit_logs();$$
);
```

---

## 🐛 Solución de Problemas

### **Error: "extension pg_cron does not exist"**

**Causa:** pg_cron no está instalado.
**Solución:** Seguir la sección "Instalar pg_cron" más arriba.

---

### **Error: "must be owner of extension pg_cron"**

**Causa:** No tenés permisos suficientes.
**Solución:** Ejecutar como superusuario de PostgreSQL:

```bash
# En Windows (cmd como administrador)
psql -U postgres -d egresos_db

# En Linux/Mac
sudo -u postgres psql -d egresos_db
```

---

### **La tarea no se ejecuta**

1. **Verificar que esté activa:**
```sql
SELECT * FROM cron.job WHERE active = true;
```

2. **Revisar logs de errores:**
```sql
SELECT * FROM cron.job_run_details
WHERE status = 'failed'
ORDER BY start_time DESC;
```

3. **Verificar zona horaria:**
```sql
SHOW timezone;
```

Si la zona horaria no coincide con tu ubicación:
```sql
ALTER DATABASE egresos_db SET timezone TO 'America/Argentina/Buenos_Aires';
```

---

### **La extensión no se carga después de editar postgresql.conf**

**Causa:** PostgreSQL no se reinició correctamente.
**Solución:**

**Windows:**
```cmd
net stop postgresql-x64-16
net start postgresql-x64-16
```

**Linux:**
```bash
sudo systemctl restart postgresql
```

**Mac:**
```bash
brew services restart postgresql
```

---

## ✨ Resumen

Una vez que completés estos pasos:

1. ✅ La limpieza se ejecutará **automáticamente** el día 1 de cada mes a las 3 AM
2. ✅ No tenés que acordarte de nada
3. ✅ Los logs viejos se eliminan automáticamente cada mes
4. ✅ El sistema se mantiene rápido y eficiente sin intervención manual

**Tiempo estimado de configuración:** 10-15 minutos
**Esfuerzo recurrente:** 0 minutos (es automático)

---

## 📞 ¿Necesitás ayuda?

Si tenés algún error o duda durante la configuración, podés:

1. Revisar la sección "Solución de Problemas" arriba
2. Consultar los logs de PostgreSQL
3. Ejecutar manualmente `SELECT cleanup_old_audit_logs();` para verificar que la función existe

---

**Última actualización:** 2025-12-22
