# Enlaza .env del repo al vault central (Desktop\credenciales\receipt-gate.env).
# Uso: powershell -ExecutionPolicy Bypass -File scripts\use-credenciales.ps1
#
# Si el hard link falla, el loader (src/config/load-env.ts) igual lee Desktop\credenciales\.

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$linkPath = Join-Path $repoRoot ".env"
$credRoot = if ($env:CREDENCIALES_ROOT) { $env:CREDENCIALES_ROOT } else { Join-Path $env:USERPROFILE "Desktop\credenciales" }
$target = Join-Path $credRoot "GATE\local.env"

if (-not (Test-Path $target)) {
    $example = Join-Path $credRoot "GATE\local.env.example"
    if (Test-Path $example) {
        Copy-Item $example $target
        Write-Host "Creado $target desde .example - completar API keys antes de prod."
    } else {
        Write-Error "No existe $target ni $example. Crear el vault en Desktop\credenciales."
    }
}

if (Test-Path $linkPath) {
    $item = Get-Item $linkPath -Force
    $isLink = ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
    if ($isLink) {
        Remove-Item $linkPath -Force
    } else {
        $backup = "$linkPath.local.bak"
        Write-Host "Respaldo de .env existente en $backup"
        Move-Item $linkPath $backup -Force
    }
}

try {
    New-Item -ItemType HardLink -Path $linkPath -Target $target | Out-Null
    Write-Host "Hard link: $linkPath -> $target"
} catch {
    Write-Warning "No se pudo crear hard link ($($_.Exception.Message))."
    Write-Host "El gate carga credenciales desde $target via load-env.ts (sin .env local)."
}

Write-Host ('Opcional: $env:CREDENCIALES_ROOT = ' + $credRoot)
