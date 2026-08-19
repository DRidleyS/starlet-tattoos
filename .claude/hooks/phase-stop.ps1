$ErrorActionPreference = 'SilentlyContinue'
$proj     = 'C:\Users\doria\web-projects\starlet-tattoos'
$board    = Join-Path $proj 'docs\PHASELOG.md'
$marker   = Join-Path $proj '.claude\.last_compacted_phase'
$injector = Join-Path $proj '.claude\hooks\compact-injector.ps1'
$log      = Join-Path $proj '.claude\hook-stop.log'
function Log($m){ Add-Content -Path $log -Value ((Get-Date -Format 'HH:mm:ss')+'  '+$m) -Encoding utf8 }

# =============================================================================================
# THE MASTER SWITCH (user 2026-08-16: "i would like a UI ... with a simple on/off button ... so i
# can interrupt and send you messages without fighting the constant injection like i have been
# while writing this message").
#
# Checked FIRST, before the transcript read, before the board parse, before anything. The whole
# point is that a user who wants to type should not have to out-race an injector, and a switch that
# only takes effect after several hundred milliseconds of work is a switch you can lose a race to.
#
# THE DEFAULT IS OFF, AND IT IS A HEARTBEAT RATHER THAN A FLAG (user 2026-08-16: "i want the
# harness to default to off with the UI application closed"). Tools\harness_ui.ps1 REFRESHES
# .claude\.harness_on every 2 s while it is open and switched on; this hook requires the file to
# exist AND to be fresh.
#
# A flag would have been wrong in the one case that matters: the UI crashing, or the machine being
# rebooted with the flag still set, would leave the harness armed with nobody watching it. A
# heartbeat cannot do that - closing the window, killing it, or losing power all stop the refresh,
# and the harness falls silent on its own within one stale window. Off is the resting state and
# staying on requires something alive to keep saying so.
# =============================================================================================
#
# The test itself now lives in harness-lib.ps1, shared with post-compact-resume.ps1 and the UI's
# readout. A MISSING LIB IS A LOUD STOP, NOT A SILENT ONE: exiting quietly here would look exactly
# like "the harness is switched off", and the user would go hunting for a switch that was never the
# problem. The message lands in the log the UI tails, so it surfaces where they are already looking.
$lib = Join-Path $PSScriptRoot 'harness-lib.ps1'
if (-not (Test-Path $lib)) {
  Log 'FATAL: harness-lib.ps1 is MISSING - the harness cannot evaluate its own gates. Nothing sent.'
  exit 0
}
. $lib

$whyOff = Get-HarnessOffReason
if ($whyOff) {
  Log ("OFF: " + $whyOff + " - no compaction, no nudge.")
  exit 0
}

# --- TUNABLES ------------------------------------------------------------------------------
# The three percentage gates and the window size now live in harness-lib.ps1 so the UI's gauge and
# the hook's decisions cannot drift apart. Read them, do not redefine them.
#   $HarnessCompactAtPct 32  - at a phase BOUNDARY (user 2026-08-10: "anything above that i wouldnt
#                              want to start a new phase with"). A statement about the NEXT phase's
#                              headroom, not about this one's cost.
#   $HarnessCriticalPct  45  - MID-PHASE CRITICAL MASS, new 2026-08-17, tuned 55 -> 45 on 2026-08-18.
#   $HarnessBackstopPct  75  - fire regardless, so the BUILT-IN auto-compact (which picks its own
#                              moment, possibly mid-tool-call) never wins.
$WindowTokens = $HarnessWindowTokens
$CompactAtPct = $HarnessCompactAtPct
$CriticalPct  = $HarnessCriticalPct
$BackstopPct  = $HarnessBackstopPct
$MaxNudges    = 40        # runaway guard on the continue-nudge; resets when the phase id changes
$MaxNotesNudges = 3       # backstop-only escape: after this many asks, compact WITHOUT the notes

