[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('weekly', 'monthly')]
  [string]$Window
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$LogDirectory = Join-Path $ProjectRoot 'data\logs'
$LogPath = Join-Path $LogDirectory ("scheduled-{0}-{1}.log" -f $Window, (Get-Date -Format 'yyyyMMdd-HHmmss'))
. (Join-Path $PSScriptRoot 'scheduler-common.ps1')
$RedactionSecrets = Get-ScheduledRedactionSecrets -ProjectRoot $ProjectRoot

New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
Push-Location $ProjectRoot
try {
  $output = Write-ScheduledLog -Path $LogPath -Text (@(& npm run instagram:present -- --window $Window 2>&1) -join [Environment]::NewLine) -Secrets $RedactionSecrets
  $exitCode = $LASTEXITCODE
  $output | Write-Output
  if ($exitCode -ne 0) {
    throw "Scheduled $Window pipeline failed with exit code $exitCode. See $LogPath"
  }
}
catch {
  $message = Protect-ScheduledOutput -Text $_.Exception.Message -Secrets $RedactionSecrets
  if (-not (Test-Path -LiteralPath $LogPath)) {
    Write-ScheduledLog -Path $LogPath -Text $message -Secrets $RedactionSecrets | Out-Null
  }
  Write-Error $message
  exit 1
}
finally {
  Pop-Location
}
