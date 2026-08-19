# Mode 'compact' : raise Claude, send /compact, WAIT for the compaction to finish, send the resume.
# Mode 'resume'  : raise Claude and send the resume line only.
#                  This is the DEFERRAL path (user 2026-08-10). The gate declining to compact used to
#                  end the turn and leave the loop dead - the compaction path had an injector to wake
#                  Claude and the deferral path had nothing, so an autonomous wave simply stopped at
#                  the first phase boundary under the threshold. A nudge keeps the wave running WITHOUT
#                  scheduling a wakeup, which the standing 2026-08-09 directive forbids.
#
# -Line     : WHAT to send in 'resume' mode. Added 2026-08-12. Both modes used to send one
#             hardcoded string, "continue the in_progress phase", which quietly made the nudge
#             channel able to express exactly one instruction - and the RECON request (the thing
#             that is supposed to happen when a wave finishes) lived only in the post-compact hook,
#             so it could be reached only by going through a compaction. A wave that ended under the
#             compaction threshold was never asked for recon at all. Defaulted to the old string so
#             every existing caller behaves identically.
# -LineFile : WHERE to read the line from, and it is now the PREFERRED channel. Added 2026-08-18
#             after -Line was found to have been DEAD SINCE THE DAY IT WAS ADDED (2026-08-12).
#             Start-Process -ArgumentList takes an ARRAY, joins it on spaces, and does NOT quote
#             elements that themselves contain spaces - so '-Line','the phase board has no...'
#             reached this script as -Line the phase board has no..., bound -Line to "the", and
#             died on parameter binding BEFORE the first Log call. Five callers passed a
#             multi-word -Line; all five logged that they had nudged and delivered nothing, for
#             six days. A path carries no spaces and no quoting rules, so this channel cannot
#             break the same way. -Line is still honoured for any caller that passes a single
#             word, but nothing in the harness should use it any more.
# -NotesKind / -NotesOverride : the preservation-notes gate, added 2026-08-17. See the block below
#             the busy gate. 'closed' checks for the "<PHASE> CLOSED" token, 'inflight' for
#             "<PHASE> IN FLIGHT". -NotesOverride is passed ONLY by the 75% backstop after it has
#             asked $MaxNotesNudges times, because past that point losing the compaction to the
#             built-in is worse than compacting without notes.
param([string]$Phase = "", [string]$Mode = "compact", [string]$Line = "",
      [string]$LineFile = "",
      [string]$NotesKind = "closed", [switch]$NotesOverride)
$ErrorActionPreference = 'SilentlyContinue'
$proj = 'C:\Users\doria\web-projects\starlet-tattoos'
$log  = Join-Path $proj '.claude\hook-injector.log'
$done = Join-Path $proj '.claude\.compaction_done'
function Log($m){ Add-Content -Path $log -Value ((Get-Date -Format 'HH:mm:ss')+'  '+$m) -Encoding utf8 }

# =================================================================================================
# THE BUSY GATE BELONGS HERE, AT THE CHOKE POINT (2026-08-16).
#
# This script is the ONLY thing in the whole harness that types into the user's window. Every nudge,
# every resume, every fallback goes through Send-Line in this file. Gating "don't wake Claude during
# a cook" at each CALLER is how the bug got in: phase-stop.ps1 grew a correct, well-tested busy gate
# and then routed its compaction branch around it, because that branch reads as "compact", not as
# "nudge" - and nobody looking at the caller can see that the injector ends by pasting a resume.
#
# A predicate enforced at three call sites is a predicate with three chances to be forgotten. Held
# at the single point where the side effect actually happens, it cannot be routed around, and any
# FUTURE caller inherits it without knowing it exists.
#
# A MISSING LIB MEANS "NOT BUSY", which is the opposite of phase-stop.ps1's loud stop, and the
# asymmetry is deliberate. There, failing closed means doing nothing for one turn - free. Here,
# failing closed means never pasting, which strands an autonomous wave with nothing scheduled to
# wake it. When this gate cannot evaluate itself it must fall back to the old, noisy, LIVE behaviour.
$hlib = Join-Path $PSScriptRoot 'harness-lib.ps1'
if (Test-Path $hlib) { . $hlib }
function Get-PasteBlockReason {
  if (-not (Get-Command Get-HarnessBusyReason -ErrorAction SilentlyContinue)) { return '' }
  return (Get-HarnessBusyReason)
}

