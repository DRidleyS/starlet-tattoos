# ============================================================================
# SessionStart hook, matcher "compact" - fires AFTER a compaction completes,
# whether that compaction was run by the user or fired automatically.
#
# Job: print the current phase brief on stdout. SessionStart stdout is injected
# into Claude's context, so this is what makes a compaction lossless at a phase
# boundary - the freshly-compacted context opens already knowing which phase is
# live, what it is for, and what to do if the board has run dry.
#
# Also advances .last_compacted_phase so the Stop hook does not treat the same
# completed phase as "new" a second time.
#
# AND - since 2026-08-16 - IT WAKES CLAUDE AFTER A COMPACTION THE HARNESS DID NOT DRIVE.
# See the long note above the launch block at the bottom. Short version: a user-run
# /compact is not a Stop event, so before this the loop had no way to resume from one.
#
# Reads ONLY the PHASE-BOARD block at the top of docs/PHASELOG.md - never the
# ~480 KB of wave narrative below it.
# ============================================================================

$ErrorActionPreference = 'SilentlyContinue'

$proj   = 'C:\Users\doria\web-projects\starlet-tattoos'
$board  = Join-Path $proj 'docs\PHASELOG.md'
$marker = Join-Path $proj '.claude\.last_compacted_phase'
$slog   = Join-Path $proj '.claude\hook-stop.log'

# Logged to hook-stop.log rather than a log of its own, ON PURPOSE: that is the file the harness UI
# tails, so the post-compaction decision shows up in the same pane as every other harness verdict.
# A decision the user cannot see is a decision they have to reverse-engineer from silence.
function SLog($m){ Add-Content -Path $slog -Value ((Get-Date -Format 'HH:mm:ss')+'  '+$m) -Encoding utf8 }

if (-not (Test-Path $board)) { exit 0 }

# TWO-TIER, SELF-VALIDATING READ. The cheap capped read is the normal path and keeps the promise
# above - the board block, not the ~480 KB of wave narrative under it. But A CAP IS A FENCE FITTED
# TO THE FILE'S SIZE ON THE DAY IT WAS WRITTEN, and this one was outgrown: on 2026-08-15 the block
# ran to line 232, so wave AJ's rows sat past a 200-line cap and this hook announced "THE BOARD IS
# EMPTY" while AJ1 was in_progress - and then wrote a STALE id into .last_compacted_phase from the
# newest 'complete' row it could still see, which is what silently killed the Stop hook's
# phase-is-new test. So the cap no longer gets to be wrong quietly: not reaching PHASE-BOARD-END is
# now a detected condition that re-reads the whole file, and says so if even that fails.
$cap    = 0
$sawEnd = $false
foreach ($cap in @(400, -1)) {
    $inBlock = $false; $complete = @(); $current = $null; $currDesc = ''
    $next = $null; $nextDesc = ''
    # 'proposed' is the FOURTH status, deliberately unparsed by the board's own regex so an
    # unapproved wave cannot auto-start across a compaction. It is read HERE - and only to stay
    # quiet. Without it this hook cannot tell "board empty, recon never ran" from "board empty
    # BECAUSE recon ran and its proposals are sitting right there", so a compaction landing after a
    # recon report would send Claude round to redo the report and rewrite the very proposals
    # awaiting a greenlight.
    $proposed = @(); $sawEnd = $false
    $lines = if ($cap -gt 0) { Get-Content $board -TotalCount $cap } else { Get-Content $board }
    foreach ($l in $lines) {
        if ($l -match 'PHASE-BOARD-START') { $inBlock = $true;  continue }
        if ($l -match 'PHASE-BOARD-END')   { $inBlock = $false; $sawEnd = $true; break }
        if (-not $inBlock) { continue }
        if ($l -match '^\s*-\s*\[(complete|in_progress|pending|proposed)\]\s+(\S+)\s*::\s*(.*)$') {
            $status = $Matches[1]; $id = $Matches[2]; $desc = $Matches[3]
            if ($status -eq 'complete')    { $complete += $id }
            if ($status -eq 'in_progress') { $current = $id; $currDesc = $desc }
            if ($status -eq 'pending' -and $null -eq $next) { $next = $id; $nextDesc = $desc }
            if ($status -eq 'proposed')    { $proposed += $id }
        }
    }
    if ($sawEnd) { break }
}