# STDIN IS READ EXACTLY ONCE, HERE. The measurement itself is Get-HarnessContextTokens in the lib;
# this only digs the transcript path out of the hook payload so the lib does not have to guess.
function Get-StdinTranscriptPath {
    try { $s = [Console]::In.ReadToEnd() } catch { $s = '' }
    if ($s -match '"transcript_path"\s*:\s*"([^"]+)"') { return ($Matches[1] -replace '\\\\', '\') }
    return ''
}

if (-not (Test-Path $board)) { exit 0 }
# TWO-TIER, SELF-VALIDATING READ - see the long note in post-compact-resume.ps1. Short version: a
# fixed line cap is a fence fitted to the file's size on the day it was written, and a 200-line cap
# was outgrown on 2026-08-15. THE FAILURE HERE WAS THE EXPENSIVE ONE: truncation does not blank
# $complete, it TRUNCATES it, so $complete[-1] silently returns an OLDER phase id. That id then
# matched the equally-stale marker, $phaseIsNew went false, and the phase loop's auto-compaction
# stopped firing for every phase past the cap - a dead engine that reports nothing.
$inBlock=$false; $complete=@(); $current=$null; $pending=@(); $proposed=@(); $sawEnd=$false
foreach ($cap in @(400, -1)) {
  $inBlock=$false; $complete=@(); $current=$null; $pending=@(); $proposed=@(); $sawEnd=$false
  $lines = if ($cap -gt 0) { Get-Content $board -TotalCount $cap } else { Get-Content $board }
  foreach ($l in $lines) {
    if ($l -match 'PHASE-BOARD-START') { $inBlock=$true; continue }
    if ($l -match 'PHASE-BOARD-END')   { $sawEnd=$true; break }
    if (-not $inBlock) { continue }
    if ($l -match '^\s*-\s*\[(complete|in_progress|pending|proposed)\]\s+(\S+)\s*::') {
      if ($Matches[1] -eq 'complete')    { $complete += $Matches[2] }
      if ($Matches[1] -eq 'in_progress') { $current   = $Matches[2] }
      if ($Matches[1] -eq 'pending')     { $pending  += $Matches[2] }
      if ($Matches[1] -eq 'proposed')    { $proposed += $Matches[2] }
    }
  }
  if ($sawEnd) { break }
}
if (-not $sawEnd) { Log "BOARD: PHASE-BOARD-END never reached - parse may be INCOMPLETE" }
# Measure ONCE and unconditionally - it consumes stdin, and the backstop needs it even
# when no phase closed this turn.
$tokens = Get-HarnessContextTokens -TranscriptPath (Get-StdinTranscriptPath)
$pct = -1
if ($tokens -gt 0) { $pct = [math]::Round(($tokens * 100.0) / $WindowTokens, 1) }

# =============================================================================================
# WHICH PHASE JUST CLOSED - BY SET DIFFERENCE, NOT BY FILE POSITION (2026-08-17)
# =============================================================================================
# The old test was `$complete[-1] -ne (Get-Content .last_compacted_phase)`, which reads "the LAST
# complete row in the FILE is not the one we last compacted for". That is only equivalent to "a
# phase just closed" while board order matches execution order, and on 2026-08-17 the user
# reordered the work (AM6 -> AM7 -> AM8 before the AN phases) while AM6's row stayed at board line
# 309 and AN1's at 358. Closing AM6 therefore left $complete[-1] reading AN1, matching the equally
# stale marker, and THE PHASE-LOOP COMPACTION STOPPED FIRING ENTIRELY - silently, with every other
# part of the harness reporting healthy. That is what let the window run to critical mass.
#
# The full rationale is in harness-lib.ps1. Here: remember the SET of ids seen complete, and treat
# anything not in it as newly closed no matter where its row sits.
#
# SEEDING IS DELIBERATELY SILENT. On the very first run after this upgrade the remembered set does
# not exist, and treating all 93 complete rows as "just closed" would fire a compaction for a phase
# that closed days ago. So the first run records the board and fires nothing.
$seen = Get-HarnessSeenComplete
if ($null -eq $seen) {
  Set-HarnessSeenComplete $complete
  $seen = $complete
  Log ("SEEDED .completed_seen with $($complete.Count) complete row(s) - nothing fires on the seeding run.")
}
$newlyComplete = @($complete | Where-Object { $seen -notcontains $_ })
$phaseIsNew = ($newlyComplete.Count -gt 0)
$justClosed = ''
if ($phaseIsNew) { $justClosed = $newlyComplete[-1] }
if ($phaseIsNew) { Log ("NEWLY COMPLETE since last compaction: " + ($newlyComplete -join ', ')) }

# Still computed for the RECON marker and for logging, where "newest row on the board" is genuinely
# what is meant. It is no longer the compaction trigger.
$newest = ''
if ($complete.Count -gt 0) { $newest = $complete[-1] }
$last = ''; if (Test-Path $marker) { $last = (Get-Content $marker -Raw).Trim() }

# Unknown context (-1) falls back to the OLD boundary-only behaviour rather than never
# compacting - a broken measurement must not silently disable the loop.
$full     = ($pct -lt 0) -or ($pct -ge $CompactAtPct)
$critical = ($pct -ge $CriticalPct)
$backstop = ($pct -ge $BackstopPct)

# =============================================================================================
# LAUNCH, AND WHY IT NOW PROVES IT WORKED  (2026-08-18)
# =============================================================================================
# THE DEFECT THIS REPLACES RAN FOR SIX DAYS AND LOGGED SUCCESS THE WHOLE TIME. Start-Process
# -ArgumentList takes an ARRAY, joins it on spaces, and does NOT quote elements that themselves
# contain spaces. So @('-Line','the phase board has no in_progress phase and ...') arrived at the
# injector as -Line the phase board has no ..., bound -Line to 'the', made the rest positional,
# and PowerShell killed the process on parameter binding BEFORE compact-injector.ps1 reached its
# first Log call. Five of the eleven Launch calls passed a multi-word -Line - the three
# preservation-notes nudges, the pending-phase nudge and the recon nudge - and every one of them
# wrote 'NUDGE: ...' to hook-stop.log and delivered NOTHING. Only the message-less calls worked,
# which is exactly why the loop ran fine mid-phase and died at every phase boundary.
#
# Measured 2026-08-18: 03:39:35 'NUDGE: no in_progress but 4 pending row(s) - asking for AN2.'
# with hook-injector.log's last entry at 03:25:29 and five hours of silence after it.
#
# TWO FIXES, AND THE SECOND MATTERS MORE THAN THE FIRST.
#   1. The line travels in a FILE. A path carries no spaces and no quoting rules, so this channel
#      cannot break the same way, and no future caller has to remember the array trap.
#   2. LAUNCH VERIFIES DELIVERY. The injector's first act is to write '=== injector start ===',
#      so a launch that produced no new line in hook-injector.log did not happen. That is checked
#      here, logged LOUDLY, and retried once with the bare message-less form - which is the one
#      shape proven to survive. The root cause was never really the quoting: it was that a dead
#      channel could report success. A launch that cannot fail visibly WILL fail invisibly, and
#      the same shape has now cost this project AN2's HLOD footprint (0 packages while 70 were
#      written), AI's silently-dead Shot, and AN1's harness measuring the wrong world.
# =============================================================================================
function Launch([string]$Mode, [string]$PhaseArg, [string]$LineArg = '',
                [string]$NotesKind = 'closed', [bool]$NotesOverride = $false) {
  $injLog   = Join-Path $proj '.claude\hook-injector.log'
  $before   = 0
  if (Test-Path $injLog) { $before = (Get-Item $injLog).Length }

  $a = @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',$injector,
         '-Phase',$PhaseArg,'-Mode',$Mode,'-NotesKind',$NotesKind)
  if ($LineArg) {
    $lineFile = Join-Path $proj '.claude\.nudge_line'
    Set-Content -Path $lineFile -Value $LineArg -Encoding utf8 -NoNewline
    $a += @('-LineFile',$lineFile)
  }
  if ($NotesOverride) { $a += '-NotesOverride' }
  Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList $a | Out-Null

  # ---- PROOF OF DELIVERY ----------------------------------------------------------------------
  # The injector logs its start line immediately, so ~6 s is generous. Waiting costs nothing: the
  # Stop hook has already decided to nudge and has nothing else to do.
  $grew = $false
  for ($i = 0; $i -lt 12; $i++) {
    Start-Sleep -Milliseconds 500
    $now = 0; if (Test-Path $injLog) { $now = (Get-Item $injLog).Length }
    if ($now -gt $before) { $grew = $true; break }
  }
  if ($grew) { return $true }

  Log "LAUNCH FAILED: injector wrote nothing to hook-injector.log within 6s (mode=$Mode phase=$PhaseArg lineChars=$($LineArg.Length)) - RETRYING BARE"
  $b = @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',$injector,
         '-Phase',$PhaseArg,'-Mode',$Mode,'-NotesKind',$NotesKind)
  if ($NotesOverride) { $b += '-NotesOverride' }
  Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList $b | Out-Null
  for ($i = 0; $i -lt 12; $i++) {
    Start-Sleep -Milliseconds 500
    $now = 0; if (Test-Path $injLog) { $now = (Get-Item $injLog).Length }
    if ($now -gt $before) { Log 'LAUNCH RECOVERED: bare retry reached the injector'; return $true }
  }
  Log 'LAUNCH FAILED TWICE: the nudge channel is DEAD - the loop will stall until this is fixed'
  return $false
}

