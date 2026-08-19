# =================================================================================================
#  busy-watchdog.ps1 -- THE PHASE LOOP'S ONLY CLOCK.
#
#  WHY IT EXISTS (2026-08-18, and the user's words are the spec: "the whole point of the automation
#  harness is that you dont hang up at 1am like you do every single night").
#
#  phase-stop.ps1 runs ONLY when the agent stops. That is fine while the agent is producing stops -
#  but the moment it goes quiet believing a job will wake it, the harness has no clock at all. Both
#  of the existing backstops are counted in STOPS (the 30-suppression cap) or evaluated ON a stop
#  (the marker staleness test), so both are unreachable in exactly the situation they were written
#  for. Measured that night: a cook finished at 00:16, its .busy marker was never deleted, the 00:40
#  stop read the stale marker and printed "QUIET (11/30) ... No nudge", and nothing ever ran again.
#
#  harness-lib.ps1 now reaps a marker with no job process behind it, which fixes that specific
#  night. THIS fixes the class: a suppression that nothing is guaranteed to revisit. When the stop
#  hook decides to stay quiet, it arms this watchdog, and this watchdog re-checks on a wall clock
#  the agent does not have to be alive to advance.
#
#  IT IS NOT AN AIMLESS WAKEUP (2026-08-09 directive, scoped 2026-08-10). It has a named job it
#  performs itself: re-evaluate the busy state and, if the job is gone while a phase is still
#  in_progress, send the continue the stop hook declined to send. It never waits on the user, and it
#  exits the moment a real stop supersedes it.
#
#  SUPERSESSION IS OBSERVED, NOT ASSUMED: it records hook-stop.log's write time when it arms, and any
#  change means a newer stop already made this decision with fresher information. That is the same
#  discipline as "which phase just closed is a set difference, never a file position" - watch for the
#  transition, do not infer it.
# =================================================================================================
param(
  [int]$CheckEveryMin = 8,
  [int]$MaxChecks = 12          # ~96 min of cover; past that a human should be looking at it anyway
)

$ErrorActionPreference = 'SilentlyContinue'
$proj = 'C:\Users\doria\web-projects\starlet-tattoos'
. (Join-Path $proj '.claude\hooks\harness-lib.ps1')

$lockFile = Join-Path $proj '.claude\.busywatch.lock'
$stopLog  = Join-Path $proj '.claude\hook-stop.log'
$injector = Join-Path $proj '.claude\hooks\compact-injector.ps1'
$board    = Join-Path $proj 'docs\PHASELOG.md'

function WLog([string]$m) { Write-HarnessLog ("WATCHDOG: " + $m) }

# ---- ONE AT A TIME, AND SELF-HEALING BY CONSTRUCTION -------------------------------------------
# PID + process start time, so a lock whose owner died reads as free with nobody having to release
# it. Copied deliberately from Test-HarnessInjectorLive rather than invented: the .busy marker this
# whole script exists to backstop is what a lock WITHOUT that property looks like after a crash.
if (Test-Path $lockFile) {
  $parts = ((Get-Content $lockFile -Raw).Trim() -split '\|')
  if ($parts.Count -eq 2) {
    $op = Get-Process -Id ([int]$parts[0]) -ErrorAction SilentlyContinue
    if ($op -and ($op.StartTime.ToString('o') -eq $parts[1])) { exit 0 }   # a live watchdog already has this
  }
}
$me = Get-Process -Id $PID
Set-Content -Path $lockFile -Value ($PID.ToString() + '|' + $me.StartTime.ToString('o')) -Encoding utf8 -NoNewline

$armedStamp = ''
if (Test-Path $stopLog) { $armedStamp = (Get-Item $stopLog).LastWriteTime.ToString('o') }

for ($i = 1; $i -le $MaxChecks; $i++) {
  Start-Sleep -Seconds ($CheckEveryMin * 60)

  # A newer stop means the agent is alive and the hook has already decided. Stand down.
  if (Test-Path $stopLog) {
    $now = (Get-Item $stopLog).LastWriteTime.ToString('o')
    if ($now -ne $armedStamp) { Remove-Item $lockFile -Force -ErrorAction SilentlyContinue; exit 0 }
  }

  # Still genuinely busy? Then the suppression was correct and remains correct.
  $busy = Get-HarnessBusyReason
  if ($busy) { continue }

  # Not busy, and no stop has happened since we armed: the job ended without waking anyone.
  if (-not (Test-Path $board)) { break }
  $current = ''
  foreach ($l in (Get-Content $board)) {
    if ($l -match '^\s*-\s*\[in_progress\]\s+(\S+)\s*::') { $current = $Matches[1]; break }
    if ($l -match '<!-- PHASE-BOARD-END -->') { break }
  }
  if (-not $current) {
    WLog "job ended and no phase is in_progress - nothing to continue, standing down."
    break
  }

  if (Get-HarnessOffReason) { WLog "job ended but the harness is switched off - not nudging."; break }
  if (Test-HarnessInjectorLive) { WLog "job ended but an injector is already waiting - it sends, not us."; break }

  WLog ("job ended with no stop for {0} min and phase {1} still in_progress - sending the continue the stop hook declined." -f ($i * $CheckEveryMin), $current)
  $a = @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',$injector,
         '-Phase',$current,'-Mode','resume')
  Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList $a | Out-Null
  break
}

Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
exit 0
