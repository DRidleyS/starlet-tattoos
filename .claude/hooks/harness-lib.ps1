# =================================================================================================
# harness-lib.ps1 -- THE single definition of the harness's shared predicates.
#
# WHY IT EXISTS. Three files had to agree on "is the harness armed" and "is the machine busy":
# phase-stop.ps1 (which acts on them), post-compact-resume.ps1 (which now also acts on them), and
# Tools\harness_ui.ps1 (which REPORTS them to the user). Two hand-synced copies were already carrying
# a comment promising to keep them in step by hand; a third would have made that promise a fiction.
# A readout that disagrees with the hook it is reporting on is worse than no readout, because it is
# believed. One definition, three consumers.
#
# LOADING CONTRACT. Every consumer dot-sources this and must treat a MISSING lib as a loud, logged
# stop - never as a silent skip. A hook that half-loads and then calls an undefined function dies
# mid-way with $ErrorActionPreference='SilentlyContinue' swallowing the reason, which is exactly the
# failure mode this project keeps paying for: a dead engine that reports nothing.
#
# PORTED 2026-08-19 from the EXFIL/SIGHTHOUNDS install (see D:\claude-phase-harness\BLUEPRINT.md).
# Port adaptations are marked with "PORT:" comments; everything else is verbatim on purpose -
# every mechanism here is a scar from a measured failure in the source project.
# =================================================================================================

$HarnessProj = 'C:\Users\doria\web-projects\starlet-tattoos'

# PORT: the Node-stack busy list is EMPTY by design (PORTING.md #2): `node` is far too common to be
# a reliable busy signal - our own tooling runs node constantly, and a resident dev server would
# silence the harness forever (the same failure the UnrealEditor exclusion avoided in the source
# project). This stack's long jobs (next build ~1-2 min, lint/typecheck ~30-60 s) are declared by
# the wrapper scripts in scripts\harness\ via Write-HarnessBusy, which is the designed-for path.
# The name list exists only as a net under forgetting, and this project has nothing unmistakable
# to put in it yet. If Playwright or a similar genuinely-long unmistakable process joins the stack,
# add it here.
$HarnessBusyProcs = @()

# HOW LONG A DECLARED-BUSY MARKER IS BELIEVED WHEN NO JOB PROCESS IS VISIBLE.
#
# This replaced a 90-minute ceiling, and the old one was REMOVED rather than left standing beside
# it: a superseded gate that still runs is a second answer to a question that now has one (AJ).
$HarnessBusyGraceMin = 6

# Where the reap announces itself. Silent self-healing is how you get a harness nobody can debug.
$HarnessStopLog = Join-Path $HarnessProj '.claude/hook-stop.log'
function Write-HarnessLog([string]$Message) {
  try { Add-Content -Path $HarnessStopLog -Value ((Get-Date -Format 'HH:mm:ss') + '  ' + $Message) -Encoding utf8 } catch { }
}

# ---- THE MASTER SWITCH ---------------------------------------------------------------------------
# Returns '' when the harness is ARMED, or a human-readable reason when it is not.
#
# A HEARTBEAT, NOT A FLAG. Tools\harness_ui.ps1 rewrites .harness_on every 2 s while open and switched
# on. A flag would have been wrong in the one case that matters: the UI crashing, or the machine
# rebooting with the flag still set, would leave the harness armed with nobody watching it. Off is the
# resting state, and staying on requires something alive to keep saying so.
function Get-HarnessOffReason {
  $onFile = Join-Path $HarnessProj '.claude\.harness_on'
  if (-not (Test-Path $onFile)) { return 'no .harness_on - the harness UI is closed or switched off' }
  $age = ((Get-Date) - (Get-Item $onFile).LastWriteTime).TotalSeconds
  if ($age -gt 20) { return ('.harness_on is stale by {0:N0}s - the UI is gone, not merely idle' -f $age) }
  return ''
}