# =============================================================================================
# THE PRESERVATION-NOTES GATE  (user 2026-08-17: "it should not be possible for you to claim youre
# ready for a compaction without ever writing context preservation notes")
# =============================================================================================
# The predicate lives in harness-lib.ps1 and is enforced AGAIN inside compact-injector.ps1, at the
# single point where /compact is actually typed - the same choke-point discipline the busy gate
# learned the hard way. Here it only chooses WHICH message to send, because a gate that blocks
# without saying what it wants is a gate that strands the loop.
#
# THE NUDGE QUOTES THE LITERAL TOKEN IT REQUIRES. A fence whose remedy has to be guessed gets
# guessed wrong, and this one is checked by string match - so it states the exact string.
$gapState = Join-Path $proj '.claude\.notes_gap_state'
# PARSED ON THE LAST DELIMITER, NOT BY FIELD COUNT. The first cut split on '|' and required exactly
# two fields, while the caller built its key as 'backstop|<phase>' - so the stored record
# 'backstop|AM7|1' split into THREE, the count test never matched, the streak read 0 forever and the
# backstop's escape hatch could never fire. It failed silently and in the safe-looking direction:
# the harness would have gone on politely asking for notes while the window filled and the built-in
# auto-compaction took the decision away from it. Caught by the test rig, not by reading.
function Get-GapStreak([string]$key) {
  $v = ''; if (Test-Path $gapState) { $v = ([string](Get-Content $gapState -Raw)).Trim() }
  $i = $v.LastIndexOf('|')
  if ($i -gt 0 -and $v.Substring(0,$i) -eq $key) {
    try { return [int]$v.Substring($i+1) } catch { return 0 }
  }
  return 0
}
function Set-GapStreak([string]$key, [int]$n) {
  Set-Content -Path $gapState -Value ($key + '|' + $n) -Encoding utf8 -NoNewline
}

