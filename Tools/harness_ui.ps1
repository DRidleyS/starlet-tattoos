<#
  harness_ui.ps1  --  PHASE AUTOMATION HARNESS: the master switch, plus read-only views of the
  logs it writes and the board it acts on.

  WHY THIS EXISTS (user 2026-08-16): "i would like a UI for myself to operate the phase-and-cook-
  aware compaction tooling with a simple on/off button so that i can leave the ui open next to your
  window and i can toggle the whole automation harness so i can interrupt and send you messages
  without fighting the constant injection like i have been while writing this message."

  THE MODEL, in the user's words: "i want the harness to default to off with the UI application
  closed ... turn my computer on, launch claude desktop, give you some work, click on my harness
  icon pinned to my taskbar, and have the switch ... ready for me to fire up and start listening
  for hooks."

  So: OFF IS THE RESTING STATE. The harness does nothing at all unless this window is open AND
  switched on. Nothing to remember, nothing to clean up, and a fresh boot is always quiet.

  HOW IT WORKS - A HEARTBEAT, NOT A FLAG. While ON, this window rewrites .claude\.harness_on every
  2 seconds. phase-stop.ps1 requires that file to exist AND to be less than 20 seconds old.
  A flag would have been wrong in the one case that matters: this window crashing, or the machine
  rebooting with the flag set, would leave the harness armed with nobody watching it. A heartbeat
  cannot do that. Closing the window, killing it, or pulling the power all stop the refresh, and
  the harness falls silent on its own. Staying on requires something alive to keep saying so.

  MINIMISING DOES NOT SWITCH IT OFF, and that is deliberate. The heartbeat is driven by a timer,
  and a minimised window still ticks. Only closing (or dying) stops it. This is why the window is a
  real top-level window run through Application::Run rather than a modal ShowDialog: the previous
  cut ran the form as a DIALOG, which is why it could not be minimised to the taskbar at all.

  WHAT "ON" ACTUALLY ENABLES: context compaction at phase boundaries, and the continue-nudge that
  keeps an autonomous wave moving. It does NOT gate the machine - a cook, build or QA battery
  started before you switched off keeps running to completion.

  THE TWO VIEWS ARE STRICTLY READ-ONLY. "Logs" tails the four files the harness writes; "Phases"
  renders the board out of docs\PHASELOG.md. Neither ever writes to either. That is not politeness -
  PHASELOG.md must never be round-tripped through PowerShell text cmdlets (it is the control file,
  and a re-encode would corrupt rows the hooks parse), so this window only ever reads it.

  ALWAYS-ON-TOP IS OFF BY DEFAULT (user 2026-08-17: "it demands the foreground, and id like it to be
  able to sit behind other windows since this is the machine we are running the game on, and i want
  game testing to be foregrounded"). This machine both runs the harness AND runs the game, so a
  switch that floats over everything competes with the thing under test. Pass -TopMost, or use the
  "On top" toggle in the window, when you do want it pinned; the choice is remembered.

  Usage:  ./Tools/harness_ui.ps1          (or pin the shortcut - see Tools/make_harness_shortcut.ps1)
          ./Tools/harness_ui.ps1 -TopMost -StartOn
#>
[CmdletBinding()]
# -NoTopMost is retained as an accepted no-op: it was the old opt-OUT, and off is now the default,
# so any existing shortcut that still passes it keeps working and means what it says.
param([switch]$TopMost, [switch]$NoTopMost, [switch]$StartOn)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$proj     = Split-Path $PSScriptRoot -Parent
$onFile   = Join-Path $proj '.claude\.harness_on'
$board    = Join-Path $proj 'docs\PHASELOG.md'
$geomFile = Join-Path $proj '.claude\.harness_ui.geometry'

# ---- THE SHARED PREDICATES -----------------------------------------------------------------------
# THE SAME definition the hooks use, not a copy of it. This was a hand-synced duplicate until
# 2026-08-16, when a THIRD consumer (post-compact-resume.ps1) turned "kept in sync by hand" into a
# promise nobody could keep. A readout that disagrees with the hook it reports on is worse than no
# readout, because it is believed. Dot-sourcing does not let this window change the hooks' behaviour
# - the lib is pure predicates, and nothing here writes to it.
$lib = Join-Path $proj '.claude\hooks\harness-lib.ps1'
if (-not (Test-Path $lib)) {
  [System.Windows.Forms.MessageBox]::Show(
    "harness-lib.ps1 is missing:`n$lib`n`nThe hooks share their gates with this window through that file. Without it this switch cannot report what the harness will actually do.",
    'Phase Automation Harness') | Out-Null
  exit 1
}
. $lib

# Start OFF unless explicitly asked otherwise: opening the window must not by itself arm anything.
$script:IsOn = [bool]$StartOn
# Any marker left by a previous run is someone else's stale state. Clear it so the window's
# displayed state and the hook's actual state can never disagree at startup.
Remove-Item $onFile -Force -ErrorAction SilentlyContinue

# ---- PALETTE -------------------------------------------------------------------------------------
function C([int]$r,[int]$g,[int]$b) { return [System.Drawing.Color]::FromArgb($r,$g,$b) }
$colBg      = C 20 20 24
$colCard    = C 30 30 36
$colCardHi  = C 40 40 48
$colBorder  = C 54 54 64
$colText    = C 234 234 240
$colDim     = C 152 152 162
$colFaint   = C 112 112 122
$colOn      = C 38 150 80
$colOnHot   = C 48 176 96
$colOff     = C 68 68 78
$colOffHot  = C 86 86 98
$colAccent  = C 92 162 240
$colWarn    = C 230 170 60
$colDanger  = C 214 90 90

# Status -> colour, used by both the main readout and the Phases list.
function Get-StatusColor([string]$s) {
  switch ($s) {
    'complete'    { return (C 62 172 112) }
    'in_progress' { return $colWarn }
    'pending'     { return (C 122 132 152) }
    'proposed'    { return $colAccent }
    default       { return $colDim }
  }
}

$fontUI    = New-Object System.Drawing.Font('Segoe UI',9)
$fontUIB   = New-Object System.Drawing.Font('Segoe UI',9,[System.Drawing.FontStyle]::Bold)
$fontSmall = New-Object System.Drawing.Font('Segoe UI',7.5)
$fontTitle = New-Object System.Drawing.Font('Segoe UI',11,[System.Drawing.FontStyle]::Bold)
$fontBig   = New-Object System.Drawing.Font('Segoe UI',14,[System.Drawing.FontStyle]::Bold)
$fontMono  = New-Object System.Drawing.Font('Consolas',8.5)

# ---- SMALL BUILDERS ------------------------------------------------------------------------------
function New-FlatButton([string]$text,[System.Drawing.Color]$back,[System.Drawing.Color]$hot,[System.Drawing.Font]$font) {
  $b = New-Object System.Windows.Forms.Button
  $b.Text      = $text
  $b.FlatStyle = 'Flat'
  $b.Font      = $font
  $b.ForeColor = $colText
  $b.BackColor = $back
  $b.FlatAppearance.BorderSize = 0
  $b.FlatAppearance.MouseOverBackColor = $hot
  $b.Cursor    = [System.Windows.Forms.Cursors]::Hand
  return $b
}

# A checkbox drawn as a toggle BUTTON. A stock WinForms CheckBox paints its tick box in system
# colours: on this palette the box is a dark square on a dark panel and the tick is invisible, so
# the control silently stops reporting its own state. Appearance='Button' is fully themeable.
function New-ToggleCheck([string]$text,[bool]$checked) {
  $c = New-Object System.Windows.Forms.CheckBox
  $c.Appearance = 'Button'
  $c.TextAlign  = 'MiddleCenter'
  $c.FlatStyle  = 'Flat'
  $c.Font       = $fontUI
  $c.Text       = $text
  $c.BackColor  = $colCard
  $c.Cursor     = [System.Windows.Forms.Cursors]::Hand
  $c.FlatAppearance.BorderSize        = 1
  $c.FlatAppearance.BorderColor       = $colBorder
  $c.FlatAppearance.CheckedBackColor  = $colAccent
  $c.FlatAppearance.MouseOverBackColor= $colCardHi
  $c.Add_CheckedChanged({
    param($s,$e)
    if ($s.Checked) { $s.ForeColor = [System.Drawing.Color]::White } else { $s.ForeColor = $colDim }
  })
  $c.Checked   = $checked
  $c.ForeColor = if ($checked) { [System.Drawing.Color]::White } else { $colDim }
  return $c
}

# A card: a flat panel with a hairline border, drawn rather than themed (WinForms has no border
# colour of its own that respects a dark palette).
function New-Card() {
  $p = New-Object System.Windows.Forms.Panel
  $p.BackColor = $colCard
  $p.Add_Paint({
    param($s,$e)
    $pen = New-Object System.Drawing.Pen($colBorder)
    $e.Graphics.DrawRectangle($pen, 0, 0, $s.Width-1, $s.Height-1)
    $pen.Dispose()
  })
  return $p
}

# A status dot. The colour rides on .Tag so the Paint handler stays a single shared closure.
function New-Dot([System.Drawing.Color]$col) {
  $d = New-Object System.Windows.Forms.Panel
  $d.Size = New-Object System.Drawing.Size(10,10)
  $d.Tag  = $col
  $d.Add_Paint({
    param($s,$e)
    $e.Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $br = New-Object System.Drawing.SolidBrush($s.Tag)
    $e.Graphics.FillEllipse($br, 0, 0, 9, 9)
    $br.Dispose()
  })
  return $d
}

function New-ReadOnlyBox([System.Drawing.Font]$font) {
  $t = New-Object System.Windows.Forms.TextBox
  $t.Multiline   = $true
  $t.ReadOnly    = $true
  $t.ScrollBars  = 'Both'
  $t.WordWrap    = $false
  $t.BackColor   = $colCard
  $t.ForeColor   = $colDim
  $t.Font        = $font
  $t.BorderStyle = 'None'
  return $t
}

# ---- BOARD PARSING (READ-ONLY) -------------------------------------------------------------------
# Bounded to the board block. The board lives at the top of the file inside HTML markers; rows that
# look like phase rows also appear further down inside commented-out wave notes, so scanning the
# whole document would invent phases that are not on the board.
function Get-BoardRows {
  $rows = @()
  if (-not (Test-Path $board)) { return $rows }
  try {
    $lines = Get-Content $board -Encoding UTF8 -ErrorAction Stop
  } catch { return $rows }
  $inBoard = $false
  $idx = 0
  foreach ($l in $lines) {
    $idx++
    if ($l -match 'PHASE-BOARD-START') { $inBoard = $true;  continue }
    if ($l -match 'PHASE-BOARD-END')   { $inBoard = $false; break }
    if (-not $inBoard) { continue }
    # A commented-out row is a note about a phase, not a phase. The hooks ignore them; so must this.
    if ($l -match '^\s*<!--') { continue }
    if ($l -match '^\s*-\s*\[(complete|in_progress|pending|proposed)\]\s*(\S+)\s*::\s*(.*)$') {
      $rows += [pscustomobject]@{
        Status = $Matches[1]
        Id     = $Matches[2]
        Desc   = $Matches[3]
        Line   = $idx
      }
    }
  }
  return $rows
}

function Get-CurrentPhase {
  if (-not (Test-Path $board)) { return 'no board' }
  try {
    foreach ($l in (Get-Content $board -TotalCount 400 -Encoding UTF8 -ErrorAction Stop)) {
      if ($l -match '^\s*<!--') { continue }
      if ($l -match '^\s*-\s*\[in_progress\]\s*(\S+)\s*::\s*(.*)$') {
        $d = $Matches[2]
        # Strip markdown emphasis so the one-line readout is not full of asterisks.
        $d = $d -replace '\*\*','' -replace '`',''
        if ($d.Length -gt 34) { $d = $d.Substring(0,34) + '...' }
        return ($Matches[1] + '  ' + $d)
      }
    }
    return 'no phase in progress'
  } catch { return 'board unreadable' }
}

function Get-BusyText {
  $reason = Get-HarnessBusyReason
  if ($reason) { return $reason }
  return 'idle'
}

# ---- MAIN WINDOW ---------------------------------------------------------------------------------
# FREELY RESIZABLE (user 2026-08-16: "i want the harness UI window to be freely resizable because i
# have OCD and its killing me not to be able to fill the right side of the screen"), and now also
# MINIMISABLE (user 2026-08-17). Dock-based layout throughout, so every panel grows with the window
# instead of stranding a fixed-width column in the corner of a tall one.
$form                 = New-Object System.Windows.Forms.Form
$form.Text            = 'Phase Automation Harness'
$form.Size            = New-Object System.Drawing.Size(400,470)
$form.MinimumSize     = New-Object System.Drawing.Size(380,440)
$form.FormBorderStyle = 'Sizable'
$form.MaximizeBox     = $true
$form.MinimizeBox     = $true
$form.ShowInTaskbar   = $true
# OFF unless asked for. The geometry file may raise it back if it was left on last time.
$script:OnTop         = [bool]$TopMost
$form.TopMost         = $script:OnTop
$form.BackColor       = $colBg
$form.StartPosition   = 'Manual'
$form.Padding         = New-Object System.Windows.Forms.Padding(0)

# Restore last geometry when it is still on a real screen. A remembered size is the point of a
# resizable window; a remembered position that lands off-screen is a window you cannot reach, so the
# restore is validated against the current desktop bounds rather than trusted.
$wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$form.Location = New-Object System.Drawing.Point(($wa.Right - 400), ($wa.Bottom - 500))
if (Test-Path $geomFile) {
  try {
    $g = (Get-Content $geomFile -Raw -ErrorAction Stop).Trim() -split ','
    if ($g.Count -ge 4) {
      $gx = [int]$g[0]; $gy = [int]$g[1]; $gw = [int]$g[2]; $gh = [int]$g[3]
      $onScreen = $false
      foreach ($sc in [System.Windows.Forms.Screen]::AllScreens) {
        if ($sc.WorkingArea.IntersectsWith((New-Object System.Drawing.Rectangle($gx,$gy,$gw,$gh)))) { $onScreen = $true }
      }
      if ($onScreen -and $gw -ge 380 -and $gh -ge 380) {
        $form.Location = New-Object System.Drawing.Point($gx,$gy)
        $form.Size     = New-Object System.Drawing.Size($gw,$gh)
      }
      # 5th field is the remembered on-top choice. An explicit -TopMost still wins.
      if ($g.Count -ge 5 -and $g[4].Trim() -eq '1') { $script:OnTop = $true; $form.TopMost = $true }
    }
  } catch { }
}

# --- accent strip ---
$accent = New-Object System.Windows.Forms.Panel
$accent.Dock = 'Top'; $accent.Height = 3; $accent.BackColor = $colAccent
$form.Controls.Add($accent)

# --- footer hint (added before body so Dock ordering puts it at the bottom) ---
$footer = New-Object System.Windows.Forms.Panel
$footer.Dock = 'Bottom'; $footer.Height = 40; $footer.BackColor = $colBg
$footer.Padding = New-Object System.Windows.Forms.Padding(14,4,14,8)
$lblHint = New-Object System.Windows.Forms.Label
$lblHint.Dock = 'Fill'; $lblHint.Font = $fontSmall; $lblHint.ForeColor = $colFaint
$lblHint.Text = 'Closing this window switches the harness OFF within 20s. Minimising does not.' + "`n" +
                'A running cook is never interrupted either way.'
$footer.Controls.Add($lblHint)
$form.Controls.Add($footer)

# --- toolbar: the two new views ---
$toolbar = New-Object System.Windows.Forms.Panel
$toolbar.Dock = 'Bottom'; $toolbar.Height = 44; $toolbar.BackColor = $colBg
$toolbar.Padding = New-Object System.Windows.Forms.Padding(14,4,14,4)
$btnLogs   = New-FlatButton 'Logs'   $colCard $colCardHi $fontUIB
$btnPhases = New-FlatButton 'Phases' $colCard $colCardHi $fontUIB
$btnLogs.Dock = 'Left';    $btnLogs.Width = 104
$spacer = New-Object System.Windows.Forms.Panel; $spacer.Dock='Left'; $spacer.Width=10; $spacer.BackColor=$colBg
$btnPhases.Dock = 'Left';  $btnPhases.Width = 104
# The pin, live. Restarting the app to change whether a switch floats is not a setting, it is a chore.
$cbTop = New-ToggleCheck 'On top' $script:OnTop
$cbTop.Dock = 'Right'; $cbTop.Width = 92
$topGap = New-Object System.Windows.Forms.Panel; $topGap.Dock='Right'; $topGap.Width=8; $topGap.BackColor=$colBg
$cbTop.Add_CheckedChanged({ param($s,$e) $script:OnTop = $s.Checked; $form.TopMost = $s.Checked })
$toolbar.Controls.Add($btnPhases); $toolbar.Controls.Add($spacer); $toolbar.Controls.Add($btnLogs)
$toolbar.Controls.Add($topGap); $toolbar.Controls.Add($cbTop)
$form.Controls.Add($toolbar)

# --- body ---
$body = New-Object System.Windows.Forms.Panel
$body.Dock = 'Fill'; $body.BackColor = $colBg
$body.Padding = New-Object System.Windows.Forms.Padding(14,12,14,4)
$form.Controls.Add($body)

# recent activity (fills the slack - a taller window is worth more history)
$actCard = New-Card
$actCard.Dock = 'Fill'
$actCard.Padding = New-Object System.Windows.Forms.Padding(1,1,1,1)
$txtTail = New-ReadOnlyBox $fontMono
$txtTail.Dock = 'Fill'
$actCard.Controls.Add($txtTail)

$lblAct = New-Object System.Windows.Forms.Label
$lblAct.Dock = 'Top'; $lblAct.Height = 20; $lblAct.Font = $fontSmall; $lblAct.ForeColor = $colFaint
$lblAct.Text = 'RECENT HOOK ACTIVITY'

# status card
$statCard = New-Card
$statCard.Dock = 'Top'; $statCard.Height = 108
$statCard.Padding = New-Object System.Windows.Forms.Padding(10,8,10,8)

$dotPhase = New-Dot $colDim
$dotPhase.Location = New-Object System.Drawing.Point(11,15)
$dotBusy  = New-Dot $colDim
$dotBusy.Location  = New-Object System.Drawing.Point(11,37)
$dotCtx   = New-Dot $colDim
$dotCtx.Location   = New-Object System.Drawing.Point(11,59)

$lblPhase = New-Object System.Windows.Forms.Label
$lblPhase.Location = New-Object System.Drawing.Point(28,11)
$lblPhase.Size     = New-Object System.Drawing.Size(300,18)
$lblPhase.Anchor   = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Left -bor [System.Windows.Forms.AnchorStyles]::Right
$lblPhase.Font     = $fontUIB; $lblPhase.ForeColor = $colText

$lblBusy = New-Object System.Windows.Forms.Label
$lblBusy.Location  = New-Object System.Drawing.Point(28,33)
$lblBusy.Size      = New-Object System.Drawing.Size(300,18)
$lblBusy.Anchor    = $lblPhase.Anchor
$lblBusy.Font      = $fontUI; $lblBusy.ForeColor = $colDim

# ---- THE CONTEXT GAUGE (added 2026-08-17) --------------------------------------------------------
# User: "im watching your context window balloon, are you forgetting to compact via the harness?" -
# and then, on the fix: "im not sure if its possible for the harness to programmatically watch the
# context window but if so that would be the way to achieve it."
#
# It is, and it always was: phase-stop.ps1 has read this number on every Stop since 2026-08-10. It
# was simply never SHOWN and never acted on except at a phase boundary, so a long phase could fill
# the window with the harness reporting perfect health throughout. The number comes from
# Get-HarnessContextPct in harness-lib.ps1 - THE SAME FUNCTION THE GATES FIRE ON, not a second
# implementation, because a gauge that disagrees with the hook it reports on is worse than no gauge.
#
# The bar draws its three thresholds as ticks so the reading is self-explaining: you can see which
# gate is next without knowing the numbers.
$lblCtx = New-Object System.Windows.Forms.Label
$lblCtx.Location = New-Object System.Drawing.Point(28,55)
$lblCtx.Size     = New-Object System.Drawing.Size(300,16)
$lblCtx.Anchor   = $lblPhase.Anchor
$lblCtx.Font     = $fontUI; $lblCtx.ForeColor = $colDim

$barCtx = New-Object System.Windows.Forms.Panel
$barCtx.Location = New-Object System.Drawing.Point(28,74)
$barCtx.Size     = New-Object System.Drawing.Size(300,8)
$barCtx.Anchor   = $lblPhase.Anchor
$barCtx.BackColor = $colBg
$script:CtxPct = -1.0
$barCtx.Add_Paint({
  param($s,$e)
  $g = $e.Graphics
  $w = $s.ClientSize.Width; $h = $s.ClientSize.Height
  $trk = New-Object System.Drawing.SolidBrush (C 46 50 58)
  $g.FillRectangle($trk, 0, 0, $w, $h); $trk.Dispose()
  $p = $script:CtxPct
  if ($p -gt 0) {
    $fillW = [int]([Math]::Min(100.0, $p) / 100.0 * $w)
    $col = if ($p -ge $HarnessBackstopPct) { $colDanger }
           elseif ($p -ge $HarnessCriticalPct) { $colWarn }
           else { (C 62 172 112) }
    $b = New-Object System.Drawing.SolidBrush $col
    $g.FillRectangle($b, 0, 0, $fillW, $h); $b.Dispose()
  }
  # threshold ticks, drawn last so the fill never hides them
  $tick = New-Object System.Drawing.SolidBrush (C 150 156 168)
  foreach ($t in @($HarnessCompactAtPct, $HarnessCriticalPct, $HarnessBackstopPct)) {
    $g.FillRectangle($tick, [int]($t / 100.0 * $w), 0, 1, $h)
  }
  $tick.Dispose()
})

$statCard.Controls.AddRange(@($dotPhase,$dotBusy,$dotCtx,$lblPhase,$lblBusy,$lblCtx,$barCtx))

$gap1 = New-Object System.Windows.Forms.Panel; $gap1.Dock='Top'; $gap1.Height=10; $gap1.BackColor=$colBg
$gap2 = New-Object System.Windows.Forms.Panel; $gap2.Dock='Top'; $gap2.Height=10; $gap2.BackColor=$colBg

# the switch
$btn = New-FlatButton '' $colOff $colOffHot $fontBig
$btn.Dock = 'Top'; $btn.Height = 82
$btn.ForeColor = [System.Drawing.Color]::White

# Dock stacking is last-added-first, so add bottom-up to get: switch, gap, status, gap, label, tail.
$body.Controls.Add($actCard)
$body.Controls.Add($lblAct)
$body.Controls.Add($gap2)
$body.Controls.Add($statCard)
$body.Controls.Add($gap1)
$body.Controls.Add($btn)

# ---- LOGS WINDOW ---------------------------------------------------------------------------------
$script:LogForm = $null
$script:LogSel  = 'stop'

$logSources = @{
  'stop'     = @{ Name='Stop hook';  Path=(Join-Path $proj '.claude\hook-stop.log') }
  'injector' = @{ Name='Injector';   Path=(Join-Path $proj '.claude\hook-injector.log') }
  'compact'  = @{ Name='Compaction'; Path=(Join-Path $proj '.claude\compact.log') }
  'inflight' = @{ Name='In-flight';  Path=(Join-Path $proj '.claude\.inflight') }
}
$logOrder = @('stop','injector','compact','inflight')

function Show-LogsWindow {
  if ($script:LogForm -and -not $script:LogForm.IsDisposed) {
    if ($script:LogForm.WindowState -eq 'Minimized') { $script:LogForm.WindowState = 'Normal' }
    $script:LogForm.BringToFront(); $script:LogForm.Activate(); return
  }

  $f = New-Object System.Windows.Forms.Form
  $f.Text          = 'Harness logs'
  $f.Size          = New-Object System.Drawing.Size(940,620)
  $f.MinimumSize   = New-Object System.Drawing.Size(520,340)
  $f.BackColor     = $colBg
  $f.ShowInTaskbar = $true
  $f.MinimizeBox   = $true
  $f.StartPosition = 'CenterScreen'
  # Owned by the switch, so it floats above it instead of hiding behind a TopMost parent.
  $f.Owner         = $form

  $acc = New-Object System.Windows.Forms.Panel
  $acc.Dock='Top'; $acc.Height=3; $acc.BackColor=$colAccent
  $f.Controls.Add($acc)

  # status bar
  $sb = New-Object System.Windows.Forms.Panel
  $sb.Dock='Bottom'; $sb.Height=26; $sb.BackColor=$colBg
  $sb.Padding = New-Object System.Windows.Forms.Padding(14,4,14,4)
  $lblMeta = New-Object System.Windows.Forms.Label
  $lblMeta.Dock='Fill'; $lblMeta.Font=$fontSmall; $lblMeta.ForeColor=$colFaint
  $sb.Controls.Add($lblMeta)
  $f.Controls.Add($sb)

  # tab strip + controls
  $bar = New-Object System.Windows.Forms.Panel
  $bar.Dock='Top'; $bar.Height=46; $bar.BackColor=$colBg
  $bar.Padding = New-Object System.Windows.Forms.Padding(14,8,14,6)
  $f.Controls.Add($bar)

  $filterRow = New-Object System.Windows.Forms.Panel
  $filterRow.Dock='Top'; $filterRow.Height=38; $filterRow.BackColor=$colBg
  $filterRow.Padding = New-Object System.Windows.Forms.Padding(14,2,14,8)
  $f.Controls.Add($filterRow)

  $txt = New-ReadOnlyBox $fontMono
  $txt.ForeColor = $colText
  $host2 = New-Card
  $host2.Dock='Fill'
  $host2.Padding = New-Object System.Windows.Forms.Padding(1,1,1,1)
  $host2.Controls.Add($txt)
  $txt.Dock='Fill'
  $f.Controls.Add($host2)
  # Dock order: Fill must be added before the Top panels it sits under, so re-add to fix z-order.
  $f.Controls.SetChildIndex($host2, 0)

  # segmented "tabs" - flat buttons, because a real TabControl cannot be themed dark in WinForms
  # without owner-drawing the whole thing.
  $tabBtns = @{}
  $x = 0
  foreach ($k in $logOrder) {
    $tb = New-FlatButton $logSources[$k].Name $colCard $colCardHi $fontUI
    $tb.Dock = 'Left'; $tb.Width = 116
    $tb.Tag = $k
    $tb.Add_Click({
      param($s,$e)
      $script:LogSel = $s.Tag
      Update-LogsWindow
    }.GetNewClosure())
    $tabBtns[$k] = $tb
    $x++
  }
  # add in reverse so Dock='Left' lays them out in declared order
  for ($i = $logOrder.Count - 1; $i -ge 0; $i--) {
    $sp = New-Object System.Windows.Forms.Panel; $sp.Dock='Left'; $sp.Width=6; $sp.BackColor=$colBg
    $bar.Controls.Add($sp)
    $bar.Controls.Add($tabBtns[$logOrder[$i]])
  }

  $lblFilter = New-Object System.Windows.Forms.Label
  $lblFilter.Dock='Left'; $lblFilter.Width=44; $lblFilter.Font=$fontUI; $lblFilter.ForeColor=$colDim
  $lblFilter.Text='Filter'; $lblFilter.TextAlign='MiddleLeft'

  $tbFilter = New-Object System.Windows.Forms.TextBox
  $tbFilter.Dock='Fill'; $tbFilter.BackColor=$colCard; $tbFilter.ForeColor=$colText
  $tbFilter.BorderStyle='FixedSingle'; $tbFilter.Font=$fontMono

  $cbFollow = New-ToggleCheck 'Follow tail' $true
  $cbFollow.Dock='Right'; $cbFollow.Width=104
  $cbAuto = New-ToggleCheck 'Auto-refresh' $true
  $cbAuto.Dock='Right'; $cbAuto.Width=110
  $gapCb = New-Object System.Windows.Forms.Panel; $gapCb.Dock='Right'; $gapCb.Width=8; $gapCb.BackColor=$colBg

  $filterRow.Controls.Add($tbFilter)
  $filterRow.Controls.Add($lblFilter)
  $filterRow.Controls.Add($cbAuto)
  $filterRow.Controls.Add($gapCb)
  $filterRow.Controls.Add($cbFollow)

  # Stash the pieces the updater needs on the form itself, so the updater is a plain function
  # rather than a closure over a dozen locals.
  $f.Tag = @{ Txt=$txt; Meta=$lblMeta; Filter=$tbFilter; Follow=$cbFollow; Auto=$cbAuto; Tabs=$tabBtns }

  $tbFilter.Add_TextChanged({ Update-LogsWindow })

  $t = New-Object System.Windows.Forms.Timer
  $t.Interval = 2000
  $t.Add_Tick({
    if ($script:LogForm -and -not $script:LogForm.IsDisposed) {
      if ($script:LogForm.Tag.Auto.Checked) { Update-LogsWindow }
    }
  })
  $f.Add_FormClosed({ $t.Stop(); $t.Dispose() })
  $t.Start()

  $script:LogForm = $f
  # SHOW FIRST, THEN FILL. ScrollToCaret is a no-op until the control has a window handle, so
  # populating before Show() left "Follow tail" checked and the view parked at line 1 - the setting
  # reported one thing and the pane did another.
  $f.Show()
  Update-LogsWindow
}

function Update-LogsWindow {
  $f = $script:LogForm
  if (-not $f -or $f.IsDisposed) { return }
  $st = $f.Tag
  foreach ($k in $logOrder) {
    if ($k -eq $script:LogSel) { $st.Tabs[$k].BackColor = $colAccent; $st.Tabs[$k].ForeColor = [System.Drawing.Color]::White }
    else                       { $st.Tabs[$k].BackColor = $colCard;   $st.Tabs[$k].ForeColor = $colDim }
  }
  $src  = $logSources[$script:LogSel]
  $path = $src.Path
  if (-not (Test-Path $path)) {
    $st.Txt.Text  = "(no file yet: $path)"
    $st.Meta.Text = 'nothing written'
    return
  }
  $lines = @()
  # Get-Content, never [IO.File]::ReadAllText - a log being written to is share-locked, and
  # ReadAllText cannot open it while the writer holds the handle (the AG3 law, learned on UE logs).
  try { $lines = @(Get-Content $path -Encoding UTF8 -ErrorAction Stop) } catch { $lines = @('(log is locked by its writer - retrying on the next tick)') }
  $total = $lines.Count
  $flt = $st.Filter.Text
  if ($flt) {
    try { $lines = @($lines | Where-Object { $_ -match [regex]::Escape($flt) }) } catch { }
  }
  # A cap, and it is ANNOUNCED rather than silent: an unlabelled truncation reads as "this is the
  # whole log" when it is not.
  $capped = $false
  if ($lines.Count -gt 3000) { $lines = @($lines[-3000..-1]); $capped = $true }

  $new = ($lines -join "`r`n")
  if ($st.Txt.Text -ne $new) {
    $st.Txt.Text = $new
    if ($st.Follow.Checked) {
      $st.Txt.SelectionStart  = $st.Txt.TextLength
      $st.Txt.ScrollToCaret()
    }
  }
  $fi = Get-Item $path
  $meta = "{0}   {1:N0} lines" -f $src.Name, $total
  if ($flt)    { $meta += "   {0:N0} shown" -f $lines.Count }
  if ($capped) { $meta += "   (showing last 3000 only)" }
  $meta += "   {0:N1} KB   modified {1:HH:mm:ss}" -f ($fi.Length/1KB), $fi.LastWriteTime
  $st.Meta.Text = $meta
}

# ---- PHASES WINDOW -------------------------------------------------------------------------------
$script:PhaseForm = $null
$script:PhaseView = 'board'

function Show-PhasesWindow {
  if ($script:PhaseForm -and -not $script:PhaseForm.IsDisposed) {
    if ($script:PhaseForm.WindowState -eq 'Minimized') { $script:PhaseForm.WindowState = 'Normal' }
    $script:PhaseForm.BringToFront(); $script:PhaseForm.Activate(); return
  }

  $f = New-Object System.Windows.Forms.Form
  $f.Text          = 'Phase board'
  $f.Size          = New-Object System.Drawing.Size(1040,680)
  $f.MinimumSize   = New-Object System.Drawing.Size(620,400)
  $f.BackColor     = $colBg
  $f.ShowInTaskbar = $true
  $f.MinimizeBox   = $true
  $f.StartPosition = 'CenterScreen'
  $f.Owner         = $form

  $acc = New-Object System.Windows.Forms.Panel
  $acc.Dock='Top'; $acc.Height=3; $acc.BackColor=$colAccent
  $f.Controls.Add($acc)

  # BOTTOM-DOCK ORDER IS LAST-ADDED-OUTERMOST. Added in the obvious reading order, the summary line
  # landed BETWEEN the list and the detail pane. Detail first, gap, then summary, so the summary
  # ends up flush against the bottom edge where it belongs.
  #
  # The detail pane exists because descriptions on this board run to whole paragraphs - a row in a
  # list can only ever show the first clause of one.
  $detailCard = New-Card
  $detailCard.Dock='Bottom'; $detailCard.Height=170
  $detailCard.Padding = New-Object System.Windows.Forms.Padding(1,1,1,1)
  $txtDetail = New-Object System.Windows.Forms.TextBox
  $txtDetail.Multiline=$true; $txtDetail.ReadOnly=$true; $txtDetail.ScrollBars='Vertical'
  $txtDetail.WordWrap=$true; $txtDetail.BackColor=$colCard; $txtDetail.ForeColor=$colText
  $txtDetail.Font=$fontUI; $txtDetail.BorderStyle='None'; $txtDetail.Dock='Fill'
  # An empty pane reads as a broken pane. Say what it is for instead.
  # TabStop off so the prompt is not the first thing focused - assigning .Text selects all of it,
  # and a focused read-only box shows that selection as a highlight over the placeholder.
  $txtDetail.TabStop = $false
  $txtDetail.Text = 'Select a phase above to read its full description.'
  $detailCard.Controls.Add($txtDetail)
  $f.Controls.Add($detailCard)

  $splitGap = New-Object System.Windows.Forms.Panel
  $splitGap.Dock='Bottom'; $splitGap.Height=8; $splitGap.BackColor=$colBg
  $f.Controls.Add($splitGap)

  # summary bar
  $sb = New-Object System.Windows.Forms.Panel
  $sb.Dock='Bottom'; $sb.Height=26; $sb.BackColor=$colBg
  $sb.Padding = New-Object System.Windows.Forms.Padding(14,4,14,4)
  $lblSum = New-Object System.Windows.Forms.Label
  $lblSum.Dock='Fill'; $lblSum.Font=$fontSmall; $lblSum.ForeColor=$colFaint
  $sb.Controls.Add($lblSum)
  $f.Controls.Add($sb)

  # toolbar
  $bar = New-Object System.Windows.Forms.Panel
  $bar.Dock='Top'; $bar.Height=46; $bar.BackColor=$colBg
  $bar.Padding = New-Object System.Windows.Forms.Padding(14,8,14,6)
  $f.Controls.Add($bar)

  $filterRow = New-Object System.Windows.Forms.Panel
  $filterRow.Dock='Top'; $filterRow.Height=38; $filterRow.BackColor=$colBg
  $filterRow.Padding = New-Object System.Windows.Forms.Padding(14,2,14,8)
  $f.Controls.Add($filterRow)

  # --- board list ---
  $lv = New-Object System.Windows.Forms.ListView
  $lv.View          = 'Details'
  $lv.FullRowSelect = $true
  $lv.MultiSelect   = $false
  $lv.HideSelection = $false
  $lv.BackColor     = $colCard
  $lv.ForeColor     = $colText
  $lv.Font          = $fontUI
  $lv.BorderStyle   = 'None'
  $lv.OwnerDraw     = $true
  [void]$lv.Columns.Add('Status', 96)
  [void]$lv.Columns.Add('ID', 70)
  [void]$lv.Columns.Add('Description', 780)
  # Stretch the last column to the client edge. Any width the columns do not cover is "header
  # filler", which the control paints in the SYSTEM colour regardless of OwnerDraw - it showed up as
  # a white notch in the top-right corner of an otherwise dark window.
  $lv.Add_Resize({
    param($s,$e)
    $w = $s.ClientSize.Width - $s.Columns[0].Width - $s.Columns[1].Width - 4
    if ($w -gt 120) { $s.Columns[2].Width = $w }
  })

  # Owner-draw, because a ListView header ignores BackColor and would sit as a bright white band
  # across an otherwise dark window.
  $lv.Add_DrawColumnHeader({
    param($s,$e)
    $br = New-Object System.Drawing.SolidBrush($colCardHi)
    $e.Graphics.FillRectangle($br, $e.Bounds); $br.Dispose()
    $pen = New-Object System.Drawing.Pen($colBorder)
    $e.Graphics.DrawLine($pen, $e.Bounds.Left, $e.Bounds.Bottom-1, $e.Bounds.Right, $e.Bounds.Bottom-1)
    $pen.Dispose()
    [System.Windows.Forms.TextRenderer]::DrawText($e.Graphics, $e.Header.Text, $fontSmall, $e.Bounds, $colDim,
      ([System.Windows.Forms.TextFormatFlags]::Left -bor [System.Windows.Forms.TextFormatFlags]::VerticalCenter -bor [System.Windows.Forms.TextFormatFlags]::LeftAndRightPadding))
  })
  $lv.Add_DrawItem({ param($s,$e) $e.DrawDefault = $false })
  $lv.Add_DrawSubItem({
    param($s,$e)
    $bg = if ($e.Item.Selected) { $colCardHi } else { $colCard }
    $br = New-Object System.Drawing.SolidBrush($bg)
    $e.Graphics.FillRectangle($br, $e.Bounds); $br.Dispose()
    # Column 0 carries the status colour; the rest read as ordinary text.
    $fg = if ($e.ColumnIndex -eq 0) { Get-StatusColor $e.Item.Tag.Status }
          elseif ($e.ColumnIndex -eq 1) { $colText }
          else { $colDim }
    $fnt = if ($e.ColumnIndex -le 1) { $fontUIB } else { $fontUI }
    [System.Windows.Forms.TextRenderer]::DrawText($e.Graphics, $e.SubItem.Text, $fnt, $e.Bounds, $fg,
      ([System.Windows.Forms.TextFormatFlags]::Left -bor [System.Windows.Forms.TextFormatFlags]::VerticalCenter -bor [System.Windows.Forms.TextFormatFlags]::EndEllipsis -bor [System.Windows.Forms.TextFormatFlags]::LeftAndRightPadding))
  })
  $lv.Add_SelectedIndexChanged({
    param($s,$e)
    if ($s.SelectedItems.Count -eq 0) { return }
    $r = $s.SelectedItems[0].Tag
    $d = $script:PhaseForm.Tag.Detail
    $d.Text = ("[{0}]  {1}   (PHASELOG.md line {2})" -f $r.Status, $r.Id, $r.Line) + "`r`n`r`n" + $r.Desc
    # Assigning .Text leaves the whole value selected and scrolled to the end; start at the top.
    $d.SelectionStart = 0; $d.SelectionLength = 0; $d.ScrollToCaret()
  })

  $lvCard = New-Card
  $lvCard.Dock='Fill'; $lvCard.Padding = New-Object System.Windows.Forms.Padding(1,1,1,1)
  $lvCard.Controls.Add($lv); $lv.Dock='Fill'

  # --- full document ---
  $txtFull = New-ReadOnlyBox $fontMono
  $txtFull.ForeColor = $colText
  $fullCard = New-Card
  $fullCard.Dock='Fill'; $fullCard.Padding = New-Object System.Windows.Forms.Padding(1,1,1,1)
  $fullCard.Controls.Add($txtFull); $txtFull.Dock='Fill'
  $fullCard.Visible = $false

  $f.Controls.Add($fullCard); $f.Controls.SetChildIndex($fullCard,0)
  $f.Controls.Add($lvCard);   $f.Controls.SetChildIndex($lvCard,0)

  # view switch
  $btnBoard = New-FlatButton 'Board'          $colCard $colCardHi $fontUI
  $btnFull  = New-FlatButton 'Full document'  $colCard $colCardHi $fontUI
  $btnBoard.Dock='Left'; $btnBoard.Width=116
  $btnFull.Dock='Left';  $btnFull.Width=136
  $sp1 = New-Object System.Windows.Forms.Panel; $sp1.Dock='Left'; $sp1.Width=6; $sp1.BackColor=$colBg
  $bar.Controls.Add($btnFull); $bar.Controls.Add($sp1); $bar.Controls.Add($btnBoard)

  $btnRefresh = New-FlatButton 'Refresh' $colCard $colCardHi $fontUI
  $btnRefresh.Dock='Right'; $btnRefresh.Width=92
  $bar.Controls.Add($btnRefresh)

  $lblFilter = New-Object System.Windows.Forms.Label
  $lblFilter.Dock='Left'; $lblFilter.Width=44; $lblFilter.Font=$fontUI; $lblFilter.ForeColor=$colDim
  $lblFilter.Text='Filter'; $lblFilter.TextAlign='MiddleLeft'
  $tbFilter = New-Object System.Windows.Forms.TextBox
  $tbFilter.Dock='Fill'; $tbFilter.BackColor=$colCard; $tbFilter.ForeColor=$colText
  $tbFilter.BorderStyle='FixedSingle'; $tbFilter.Font=$fontMono
  $cbOpen = New-ToggleCheck 'Unfinished only' $false
  $cbOpen.Dock='Right'; $cbOpen.Width=136
  $filterRow.Controls.Add($tbFilter); $filterRow.Controls.Add($lblFilter); $filterRow.Controls.Add($cbOpen)

  $f.Tag = @{ Lv=$lv; Full=$txtFull; Detail=$txtDetail; Sum=$lblSum; Filter=$tbFilter;
              OpenOnly=$cbOpen; LvCard=$lvCard; FullCard=$fullCard; BtnBoard=$btnBoard; BtnFull=$btnFull;
              DetailCard=$detailCard; SplitGap=$splitGap; FilterLbl=$lblFilter }

  $btnBoard.Add_Click({ $script:PhaseView='board'; Update-PhasesWindow })
  $btnFull.Add_Click({  $script:PhaseView='full';  Update-PhasesWindow })
  $btnRefresh.Add_Click({ Update-PhasesWindow })
  $tbFilter.Add_TextChanged({ Update-PhasesWindow })
  $cbOpen.Add_CheckedChanged({ Update-PhasesWindow })

  $script:PhaseForm = $f
  $f.Show()
  Update-PhasesWindow
}

function Update-PhasesWindow {
  $f = $script:PhaseForm
  if (-not $f -or $f.IsDisposed) { return }
  $st = $f.Tag

  $isBoard = ($script:PhaseView -eq 'board')
  $st.LvCard.Visible   = $isBoard
  $st.FullCard.Visible = -not $isBoard
  # The detail pane and the row filter belong to the LIST. Left visible over the document they are
  # controls that quietly do nothing, which is worse than controls that are not there.
  $st.DetailCard.Visible = $isBoard
  $st.SplitGap.Visible   = $isBoard
  $st.Filter.Enabled     = $isBoard
  $st.OpenOnly.Enabled   = $isBoard
  $st.FilterLbl.ForeColor = if ($isBoard) { $colDim } else { $colFaint }
  if ($isBoard) {
    $st.BtnBoard.BackColor=$colAccent; $st.BtnBoard.ForeColor=[System.Drawing.Color]::White
    $st.BtnFull.BackColor=$colCard;    $st.BtnFull.ForeColor=$colDim
  } else {
    $st.BtnFull.BackColor=$colAccent;  $st.BtnFull.ForeColor=[System.Drawing.Color]::White
    $st.BtnBoard.BackColor=$colCard;   $st.BtnBoard.ForeColor=$colDim
  }

  $rows = Get-BoardRows
  $tally = @{ complete=0; in_progress=0; pending=0; proposed=0 }
  foreach ($r in $rows) { if ($tally.ContainsKey($r.Status)) { $tally[$r.Status]++ } }

  if ($script:PhaseView -eq 'full') {
    if ($st.Full.TextLength -eq 0) {
      try { $st.Full.Text = ((Get-Content $board -Encoding UTF8 -ErrorAction Stop) -join "`r`n") }
      catch { $st.Full.Text = '(PHASELOG.md unreadable)' }
    }
  } else {
    $flt  = $st.Filter.Text
    $open = $st.OpenOnly.Checked
    $show = @()
    foreach ($r in $rows) {
      if ($open -and $r.Status -eq 'complete') { continue }
      if ($flt) {
        $hit = $false
        try { if (($r.Id -match [regex]::Escape($flt)) -or ($r.Desc -match [regex]::Escape($flt))) { $hit = $true } } catch { $hit = $true }
        if (-not $hit) { continue }
      }
      $show += $r
    }
    $st.Lv.BeginUpdate()
    $st.Lv.Items.Clear()
    foreach ($r in $show) {
      # One line in the row; the paragraph goes to the detail pane below.
      $d = $r.Desc -replace '\*\*','' -replace '`','' -replace '\s+',' '
      $it = New-Object System.Windows.Forms.ListViewItem($r.Status)
      [void]$it.SubItems.Add($r.Id)
      [void]$it.SubItems.Add($d)
      $it.Tag = $r
      [void]$st.Lv.Items.Add($it)
    }
    $st.Lv.EndUpdate()
  }

  $st.Sum.Text = "{0} phases   {1} complete   {2} in progress   {3} pending   {4} proposed   -   PHASELOG.md, read-only" -f `
    $rows.Count, $tally['complete'], $tally['in_progress'], $tally['pending'], $tally['proposed']
}

# ---- WIRING --------------------------------------------------------------------------------------
function Update-Ui {
  if ($form.IsDisposed) { return }
  if ($script:IsOn) {
    # THE HEARTBEAT. Rewritten every tick; the hook treats anything older than 20 s as "gone".
    try { Set-Content -Path $onFile -Value (Get-Date -Format 'o') -Encoding ascii -ErrorAction Stop } catch { }
    $btn.Text = "LISTENING`nclick to take the floor"
    $btn.BackColor = $colOn
    $btn.FlatAppearance.MouseOverBackColor = $colOnHot
  } else {
    Remove-Item $onFile -Force -ErrorAction SilentlyContinue
    $btn.Text = "HARNESS OFF`nclick to start listening"
    $btn.BackColor = $colOff
    $btn.FlatAppearance.MouseOverBackColor = $colOffHot
  }

  $phase = Get-CurrentPhase
  $lblPhase.Text = $phase
  $dotPhase.Tag  = if ($phase -match '^no |unreadable') { $colFaint } else { $colWarn }
  $dotPhase.Invalidate()

  $busy = Get-BusyText
  $lblBusy.Text = $busy
  if ($busy -eq 'idle') { $dotBusy.Tag = (C 62 172 112) } else { $dotBusy.Tag = $colDanger }
  $dotBusy.Invalidate()

  # The context gauge. Reading the transcript tail every 2 s is cheap (Get-Content -Tail 150), and
  # it is the same call the Stop hook makes, so the two can never disagree about what "58%" means.
  $script:CtxPct = Get-HarnessContextPct
  if ($script:CtxPct -lt 0) {
    $lblCtx.Text  = 'context: unreadable'
    $dotCtx.Tag   = $colFaint
  } else {
    $nextGate =
      if     ($script:CtxPct -ge $HarnessBackstopPct) { 'BACKSTOP - compacting now' }
      elseif ($script:CtxPct -ge $HarnessCriticalPct) { 'CRITICAL - notes + split, then compact' }
      elseif ($script:CtxPct -ge $HarnessCompactAtPct){ 'compacts at the next phase close' }
      else   { ('next gate ' + $HarnessCompactAtPct + '%') }
    $lblCtx.Text = ('context {0}%  -  {1}' -f $script:CtxPct, $nextGate)
    $dotCtx.Tag  =
      if     ($script:CtxPct -ge $HarnessBackstopPct) { $colDanger }
      elseif ($script:CtxPct -ge $HarnessCriticalPct) { $colWarn }
      else   { (C 62 172 112) }
  }
  $dotCtx.Invalidate()
  $barCtx.Invalidate()

  $sl = Join-Path $proj '.claude\hook-stop.log'
  if (Test-Path $sl) {
    $n = [Math]::Max(4, [Math]::Floor($txtTail.Height / 14))
    try {
      $tail = ((Get-Content $sl -Tail $n -Encoding UTF8 -ErrorAction Stop) -join "`r`n")
      if ($txtTail.Text -ne $tail) {
        $txtTail.Text = $tail
        $txtTail.SelectionStart = $txtTail.TextLength
        $txtTail.ScrollToCaret()
      }
    } catch { }
  }
}