# ---- COOK / BUILD AWARENESS ----------------------------------------------------------------------
# Returns '' when idle, or the reason when busy. Two ways to be busy, because neither alone is honest:
#   1. A known long-running TOOL is alive - automatic, needs no discipline from future scripts.
#      (PORT: list is empty for this stack - see $HarnessBusyProcs above.)
#   2. A script DECLARED it, by writing .claude\.busy with a one-line reason - covers work the process
#      list cannot see (a long MCP operation, a remote job). On this stack this is the PRIMARY signal.
#
# PORT: Test-HarnessUATAlive is NEUTERED here, deliberately. In the source project it disambiguated
# `dotnet AutomationTool.dll` cooks by command line. On THIS machine the EXFIL project still exists
# and still cooks - and an EXFIL cook is not starlet-tattoos work. Detecting it here would silence
# THIS project's harness whenever the OTHER project is busy, which is cross-project contamination,
# not cook-awareness. The original lesson (a marker-less detector goes blind between job steps)
# still stands and is carried by the owned .busy marker path below.
function Test-HarnessUATAlive {
  return $false
}

function Write-HarnessBusy {
  # WRITE A MARKER THAT NAMES ITS OWNER, so the gate can ASK instead of INFER (2026-08-18).
  #
  # Format: "<PID>|<StartTicks>|<reason>" on one line. The start ticks defeat PID reuse, exactly as
  # Test-HarnessInjectorLive already does for the injector lock - copied deliberately rather than
  # invented, because that lock is the one marker in this harness that has never rotted.
  #
  # Callers should pass the PID of the process that OWNS the job (the script or the task), not a
  # child it happens to spawn. A batched job's children come and go; its owner does not.
  param([Parameter(Mandatory=$true)][string]$Reason, [int]$OwnerPid = $PID)
  $busyFile = Join-Path $HarnessProj '.claude/.busy'
  $ticks = 0
  try { $ticks = (Get-Process -Id $OwnerPid -ErrorAction Stop).StartTime.Ticks } catch { }
  Set-Content -Path $busyFile -Value ("{0}|{1}|{2}" -f $OwnerPid, $ticks, $Reason) -Encoding utf8 -NoNewline
}