Add-Type -AssemblyName Microsoft.VisualBasic
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Text; using System.Runtime.InteropServices;
public class CW {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  public static string T(){ IntPtr h=GetForegroundWindow(); if(h==IntPtr.Zero) return ""; StringBuilder b=new StringBuilder(512); GetWindowText(h,b,512); return b.ToString(); }
  public static string C(){ IntPtr h=GetForegroundWindow(); if(h==IntPtr.Zero) return ""; StringBuilder b=new StringBuilder(256); GetClassName(h,b,256); return b.ToString(); }
}
"@

# THE THIRD FAILURE MODE OF THIS CHANNEL, and it was self-inflicted (2026-08-13, phase AF5).
#
#   03:18:48  FIRE: phase AF5 complete - launching injector
#   03:18:56  raise attempt 1 failed - foreground is [SplashScreenGuard]   ... x5
#   03:19:08  HUNG: could not raise Claude in 5 tries. NOTHING SENT.
#
# SplashScreenGuard is UNREAL'S SPLASH WINDOW. Every phase in this wave closes moments after a QA
# run launches or tears down an editor, so the loop's own nudge races the tooling the phase just
# used - and the old budget was five tries across THIRTEEN SECONDS, which an Unreal splash or a
# teardown outlives comfortably. Refusing to type into the wrong window was RIGHT (blind pasting
# into an editor is a far worse outcome than a stall); giving up in thirteen seconds was not.
#
# So it now WAITS OUT the interloper instead of losing to it: up to four minutes, which covers an
# editor's whole launch-and-splash, and it names what it is waiting for the first time and then
# every twentieth attempt, so the log stays readable while still fingerprinting the blocker.
function Raise-Claude {
  $deadline = (Get-Date).AddMinutes(4)
  $i = 0
  $lastBlocker = ''
  while ((Get-Date) -lt $deadline) {
    $i++
    try { [Microsoft.VisualBasic.Interaction]::AppActivate('Claude') } catch { }
    Start-Sleep -Milliseconds 700
    if ([CW]::T() -eq 'Claude' -and [CW]::C() -eq 'Chrome_WidgetWin_1') {
      if ($i -gt 1) { Log ("raise SUCCEEDED on attempt $i (waited out the blocker)") }
      return $true
    }
    $blocker = [CW]::T()
    if ($blocker -ne $lastBlocker -or ($i % 20) -eq 0) {
      Log ("raise attempt $i failed - foreground is [" + $blocker + "]")
      $lastBlocker = $blocker
    }
    Start-Sleep -Seconds 2
  }
  Log ("raise EXHAUSTED after $i attempts over 4 min - last blocker was [" + $lastBlocker + "]")
  return $false
}