# THE STALE VARIANT OF THE ASK (2026-08-18): the token exists but the section is byte-identical to
# what the last compaction consumed. The remedy is different from the token gap's - not "write the
# token" but "refresh the content" - and an ask whose remedy has to be guessed gets guessed wrong,
# so it gets its own line.
function Build-FreshLine([string]$ph, [double]$p, [bool]$urgent) {
  $u = if ($urgent) { 'THE WINDOW IS NEARLY FULL - this is the last ask before the harness compacts anyway. ' } else { '' }
  return ($u + "PRESERVATION NOTES ARE STALE at $p% context: the '## Preservation notes' section of " +
    "docs/PHASELOG.md is byte-identical to what the LAST compaction already consumed, so everything " +
    "learned since then lives only in this context and dies at the next compaction. Refresh the stamp " +
    "for phase $ph NOW - keep its literal token, update the content (new measurements, handles, file " +
    "paths, decisions, next steps), confirm .claude/.inflight matches what is actually running - then " +
    "END YOUR TURN and start nothing new. The compaction fires on your next stop once the section has changed.")
}

function Build-NotesLine([string]$ph, [string]$kind, [string]$gap, [double]$p, [bool]$urgent) {
  if ($kind -eq 'inflight') {
    $u = if ($urgent) { 'THE WINDOW IS NEARLY FULL - this is the last ask before the harness compacts without notes. ' } else { '' }
    return ($u + "CONTEXT HAS HIT CRITICAL MASS AT $p% while phase $ph is still in_progress. " +
      "Stop feature work now and do these four things in order, then END YOUR TURN - do not start anything new. " +
      "(1) Write the preservation notes for the IN-FLIGHT phase into the '## Preservation notes for next compaction' " +
      "section of docs/PHASELOG.md. They MUST contain the literal token '$ph IN FLIGHT' - the harness greps for " +
      "exactly that string and will not compact without it. Lead with what cannot be re-derived: run ids, script " +
      "paths, file paths, the measurement you are mid-way through, and what you were about to do next. " +
      "(2) SPLIT THE PHASE on the board: close the part that is genuinely finished as its own row, and add the " +
      "remainder as a new pending row with a real description, so the split is visible on the board rather than " +
      "only in your head. (3) Declare any background work in .claude/.inflight, one line per item. " +
      "(4) End the turn. The harness compacts on the next Stop once the token is present. Currently: $gap")
  }
  $u = if ($urgent) { 'THE WINDOW IS NEARLY FULL - this is the last ask before the harness compacts without notes. ' } else { '' }
  return ($u + "Phase $ph is marked complete and context is at $p%, so the harness is ready to compact - but " +
    "THE PRESERVATION NOTES ARE NOT WRITTEN, so it will not. $gap. " +
    "Write them now, then END YOUR TURN. (1) Refresh the '## Preservation notes for next compaction' section of " +
    "docs/PHASELOG.md with a stamp containing the literal token '$ph CLOSED' - the harness greps for exactly that " +
    "string. Lead with what a fresh context could not re-derive. (2) Write the phase's narrative and evidence into " +
    "its wave file under docs/phases/, under a heading that STARTS with '$ph'. (3) Update the ONE circle-back " +
    "ledger in place. Then end the turn and the harness will compact.")
}