function Get-HarnessBusyReason {
  # ---- 1. ASK THE MARKER WHO OWNS IT, BEFORE GUESSING FROM PROCESS NAMES ------------------------
  #
  # THE DEFECT THIS FIXES WAS MEASURED ON 2026-08-18 AND IT IS THE OPPOSITE FAILURE FROM THE ONE
  # BELOW. At 09:35:41 this function logged "STALE .busy REAPED after 28 min with no job process
  # alive" for AN4's per-player measurement - and at 09:39:43 the stop hook reported
  # "running: SighthoundsEOS", with the job not actually finishing until ~09:52. The marker was
  # reaped with SEVENTEEN MINUTES of work left.
  #
  # Cause: the name list below is a list of GAME AND BUILD process names, and AN4's job was a
  # PowerShell script running THREE SEQUENTIAL BOOTS. Between boots there is a real window in which
  # no game process exists at all, and the reaper landed in one. A gate that infers "is my job
  # alive?" from a hardcoded list of names cannot see a batched job between its steps.
  #
  # WHY IT MATTERS MORE THAN "ONE SPURIOUS NUDGE": premature reaping re-arms the nudges, which can
  # start new work while the old work is still running - and when the running job is a MEMORY
  # measurement, a second game instance competing for RAM does not merely waste time, it corrupts
  # the number. That is a correctness hazard, not a cosmetic one.
  #
  # A PID whose absence reads as free is self-healing by construction, which is why the injector
  # lock has never rotted while every plain-text marker in this harness eventually did.
  $busyFile = Join-Path $HarnessProj '.claude/.busy'
  if (Test-Path $busyFile) {
    $raw = ''
    try { $raw = ([string](Get-Content $busyFile -Raw)).Trim() } catch { }
    $parts = $raw -split '\|', 3
    if ($parts.Count -eq 3 -and $parts[0] -match '^\d+$') {
      $ownerPid = [int]$parts[0]
      $wantTicks = 0; [void][int64]::TryParse($parts[1], [ref]$wantTicks)
      $reason = if ($parts[2]) { $parts[2] } else { 'declared busy' }
      $owner = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
      $sameProc = $false
      if ($owner) {
        if ($wantTicks -eq 0) { $sameProc = $true }
        else { try { $sameProc = ($owner.StartTime.Ticks -eq $wantTicks) } catch { $sameProc = $true } }
      }
      if ($sameProc) {
        return ($reason + (' [.busy, owner pid {0} ALIVE]' -f $ownerPid))
      }
      # We do not have to wait out a grace period to know this: the owner is gone, full stop.
      Write-HarnessLog ('OWNED .busy REAPED - owner pid ' + $ownerPid + ' is gone - was: ' + $reason)
      Remove-Item $busyFile -Force -ErrorAction SilentlyContinue
      # fall through to the name checks; another job may legitimately be running
    }
  }

  # ---- 2. NAME-BASED DETECTION, for jobs nobody declared -----------------------------------------
  $hits = @(Get-Process -ErrorAction SilentlyContinue |
            Where-Object { $HarnessBusyProcs -contains $_.ProcessName } |
            Select-Object -ExpandProperty ProcessName -Unique)
  if ($hits.Count -gt 0) { return ('running: ' + ($hits -join ', ')) }

  if (Test-HarnessUATAlive) { return 'running: dotnet (UAT BuildCookRun)' }

  # ---- 3. AN UNOWNED MARKER WITH NOTHING BEHIND IT -----------------------------------------------
  # Reaching here means no job process is visible AND the marker did not name a live owner. A
  # legacy plain-text marker (no PID) is a CLAIM WITH NOTHING BEHIND IT, and is worth honouring only
  # for as long as a job could still plausibly be starting up.
  #
  # THIS IS THE DEFECT THAT COST THE NIGHT OF 2026-08-18, and it is the MIRROR of the one fixed in
  # step 1: a re-cook finished at 00:16, nobody deleted its marker, and at 00:40 this function
  # answered "[.busy, 24 min old]" with ZERO matching processes alive. phase-stop.ps1 did as it was
  # told and stayed silent, and the phase loop stopped dead until the user noticed. BOTH existing
  # backstops - the 90-minute ceiling and the 30-suppression cap - were unreachable BY CONSTRUCTION,
  # because both are only evaluated when the agent STOPS, and a stopped agent produces no further
  # stops. A watchdog whose only clock is the thing it watches cannot fire once that thing goes still.
  #
  # The asymmetry sets the grace period: reaping too early costs a spurious nudge (and, per step 1,
  # can corrupt a running measurement), reaping too late costs the whole night. Six minutes is
  # generous against the measured worst case for spawn lag (17 s - the dotnet/UnrealEditor-Cmd gap
  # that motivated the marker in the first place). NEW MARKERS SHOULD USE Write-HarnessBusy AND
  # NEVER LAND HERE.
  if (Test-Path $busyFile) {
    $age = ((Get-Date) - (Get-Item $busyFile).LastWriteTime).TotalMinutes
    $reason = ''
    try { $reason = (Get-Content $busyFile -Raw).Trim() } catch { }
    if (-not $reason) { $reason = 'declared busy' }
    if ($age -le $HarnessBusyGraceMin) {
      return ($reason + (' [.busy, {0:N0} min old, no job process yet, UNOWNED marker]' -f $age))
    }
    Write-HarnessLog ((('STALE unowned .busy REAPED after {0:N0} min with no job process alive - was: ') -f $age) + $reason)
    Remove-Item $busyFile -Force -ErrorAction SilentlyContinue
  }
  return ''
}

