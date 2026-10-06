function Get-ScheduledRedactionSecrets {
  param([Parameter(Mandatory = $true)][string]$ProjectRoot)

  $secrets = [System.Collections.Generic.List[string]]::new()
  $envPath = Join-Path $ProjectRoot '.env'
  if (Test-Path -LiteralPath $envPath) {
    foreach ($line in Get-Content -LiteralPath $envPath) {
      if ($line -match '^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.*?)\s*$') {
        $value = $Matches[1].Trim()
        if ($value.StartsWith('#')) { continue }
        if ($value.Length -ge 3 -and $value -match '^(".*"|''.*'')$') {
          $value = $value.Substring(1, $value.Length - 2)
        }
        if ($value.Length -ge 1) { $secrets.Add($value) }
      }
    }
  }

  foreach ($variable in Get-ChildItem Env:) {
    if ($variable.Name -match '(?i)(token|secret|password|credential|authorization|api.?key)' -and $variable.Value.Length -ge 3) {
      $secrets.Add($variable.Value)
    }
  }
  return $secrets | Sort-Object Length -Descending -Unique
}

function Protect-ScheduledOutput {
  param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text,
    [string[]]$Secrets = @()
  )

  foreach ($secret in ($Secrets | Where-Object { $_ -and $_.Length -ge 1 } | Sort-Object Length -Descending -Unique)) {
    $Text = [regex]::Replace($Text, [regex]::Escape($secret), '[REDACTED]')
  }

  $Text = [regex]::Replace($Text, '(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+', 'Bearer [REDACTED]')
  $Text = [regex]::Replace($Text, '(?i)(\b(?:access[-_]?token|auth[-_]?token|refresh[-_]?token|id[-_]?token|client[-_]?(?:secret|key)|api[-_]?key|authorization|password|passwd|secret|credential|private[-_]?key|signing[-_]?key|token)\b\s*[=:]\s*)[^\s,;]+', '$1[REDACTED]')
  return [regex]::Replace($Text, '(?<![A-Za-z0-9])(?:eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|(?:sk|pk|ghp|github_pat|xox[baprs]-)[A-Za-z0-9_-]{10,}|[A-Fa-f0-9]{32,}|[A-Za-z0-9+/]{32,}={0,2})(?![A-Za-z0-9])', '[REDACTED]')
}

function Write-ScheduledLog {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text,
    [string[]]$Secrets = @()
  )

  $safeText = Protect-ScheduledOutput -Text $Text -Secrets $Secrets
  $safeText | Out-File -FilePath $Path -Encoding utf8
  return $safeText
}