# THIS FUNCTION USED TO LOG NOTHING AND CLAIM SUCCESS. On 2026-08-10 the resume nudge logged
# "guard passed - sending CONTINUE nudge" and NO TURN STARTED - and the log could not say why,
# because it recorded the intent to paste and nothing about the paste. A channel with no delivery
# confirmation is not a channel you can debug, which is this project's own fix-the-instrument law
# applied to its own plumbing. Now every step states the foreground window it acted on, so a focus
# loss (the one failure mode that would explain a silent no-op) leaves a fingerprint.
function Send-Line([string]$text) {
  # ================================================================================================
  # DO NOT SEND ESC FROM THIS CHANNEL. IT IS THE REWIND SHORTCUT. (2026-08-14, reverted 2026-08-14)
  # ================================================================================================
  # A "caret fix" added here at 14:32 sent {ESC}{ESC} before every paste, reasoning that ESC closes
  # an overlay holding the keyboard and "is inert when the composer already holds the caret". The
  # second half of that premise is FALSE for this client: DOUBLE-ESC IS CLAUDE CODE'S REWIND
  # SHORTCUT. So every paste opened the rewind picker, typed into it, and pressed Enter twice.
  #
  # It was not a subtle regression, and the log is a clean controlled experiment - one variable,
  # a hard before/after:
  #   BEFORE 14:32   compact.log gains a PreCompact row on every run: 07:57, 08:36, 10:05, 10:52
  #                  (AG2, AG3, AG4, AG5 - four for four).
  #   AFTER  14:32   SIX /compact sends across two runs (14:35:00-14:36:25, 14:39:44-14:41:08),
  #                  every fingerprint healthy - foreground=[Claude] at all three checkpoints -
  #                  and compact.log gains NOTHING. Zero for six.
  # The user watched the other half of it from the front: "cannot rewind to this message" toasts
  # they never asked for, and messages, answers and printed thoughts disappearing and reappearing
  # as the picker walked the history. The channel was not failing to reach the app; it was driving
  # the app somewhere else.
  #
  # THE LAW THIS CHANNEL KEEPS RE-LEARNING, now in its strongest form: a blind keystroke is not a
  # neutral act. Every key this function sends is a GLOBAL SHORTCUT somewhere in the client, and a
  # fix that adds one is a fix that presses it - so this channel may only send keys whose behaviour
  # is understood in the composer AND in whatever else might hold focus. When the caret is in
  # doubt, the correct response is the one already built below: send, CONFIRM against the PreCompact
  # row, retry, and fall through to the resume so a stall never kills the wave. Confirmation beats
  # coercion. The stall this ESC was meant to cure cost one boundary; the cure cost the whole UI.
  # WAVE AJ - THE THIRD SILENT FAILURE, AND THIS TIME THE LOG CAUGHT THE MECHANISM. On 2026-08-15 the
  # nudge for phase AI4 logged pre-paste=[Claude], post-paste=[Claude], and then
  # post-enter=[SighthoundsEOS.exe]: the paste landed in the composer and the packaged game took
  # foreground in the ~2 s before the ENTER, so the SUBMIT went to the game and the text sat unsent.
  # The wave's own battery was the thief - 37 consecutive raise attempts in that same run are blocked
  # by SighthoundsEOS.exe - which makes this failure MOST likely during exactly the long
  # packaged-gate phases the nudge exists to carry.
  #
  # THE FIX OBEYS THE LAW ABOVE RATHER THAN BENDING IT. That law says this channel may only send keys
  # whose behaviour is understood in whatever holds focus; the defect is that it sent ENTER into a
  # game. So the fix WITHHOLDS a keystroke instead of adding one: re-check the foreground immediately
  # before each ENTER, try once to re-raise, and if the composer is not in front, SEND NOTHING and say
  # so. A missed ENTER leaves pasted text a human can submit; a stray ENTER goes wherever it likes.
  # The confirm-and-retry path below already treats "nothing arrived" as a stall, so withholding is
  # strictly the safer branch.
  $enterIfFocused = {
    param([string]$whichEnter)
    if ([CW]::T() -ne 'Claude' -or [CW]::C() -ne 'Chrome_WidgetWin_1') {
      Log ("send: foreground moved to [" + [CW]::T() + "] before $whichEnter - re-raising")
      if (-not (Raise-Claude)) {
        Log "send: WITHHELD $whichEnter - composer not in front. Text is pasted but UNSENT."
        return $false
      }
      Start-Sleep -Milliseconds 300
    }
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    return $true
  }

  Log ("send: pre-paste foreground=[" + [CW]::T() + "] class=[" + [CW]::C() + "]")
  Set-Clipboard -Value $text
  Start-Sleep -Milliseconds 250
  [System.Windows.Forms.SendKeys]::SendWait('^v')
  Start-Sleep -Milliseconds 600
  Log ("send: post-paste foreground=[" + [CW]::T() + "]")
  if (& $enterIfFocused 'ENTER#1') {
    Start-Sleep -Milliseconds 1200
    & $enterIfFocused 'ENTER#2' | Out-Null
    Start-Sleep -Milliseconds 500
  }
  Log ("send: post-enter foreground=[" + [CW]::T() + "]")
}

