[CmdletBinding()]
$ErrorActionPreference = 'Stop'
$TaskNames = @('InstagramPresenton-Weekly', 'InstagramPresenton-Monthly')

foreach ($taskName in $TaskNames) {
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if ($null -ne $task) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Output "Removed $taskName."
  }
}
