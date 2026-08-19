# =================================================================================================
#  SESSION START (startup / resume / clear) - RE-ARM THE HEARTBEAT AND STATE THE BOARD
#
#  WHY THIS FILE EXISTS (2026-08-18). The user asked whether the once-and-for-all fix for harness
#  stalls is a standing rule that every turn ends by scheduling a wakeup which restarts Claude to
#  check whether the harness is genuinely idle or has failed. It is - a self-armed clock is the ONLY
#  backstop that does not share a failure mode with the hook chain, because the Stop hook runs only
#  when Claude stops and busy-watchdog.ps1 is armed BY that hook, so one broken decision path leaves
#  both unreachable. That is the same law the stale .busy taught: a watchdog whose only clock is the
#  thing it watches cannot fire once that thing goes still.
#
#  BUT THE CLOCK HAS A HOLE, AND THIS FILE IS THE PATCH. CronCreate jobs are SESSION-ONLY - "nothing
#  is written to disk, and the job is gone when Claude exits". So the heartbeat dies on exactly the
#  event the user performs most often: restarting the GUI. And SessionStart was wired ONLY with
#  matcher "compact", so a fresh start ran NO hook at all - the cron was gone and nothing said so.
#  Two independent gaps lining up to produce silence, which is how every stall in this project has
#  looked.
#
#  The pairing is deliberate and each half covers the other's gap:
#     cron               - independent wall clock, outside the hook chain, DIES ON RESTART
#     this hook (ondisk) - survives every restart, but only fires on session events
#
#  It does NOT launch the injector. SessionStart output is injected as additional context, so
#  printing IS the channel; pasting into a freshly-opened window would be a surprise, and the whole
#  reason the injector is dangerous to test is that its paste is real.
# =================================================================================================
$ErrorActionPreference = 'SilentlyContinue'
$proj = 'C:\Users\doria\web-projects\starlet-tattoos'
$board = Join-Path $proj 'docs\PHASELOG.md'

Write-Output '=== HARNESS HEARTBEAT: RE-ARM IT NOW (session-only crons do not survive a restart) ==='
Write-Output ''
Write-Output 'Both clocks Rule Zero relies on are SESSION-ONLY - a CronCreate job is never written to'
Write-Output 'disk and dies when Claude exits. If this is a fresh start, a resume or a clear, they are'
Write-Output 'GONE and nothing else will notice a dead nudge channel. Before doing anything else:'
Write-Output ''
Write-Output '  1. Call CronList.'
Write-Output '  2. If no HARNESS HEARTBEAT floor job is listed, re-arm it with CronCreate on'
Write-Output '     "11,41 * * * *" (recurring). It is the FLOOR, not the primary check - it exists'
Write-Output '     because a chain of one-shots dies silently if one turn forgets to schedule the next.'
Write-Output '  3. The PRIMARY check is a one-shot wakeup scheduled at the END OF EVERY TURN that does'
Write-Output '     not end the wave (CronCreate recurring:false, delay paced to what is being awaited).'
Write-Output '  4. The named job for both: pair the newest NUDGE/FIRE in hook-stop.log against an'
Write-Output '     "=== injector start ===" in hook-injector.log WITHIN 120 SECONDS - ordering alone is'
Write-Output '     not delivery - then reap dead .inflight/.busy markers and continue the board.'
Write-Output '  5. Do NOT arm anything if the board is awaiting a user greenlight - a finished wave gets'
Write-Output '     no timer (standing directive 2026-08-09).'
Write-Output ''

