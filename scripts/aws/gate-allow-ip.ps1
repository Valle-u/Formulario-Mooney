<#
.SYNOPSIS
  Alta/baja de una IP en el allowlist :443 de los Security Groups del GATE (prod/test).

.DESCRIPTION
  Evita el camino manual por consola AWS. Usa el AWS CLI con credenciales de un IAM user
  de alcance mínimo (ver scripts/aws/gate-sg-manager-policy.json). Las credenciales se
  cargan por variables de entorno desde el vault (nunca en git/chat):
    AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION=us-east-2
  (session-open.ps1 del vault las exporta; o `. E:\credenciales\GATE\aws-sg.env` en la sesión).

.PARAMETER Ip
  IP pública /32 a habilitar (ej. 181.0.195.235). Se le agrega /32 si falta.

.PARAMETER Env
  prod | test | both  (default: prod). prod=sg-0b9abb8d6c9927f4b · test=sg-07d12df127a944052.

.PARAMETER Description
  Texto de la regla (ej. "QA Martin CROSS-G01-05").

.PARAMETER Revoke
  Si se pasa, REVOCA la regla en vez de crearla.

.EXAMPLE
  pwsh scripts/aws/gate-allow-ip.ps1 -Ip 181.0.195.235 -Env prod -Description "QA Martin"
.EXAMPLE
  pwsh scripts/aws/gate-allow-ip.ps1 -Ip 181.0.195.235 -Env both -Revoke
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Ip,
  [ValidateSet("prod", "test", "both")][string]$Env = "prod",
  [string]$Description = "gate allowlist (managed by gate-allow-ip.ps1)",
  [switch]$Revoke
)

$ErrorActionPreference = "Stop"
$region = if ($env:AWS_DEFAULT_REGION) { $env:AWS_DEFAULT_REGION } else { "us-east-2" }
$sg = @{ prod = "sg-0b9abb8d6c9927f4b"; test = "sg-07d12df127a944052" }
$targets = switch ($Env) { "both" { @("prod", "test") } default { @($Env) } }

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) { throw "AWS CLI no encontrado en PATH." }
if (-not $env:AWS_ACCESS_KEY_ID) {
  throw "Sin credenciales AWS en el entorno. Cargá el vault (session-open.ps1) o '. E:\credenciales\GATE\aws-sg.env' antes de correr."
}

$cidr = if ($Ip -match "/") { $Ip } else { "$Ip/32" }
$id = aws sts get-caller-identity --query Arn --output text 2>&1
Write-Host "Identity: $id  ·  region: $region"

foreach ($t in $targets) {
  $groupId = $sg[$t]
  $verb = if ($Revoke) { "revoke-security-group-ingress" } else { "authorize-security-group-ingress" }
  Write-Host "==> $verb  $t ($groupId)  443  $cidr"
  if ($Revoke) {
    $out = aws ec2 revoke-security-group-ingress --group-id $groupId --protocol tcp --port 443 --cidr $cidr --region $region 2>&1
  } else {
    $perm = "IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=$cidr,Description=$Description}]"
    $out = aws ec2 authorize-security-group-ingress --group-id $groupId --ip-permissions $perm --region $region 2>&1
  }
  if ($LASTEXITCODE -ne 0) {
    if ("$out" -match "InvalidPermission.Duplicate") { Write-Host "   ya existía (ok)." }
    elseif ("$out" -match "InvalidPermission.NotFound") { Write-Host "   no existía (ok, revoke idempotente)." }
    else { Write-Warning "   $out" }
  } else {
    Write-Host "   OK."
  }
  Write-Host "   estado 443:"
  aws ec2 describe-security-groups --group-ids $groupId --region $region `
    --query "SecurityGroups[0].IpPermissions[?FromPort==``443``].IpRanges[].[CidrIp,Description]" --output text 2>&1 | ForEach-Object { "     $_" }
}
