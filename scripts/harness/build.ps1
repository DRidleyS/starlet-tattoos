# =================================================================================================
# build.ps1 -- production build wrapper (next build) under the harness contract.
#
# Contract (PORTING.md §2, web column): refuse while a conflicting process runs -> declare busy
# with an OWNED marker -> run with a file log -> judge by reading the thing itself -> emit a
# RESULT line as the last word. THE RESULT LINE IS THE VERDICT; a missing line is a FAIL.
#
# The verdict is exit code AND a fresh .next\BUILD_ID (the artifact, not the tool's self-report):
# "read the thing itself, never the run's own verdict". A build that exits 0 without minting a
# BUILD_ID did not build.
#
# REFUSES while a dev server holds a port in 3000-3010: `next build` and `next dev` share .next\
# and running both corrupts the dev server's cache at best. A dev server never exits on its own,
# so unlike the source project's editor-wait there is no deadline to wait out - the agent must
# stop the preview first. Loud REFUSED, not a silent queue.
# =================================================================================================
$ErrorActionPreference = 'Continue'
$proj = 'C:\Users\doria\web-projects\starlet-tattoos'
. (Join-Path $proj '.claude\hooks\harness-lib.ps1')

$env:Path = 'C:\Program Files\nodejs;' + $env:Path
$logDir = Join-Path $proj '.claude\joblogs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir ('build-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')

# ---- refuse under a live dev server -------------------------------------------------------------
$devPorts = @()
try {
  $devPorts = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -ge 3000 -and $_.LocalPort -le 3010 } |
    Where-Object { (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName -eq 'node' } |
    Select-Object -ExpandProperty LocalPort -Unique)
} catch { }
if ($devPorts.Count -gt 0) {
  Write-Output ("REFUSED: a node dev server is listening on port " + ($devPorts -join ', ') +
    " - next build and next dev share .next\. Stop the preview server, then rerun.")
  Write-Output ('RESULT: FAIL reason=dev-server-running ports=' + ($devPorts -join ','))
  exit 2
}

$start = Get-Date
Write-HarnessBusy -Reason 'next build (scripts/harness/build.ps1)' -OwnerPid $PID
try {
  Push-Location $proj
  cmd /c "npm run build > `"$log`" 2>&1"
  $code = $LASTEXITCODE
  Pop-Location

  $buildId = ''
  $bidPath = Join-Path $proj '.next\BUILD_ID'
  $fresh = $false
  if (Test-Path $bidPath) {
    $bi = Get-Item $bidPath
    $fresh = ($bi.LastWriteTime -ge $start)
    $buildId = (Get-Content $bidPath -Raw -ErrorAction SilentlyContinue).Trim()
  }
  $dur = [int]((Get-Date) - $start).TotalSeconds

  # Surface the tail so a failure's cause rides along with the verdict.
  if (Test-Path $log) { Get-Content $log -Tail 25 | ForEach-Object { Write-Output $_ } }

  if ($code -eq 0 -and $fresh -and $buildId) {
    Write-Output ("RESULT: OK exit=0 buildId=$buildId durationS=$dur log=$log")
    exit 0
  }
  $why = if ($code -ne 0) { "exit=$code" } elseif (-not $fresh) { 'exit=0 but .next\BUILD_ID was NOT freshly written (stale or missing artifact)' } else { 'no BUILD_ID content' }
  Write-Output ("RESULT: FAIL $why durationS=$dur log=$log")
  exit 1
} finally {
  Remove-Item (Join-Path $proj '.claude\.busy') -Force -ErrorAction SilentlyContinue
}