# ---- Did the nudge channel land last time? Answer it here, unprompted. -------------------------
# This is the exact comparison that would have caught the 2026-08-18 stall six days earlier: the
# stop hook logged "NUDGE: ... asking for AN2" at 03:39:35 and hook-injector.log's last entry was
# 03:25:29. A decision with no matching injector start IS a silent failure, every time.
$stopLog = Join-Path $proj '.claude\hook-stop.log'
$injLog  = Join-Path $proj '.claude\hook-injector.log'
if ((Test-Path $stopLog) -and (Test-Path $injLog)) {
  $lastDecision = $null
  foreach ($l in (Get-Content $stopLog -Tail 40)) {
    if ($l -match '^(\d\d:\d\d:\d\d)\s+(NUDGE|FIRE)') { $lastDecision = $l }
  }
  $lastInjStart = $null
  foreach ($l in (Get-Content $injLog -Tail 40)) {
    if ($l -match '^(\d\d:\d\d:\d\d)\s+=== injector start') { $lastInjStart = $l }
  }
  if ($lastDecision) {
    Write-Output '--- LAST NUDGE DECISION vs LAST INJECTOR START (a decision with no later start = SILENT FAILURE) ---'
    Write-Output ("  stop hook : " + $lastDecision)
    Write-Output ("  injector  : " + $(if ($lastInjStart) { $lastInjStart } else { '(NO injector start found in the last 40 lines)' }))
    # PAIRED WITHIN A WINDOW, NOT MERELY ORDERED. The first cut asked "is there any injector start
    # LATER than the last decision", and on its very first run it reported >>> delivered for the
    # 03:39:35 nudge that was never delivered - because an unrelated TEST run at 08:54:23, five
    # hours later, satisfies "later". That is a fence fitted to its output (law AB5): any later
    # injector activity for any reason makes it pass. Delivery means a start SOON AFTER the
    # decision, so the WINDOW is the predicate, not the ordering.
    $WindowSec = 120
    if ($lastDecision -match '^([0-9][0-9]):([0-9][0-9]):([0-9][0-9])') {
      $dT = [int]$Matches[1]*3600 + [int]$Matches[2]*60 + [int]$Matches[3]
      $paired = $false; $bestGap = -1
      foreach ($l in (Get-Content $injLog -Tail 200)) {
        if ($l -match '^([0-9][0-9]):([0-9][0-9]):([0-9][0-9])[ ]+=== injector start') {
          $iT = [int]$Matches[1]*3600 + [int]$Matches[2]*60 + [int]$Matches[3]
          $gap = $iT - $dT
          if ($gap -lt -43200) { $gap += 86400 }   # the log carries no dates; assume a midnight roll
          if ($gap -ge 0 -and $gap -le $WindowSec) { $paired = $true; $bestGap = $gap; break }
          if ($gap -ge 0 -and ($bestGap -lt 0 -or $gap -lt $bestGap)) { $bestGap = $gap }
        }
      }
      if ($paired) {
        Write-Output ('  >>> DELIVERED - injector started ' + $bestGap + 's after the decision.')
      } else {
        $g = if ($bestGap -ge 0) { '{0:N0} min' -f ($bestGap/60) } else { 'never' }
        Write-Output ('  >>> THE LAST DECISION WAS NEVER DELIVERED (nearest injector start: ' + $g + ' after; window is ' + $WindowSec + 's).')
        Write-Output '      Investigate the nudge channel BEFORE continuing the board. The 2026-08-18 defect:'
        Write-Output '      Start-Process -ArgumentList never quotes array elements containing spaces, so any'
        Write-Output '      nudge carrying a multi-word message died on binding before logging anything.'
      }
    }
    Write-Output ''
  }
}

# ---- In-flight work, because a handle is the thing a summary cannot re-derive -------------------
foreach ($f in @('.claude\.inflight', '.claude\.busy')) {
  $p = Join-Path $proj $f
  if (Test-Path $p) {
    $body = @(Get-Content $p | Where-Object { $_ -and $_ -notmatch '^\s*#' })
    if ($body.Count -gt 0) {
      Write-Output ("--- $f (declared work - verify the process is ALIVE before trusting it) ---")
      $body | ForEach-Object { Write-Output ("  " + $_) }
      Write-Output ''
    }
  }
}

# ---- Board census ------------------------------------------------------------------------------
if (Test-Path $board) {
  $c = @{}
  foreach ($s in @('complete','in_progress','pending','proposed')) { $c[$s] = 0 }
  $curr = ''; $nextPending = ''
  foreach ($l in (Get-Content $board)) {
    # PORT FIX 2026-08-19: the source kit used single literal spaces here ('\] (id) ::') while every
    # other hook parses '\]\s+(\S+)\s*::'. Column-aligned rows - the style the kit's own PHASELOG
    # template demonstrates - made this census under-count (measured: "0 pending" with A2 pending on
    # the board). Same tolerant regex as the other four parsers now; backport to the source install.
    if ($l -match '^-\s*\[(complete|in_progress|pending|proposed)\]\s+([A-Za-z0-9]+)\s*::') {
      $c[$Matches[1]]++
      if ($Matches[1] -eq 'in_progress' -and -not $curr) { $curr = $Matches[2] }
      if ($Matches[1] -eq 'pending' -and -not $nextPending -and $l -notmatch '(?i)DEFERRED|TO LAST|LAST, AFTER') {
        $nextPending = $Matches[2]
      }
    }
  }
  Write-Output ("--- BOARD: {0} complete / {1} in_progress / {2} pending / {3} proposed ---" -f $c['complete'],$c['in_progress'],$c['pending'],$c['proposed'])
  if ($curr) { Write-Output ("  in_progress -> $curr : continue it.") }
  elseif ($nextPending) { Write-Output ("  next actionable pending -> $nextPending (deferred rows skipped: board order is NOT execution order).") }
  else { Write-Output '  nothing actionable - the board is awaiting a user greenlight. Do NOT arm a timer.' }
}
exit 0
