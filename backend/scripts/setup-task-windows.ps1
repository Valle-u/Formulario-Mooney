# =========================================================================
# Script de Configuración de Tarea Program ada (Windows Task Scheduler)
# Para Windows 10/11
# =========================================================================

Write-Host "🔧 Configurando tarea programada en Windows..." -ForegroundColor Green
Write-Host ""

# Obtener ruta del proyecto
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectPath = Split-Path -Parent $scriptPath
$nodePath = (Get-Command node).Source
$cleanupScript = Join-Path $projectPath "scripts\cleanup-audit-logs.js"

Write-Host "📁 Directorio del proyecto: $projectPath" -ForegroundColor Cyan
Write-Host "🔧 Node.js: $nodePath" -ForegroundColor Cyan
Write-Host "📜 Script: $cleanupScript" -ForegroundColor Cyan
Write-Host ""

# Verificar que el script existe
if (-not (Test-Path $cleanupScript)) {
    Write-Host "❌ Error: No se encontró $cleanupScript" -ForegroundColor Red
    exit 1
}

# Nombre de la tarea
$taskName = "MooneyMaker-CleanupAuditLogs"

# Verificar si ya existe la tarea
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($existingTask) {
    Write-Host "⚠️  Ya existe una tarea programada con el nombre '$taskName'" -ForegroundColor Yellow
    $response = Read-Host "¿Deseas reemplazarla? (S/N)"
    if ($response -ne "S" -and $response -ne "s") {
        Write-Host "Cancelado." -ForegroundColor Yellow
        exit 0
    }
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "✅ Tarea anterior eliminada" -ForegroundColor Green
}

# Crear acción (ejecutar Node.js con el script)
$action = New-ScheduledTaskAction `
    -Execute $nodePath `
    -Argument "`"$cleanupScript`"" `
    -WorkingDirectory $projectPath

# Crear trigger (todos los domingos a las 3 AM)
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Sunday -At 3am

# Configurar settings
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable

# Crear principal (usuario actual)
$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType S4U

# Registrar tarea
Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Limpieza automática de audit logs del sistema Mooney Maker"

Write-Host ""
Write-Host "✅ Tarea programada configurada exitosamente" -ForegroundColor Green
Write-Host ""
Write-Host "📅 Configuración:" -ForegroundColor Cyan
Write-Host "   • Nombre: $taskName"
Write-Host "   • Frecuencia: Todos los domingos a las 3:00 AM"
Write-Host "   • Script: $cleanupScript"
Write-Host ""
Write-Host "Para ver la tarea:" -ForegroundColor Yellow
Write-Host "   Get-ScheduledTask -TaskName '$taskName'"
Write-Host ""
Write-Host "Para ejecutar manualmente:" -ForegroundColor Yellow
Write-Host "   Start-ScheduledTask -TaskName '$taskName'"
Write-Host ""
Write-Host "Para desactivar:" -ForegroundColor Yellow
Write-Host "   Disable-ScheduledTask -TaskName '$taskName'"
Write-Host ""
Write-Host "Para eliminar:" -ForegroundColor Yellow
Write-Host "   Unregister-ScheduledTask -TaskName '$taskName'"
Write-Host ""

# Probar ejecución en modo dry-run
Write-Host "🧪 Probando ejecución en modo dry-run..." -ForegroundColor Yellow
Write-Host ""
Set-Location $projectPath
& node $cleanupScript --dry-run

Write-Host ""
Write-Host "✅ Configuración completada" -ForegroundColor Green
Write-Host ""
Write-Host "💡 Consejo: Abrí Task Scheduler (taskschd.msc) para ver y administrar la tarea" -ForegroundColor Cyan
