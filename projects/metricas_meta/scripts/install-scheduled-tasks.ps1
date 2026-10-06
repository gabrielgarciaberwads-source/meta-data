[CmdletBinding()]
param(
  [switch]$AllUsers
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$RunnerPath = Join-Path $ProjectRoot 'scripts\run-scheduled.ps1'
$TaskNames = @{
  Weekly = 'InstagramPresenton-Weekly'
  Monthly = 'InstagramPresenton-Monthly'
}

function New-RunnerAction([string]$window) {
  $arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}" -Window {1}' -f $RunnerPath, $window
  New-ScheduledTaskAction -Execute 'PowerShell.exe' -Argument $arguments -WorkingDirectory $ProjectRoot
}

function Register-PipelineTask([string]$name, $trigger, [string]$window) {
  $registration = @{
    TaskName = $name
    Action = New-RunnerAction $window
    Trigger = $trigger
    Description = "Run the Instagram Presenton $window briefing."
    Force = $true
  }
  if ($AllUsers) {
    $registration.User = 'SYSTEM'
    $registration.RunLevel = 'Highest'
  }
  Register-ScheduledTask @registration | Out-Null
}

$weeklyTrigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At '08:00'
$monthlyTrigger = New-ScheduledTaskTrigger -Monthly -DaysOfMonth 1 -At '08:00'

Register-PipelineTask $TaskNames.Weekly $weeklyTrigger 'weekly'
Register-PipelineTask $TaskNames.Monthly $monthlyTrigger 'monthly'
Write-Output "Installed $($TaskNames.Weekly) and $($TaskNames.Monthly) using the machine's local timezone."