Log "=== injector start (phase $Phase, mode $Mode) ==="

# -LineFile wins over -Line. Read it BEFORE the default is applied, and log what happened either
# way: the failure this replaced was silent, so this channel reports itself.
if ($LineFile) {
  if (Test-Path $LineFile) {
    $fromFile = ([string](Get-Content $LineFile -Raw -ErrorAction SilentlyContinue)).Trim()
    if ($fromFile) { $Line = $fromFile; Log ("line read from LineFile (" + $fromFile.Length + " chars)") }
    else { Log "WARNING: -LineFile exists but is EMPTY - falling back to the default line" }
  } else {
    Log ("WARNING: -LineFile does not exist [" + $LineFile + "] - falling back to the default line")
  }
}
if (-not $Line) { $Line = 'continue the in_progress phase per the phase board in docs/PHASELOG.md' }

# =================================================================================================
# THE PRESERVATION-NOTES GATE, HELD AT THE SAME CHOKE POINT AS THE BUSY GATE (2026-08-17)
# =================================================================================================
# User: "it should not be possible for you to claim youre ready for a compaction without ever
# writing context preservation notes." It was possible, and on 2026-08-17 it happened: AM6 was
# closed, reported done, and declared ready to compact while docs/phases/wave-am.md still ended at
# AM5 and the preservation-notes stamp still read AM2 from the day before. Both artifacts were
# written only because the user asked a direct question.
#
# phase-stop.ps1 checks this too, and chooses a helpful nudge when it fails. THIS check is the one
# that actually enforces it, for the reason written above the busy gate and learned the expensive
# way: a predicate enforced at each caller is a predicate with one chance per caller to be routed
# around, and this file is the only thing in the harness that can type /compact. Any FUTURE caller
# inherits the gate here without knowing it exists.
#
# FAILS OPEN WHEN IT CANNOT EVALUATE, exactly like the busy gate directly above and for the same
# reason: failing closed here means never pasting, which strands an autonomous wave with nothing
# scheduled to wake it. A missing lib must degrade to the old, noisy, LIVE behaviour.
function Get-NotesGapReason {
  if ($NotesOverride) { return '' }
  if (-not (Get-Command Get-HarnessNotesGap -ErrorAction SilentlyContinue)) { return '' }
  $g = Get-HarnessNotesGap -Phase $Phase -Kind $NotesKind
  if ($g) { return $g }
  # FRESHNESS (2026-08-18): a token is necessary but not sufficient - a section byte-identical to
  # what the last compaction consumed preserves nothing new (an IN FLIGHT token never expires
  # within its phase, so a long phase could compact twice on the same notes). Same fail-open
  # posture as the token check above, for the same reason.
  if (Get-Command Get-HarnessNotesStale -ErrorAction SilentlyContinue) { return (Get-HarnessNotesStale) }
  return ''
}
if ($Mode -eq 'compact') {
  $ngap = Get-NotesGapReason
  if ($ngap) {
    Log ("REFUSED: preservation notes are owed for phase $Phase ($NotesKind) - $ngap. /compact NOT sent.")
    Log '=== injector done (refused: notes owed) ==='
    exit 8
  }
  if ($NotesOverride) { Log "NOTES GATE OVERRIDDEN by the backstop - compacting without confirmed notes for $Phase." }
}