# The shared predicates are loaded HERE rather than further down, because advancing the completed-set
# below needs them. A missing lib is not fatal to this hook's main job (printing the board brief), so
# it degrades: the brief still prints, the resume gates and the set-advance are skipped, and it says
# so in the log rather than dying silently.
$lib = Join-Path $PSScriptRoot 'harness-lib.ps1'
$libOk = Test-Path $lib
if ($libOk) { . $lib } else { SLog 'POST-COMPACT: harness-lib.ps1 MISSING - board brief only; no resume, no set-advance.' }

# Advance the completed-phase record so the Stop hook does not re-fire on the same phase. GUARDED ON
# $sawEnd: a partial read's complete-list is not the board's complete-list, and writing it here is
# worse than writing nothing - it would teach the Stop hook that phases it has never seen are already
# accounted for, permanently disabling their triggers.
#
# TWO RECORDS, AND THE SECOND ONE IS NOW THE REAL ONE (2026-08-17). .last_compacted_phase holds a
# single id and is kept only because other things read it; it is the file whose "newest = last row"
# assumption broke when the user reordered the wave (see harness-lib.ps1). .completed_seen holds the
# whole SET, which is what makes the Stop hook's trigger independent of board order.
if ($sawEnd -and $complete.Count -gt 0) {
    Set-Content -Path $marker -Value $complete[-1] -Encoding utf8 -NoNewline
    if ($libOk) { Set-HarnessSeenComplete $complete }
}
# A completed compaction clears the notes-gap streak: the backstop's escape allowance is per-window,
# not cumulative across the life of the project.
Remove-Item (Join-Path $proj '.claude\.notes_gap_state') -Force -ErrorAction SilentlyContinue

