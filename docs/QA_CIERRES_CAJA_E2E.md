# QA Guiado End-to-End - Modulo Cierres de Caja

Este documento permite validar el flujo completo del nuevo modulo `cierres-caja.html`.

## 1) Precondiciones

- Backend levantado en `http://localhost:4000`.
- Base de datos accesible (migraciones aplicadas).
- Usuario con permisos (empleado/encargado/admin) para cargar egresos.

## 2) Smoke tecnico (ejecucion rapida)

1. Abrir `http://localhost:4000/cierres-caja.html`.
2. Iniciar sesion.
3. Verificar que carga:
   - panel izquierdo "Carga asistida"
   - panel derecho "Estado de cierres"
   - KPIs: Pendientes / Correctos / Duplicados.

Resultado esperado: la vista carga sin errores JS ni pantalla vacia.

## 3) Caso A - Carga correcta de cierre

1. Ir a `Cierres` desde la barra lateral.
2. Paso 1: elegir `Turno manana`.
3. Paso 2: confirmar fecha operativa.
4. Paso 3: seleccionar `Empresa`, completar `Titular`, elegir `Moneda`.
5. Paso 4: completar monto valido y subir comprobante (JPG/PNG/PDF <= 10MB).
6. Guardar.

Resultado esperado:
- Toast de exito.
- KPI se actualiza automaticamente.
- El slot correspondiente queda en estado `OK`.
- En detalle se ve monto y `created_at`.

## 4) Caso B - Bloqueo de duplicado (misma clave)

Repetir una segunda carga con exactamente:
- misma `fecha`
- mismo `turno`
- misma `empresa`
- mismo `titular` (`cuenta_salida`)
- misma `moneda`

Resultado esperado:
- respuesta 409 del backend.
- toast de error indicando que ya existe cierre para ese slot.

## 5) Caso C - Turno tarde cruzando medianoche

1. Seleccionar `Turno tarde`.
2. Simular carga en madrugada (00:00-07:59 local) o forzar manualmente la fecha.
3. Verificar ayuda de fecha operativa.

Resultado esperado:
- el sistema sugiere `ayer` para evitar asignar el cierre al dia incorrecto.

## 6) Caso D - KPI marca faltantes

1. Elegir rango de fechas (desde/hasta) en panel KPI.
2. Filtrar por empresa y titular.
3. Revisar filas por turno.

Resultado esperado:
- si un slot no existe => `PENDIENTE`.
- si existe uno => `OK`.
- si existen varios => `DUPLICADO`.

## 7) Caso E - Accion "Usar este slot"

1. En una fila `PENDIENTE`, click `Usar este slot`.

Resultado esperado:
- el formulario de carga se completa automaticamente con ese dia/turno/empresa/titular/moneda.

## 8) Caso F - Regresion en formularios generales

1. Abrir `egreso.html` y `flujo-usd.html`.
2. Revisar `ETIQUETA`.

Resultado esperado:
- `Cierre de Caja` no aparece en el selector.
- aparece nota con link al modulo `Cierres de Caja`.

## 9) Caso G - Navegacion completa

Verificar que existe item `Cierres` en desktop/mobile en:
- `egreso.html`
- `consulta-egresos.html`
- `flujo-usd.html`
- `saldos.html`
- `usuarios.html`
- `logs.html`

Resultado esperado: navegacion consistente en todas las paginas autenticadas.

## 10) Check de API (opcional)

Con token valido:

```bash
curl -H "Authorization: Bearer <TOKEN>" "http://localhost:4000/api/egresos/cierres/kpi?fecha_desde=2026-02-25&fecha_hasta=2026-02-28"
```

Resultado esperado: JSON con `summary` y `rows`.

## 11) Criterio de aprobacion

El modulo se aprueba si:
- no permite duplicados por slot operativo,
- guia correctamente el turno y fecha operativa,
- KPI refleja faltantes/ok/duplicados,
- flujo general (egreso/flujo-usd/nav) no se rompe.