# ---- ONE COMPACT INJECTOR AT A TIME ------------------------------------------------------------
# The Stop hook keys its FIRE on "the newest complete phase is newer than .last_compacted_phase",
# and that marker is only advanced by the post-compact hook - so while a compaction is pending, EVERY
# subsequent turn end fires again for the same phase. On 2026-08-12 that produced two live injectors
# for AE1: the first typed /compact into nothing, the second (eleven minutes later, at the next turn
# end) delivered it. The accidental retry is what saved the run, and it is exactly the behaviour the
# block above now does deliberately, bounded and logged.
#
# Uncontrolled it is worse than useless: each spare injector sits on its own 35-minute wait and will
# independently paste a resume nudge the moment any compaction completes - an unprompted "continue
# the phase" arriving mid-conversation, which is the emergent behaviour the 2026-08-09 directive
# banned. One at a time.
#
# THE LOCK IS SELF-HEALING BY CONSTRUCTION: it records a PID and a start time, and a lock whose
# process is gone (killed, crashed, machine rebooted) simply reads as free. Nothing has to remember
# to release it, which is the only kind of lock this channel could be trusted with.
$lock = Join-Path $proj '.claude\.injector.lock'
if ($Mode -eq 'compact') {
  if (Test-Path $lock) {
    $parts = (Get-Content $lock -Raw -ErrorAction SilentlyContinue) -split '\|'
    $held = $null
    if ($parts.Count -ge 2) { $held = Get-Process -Id ([int]$parts[0]) -ErrorAction SilentlyContinue }
    if ($held -and "$($held.StartTime.Ticks)" -eq $parts[1].Trim()) {
      Log ("ALREADY RUNNING: injector PID " + $parts[0] + " holds the lock - this launch does nothing")
      exit 7
    }
    Log 'stale lock (its process is gone) - taking it'
  }
  Set-Content -Path $lock -Value ("{0}|{1}" -f $PID, (Get-Process -Id $PID).StartTime.Ticks) -Encoding utf8 -NoNewline
}

if ($Mode -eq 'resume') {
  $blk = Get-PasteBlockReason
  if ($blk) { Log ("QUIET: " + $blk + " - the job's completion notification is the wake signal. Nudge NOT sent."); exit 0 }
  Start-Sleep -Seconds 5
  if (-not (Raise-Claude)) { Log 'HUNG: could not raise Claude for the nudge. NOTHING SENT.'; exit 3 }
  Log ('guard passed - sending nudge: ' + $Line)
  Send-Line $Line
  Log '=== injector done (resume) ==='
  exit 0
}

Remove-Item $done -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 5
if (-not (Raise-Claude)) { Log 'HUNG: could not raise Claude in 5 tries. NOTHING SENT.'; exit 3 }