# Signal that compaction has ACTUALLY finished. Anything waiting on the end of a
# compaction should wait on this file rather than on a guessed sleep - compaction
# is a summarisation call over the whole transcript and its duration varies wildly.
Set-Content -Path (Join-Path $proj '.claude\.compaction_done') `
    -Value (Get-Date -Format 'o') -Encoding utf8 -NoNewline

# ---- THE PRESERVATION NOTES, PASTED IN FULL ------------------------------------------------------
# A pointer is the thing that survives summarisation; the content is what dies. Telling the fresh
# context to "read docs/PHASELOG.md FIRST" is an instruction whose execution nothing can observe, and
# it has already been skipped once (the AM8 pickup, 2026-08-17 - the board row was followed and the
# stamp was never opened). Pasting the section removes the step instead of policing it.
#
# Read by SEEKING THE HEADER, not by extending the board's line cap: the notes live ~2,800 lines down
# and a cap large enough to reach them would drag the whole control file along with it.
$notesHdr = '^##\s+Preservation notes'
try {
    # ---- DID THE LAST COMPACTION HAPPEN WITHOUT NOTES? -----------------------------------------
    # pre-compact-log.ps1 evaluates the notes predicate at the one choke point EVERY compaction
    # passes through, including the two the harness cannot gate: a user-typed /compact and the
    # built-in auto-compaction. If it recorded a gap, that outranks everything below it - the
    # stamp about to be pasted describes an OLDER moment than the one just lost, and reading it as
    # the handoff is exactly how a session picks up believing it knows where it was.
    try {
        $preState = Join-Path $proj '.claude/PRECOMPACT-STATE.md'
        if (Test-Path $preState) {
            $ps = Get-Content $preState -Raw
            if ($ps -match 'THE PRESERVATION NOTES WERE NOT WRITTEN BEFORE THIS COMPACTION') {
                $gapLine = ''
                $m = [regex]::Match($ps, '(?m)^Gap: (.+)$')
                if ($m.Success) { $gapLine = $m.Groups[1].Value }
                Write-Output '!!!! THE COMPACTION YOU JUST CAME THROUGH HAD NO PRESERVATION NOTES !!!!'
                Write-Output ''
                Write-Output ("Gap recorded at compaction time: " + $gapLine)
                Write-Output ''
                Write-Output 'It was not a harness compaction (those are blocked until the token exists), so it was'
                Write-Output 'typed by the user or fired by the built-in. THE STAMP PASTED BELOW IS STALE - it describes'
                Write-Output 'an earlier phase, and treating it as this handoff is how a session resumes confidently in'
                Write-Output 'the wrong place. Reconstruct the notes for the phase named in the gap FIRST, from the board,'
                Write-Output 'the wave file and git log, and write them into docs/PHASELOG.md before continuing the work.'
                Write-Output ''
            }
        }
    } catch { }

    $allLines = Get-Content $board
    $startIx = -1
    for ($i = 0; $i -lt $allLines.Count; $i++) {
        if ($allLines[$i] -match $notesHdr) { $startIx = $i; break }
    }
    if ($startIx -ge 0) {
        $endIx = $allLines.Count
        for ($j = $startIx + 1; $j -lt $allLines.Count; $j++) {
            if ($allLines[$j] -match '^##\s' ) { $endIx = $j; break }
        }
        $notes = $allLines[$startIx..($endIx - 1)]
        # A CAP IS A FENCE FITTED TO TODAY'S FILE, so it announces itself when it bites rather than
        # silently handing over a truncated stamp that reads complete.
        $notesCap = 220
        $truncated = $false
        if ($notes.Count -gt $notesCap) { $notes = $notes[0..($notesCap - 1)]; $truncated = $true }
        Write-Output '=== PRESERVATION NOTES (pasted by the post-compact hook - this IS the handoff) ==='
        Write-Output 'These are the notes written at the last phase close. They are here rather than'
        Write-Output 'behind a file path because a path is what survives a summary and the content is'
        Write-Output 'what does not. Read them before touching the board below.'
        Write-Output ''
        foreach ($nl in $notes) { Write-Output $nl }
        if ($truncated) {
            Write-Output ''
            Write-Output ("...TRUNCATED at $notesCap lines - the rest of the section is in docs/PHASELOG.md and MUST be read.")
        }
        Write-Output ''
    } else {
        Write-Output 'WARNING: no "## Preservation notes" section was found in docs/PHASELOG.md.'
        Write-Output 'The write-side gate should have made this impossible - treat it as a harness defect.'
        Write-Output ''
    }
} catch {
    Write-Output ("WARNING: could not read the preservation notes (" + $_.Exception.Message + ') - read docs/PHASELOG.md directly.')
    Write-Output ''
}

Write-Output '=== PHASE BOARD (injected by the post-compact hook) ==='
if (-not $sawEnd) {
    Write-Output 'WARNING: PHASE-BOARD-END was never reached, even reading the whole file. The board'
    Write-Output 'below may be INCOMPLETE - read docs/PHASELOG.md directly and trust it over this brief.'
}
if ($current) {
    Write-Output ("CURRENT PHASE (in_progress): " + $current + " :: " + $currDesc)
    Write-Output 'Continue this phase now. Its full scoping - files, constants, recon findings and'
    Write-Output 'definition of done - is in this wave''s file under docs/phases/ (the newest row of the'
    Write-Output 'wave index in docs/PHASELOG.md, just under the board).'
} elseif ($next) {
    Write-Output ("NO PHASE IS in_progress. The next documented phase is: " + $next + " :: " + $nextDesc)
    Write-Output 'Mark it in_progress on the board and begin it.'
} elseif ($proposed.Count -gt 0) {
    Write-Output ("THE RECON PASS HAS ALREADY RUN - " + $proposed.Count + " [proposed] row(s) are on the board: " + ($proposed -join ', '))
    Write-Output 'They are awaiting the user greenlight, which is the user''s to give. Do NOT re-run recon'
    Write-Output 'and do NOT rewrite them. Present them and STOP. Promoting a proposed row to pending IS'
    Write-Output 'the greenlight, so only the user does that.'
} else {
    Write-Output 'THE BOARD IS EMPTY - no in_progress and no pending phase.'
    Write-Output 'Per the user directive of 2026-08-10: explore the project for technical debt, write'
    Write-Output 'the proposed phases onto the board as [proposed] rows with real descriptions, then STOP'
    Write-Output 'and present them for greenlight. Recon is read-only and cheap; do NOT begin building'
    Write-Output 'unapproved work.'
}
# ---- WORK THAT WAS IN FLIGHT WHEN THE COMPACTION FIRED -------------------------------------------
# Added 2026-08-16 with the PreCompact rewrite. A compaction landed mid-workflow: six agents were
# running, the summariser kept the measurements (which were on disk anyway) and dropped the run id
# and script path (which were not), and the fresh context could not find its own work. This is the
# read-back half. The PreCompact hook detects in-flight work two ways - what Claude DECLARED in
# .claude/.inflight, and what it DETECTS as zero-byte task outputs - and the block only prints when
# one of them fired, so a clean compaction stays quiet.
$pcState = Join-Path $proj '.claude\PRECOMPACT-STATE.md'
if (Test-Path $pcState) {
    $pcAgeMin = ((Get-Date) - (Get-Item $pcState).LastWriteTime).TotalMinutes
    # Freshness gate: this must describe the compaction that JUST happened, not a stale one from
    # hours ago. A stale record re-announcing dead work would be its own false instrument.
    if ($pcAgeMin -le 45) {
        $pcBody = Get-Content $pcState -Raw
        if ($pcBody -notmatch 'NONE DETECTED') {
            Write-Output ''
            Write-Output '!!! WORK WAS IN FLIGHT WHEN THIS COMPACTION FIRED !!!'
            Write-Output 'Recover it or retire it BEFORE starting anything new. Full record:'
            Write-Output ('  ' + $pcState)
            $emit = $false
            foreach ($pl in ($pcBody -split "`r?`n")) {
                if ($pl -match '^## Work in flight')  { $emit = $true;  continue }
                if ($pl -match '^## Standing rule')   { $emit = $false; break }
                if ($emit -and $pl.Trim()) { Write-Output ('  ' + $pl) }
            }
            SLog ("POST-COMPACT: in-flight work reported from PRECOMPACT-STATE.md ({0:N0} min old)" -f $pcAgeMin)
        }
    }
}

Write-Output ''
Write-Output 'Standing rules that survive compaction: read docs/PHASELOG.md FIRST - it is the CONTROL'
Write-Output 'file (board, standing constraints, the ONE circle-back ledger, upcoming phases, preservation'
Write-Output 'notes) and since 2026-08-16 each wave''s narrative lives in its own docs/phases/wave-XX.md,'
Write-Output 'listed in the wave index under the board. The ledger is the ONLY debt list and is updated IN'
Write-Output 'PLACE; never schedule wakeups or crons; explicit git staging only, never add -A.'
Write-Output '======================================================='

# =================================================================================================
# WAKE CLAUDE AFTER A COMPACTION NOBODY IS WAITING ON  (added 2026-08-16, phase AM0)
# =================================================================================================
# THE DEFECT, in the user's words: "the compaction finished but i waited about a minute or so and it
# doesnt look like the harness sent you a nudge after my manual compaction, and i have the UI open
# and listening." The UI was open. The switch was on. Nothing was broken. THE CHANNEL DID NOT EXIST.
#
# Every nudge this harness has ever sent comes from compact-injector.ps1, and that process is
# launched from exactly one place: phase-stop.ps1, the STOP hook. A user-run /compact is not a Stop
# event - no turn ended - so no injector was ever launched, and no injector was parked waiting on
# .compaction_done either. The loop had a resume path for compactions IT started and none at all for
# compactions the USER started.
#
# WHY THE BOARD PRINT ABOVE IS NOT ITSELF THE FIX, which is the subtle half: SessionStart stdout is
# STAGED CONTEXT, not a turn. It rides along with whatever message comes next. It can tell Claude
# exactly which phase is live - and it did, perfectly, on the run that prompted this fix - but it
# cannot make Claude start. Something has to deliver an actual turn, and on this client that means
# the injector's paste.
#
# THE FOUR GATES, each closing a way this could misfire:
#   1. THE MASTER SWITCH. Same heartbeat every other path honours. The user's model is "click to take
#      the floor", and a compaction they ran while the harness is OFF must stay silent.
#   2. NO LIVE INJECTOR. If the harness drove this compaction, an injector is already parked on
#      .compaction_done and will send its own resume within seconds. Two pastes would put an
#      unprompted "continue the phase" mid-conversation - the exact emergent behaviour the 2026-08-09
#      directive banned.
#   3. NOT BUSY. Bundling a compaction with a cook is now the PREFERRED workflow (user 2026-08-16:
#      "id like you to try to bundle compactions with cooks in the future"), which makes "compaction
#      finishes while a cook runs" the normal case rather than the exception. During a cook the
#      completion notification is the wake signal and a nudge is redundant - the same reasoning that
#      put the busy gate in phase-stop.ps1.
#   4. THE BOARD'S OWN STATE. Proposals awaiting a greenlight get SILENCE, because a greenlight is
#      the user's to give and re-asking would rewrite the proposals they have not answered yet. This
#      hook must not be a back door into starting unapproved work.
# =================================================================================================
if (-not $libOk) { exit 0 }   # already logged above, where the lib is loaded

$newest    = ''
if ($complete.Count -gt 0) { $newest = $complete[-1] }
# Shared with phase-stop.ps1 so the two wake paths cannot both ask for recon on the same board.
$reconMark = Join-Path $proj '.claude\.last_recon_board'
$askedFor  = ''; if (Test-Path $reconMark) { $askedFor = (Get-Content $reconMark -Raw).Trim() }

$verdict = Get-HarnessResumeVerdict -Current $current -Next $next -ProposedCount $proposed.Count `
                                    -Newest $newest -ReconAskedFor $askedFor

