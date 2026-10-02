# Poll gate prod SSH; al conectar ejecuta fix ClamAV+gate.
# Uso: powershell -File scripts/gate-prod-recover-wait.ps1
# Requiere reboot previo EC2 GateAI i-0f8428f7b82c2e75a si SSH/TLS colgados.

$Key = Join-Path $env:USERPROFILE "Desktop\credenciales\GATE\keys\GateAI.pem"
$Target = "ec2-user@3.12.87.253"
$MaxAttempts = 40
$IntervalSec = 15
$RemoteCmd = "cd ~/gate 2>/dev/null || cd ~/receipt-gate; docker compose restart clamav; sleep 45; docker compose restart gate; sleep 10; curl -s http://127.0.0.1:4100/health; echo; curl -sk https://127.0.0.1/health; echo"

Write-Host "Esperando SSH gate prod..."
for ($i = 1; $i -le $MaxAttempts; $i++) {
  Write-Host "[$i/$MaxAttempts]"
  ssh -i $Key -o ConnectTimeout=12 -o BatchMode=yes $Target "echo GATE_SSH_OK" 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "SSH OK - ejecutando recuperacion..."
    ssh -i $Key -o ConnectTimeout=120 $Target $RemoteCmd
    exit $LASTEXITCODE
  }
  Start-Sleep -Seconds $IntervalSec
}
Write-Host "Timeout - reiniciar instancia i-0f8428f7b82c2e75a en AWS Console us-east-2 y reintentar."
exit 1
