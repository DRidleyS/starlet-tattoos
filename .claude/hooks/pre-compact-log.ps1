# =================================================================================================
# PreCompact hook -- fires BEFORE a compaction, user-run or automatic.
#
# ITS ONE JOB IS NOW THE OPPOSITE OF WHAT IT WAS. It used to append a one-line tally to compact.log
# and nothing else. That made it a diary, not an instrument, and it failed twice over:
#
#   1. THE CAP WAS A FENCE FITTED TO THE FILE ON THE DAY IT WAS WRITTEN. It read the first 200 lines
#      of PHASELOG.md. The board block reached line 307 some time around wave AJ, so every row past
#      200 became invisible and the log has recorded "in_progress=[(none)] complete=59 pending=0" on
#      EVERY compaction since - twelve identical rows on 2026-08-16 alone, across four phases that
#      each started and finished inside that window. A frozen number is worse than a missing one,
#      because it looks like a reading. (Same defect, same fix, as post-compact-resume.ps1 already
#      carries: read capped, DETECT not reaching PHASE-BOARD-END, then re-read the whole file.)
#
#   2. IT CAPTURED NOTHING THAT COULD NOT BE RE-DERIVED. On 2026-08-16 a compaction landed while a
#      six-agent research workflow was in flight. The summariser carried the measurements - which
#      were on disk anyway - and dropped the workflow's run id and script path, which were not. The
#      post-compact context could not even find the thing it had started, and the user had to kill
#      it. USER, VERBATIM: "you started the workflow, ended your turn without writing proper
#      preservation notes, and when compaction hit you completely forgot what you were doing and
#      couldnt even find the workflow that was running 6 agents you just started ... i think in
#      general its a good rule to not compact mid-workflow and i think you need to be more robust
#      and consistent with writing to the phaselog, and writing preservation notes."
#
# SO THIS HOOK NOW WRITES A SURVIVAL RECORD, .claude\PRECOMPACT-STATE.md, and post-compact-resume.ps1
# reads it back into the fresh context. A compaction cannot be blocked by a hook, so the design goal
# is not prevention - it is that NOTHING IN FLIGHT CAN CROSS A COMPACTION UNANNOUNCED.
#
# TWO DETECTORS, BECAUSE ONE OF THEM DEPENDS ON DISCIPLINE AND DISCIPLINE IS WHAT FAILED:
#   (a) DECLARED - .claude\.inflight, which Claude writes when it starts background work. Rich, and
#       exactly as reliable as remembering to write it. It is the half that broke tonight.
#   (b) DETECTED - a sweep of this session's own tasks directory for .output files that are ZERO
#       BYTES. A finished background task has written something; an empty output file is a task that
#       never reported. This needs no discipline from anybody, which is the whole point of having it.
# =================================================================================================

$ErrorActionPreference = 'SilentlyContinue'

$proj    = 'C:\Users\doria\web-projects\starlet-tattoos'
$board   = Join-Path $proj 'docs\PHASELOG.md'
$log     = Join-Path $proj '.claude\compact.log'
$state   = Join-Path $proj '.claude\PRECOMPACT-STATE.md'
$inflight= Join-Path $proj '.claude\.inflight'

# THE SAME NOTES PREDICATE THE INJECTOR ENFORCES, EVALUATED AT THE ONE CHOKE POINT EVERY
# COMPACTION PASSES THROUGH (2026-08-18, user: "are we reliably writing pre compaction notes
# before all compact triggers?"). The answer was NO, and the audit is worth keeping: the harness
# gates the three compactions IT drives (phase boundary, critical mass, backstop) inside
# compact-injector.ps1 - but a compaction the harness did not start never goes near that file.
# A USER-TYPED /compact and the BUILT-IN auto-compaction both sail straight past it, and the
# compaction that opened this very session was a user-typed one.
#
# This hook cannot warn BEFORE a compaction nobody told it about - by the time it runs, the
# decision is made. What it can do is refuse to let the gap go unrecorded, so the next context
# opens knowing its handoff is missing instead of trusting a stamp that describes an older phase.
# ADVISORY, NOT BLOCKING, and deliberately: a gate that can strand a full window at 1am is worse
# than the gap it prevents.
$notesGap = ''
$libPath = Join-Path $proj '.claude/hooks/harness-lib.ps1'
if (Test-Path $libPath) { . $libPath }