# ---- IS A COMPACT INJECTOR ALREADY WAITING? ------------------------------------------------------
# THE ANTI-DOUBLE-NUDGE TEST, and the reason post-compact-resume.ps1 can be trusted to send at all.
#
# When the HARNESS drove the compaction, compact-injector.ps1 is alive, holding this lock, and parked
# on a wait for .compaction_done - and it will send its own resume the moment that file appears. The
# post-compact hook fires at that same instant. Without this test both would paste, and the second
# "continue the phase" would arrive mid-turn, which is precisely the emergent behaviour the
# 2026-08-09 directive banned.
#
# SELF-HEALING BY CONSTRUCTION: the lock records PID + process start time, so a lock whose process is
# gone (exited, killed, machine rebooted) simply reads as free. Nothing has to remember to release it.
function Test-HarnessInjectorLive {
  $lock = Join-Path $HarnessProj '.claude\.injector.lock'
  if (-not (Test-Path $lock)) { return $false }
  $parts = (Get-Content $lock -Raw -ErrorAction SilentlyContinue) -split '\|'
  if ($parts.Count -lt 2) { return $false }
  $held = Get-Process -Id ([int]$parts[0]) -ErrorAction SilentlyContinue
  if (-not $held) { return $false }
  return ("$($held.StartTime.Ticks)" -eq $parts[1].Trim())
}