# =============================================================================================
# COOK / BUILD AWARENESS (user 2026-08-16: "we need to adjust the tooling so it doesnt spam you
# during cooks. phase-aware and cook-aware if you will").
#
# THE DEFECT. The nudge fires on every Stop, and a Stop happens every time the turn ends -
# INCLUDING when the turn ended because a build, cook or packaged QA battery is running and there
# is genuinely nothing to do but wait. During AL4 that produced a dozen consecutive turns whose
# entire content was "still running", each one burning a nudge off the runaway cap and a slice of
# context, and each one making the transcript harder to read for the one thing that mattered.
#
# WHY SILENCE IS SAFE HERE, which is the whole reason this gate can exist at all: a background job
# started with run_in_background RE-INVOKES Claude when it exits. During a build the notification
# IS the wake signal, so the nudge is not merely noisy - it is redundant. The nudge exists for the
# case where nothing else will wake the loop, and that case is exactly "no long job is running".
#
# TWO WAYS TO BE BUSY, because neither alone is honest:
#   1. A known long-running TOOL is alive. This is automatic and needs no discipline from future
#      scripts. The editor is deliberately NOT in the list - it is open for most of a normal phase,
#      and gating on it would silence the loop permanently.
#   2. A script declared it, by writing .claude\.busy with a one-line reason. That covers work the
#      process list cannot see (a long MCP operation, a remote job).
#
# AND A CAP ON BOTH, because a gate with no escape is how a loop dies quietly: after
# $MaxBusySuppress consecutive suppressions the hook nudges ANYWAY, and a .busy marker older than
# $BusyMarkerMaxMin is ignored outright. A hung cook must surface as a nudge, not as silence.
# =============================================================================================
$MaxBusySuppress  = 30    # ~30 stops of quiet is far longer than any real build; past that, speak up

# The busy test itself is in harness-lib.ps1 (dot-sourced above), shared with the post-compact wake
# path and the UI's readout. It used to be an inline copy carrying a comment promising to keep it in
# step with the UI by hand; a third consumer would have made that promise a fiction.
$busyStateFile = Join-Path $proj '.claude\.busy_state'
function Test-ShouldSuppressNudge {
  $reason = Get-HarnessBusyReason
  if (-not $reason) {
    # Not busy: clear the streak so the next cook starts from a full allowance.
    Remove-Item $busyStateFile -Force -ErrorAction SilentlyContinue
    return $false
  }
  # Parsed defensively: a zero-byte or half-written state file must not throw inside a Stop hook.
  # A hook that dies here takes the whole loop with it, and it would do so silently.
  $count = 0
  if (Test-Path $busyStateFile) {
    try { $count = [int](([string](Get-Content $busyStateFile -Raw)).Trim()) } catch { $count = 0 }
  }
  $count++
  Set-Content -Path $busyStateFile -Value $count -Encoding utf8 -NoNewline
  if ($count -gt $MaxBusySuppress) {
    Log "BUSY but suppression cap hit ($count > $MaxBusySuppress) - $reason - nudging anyway; this job may be hung."
    return $false
  }
  Log "QUIET ($count/$MaxBusySuppress): $reason - the completion notification is the wake signal. No nudge."
  # ARM THE ONLY CLOCK THE LOOP HAS. Deciding to stay quiet is a promise that something else will
  # wake the agent - and on 2026-08-18 nothing did: the job had already finished, its marker was
  # stale, and because the agent was stopped there were no further stops for the suppression cap
  # or the staleness test to run in. Both backstops are counted in stops. This one is counted in
  # MINUTES, by a detached process that does not need the agent to be alive, and it stands down the
  # instant a real stop supersedes it.
  $watchdog = Join-Path $proj '.claude/hooks/busy-watchdog.ps1'
  Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @(
    '-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',$watchdog) | Out-Null
  return $true
}

# =============================================================================================
# THE BUSY GATE COVERS NUDGES, NOT COMPACTIONS. THIS ORDERING IS THE 2026-08-18 EVENING FIX,
# AND IT REVERSES HALF OF THE 2026-08-16 ONE - measured, not re-litigated:
#
# 2026-08-16 moved the gate ABOVE the compaction branches because "the compaction path ends in a
# nudge": Launch 'compact' compacted and then PASTED a resume mid-cook, waking Claude to re-read a
# cook with 40 minutes left. The same day the injector grew its own paste gate - it now compacts
# and DEFERS the resume paste until the busy state clears. That second fix quietly removed the
# reason for the first, and nobody moved the gate back.
#
# THE STARVATION THAT PAID FOR THIS COMMENT (user, 2026-08-18 evening: "it looks like a harness
# failure to me" - and it was): a healthy autonomous loop is busy at almost EVERY stop, because
# ending the turn on a declared background job is exactly what the cook-in-flight rule demands. So
# a busy gate that also guards compaction starves it indefinitely on a well-behaved loop. Measured:
# AO0c, AO0d and AO0e all closed with stamps written, 'NEWLY COMPLETE' logged at 20:56, 20:58,
# 21:04 and 21:10 - and every one of those stops was QUIET because a declared job was alive. Three
# closed phases uncompacted, the window at critical mass, and the user compacting BY HAND - the
# thing this entire harness exists to make unnecessary.
#
# THE RULE THAT REPLACES IT: a compaction whose preservation tokens are PRESENT is safe while
# declared work runs - .inflight carries the handles, the stamp carries the plan, and background
# tasks survive compaction by construction (proven twice today: a photo boot survived a full
# session REWIND; the ship cook ran through the manual split-and-compact untouched). So the
# boundary and critical-mass branches now sit ABOVE the busy gate, exactly like the backstop:
#   - tokens present -> compact NOW, busy or not; the injector's paste gate keeps it silent and
#     the job's completion notification remains the only wake signal.
#   - tokens OWED -> ask for them even while busy (the ask is one cheap turn that writes notes,
#     splits the board and ends - it starts nothing, so it cannot corrupt a running measurement),
#     but capped at $MaxNotesNudges per phase while busy so an unresponsive loop is not spammed;
#     past the cap the 75% backstop remains the escape.
# Only the WAVE-MOVEMENT nudges ("begin the next phase", recon) stay below the gate: those wake
# Claude to START work, which is precisely what must not happen during a measurement.
#
# Evaluated ONCE, before any branch, because Test-ShouldSuppressNudge advances the suppression
# streak as a side effect and must run exactly once per Stop.
# =============================================================================================
$busySuppress = Test-ShouldSuppressNudge