$btn.Add_Click({
  $script:IsOn = -not $script:IsOn
  Update-Ui
  # HAND THE FOREGROUND BACK, AND THIS IS NOT A COURTESY - IT IS THE FIX FOR A DEADLOCK.
  # compact-injector.ps1 raises the Claude window to paste the continue-nudge, and it gives up if
  # something else holds the foreground. Clicking this button gives the foreground to THIS window,
  # so the act of ARMING the harness was the act of blocking it:
  #     raise EXHAUSTED after 89 attempts over 4 min - last blocker was [Phase Automation Harness]
  #     HUNG: could not raise Claude for the nudge. NOTHING SENT.
  # Two nudges died that way on 2026-08-17. The injector waits out a blocker because it was written
  # against Unreal's SPLASH, which leaves on its own; a window a human left focused never does.
  # Flipping a switch and getting back to the conversation is what the user wanted anyway.
  if ($script:IsOn) {
    try { Add-Type -AssemblyName Microsoft.VisualBasic -ErrorAction SilentlyContinue
          [Microsoft.VisualBasic.Interaction]::AppActivate('Claude') } catch { }
  }
})
$btnLogs.Add_Click({ Show-LogsWindow })
$btnPhases.Add_Click({ Show-PhasesWindow })

# Closing the window is a real OFF, immediately - not merely a stopped heartbeat. The heartbeat is
# the backstop for the cases where no clean close happens (crash, kill, power loss).
$form.Add_FormClosing({
  Remove-Item $onFile -Force -ErrorAction SilentlyContinue
  # Remember geometry, but only from a normal window - saving a maximised or minimised rect would
  # restore a window the user never chose.
  try {
    if ($form.WindowState -eq 'Normal') {
      Set-Content -Path $geomFile -Encoding ascii -ErrorAction Stop -Value `
        ("{0},{1},{2},{3},{4}" -f $form.Location.X, $form.Location.Y, $form.Size.Width, $form.Size.Height,
                                  $(if ($script:OnTop) { '1' } else { '0' }))
    }
  } catch { }
  foreach ($c in @($script:LogForm, $script:PhaseForm)) {
    if ($c -and -not $c.IsDisposed) { $c.Close() }
  }
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.Add_Tick({ Update-Ui })
$timer.Start()

Update-Ui
# Application::Run, NOT ShowDialog. A modal dialog is not a top-level window: it gets no proper
# taskbar button and will not minimise, which is exactly what was wrong with the previous cut.
[System.Windows.Forms.Application]::Run($form)
$timer.Stop()
Remove-Item $onFile -Force -ErrorAction SilentlyContinue