# ---- SHOULD THE POST-COMPACTION WAKE FIRE, AND WITH WHAT? ----------------------------------------
# A PURE FUNCTION ON PURPOSE. Its only inputs are the three live predicates above and the board state
# the caller already parsed; its only output is a verdict. It writes nothing and sends nothing.
#
# That matters because of how this harness fails. Its defects are never wrong arithmetic - they are
# gates nobody could observe: a channel that did not exist, a cap fitted to a file's size, a paste
# that reached the app but not the composer. A decision chain welded inside a hook can only be tested
# by FIRING it, and firing this one types into the user's window. Split out, the whole verdict can be
# evaluated against real state as often as you like and it costs nothing and touches nothing.
#
# The recon marker write is deliberately NOT done here - the verdict merely REPORTS that it is owed
# (MarkRecon), and the caller performs it. A "pure" function with one hidden write is the worse of
# both worlds: untestable AND surprising.
function Get-HarnessResumeVerdict {
  param(
    [string]$Current = '',
    [string]$Next = '',
    [int]$ProposedCount = 0,
    [string]$Newest = '',
    [string]$ReconAskedFor = ''
  )
  function V($action,$reason,$line,$mark) {
    return [pscustomobject]@{ Action=$action; Reason=$reason; Line=$line; MarkRecon=$mark }
  }

  $off = Get-HarnessOffReason
  if ($off) { return (V 'silent' ("OFF: " + $off + " - no resume sent.") '' $false) }

  if (Test-HarnessInjectorLive) {
    return (V 'silent' 'an injector is alive and already waiting on this compaction - it sends the resume, not us.' '' $false)
  }

  $busy = Get-HarnessBusyReason
  if ($busy) {
    return (V 'silent' ("QUIET: " + $busy + " - the completion notification is the wake signal. No resume.") '' $false)
  }

  # The four board states, mirroring phase-stop.ps1 so the two wake paths cannot disagree about what a
  # given board means. Proposals first: a greenlight is the user's to give, and this hook must not be
  # a back door into starting unapproved work.
  if ($ProposedCount -gt 0) {
    return (V 'silent' ("STOP: $ProposedCount proposed row(s) await the user's greenlight. No resume.") '' $false)
  }
  if ($Current) {
    return (V 'launch' "RESUME (in_progress $Current) - compaction finished with no injector waiting on it." `
                'continue the in_progress phase per the phase board in docs/PHASELOG.md' $false)
  }
  if ($Next) {
    return (V 'launch' "RESUME (no in_progress, next pending is $Next)" `
                'the phase board in docs/PHASELOG.md has no in_progress phase and the next documented phase is pending - mark it in_progress and begin it' $false)
  }
  if ($Newest -eq '' -or $ReconAskedFor -eq $Newest) {
    return (V 'silent' "STOP: board complete through $Newest, recon already requested. No resume." '' $false)
  }
  return (V 'launch' "RESUME (board complete through $Newest, recon not yet requested)" `
              'the phase board in docs/PHASELOG.md is fully complete - no in_progress and no pending phase. Per the user directive of 2026-08-10: explore the project for technical debt, write the proposed phases onto the board as [proposed] rows with real descriptions, then STOP and present them for greenlight. Recon is read-only; do NOT begin building unapproved work.' $true)
}

# ==================================================================================================
# THE CONTEXT WINDOW, MEASURED  (user 2026-08-17: "im not sure if its possible for the harness to
# programmatically watch the context window but if so that would be the way to achieve it")
# ==================================================================================================
# IT IS POSSIBLE, AND THE HARNESS HAS BEEN DOING IT ALL ALONG - phase-stop.ps1 has read this number
# on every Stop since 2026-08-10. It was simply never ACTED ON except at a phase boundary, which is
# why a phase that ran long could grow the window without limit and still be reported as healthy.
#
# HOW: every assistant row in the transcript JSONL carries a usage blob, and a turn's true context
# size is input_tokens + cache_creation_input_tokens + cache_read_input_tokens on the LAST such row.
# Verified against the live transcript on 2026-08-17: 1 + 1029 + 125753 = 126,783 tokens, which the
# client's own meter reported as 12.7%.
#
# HOISTED OUT OF THE HOOK so the UI can show the same number the gates fire on. A gauge that
# disagrees with the hook it is reporting on is worse than no gauge, because it is believed - the
# same reasoning that put Get-HarnessBusyReason here in the first place.
#
# THE REGEX IS SAFE AGAINST ITS OBVIOUS TRAP: '"input_tokens":' requires a quote IMMEDIATELY before
# the name, so it cannot match inside '"cache_creation_input_tokens"'. Checked, not assumed.
#
# CORRECTED 2026-08-19: the 400000 figure below was WRONG and cost several turns of needless
# deferral. It came from a 380,519-token "compact boundary" in transcript b2d5b0f4 that I later
# realised was a MANUAL /compact (this session opened with one), NOT the built-in auto-compaction.
# DISPROOF, measured directly: this session ran to 413,324 tokens - reads, edits, a full next build,
# and commits - with NO reset and no degradation. So the real window is well above 413k. Reverted to
# the source model's known-measured 1,000,000 as the best available estimate (Fable 5 is comparable),
# ANNOTATED as provisional: re-measure $HarnessWindowTokens the FIRST time a genuine built-in
# auto-compaction is observed on this stack (the max usage total on the last assistant row before the
# compact boundary), and pin that. Until then the gates run conservative-but-not-insane against 1M.
$HarnessWindowTokens = 1000000   # provisional: 400k was disproven (ran past it); re-measure at a real auto-compaction

# THE FOUR THRESHOLDS, IN ONE PLACE so the hook and the UI cannot drift apart.
$HarnessCompactAtPct = 32   # at a phase BOUNDARY: the next phase would start a third full
$HarnessCriticalPct  = 45   # MID-PHASE critical mass - write notes, split the phase, compact
$HarnessBackstopPct  = 75   # compact at OUR moment before the built-in picks its own

function Get-HarnessContextTokens {
  param([string]$TranscriptPath = '')
  $tp = $TranscriptPath
  if (-not $tp -or -not (Test-Path $tp)) {
    $dir = Join-Path $env:USERPROFILE '.claude\projects\C--Users-doria-web-projects-starlet-tattoos'
    $f = Get-ChildItem -Path $dir -Filter *.jsonl -ErrorAction SilentlyContinue |
         Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($f) { $tp = $f.FullName }
  }
  if (-not $tp -or -not (Test-Path $tp)) { return -1 }

  # ---- READ A BOUNDED TAIL OF *BYTES*, NOT OF LINES -------------------------------------------
  # THE FIRST CUT USED Get-Content -Tail 150 AND IT WAS A LATENT UI FREEZE. Measured on this
  # session's own transcript: 22 MB across 2,104 lines, with a SINGLE LINE OF 1.24 MB (one assistant
  # turn carrying tool results). -Tail has to decode backwards across those, and the call blew a
  # 120-second timeout. That function is called by the Stop hook on EVERY turn end AND by the
  # harness UI's 2-second timer, so a slow read here stalls the loop and hangs the window - a
  # readout that costs more than the thing it reports on.
  #
  # We only ever want the LAST usage blob, so seek from the end and decode a fixed budget. The
  # ladder is the same self-validating shape the board reader uses: a fixed size is a fence fitted
  # to today's file, so when the budget contains no usage row we widen rather than return -1.
  $total = -1
  $fileLen = 0
  try { $fileLen = (Get-Item $tp -ErrorAction Stop).Length } catch { $fileLen = 0 }
  foreach ($budget in @(1MB, 8MB, 64MB)) {
    $text = ''
    try {
      # FileShare ReadWrite: the client is appending to this file as we read it. Opening it
      # exclusively is the AG3 mistake (never take a lock on a log something else is writing).
      $fs = [System.IO.File]::Open($tp, [System.IO.FileMode]::Open,
              [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
      try {
        $take = [int][math]::Min([int64]$budget, $fs.Length)
        [void]$fs.Seek(-$take, [System.IO.SeekOrigin]::End)
        $buf = New-Object byte[] $take
        $read = $fs.Read($buf, 0, $take)
        $text = [System.Text.Encoding]::UTF8.GetString($buf, 0, $read)
      } finally { $fs.Dispose() }
    } catch { $text = '' }
    if (-not $text) { continue }

    foreach ($l in ($text -split "`n")) {
      if ($l -notmatch '"cache_read_input_tokens"') { continue }
      $i = 0; $cc = 0; $cr = 0
      # '"input_tokens":' cannot match inside '"cache_creation_input_tokens"' - the quote has to sit
      # immediately before the name. Checked, not assumed.
      if ($l -match '"input_tokens":(\d+)')                { $i  = [int]$Matches[1] }
      if ($l -match '"cache_creation_input_tokens":(\d+)') { $cc = [int]$Matches[1] }
      if ($l -match '"cache_read_input_tokens":(\d+)')     { $cr = [int]$Matches[1] }
      $t = $i + $cc + $cr
      if ($t -gt 0) { $total = $t }
    }
    if ($total -gt 0) { break }
    # Already read the whole file at this budget - widening cannot find anything new.
    if ($fileLen -gt 0 -and [int64]$budget -ge $fileLen) { break }
  }
  return $total
}