# ---- stdin: the hook payload carries session_id + trigger (manual vs auto) -----------------------
$sessionId = ''
$trigger   = 'unknown'
try {
    $raw = [Console]::In.ReadToEnd()
    if ($raw) {
        $j = $raw | ConvertFrom-Json
        if ($j.session_id) { $sessionId = [string]$j.session_id }
        if ($j.trigger)    { $trigger   = [string]$j.trigger }
    }
} catch { }

# ---- BOARD READ: capped, self-validating, uncapped fallback (see note 1 above) -------------------
$current = ''; $newest = ''; $done = 0; $todo = 0; $proposed = 0; $sawEnd = $false
$pendingList = @()
foreach ($cap in @(400, -1)) {
    $inBlock = $false; $done = 0; $todo = 0; $proposed = 0
    $current = ''; $newest = ''; $sawEnd = $false; $pendingList = @()
    $lines = if ($cap -gt 0) { Get-Content $board -TotalCount $cap } else { Get-Content $board }
    foreach ($l in $lines) {
        if ($l -match 'PHASE-BOARD-START') { $inBlock = $true;  continue }
        if ($l -match 'PHASE-BOARD-END')   { $sawEnd  = $true;  break }
        if (-not $inBlock) { continue }
        if ($l -match '^\s*-\s*\[(complete|in_progress|pending|proposed)\]\s+(\S+)\s*::\s*(.*)$') {
            switch ($Matches[1]) {
                'complete'    { $done++; $newest = $Matches[2] }
                'pending'     { $todo++; $pendingList += ($Matches[2] + ' :: ' + $Matches[3]) }
                'proposed'    { $proposed++ }
                'in_progress' { $current = $Matches[2] + ' :: ' + $Matches[3] }
            }
        }
    }
    if ($sawEnd) { break }
}

# ---- DETECTOR (a): what Claude DECLARED in flight ------------------------------------------------
$declared = @()
if (Test-Path $inflight) {
    foreach ($l in (Get-Content $inflight)) {
        $t = $l.Trim()
        if ($t -and -not $t.StartsWith('#')) { $declared += $t }
    }
}