# ---- BACKSTOP: the window is nearly full, and this is the ONE path with an escape hatch --------
# Past $BackstopPct the built-in auto-compaction will fire on its own at a moment of its choosing,
# possibly mid-tool-call. Ours is strictly better-timed, so a full window outranks both "prefer not
# to compact mid-workflow" and, after $MaxNotesNudges asks, the notes gate itself. Blocking forever
# here would simply hand the compaction to the built-in and lose the notes AND the timing.
if ($backstop) {
  $bPhase = if ($current) { $current } else { $justClosed }
  $bKind  = if ($current) { 'inflight' } else { 'closed' }
  $bGap   = Get-HarnessNotesGap -Phase $bPhase -Kind $bKind
  $bStale = ''
  if (-not $bGap) { $bStale = Get-HarnessNotesStale; $bGap = $bStale }
  if ($bGap -and $bPhase) {
    $k = 'backstop|' + $bPhase
    $n = (Get-GapStreak $k) + 1
    Set-GapStreak $k $n
    if ($n -le $MaxNotesNudges) {
      Log "BACKSTOP $pct% but NOTES $(if ($bStale) { 'STALE' } else { 'OWED' }) ($n/$MaxNotesNudges): $bGap - asking for them before compacting"
      $bLine = if ($bStale) { Build-FreshLine $bPhase $pct $true } else { Build-NotesLine $bPhase $bKind $bGap $pct $true }
      Launch 'resume' $bPhase $bLine $bKind
      exit 0
    }
    Log "BACKSTOP $pct%: notes STILL owed after $MaxNotesNudges asks - COMPACTING ANYWAY (a full window outranks the notes gate). $bGap"
    Launch 'compact' $bPhase '' $bKind $true
    exit 0
  }
  Log "FIRE (BACKSTOP): context $tokens tok = $pct% (>= $BackstopPct%) phase $bPhase - compacting at OUR moment before the built-in picks its own (busy state ignored: a full window outranks a running job)"
  Launch 'compact' $bPhase '' $bKind
  exit 0
}

# ---- PHASE BOUNDARY: the cheapest possible moment to compact - ABOVE the busy gate (2026-08-18:
# ---- three closed phases starved uncompacted behind it; tokens present = compaction is safe, and
# ---- the injector's own paste gate keeps it silent while the job runs) --------------------------
if ($phaseIsNew -and $full) {
  $gap = Get-HarnessNotesGap -Phase $justClosed -Kind 'closed'
  $gapStale = ''
  if (-not $gap) { $gapStale = Get-HarnessNotesStale; $gap = $gapStale }
  if ($gap) {
    $k = 'boundary|' + $justClosed
    $n = (Get-GapStreak $k) + 1
    if ($busySuppress -and $n -gt $MaxNotesNudges) {
      Log "BOUNDARY $justClosed at $pct%: notes $(if ($gapStale) { 'stale' } else { 'owed' }), busy, and already asked $MaxNotesNudges times - staying quiet (the 75% backstop is the escape)"
    } else {
      Set-GapStreak $k $n
      Log "BOUNDARY $justClosed at $pct% but NOTES $(if ($gapStale) { 'STALE' } else { 'OWED' }) ($n): $gap - asking for them instead of compacting"
      $gLine = if ($gapStale) { Build-FreshLine $justClosed $pct $false } else { Build-NotesLine $justClosed 'closed' $gap $pct $false }
      Launch 'resume' $justClosed $gLine
      exit 0
    }
  } else {
    Log "FIRE: phase $justClosed complete, context $tokens tok = $pct% (>= $CompactAtPct%) - launching injector$(if ($busySuppress) { ' (busy: the injector defers the resume paste; the compaction itself is safe - .inflight carries the handles)' })"
    Launch 'compact' $justClosed '' 'closed'
    exit 0
  }
}

