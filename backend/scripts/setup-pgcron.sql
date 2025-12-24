-- ==========================================
-- GUÍA: Configuración de pg_cron para limpieza automática
-- ==========================================

-- PASO 1: Verificar si pg_cron está disponible
-- Ejecutá esta query para ver si pg_cron está instalado:
SELECT * FROM pg_available_extensions WHERE name = 'pg_cron';

-- Si no aparece nada, seguí las instrucciones de instalación más abajo.
-- Si aparece, continuá con el PASO 2.

-- ==========================================
-- INSTALACIÓN DE pg_cron (si no está disponible)
-- ==========================================

/*
WINDOWS:
1. Descargá pg_cron desde: https://github.com/citusdata/pg_cron/releases
2. Copiá los archivos .dll a la carpeta de extensiones de PostgreSQL:
   C:\Program Files\PostgreSQL\16\lib\
3. Editá postgresql.conf (ubicación: C:\Program Files\PostgreSQL\16\data\postgresql.conf)
   Agregá esta línea:
   shared_preload_libraries = 'pg_cron'
4. Reiniciá el servicio de PostgreSQL:
   - Abrí "Servicios" (services.msc)
   - Buscá "postgresql-x64-16" (o tu versión)
   - Click derecho → Reiniciar

LINUX (Ubuntu/Debian):
sudo apt-get install postgresql-16-cron
# Editá /etc/postgresql/16/main/postgresql.conf
# Agregá: shared_preload_libraries = 'pg_cron'
sudo systemctl restart postgresql

MAC (con Homebrew):
brew install pg_cron
# Editá postgresql.conf
# Agregá: shared_preload_libraries = 'pg_cron'
brew services restart postgresql
*/

-- ==========================================
-- PASO 2: Crear la extensión pg_cron
-- ==========================================

-- Ejecutá esto en tu base de datos:
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Verificá que se creó correctamente:
SELECT * FROM cron.job;

-- Deberías ver una tabla vacía (sin errores)

-- ==========================================
-- PASO 3: Programar la limpieza automática de logs
-- ==========================================

-- Esta tarea se ejecutará el día 1 de cada mes a las 3:00 AM
SELECT cron.schedule(
  'cleanup-audit-logs-monthly',           -- Nombre de la tarea
  '0 3 1 * *',                           -- Cron expression: minuto hora día mes día_semana
  $$SELECT cleanup_old_audit_logs();$$   -- Query a ejecutar
);

-- ==========================================
-- PASO 4: Verificar que se programó correctamente
-- ==========================================

SELECT
  jobid,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active
FROM cron.job;

-- Deberías ver algo como:
-- jobid | schedule  | command                              | active
-- ------|-----------|--------------------------------------|-------
-- 1     | 0 3 1 * * | SELECT cleanup_old_audit_logs();     | t

-- ==========================================
-- COMANDOS ÚTILES
-- ==========================================

-- Ver historial de ejecuciones (últimas 10):
SELECT
  jobid,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 10;

-- Desactivar una tarea (sin borrarla):
SELECT cron.unschedule(1);  -- Reemplazar 1 por el jobid

-- Borrar una tarea permanentemente:
DELETE FROM cron.job WHERE jobid = 1;  -- Reemplazar 1 por el jobid

-- Ejecutar manualmente la limpieza (para probar):
SELECT cleanup_old_audit_logs();

-- ==========================================
-- EXPLICACIÓN DEL CRON EXPRESSION
-- ==========================================

/*
Formato: minuto hora día_del_mes mes día_de_la_semana

'0 3 1 * *'  →  Día 1 de cada mes a las 3:00 AM
 │ │ │ │ │
 │ │ │ │ └─── Día de la semana (0-7, donde 0 y 7 = domingo) - * = cualquiera
 │ │ │ └───── Mes (1-12) - * = todos los meses
 │ │ └─────── Día del mes (1-31) - 1 = día 1
 │ └───────── Hora (0-23) - 3 = 3 AM
 └─────────── Minuto (0-59) - 0 = minuto 0

Otros ejemplos útiles:
'0 2 * * *'     →  Todos los días a las 2:00 AM
'0 0 * * 0'     →  Todos los domingos a medianoche
'*/15 * * * *'  →  Cada 15 minutos
'0 4 1,15 * *'  →  Día 1 y 15 de cada mes a las 4:00 AM
*/

-- ==========================================
-- TROUBLESHOOTING
-- ==========================================

-- Error: "extension pg_cron does not exist"
-- Solución: Instalá pg_cron según las instrucciones de arriba

-- Error: "shared_preload_libraries must include pg_cron"
-- Solución: Editá postgresql.conf y reiniciá PostgreSQL

-- La tarea no se ejecuta:
-- 1. Verificá que esté activa: SELECT * FROM cron.job;
-- 2. Revisá los logs: SELECT * FROM cron.job_run_details ORDER BY start_time DESC;
-- 3. Verificá la zona horaria: SHOW timezone;

-- Cambiar zona horaria de PostgreSQL (si es necesario):
-- ALTER DATABASE egresos_db SET timezone TO 'America/Argentina/Buenos_Aires';