# ---- DETECTOR (b): zero-byte task outputs in THIS session's task dir ------------------------------
# A background task that has reported writes bytes. Zero bytes means it never did: still running,
# killed, or crashed. Any of those is something the next context must be told about.
$orphans = @()
$taskRoot = Join-Path $env:TEMP 'claude\C--Users-doria-web-projects-starlet-tattoos'
if (Test-Path $taskRoot) {
    $sessDirs = @()
    if ($sessionId -and (Test-Path (Join-Path $taskRoot $sessionId))) {
        $sessDirs = @(Join-Path $taskRoot $sessionId)
    } else {
        # No session id (or an unexpected layout): fall back to any session touched in the last 12 h.
        $sessDirs = @(Get-ChildItem $taskRoot -Directory -ErrorAction SilentlyContinue |
                      Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-12) } |
                      Select-Object -ExpandProperty FullName)
    }
    foreach ($d in $sessDirs) {
        $td = Join-Path $d 'tasks'
        if (-not (Test-Path $td)) { continue }
        foreach ($f in (Get-ChildItem $td -Filter '*.output' -File -ErrorAction SilentlyContinue)) {
            if ($f.Length -eq 0) {
                $ageMin = ((Get-Date) - $f.LastWriteTime).TotalMinutes
                $orphans += ('{0}  (0 bytes, last touched {1:N0} min ago)  {2}' -f `
                             $f.BaseName, $ageMin, $f.FullName)
            }
        }
    }
}

# ---- THE SURVIVAL RECORD -------------------------------------------------------------------------
$nl = [Environment]::NewLine
$sb = New-Object System.Text.StringBuilder
function W($s) { [void]$sb.AppendLine($s) }

W '# PRECOMPACT STATE -- written by .claude/hooks/pre-compact-log.ps1'
W ''
W ('Written: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '   trigger: ' + $trigger)
W ('Session: ' + $(if ($sessionId) { $sessionId } else { '(not supplied on stdin)' }))
W ''
# Evaluated AFTER the board read above, because it needs the in_progress / newest-complete phase.
if (Get-Command Get-HarnessNotesGap -ErrorAction SilentlyContinue) {
  # $current is a DISPLAY string ("AN3 :: wilderness density, measured - ..."), built for the human
  # board brief further down; the notes predicate needs the bare id. Caught by the gate's own first
  # dry run, which asked for a token containing the entire row description.
  $currentId = ''
  if ($current) { $currentId = ($current -split ' :: ')[0].Trim() }
  if ($currentId) { $notesGap = Get-HarnessNotesGap -Phase $currentId -Kind 'inflight' }
  elseif ($newest) { $notesGap = Get-HarnessNotesGap -Phase $newest -Kind 'closed' }
}
if ($notesGap) {
  W '## !! THE PRESERVATION NOTES WERE NOT WRITTEN BEFORE THIS COMPACTION !!'
  W ''
  W ("Gap: " + $notesGap)
  W ''
  W 'This compaction was NOT driven by the harness (a harness-driven one is blocked until the token'
  W 'exists), so it was either typed by the user or fired by the built-in auto-compaction. Whatever'
  W 'the stamp in docs/PHASELOG.md currently says, IT DESCRIBES AN OLDER MOMENT than this one.'
  W ''
  W 'FIRST ACTION IN THE NEW CONTEXT: reconstruct the notes for the phase named above from the board,'
  W 'the wave file and the recent git log, and write them before continuing the work.'
  W ''
}

W 'This file is the ONE thing guaranteed to survive the compaction that was about to happen.'
W 'post-compact-resume.ps1 reads it back. If it says work was in flight, RECOVER OR RETIRE THAT'
W 'WORK BEFORE DOING ANYTHING ELSE - do not silently start something new on top of it.'
W ''
W '## Board at the moment of compaction'
W ''
if (-not $sawEnd) {
    W 'WARNING: PHASE-BOARD-END was never reached even reading the whole file. Numbers below are suspect.'
    W ''
}
W ('- in_progress : ' + $(if ($current) { $current } else { '(none)' }))
W ('- complete    : ' + $done)
W ('- pending     : ' + $todo)
W ('- proposed    : ' + $proposed)
W ('- newest done : ' + $(if ($newest) { $newest } else { '(none)' }))
if ($pendingList.Count -gt 0) {
    W ''
    W 'Pending rows, in board order:'
    foreach ($p in $pendingList) { W ('  - ' + $p) }
}
W ''
W '## Work in flight'
W ''
if ($declared.Count -eq 0 -and $orphans.Count -eq 0) {
    W 'NONE DETECTED. No .inflight declarations and no zero-byte task outputs.'
} else {
    if ($declared.Count -gt 0) {
        W '### DECLARED (Claude wrote these to .claude/.inflight)'
        W ''
        foreach ($d in $declared) { W ('- ' + $d) }
        W ''
    }
    if ($orphans.Count -gt 0) {
        W '### DETECTED (zero-byte task outputs -- running, killed, or crashed)'
        W ''
        foreach ($o in $orphans) { W ('- ' + $o) }
        W ''
        W 'A zero-byte .output is a background task that never reported. Check it before assuming'
        W 'it finished. For a Workflow, its script was persisted under the session directory and can'
        W 'be re-run or resumed with Workflow({scriptPath, resumeFromRunId}).'
    }
}
W ''
W '## Standing rule this file exists to enforce'
W ''
W 'NEVER end a turn with background work in flight without a line in .claude/.inflight. The'
W 'summariser preserves what looks important; it cannot know that a run id is the only'
W 'unrecoverable thing on the page. Declare it, or it dies at the next compaction.'

Set-Content -Path $state -Value $sb.ToString() -Encoding utf8

# ---- CONSUMPTION RECORD (2026-08-18): hash the preservation-notes section so the freshness gate
# ---- (Get-HarnessNotesStale) can refuse a SECOND compaction riding notes this one already
# ---- consumed. Recorded here because this hook is the one point EVERY compaction passes through -
# ---- harness-driven, user-typed, and the built-in auto-compaction alike. --------------------------
if (Get-Command Get-HarnessNotesSectionHash -ErrorAction SilentlyContinue) {
    $nh = Get-HarnessNotesSectionHash
    if ($nh) {
        Set-Content -Path (Join-Path $proj '.claude\.notes_hash_at_compact') `
                    -Value ($nh + ' ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) `
                    -Encoding utf8 -NoNewline
    }
}

# ---- the one-liner, now with the numbers it always meant to carry --------------------------------
$flightNote = ''
if ($declared.Count -gt 0 -or $orphans.Count -gt 0) {
    $flightNote = ('  INFLIGHT declared={0} orphaned={1}' -f $declared.Count, $orphans.Count)
}
Add-Content -Path $log -Encoding utf8 -Value (
    (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') +
    "  COMPACT[$trigger]  in_progress=[$(if($current){$current}else{'(none)'})]" +
    "  complete=$done  pending=$todo  proposed=$proposed  sawEnd=$sawEnd" + $flightNote)

exit 0