# ---- MID-PHASE CRITICAL MASS - also ABOVE the busy gate, same law, full rationale in the block
# ---- comment further down (kept there so the history of the 45% rule stays in one place) --------
if ($current -and $critical) {
  $gap = Get-HarnessNotesGap -Phase $current -Kind 'inflight'
  $gapStale = ''
  if (-not $gap) { $gapStale = Get-HarnessNotesStale; $gap = $gapStale }
  if ($gap) {
    $k = 'critical|' + $current
    $n = (Get-GapStreak $k) + 1
    if ($busySuppress -and $n -gt $MaxNotesNudges) {
      Log "CRITICAL MASS $pct% mid-phase ${current}: notes $(if ($gapStale) { 'stale' } else { 'owed' }), busy, asked $MaxNotesNudges times - staying quiet (backstop is the escape)"
    } else {
      Set-GapStreak $k $n
      Log "CRITICAL MASS: $pct% (>= $CriticalPct%) mid-phase $current and notes $(if ($gapStale) { 'STALE - unchanged since the last compaction consumed them' } else { 'not written' }) ($n) - asking for $(if ($gapStale) { 'a stamp refresh' } else { 'notes + a phase SPLIT' })"
      $gLine = if ($gapStale) { Build-FreshLine $current $pct $false } else { Build-NotesLine $current 'inflight' $gap $pct $false }
      Launch 'resume' $current $gLine 'inflight'
      exit 0
    }
  } else {
    Log "FIRE (CRITICAL MASS): $pct% mid-phase $current, notes present - compacting now$(if ($busySuppress) { ' (busy: paste deferred by the injector; compaction itself is safe)' })"
    Launch 'compact' $current '' 'inflight'
    exit 0
  }
}

if ($busySuppress) { exit 0 }

# =============================================================================================
# MID-PHASE CRITICAL MASS  (user 2026-08-17 at 55%, retuned by them to 45% on 2026-08-18)
# =============================================================================================
# THE GAP THIS FILLS, in the user's words: "you need an 'okay the context has hit critical mass
# mid-phase and i need to write preservation notes and split the phase so i can compact via the
# harness NOW'... what all just happened is not acceptable and im almost certain its because the
# context grew like a cancer over the length of that phase."
#
# It is exactly right. Before this, a phase had only two exits: close it (32% boundary) or hit the
# 75% backstop, which compacts with whatever notes happen to exist. A phase that ran long simply
# accumulated - and AM6 ran very long, because it contained a builder written from scratch, six
# defects, a runaway and an undo. Nothing in the loop could say "this phase is too big, cut it".
#
# CRITICAL MASS IS DELIBERATELY NOT A COMPACTION - IT IS AN ORDER TO PREPARE ONE. Compacting silently
# mid-phase is how in-flight work gets orphaned (2026-08-16, six agents). So this branch asks for
# the two things that make a mid-phase compaction safe - notes that name what cannot be re-derived,
# and a board SPLIT so the remainder survives as a real pending row - and only then, on the next
# Stop with the token present, does it compact. Two turns, both cheap, and the loop never loses its
# place. Sitting at critical mass having ignored the ask is not a stall either: the window keeps growing and
# the backstop takes over at 75%.
#
# 2026-08-18 EVENING: the EXECUTABLE half of this branch moved ABOVE the busy gate (see the gate's
# own comment for the starvation that forced it). This comment block stays here so the 45% rule's
# history lives in one place.

# ---------------------------------------------------------------------------------------------
# NOT COMPACTING - so KEEP THE WAVE MOVING (user 2026-08-10).
# This branch used to `exit 0` and the loop simply died: the compaction path had an injector to
# wake Claude and the deferral path had nothing, so an autonomous wave stopped dead at the first
# boundary under the threshold. The nudge is the same injector in 'resume' mode. No wakeup, no
# cron - the standing 2026-08-09 "never schedule wakeups" directive stays intact.
# ---------------------------------------------------------------------------------------------

