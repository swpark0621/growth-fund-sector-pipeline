param(
  [switch]$WhatIf
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$refreshScript = (Resolve-Path (Join-Path $PSScriptRoot "run-scheduled-v10-entry-refresh.ps1")).Path
$taskTimes = @(
  @{ Name = "GrowthFundV10EntryRefresh_0730"; Time = "07:30" },
  @{ Name = "GrowthFundV10EntryRefresh_1500"; Time = "15:00" },
  @{ Name = "GrowthFundV10EntryRefresh_1930"; Time = "19:30" }
)
$taskArgument = "-NoProfile -ExecutionPolicy Bypass -File `"$refreshScript`""
$principal = New-ScheduledTaskPrincipal `
  -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
  -LogonType Interactive `
  -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries

foreach ($task in $taskTimes) {
  $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $taskArgument
  $trigger = New-ScheduledTaskTrigger -Daily -At $task.Time

  Write-Host "Registering $($task.Name) at $($task.Time)"
  Write-Host "Action: powershell.exe $taskArgument"

  if (-not $WhatIf) {
    Register-ScheduledTask `
      -TaskName $task.Name `
      -Action $action `
      -Trigger $trigger `
      -Principal $principal `
      -Settings $settings `
      -Description "Refresh V10 dashboard and Entry Change Monitor, commit generated files, and push to GitHub Pages." `
      -Force | Out-Null
  }
}