# Logged EVERY time, launch or not. The failure this whole block exists to fix presented as silence,
# and silence is indistinguishable from "switched off" to anyone reading from the outside. Now every
# compaction leaves a line in the pane the UI tails saying what the harness decided and why.
SLog ("POST-COMPACT: " + $verdict.Reason)
if ($verdict.Action -ne 'launch') { exit 0 }
if ($verdict.MarkRecon) { Set-Content -Path $reconMark -Value $newest -Encoding utf8 -NoNewline }

$injector = Join-Path $PSScriptRoot 'compact-injector.ps1'
# THE LINE TRAVELS IN A FILE, NOT AN ARGUMENT (2026-08-18). Start-Process -ArgumentList joins its
# array on spaces WITHOUT quoting elements that contain spaces, so '-Line',$verdict.Line died on
# parameter binding for every multi-word line - before compact-injector.ps1 reached its first Log
# call, so it failed silently. This survived only because the line that happened to be exercised
# was the single word 'continue'. Same defect, same day, as phase-stop.ps1's Launch().
#
# PORT FIX 2026-08-19: the source project wrote this file to '.claude.nudge_line' - a missing
# backslash that dropped a stray file at the PROJECT ROOT instead of inside .claude\. It worked
# (writer and reader share this one variable), but the path was a typo. Corrected here to live in
# .claude\ with every other piece of harness state; worth backporting to the source install.
$lineFile = Join-Path $proj '.claude\.nudge_line'
Set-Content -Path $lineFile -Value $verdict.Line -Encoding utf8 -NoNewline
Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -ArgumentList @(
    '-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',$injector,
    '-Phase','post-compact','-Mode','resume','-LineFile',$lineFile) | Out-Null

exit 0