# NO in_progress PHASE = the wave is genuinely finished, and there are THREE different states
# hiding behind that, which this branch used to collapse into one silent exit.
#
# THE DEFECT (found 2026-08-12, user: "im worried the tooling ... never prompts you to start the
# recon pass"). The recon request lived ONLY in post-compact-resume.ps1, which fires only on
# SessionStart:compact. So the tech-debt recon pass was reachable exclusively by going THROUGH a
# compaction: a wave that finished under the 32% threshold exited here in silence and nobody ever
# asked for it. The user's fear was an indefinite "continue the in_progress phase" loop - that one
# cannot happen (the nudge needs an in_progress row, and is capped at MaxNudges anyway) - but the
# consequence they predicted was real and arrived by this other road.
#
# The three states, in the order they occur:
#   1. pending rows remain  -> the wave is not finished; the next phase is documented and approved.
#                              Ask for it by name rather than saying nothing.
#   2. board all complete   -> ask for the tech-debt recon pass, ONCE.
#   3. proposals on the board (or recon already requested for this board) -> SILENT. Proposals await
#                              a greenlight, and a greenlight is the user's to give. Asking again
#                              would rewrite the very proposals they have not answered yet.
#
# "ONCE" is enforced by a marker holding the newest complete phase id at the time recon was asked
# for. It advances only here, so re-asking requires the board to actually move on.
if (-not $current) {
  $reconMark = Join-Path $proj '.claude\.last_recon_board'
  $askedFor  = ''; if (Test-Path $reconMark) { $askedFor = (Get-Content $reconMark -Raw).Trim() }

  if ($proposed.Count -gt 0) {
    Log "STOP: $($proposed.Count) proposed row(s) on the board - awaiting the user's greenlight. No nudge."
    exit 0
  }
  if ($pending.Count -gt 0) {
    # WHICH PENDING PHASE IS NEXT IS NOT THE FIRST ROW IN THE FILE. Same law the closed-phase
    # detector already learned on 2026-08-17 ("a set difference, never a file position"), never
    # applied to this end of the board until it bit. On 2026-08-18 this asked for AN2 - the ONE
    # phase the user had explicitly deferred to LAST - purely because its row sits at line 368,
    # above AN4/AN5/AN6. Board order is not execution order and never was.
    #
    # The predicate reads the board's own words rather than hardcoding an id: a row that says it
    # is deferred is not the next one. If every pending row is deferred, fall back to the first
    # so the loop still moves rather than stalling on a technicality.
    $notDeferred = @($pending | Where-Object { $_ -notmatch '(?i)DEFERRED|TO LAST|LAST, AFTER' })
    $nextPhase = if ($notDeferred.Count -gt 0) { $notDeferred[0] } else { $pending[0] }
    $skipped = $pending.Count - $notDeferred.Count
    $note = if ($skipped -gt 0) { " (skipped $skipped deferred row(s))" } else { '' }
    Log "NUDGE: no in_progress but $($pending.Count) pending row(s) - asking for $nextPhase$note."
    Launch 'resume' $newest ("the phase board in docs/PHASELOG.md has no in_progress phase. The next actionable pending phase is $nextPhase - mark it in_progress and begin it. Respect any deferral notes on the board: a row marked DEFERRED or TO LAST is not next.")
    exit 0
  }
  if ($newest -ne '' -and $askedFor -ne $newest) {
    Set-Content -Path $reconMark -Value $newest -Encoding utf8 -NoNewline
    Log "NUDGE (RECON): board all complete through $newest and recon not yet requested for it - asking for the tech-debt recon pass."
    Launch 'resume' $newest 'the phase board in docs/PHASELOG.md is fully complete - no in_progress and no pending phase. Per the user directive of 2026-08-10: explore the project for technical debt, write the proposed phases onto the board as [proposed] rows with real descriptions, then STOP and present them for greenlight. Recon is read-only; do NOT begin building unapproved work.'
    exit 0
  }
  Log "STOP: board complete through $newest, recon already requested for this board. Waiting for the user. No nudge."
  exit 0
}

# Runaway guard: count consecutive nudges against THIS phase id, reset whenever the phase changes.
# A long phase legitimately needs many turns; a stuck one must not ping-pong forever.
$nudgeFile = Join-Path $proj '.claude\.nudge_state'
$nCount = 0; $nPhase = ''
if (Test-Path $nudgeFile) {
  $parts = ((Get-Content $nudgeFile -Raw).Trim() -split '\|')
  if ($parts.Count -eq 2) { $nPhase = $parts[0]; $nCount = [int]$parts[1] }
}
if ($nPhase -ne $current) { $nPhase = $current; $nCount = 0 }
$nCount++
Set-Content -Path $nudgeFile -Value ($nPhase + '|' + $nCount) -Encoding utf8 -NoNewline

if ($nCount -gt $MaxNudges) {
  Log "STOP: nudge cap hit ($nCount > $MaxNudges) on phase $current - something is stuck, not nudging again."
  exit 0
}

$why = "mid-phase $current at $pct%"
if ($phaseIsNew) { $why = "phase $newest complete but only $pct% (< $CompactAtPct%) - no compaction needed" }
Log "NUDGE ($nCount/$MaxNudges): $why - sending continue"
Launch 'resume' $current
exit 0
