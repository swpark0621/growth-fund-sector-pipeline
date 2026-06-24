param(
  [switch]$DryRun,
  [switch]$NoPush
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$logRoot = Join-Path $repoRoot "outputs\scheduled-refresh"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logPath = Join-Path $logRoot "$stamp-v10-entry-refresh.log"
$madeCommit = $false

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(Mandatory = $true)][string[]]$Arguments
  )

  $display = "$Command $($Arguments -join ' ')"
  Write-Host ">>> $display"
  if ($DryRun) { return }

  & $Command @Arguments
  $code = $LASTEXITCODE
  if ($code -ne 0) {
    throw "Command failed with exit code ${code}: ${display}"
  }
}

function Test-StagedChanges {
  & git.exe diff --cached --quiet
  return ($LASTEXITCODE -ne 0)
}

New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
Start-Transcript -Path $logPath -Append | Out-Null

try {
  Set-Location $repoRoot
  Write-Host "Repository: $repoRoot"
  Write-Host "Started: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss 'KST'")"

  Invoke-Step "git.exe" @("pull", "--ff-only", "origin", "main")

  Invoke-Step "npm.cmd" @("run", "v10")
  Invoke-Step "git.exe" @("add", "data/v10-execution-dashboard-data.json", "docs/v10.html")
  if (-not $DryRun -and (Test-StagedChanges)) {
    Invoke-Step "git.exe" @("commit", "-m", "Scheduled v10 refresh $stamp")
    $madeCommit = $true
  } else {
    Write-Host "No staged V10 changes."
  }

  Invoke-Step "npm.cmd" @("run", "entry-monitor")
  Invoke-Step "git.exe" @("add", "data/entry-change-monitor-v1-data.json", "docs/entry-change-monitor-v1.html")
  if (-not $DryRun -and (Test-StagedChanges)) {
    Invoke-Step "git.exe" @("commit", "-m", "Scheduled entry monitor refresh $stamp")
    $madeCommit = $true
  } else {
    Write-Host "No staged entry monitor changes."
  }

  if (-not $NoPush -and $madeCommit) {
    Invoke-Step "git.exe" @("push", "origin", "main")
  } elseif ($NoPush) {
    Write-Host "Skipping push because -NoPush was supplied."
  } else {
    Write-Host "Skipping push because no commit was created."
  }

  Write-Host "Completed: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss 'KST'")"
} catch {
  Write-Error $_
  exit 1
} finally {
  Stop-Transcript | Out-Null
}