function Get-HarnessContextPct {
  param([string]$TranscriptPath = '')
  $t = Get-HarnessContextTokens -TranscriptPath $TranscriptPath
  if ($t -le 0) { return -1.0 }
  return [math]::Round(($t * 100.0) / $HarnessWindowTokens, 1)
}

# ==================================================================================================
# WHICH PHASES ARE NEWLY COMPLETE - A SET DIFFERENCE, NOT A FILE POSITION
# ==================================================================================================
# THE DEFECT THIS REPLACES (user 2026-08-17: "jumping around in the phase order proved a weakness in
# the harness that needs to be fixed"). Both wake paths used to compute "the phase that just closed"
# as $complete[-1] - THE LAST complete ROW IN FILE ORDER - and compare it against a single stored id.
# That silently assumes board order equals execution order.
#
# On 2026-08-17 it stopped being true. The user reordered the work to AM6 -> AM7 -> AM8 before the AN
# phases, but AM6's row sits at board line 309 and AN1's at 358. So when AM6 closed, $complete[-1]
# still read AN1, the marker already read AN1, "is this phase new" answered NO, and the phase-loop
# compaction simply never fired - for AM6 and for every phase that would follow it. Nothing errored.
# The loop reported healthy while its trigger was dead, which is this project's most expensive
# failure shape and the reason the context ran to critical mass unattended.
#
# THE FIX IS TO OBSERVE THE TRANSITION RATHER THAN INFER IT FROM ORDER. The harness remembers the SET
# of ids it has already seen complete; anything in the board's current set that is not in the
# remembered set genuinely just closed, wherever its row happens to sit. Reordering rows, inserting a
# wave above an older one, or closing three phases out of order are all handled by construction
# rather than by discipline.
function Get-HarnessSeenComplete {
  $f = Join-Path $HarnessProj '.claude\.completed_seen'
  if (-not (Test-Path $f)) { return $null }   # $null means NEVER SEEDED - distinct from "seen none"
  return @(Get-Content $f -ErrorAction SilentlyContinue |
           ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

function Set-HarnessSeenComplete {
  param([string[]]$Ids)
  $f = Join-Path $HarnessProj '.claude\.completed_seen'
  Set-Content -Path $f -Value (($Ids | Where-Object { $_ }) -join "`n") -Encoding utf8
}

# ==================================================================================================
# ARE THE PRESERVATION NOTES ACTUALLY WRITTEN?  (user 2026-08-17: "it should not be possible for you
# to claim youre ready for a compaction without ever writing context preservation notes")
# ==================================================================================================
# WHAT HAPPENED. AM6 was closed, reported as done, and declared ready to compact - and neither
# artifact existed: docs/phases/wave-am.md still ended at AM5, and the preservation-notes section
# still carried a 2026-08-16 AM2 stamp. Both were written only because the user asked a direct
# question. The phase-loop contract puts the notes BEFORE the phase counts as closed; nothing
# enforced that ordering, so it held exactly as long as memory did.
#
# THE FENCE HAD TO BE CONTENT-BASED, AND IT HAD TO BE UNSATISFIABLE BY INHERITANCE. This project's
# own AB5 law - a fence fitted to its output cannot fail - rules out the obvious tests:
#   - "does the section exist"          -> it always does.
#   - "was PHASELOG.md modified today"  -> every phase modifies it, for the board row alone.
#   - "does the stamp mention $Phase"   -> THIS ONE LOOKS RIGHT AND IS NOT. The live AM6 stamp reads
#     "The user's execution order is AM6 -> AM7 -> AM8", so a stale AM6 stamp would have PASSED the
#     check for AM7 and AM8 on text written days earlier. Tested against the real file before the
#     predicate was chosen, which is the only reason it was caught.
#
# So the fence is a LITERAL TOKEN that names the phase AND its state - "<PHASE> CLOSED" for a phase
# boundary, "<PHASE> IN FLIGHT" for a mid-phase split. Neither can appear in a forward-looking
# execution-order list, neither survives from a previous phase, and both are natural things to write
# in a stamp. The nudge that fires on a gap QUOTES THE EXACT STRING REQUIRED, so the fence is never
# a guessing game - it states its own remedy.
#
# The wave-narrative half is checked separately and demands a heading that STARTS with the phase id.
# Requiring only "the id appears in a heading" would have passed on "## AM6 CLOSED ... AM7 next".
# Two documents, two independent checks, because both were missing and either alone could be.
function Get-HarnessNotesGap {
  param([string]$Phase = '', [string]$Kind = 'closed')

  if (-not $Phase) { return '' }   # nothing to attribute notes to - not a gap
  $token = if ($Kind -eq 'inflight') { "$Phase IN FLIGHT" } else { "$Phase CLOSED" }

  $board = Join-Path $HarnessProj 'docs\PHASELOG.md'
  if (-not (Test-Path $board)) { return 'docs\PHASELOG.md is missing' }

  # Read ONLY the preservation-notes section. It is the LAST '## ' section of the file, so the
  # terminating condition is normally EOF; the '^## ' break exists so that appending a new section
  # under it later cannot silently widen what counts as "the notes".
  $sb = New-Object System.Text.StringBuilder
  $inSect = $false
  foreach ($l in (Get-Content $board -ErrorAction SilentlyContinue)) {
    if (-not $inSect) {
      if ($l -match '^##\s+Preservation notes') { $inSect = $true }
      continue
    }
    if ($l -match '^##\s') { break }
    [void]$sb.AppendLine($l)
  }
  if (-not $inSect) { return 'docs/PHASELOG.md has no "## Preservation notes" section at all' }
  if ($sb.ToString() -notmatch [regex]::Escape($token)) {
    return ("the preservation-notes section of docs/PHASELOG.md does not contain the token '" + $token + "'")
  }

  # The narrative half applies to a CLOSE. A mid-phase split has no narrative to write yet - the
  # phase is not finished - so demanding one there would be a fence that cannot be satisfied.
  if ($Kind -ne 'inflight') {
    $wave = ''
    if ($Phase -match '^([A-Za-z]+)') { $wave = $Matches[1].ToLower() }
    if ($wave) {
      $wf = Join-Path $HarnessProj ('docs\phases\wave-' + $wave + '.md')
      if (-not (Test-Path $wf)) {
        return ('the wave narrative file docs/phases/wave-' + $wave + '.md does not exist')
      }
      $wtxt = Get-Content $wf -Raw -ErrorAction SilentlyContinue
      if ($wtxt -notmatch ('(?m)^#+\s+' + [regex]::Escape($Phase) + '\b')) {
        return ('docs/phases/wave-' + $wave + '.md has no heading starting with ' + $Phase)
      }
    }
  }
  return ''
}

# =================================================================================================
# NOTES FRESHNESS (2026-08-18, user: "i want to make absolutely sure that the last thing you do
# before any compaction is writing preservation notes").
#
# THE HOLE THE TOKEN GATE CANNOT SEE: within one phase, an 'X IN FLIGHT' token never expires. A
# phase that hits critical mass TWICE would ride its first split's notes into the second
# compaction, and everything learned in between dies. The token names the phase and its state -
# it cannot name WHEN it was last true.
#
# THE FIX IS A CONSUMPTION RECORD, NOT A TIMESTAMP: pre-compact-log.ps1 - the one hook EVERY
# compaction passes through, harness-driven or not - hashes the preservation-notes section into
# .claude/.notes_hash_at_compact. A section byte-identical to that baseline has, by definition,
# already been consumed by a compaction; compacting it again preserves nothing new. File mtime was
# rejected for the same reason "was PHASELOG edited" was rejected for the token gate: board-row
# edits touch the file constantly, and a predicate that passes on unrelated edits is a fence
# fitted to its output (AB5). The hash is scoped to the section the gate actually reads.
# =================================================================================================
function Get-HarnessNotesSectionHash {
  $board = Join-Path $HarnessProj 'docs\PHASELOG.md'
  if (-not (Test-Path $board)) { return '' }
  # Same extraction as Get-HarnessNotesGap, kept inline on purpose: refactoring a live gate to
  # share code is how a freshness bug becomes a token-gate bug too.
  $sb = New-Object System.Text.StringBuilder
  $inSect = $false
  foreach ($l in (Get-Content $board -ErrorAction SilentlyContinue)) {
    if (-not $inSect) {
      if ($l -match '^##\s+Preservation notes') { $inSect = $true }
      continue
    }
    if ($l -match '^##\s') { break }
    [void]$sb.AppendLine($l)
  }
  if (-not $inSect) { return '' }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($sb.ToString())
    return ([BitConverter]::ToString($sha.ComputeHash($bytes)) -replace '-', '')
  } finally { $sha.Dispose() }
}

function Get-HarnessNotesStale {
  # Returns a reason string when the notes section is byte-identical to what the LAST compaction
  # consumed; '' when fresh. FAILS OPEN in every ambiguous case - no baseline recorded (no
  # compaction has consumed anything yet), no section (the TOKEN gate owns that failure and must
  # not be double-reported), unreadable baseline - because failing closed here means a loop that
  # can never compact, which is the starvation this gate's siblings just recovered from.
  $bfile = Join-Path $HarnessProj '.claude\.notes_hash_at_compact'
  if (-not (Test-Path $bfile)) { return '' }
  $rec = (([string](Get-Content $bfile -Raw)).Trim()) -split '\s+', 2
  if (-not $rec -or -not $rec[0]) { return '' }
  $baseline = $rec[0]
  $when = if ($rec.Count -gt 1 -and $rec[1]) { $rec[1] } else { 'an earlier moment' }
  $cur = Get-HarnessNotesSectionHash
  if (-not $cur) { return '' }
  if ($cur -eq $baseline) {
    return ('the preservation-notes section of docs/PHASELOG.md is byte-identical to what the ' +
            'compaction at ' + $when + ' already consumed - everything learned since lives only ' +
            'in context; refresh the stamp before another compaction')
  }
  return ''
}
