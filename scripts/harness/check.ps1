# =================================================================================================
# check.ps1 -- typecheck + lint wrapper under the harness contract.
#
# Runs `tsc --noEmit` then the repo's own lint script (`npm run lint` -> eslint 9 flat config).
# Both always run - a lint pass that skips because typecheck failed hides the second half of the
# picture from the morning-after review. RESULT line last; missing line = FAIL.
# =================================================================================================
$ErrorActionPreference = 'Continue'
$proj = 'C:\Users\doria\web-projects\starlet-tattoos'
. (Join-Path $proj '.claude\hooks\harness-lib.ps1')

$env:Path = 'C:\Program Files\nodejs;' + $env:Path
$logDir = Join-Path $proj '.claude\joblogs'
New-Item -ItemType Directory -Force $logDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$tscLog  = Join-Path $logDir "tsc-$stamp.log"
$lintLog = Join-Path $logDir "lint-$stamp.log"

$start = Get-Date
Write-HarnessBusy -Reason 'tsc --noEmit + eslint (scripts/harness/check.ps1)' -OwnerPid $PID
try {
  Push-Location $proj
  cmd /c "npx tsc --noEmit > `"$tscLog`" 2>&1"
  $tscExit = $LASTEXITCODE
  cmd /c "npm run lint > `"$lintLog`" 2>&1"
  $lintExit = $LASTEXITCODE
  Pop-Location

  $tscErrs = 0
  if (Test-Path $tscLog) {
    $tscErrs = @(Select-String -Path $tscLog -Pattern 'error TS\d+' -ErrorAction SilentlyContinue).Count
    if ($tscExit -ne 0) { Get-Content $tscLog -Tail 30 | ForEach-Object { Write-Output ('tsc  | ' + $_) } }
  }
  if ($lintExit -ne 0 -and (Test-Path $lintLog)) {
    Get-Content $lintLog -Tail 30 | ForEach-Object { Write-Output ('lint | ' + $_) }
  }
  $dur = [int]((Get-Date) - $start).TotalSeconds

  if ($tscExit -eq 0 -and $lintExit -eq 0) {
    Write-Output ("RESULT: OK tsc=0 eslint=0 durationS=$dur logs=$logDir\*-$stamp.log")
    exit 0
  }
  Write-Output ("RESULT: FAIL tscExit=$tscExit tscErrors=$tscErrs eslintExit=$lintExit durationS=$dur logs=$logDir\*-$stamp.log")
  exit 1
} finally {
  Remove-Item (Join-Path $proj '.claude\.busy') -Force -ErrorAction SilentlyContinue
}