# =================================================================================================
# DELIVERY CONFIRMATION, AND WHY IT IS THE *PRECOMPACT* LOG AND NOT .compaction_done
# =================================================================================================
# 2026-08-12: this channel typed /compact at a correctly-foregrounded Claude window and nothing
# happened - the third silent failure of the same paste. Every checkpoint in Send-Line said
# foreground=[Claude], because all three of them measure WHICH WINDOW IS ON TOP and none of them
# measures the thing that actually has to be true: that the composer holds the caret. The function
# was instrumented after the previous two failures and it instrumented the half that was already
# working. So: retry, and confirm.
#
# THE CONFIRMATION SIGNAL IS NOT .compaction_done. That file is written by the SessionStart:compact
# hook when a compaction FINISHES, and a compaction takes 20-30 MINUTES (user, 2026-08-12: "dont try
# to rely on compaction happening in 20s because that will fail every time"). A retry keyed on it
# would re-send /compact into an in-flight compaction on every single run.
#
# What we need is "did the command get ACCEPTED", and the PreCompact hook already answers exactly
# that: it fires when a compaction BEGINS and appends a row to .claude/compact.log. Measured on the
# run that worked - Send-Line finished at 09:09:30 and compact.log gained its row at 09:09:30. Same
# second. On the run that failed, post-enter at 10:06:00 and compact.log gained nothing, ever.
# The evidence that DIAGNOSED the failure is the evidence that can prevent it.
#
# 24 s of patience against a ~0-3 s signal is an 8x margin, so a late-but-successful submit being
# re-sent is a remote case rather than the normal one - and even then the composer is disabled
# during a compaction, so the stray paste goes nowhere.
$clog = Join-Path $proj '.claude\compact.log'
function Compact-Rows {
  if (Test-Path $clog) { return (Get-Content $clog -ErrorAction SilentlyContinue | Measure-Object -Line).Lines }
  return 0
}
$rowsBefore = Compact-Rows
$sent = $false
for ($try = 1; $try -le 3 -and -not $sent; $try++) {
  if ($try -gt 1 -and -not (Raise-Claude)) { Log 'lost the window before a retry - NOTHING MORE SENT.'; break }
  Log ("guard passed - sending /compact (attempt $try of 3, compact.log rows=$rowsBefore)")
  Send-Line '/compact'
  for ($w = 0; $w -lt 12; $w++) {   # 12 x 2 s = 24 s
    Start-Sleep -Seconds 2
    # Either signal proves acceptance: a PreCompact row (the normal case) or, for a compaction so
    # small it finished inside the window, the done marker itself.
    if ((Compact-Rows) -gt $rowsBefore -or (Test-Path $done)) { $sent = $true; break }
  }
  if (-not $sent) {
    Log ("attempt $try produced NO PreCompact row in 24 s - the keystrokes did not reach the composer")
  }
}
if (-not $sent) {
  # THE 2026-08-14 STALL, MADE IMPOSSIBLE TO REPEAT: this branch used to withhold the resume and
  # exit, which left the whole autonomous wave dead at a boundary the user then had to notice by
  # eye ("phase aware compaction stalled again"). A stalled loop is strictly worse than an
  # oversized context window: send the resume anyway and let the wave continue UNCOMPACTED.
  # .last_compacted_phase does not advance, so the very next turn end re-fires this same boundary
  # and the compaction gets retried - the 2026-08-12 "accidental retry that saved the run", now
  # deliberate on the failure path too.
  Log 'FAILED: /compact never reached the composer after 3 attempts.'
  $blk = Get-PasteBlockReason
  if ($blk) {
    Log ("FALLBACK SUPPRESSED: " + $blk + " - the boundary stays owed and the next turn end retries it, but nothing wakes Claude mid-job. Exiting quiet.")
    exit 6
  }
  Log 'FALLBACK: sending the resume WITHOUT compacting - the boundary stays owed and the next turn end retries it.'
  if (Raise-Claude) {
    Send-Line $Line
    Log '=== injector done (compact FAILED, fallback resume sent) ==='
  } else {
    Log 'HUNG: could not raise for the fallback resume. NOTHING SENT.'
  }
  exit 6
}
Log 'compaction ACCEPTED (PreCompact fired) - now waiting for it to finish'

$deadline = (Get-Date).AddSeconds(2100)
$beat = 0
while (-not (Test-Path $done)) {
  if ((Get-Date) -gt $deadline) { Log 'HUNG: compaction did not finish in 35 min. Resume NOT sent.'; exit 4 }
  Start-Sleep -Seconds 5
  $beat++
  if ($beat % 12 -eq 0) { Log ("still waiting for compaction - " + ($beat*5) + "s elapsed") }
}
# THE PASTE THAT CAUSED THE 2026-08-16 REPORT. Re-checked HERE rather than trusting the check made
# before the compaction, because a compaction takes 20-35 minutes: a cook that had not started when
# this injector launched is very likely running by the time it lands. The stale answer is the wrong
# answer precisely when the wait was longest.
$blk = Get-PasteBlockReason
if ($blk) {
  Log ("compaction confirmed, but QUIET: " + $blk + " - the job's completion notification is the wake signal. Resume NOT sent.")
  Log '=== injector done (compacted, resume suppressed - job in flight) ==='
  exit 0
}
Log 'compaction confirmed - sending resume'
Start-Sleep -Seconds 2
if (-not (Raise-Claude)) { Log 'HUNG: could not raise for resume. NOTHING SENT.'; exit 5 }
Send-Line 'continue the in_progress phase per the phase board in docs/PHASELOG.md'
Log '=== injector done ==='
exit 0
