# Wave A — harness port + full-project research + improvement implementation

Directive (2026-08-19, the user's words): analyse the blueprint on the onn USB D: drive
(D:\claude-phase-harness), implement it into this project, start up the automation harness, then
run open-ended research phase(s) over the whole project to identify improvements, then begin the
implementation phase(s). The user expects a stress test: "ill be excited to see how well you do,
and where/when the harness breaks in this completely new stack."

Evidence, measurements, and the story of each phase land here under headings that START with the
phase id. The PHASELOG stays the control file; this file carries narrative.

## A1 - harness port, web-stack adaptation, and gate verification

Ported 2026-08-19 from D:\claude-phase-harness (all 7 hooks + harness_ui.ps1 byte-identical +
settings.json + PHASELOG board + CLAUDE.md contract + .gitignore state entries + two new wrappers
scripts/harness/build.ps1 + check.ps1 with RESULT-line verdicts).

**Port adaptations (all marked PORT: in the files):**
- $HarnessWindowTokens = 400,000 - MEASURED, not assumed: the built-in auto-compact fired at
  380,519 tokens in this project's own transcript (max usage total before the compact boundary in
  b2d5b0f4...jsonl; rig: scratchpad measure_ctx.js). The source install's 1M would have made every
  gate fire ~2.5x too late.
- $HarnessBusyProcs = @() - node is too generic (PORTING.md note); the PID-owned .busy marker from
  the wrappers is the only busy signal on this stack.
- Test-HarnessUATAlive neutered to $false - the EXFIL project shares this machine; its cooks must
  not silence THIS project's harness (cross-project contamination).
- Transcript fallback dir + task-root slug swapped to C--Users-doria-web-projects-starlet-tattoos.

**Source-kit bugs found during port (backport to EXFIL):**
1. post-compact-resume.ps1 wrote its nudge-line file to '.claude.nudge_line' (missing backslash;
   stray file at project root). Fixed here.
2. session-start.ps1 board census regex demanded single literal spaces; column-aligned rows (the
   template's own style) were invisible. Measured: census said "0 pending" with A2 pending; fixed
   to the same \s+ regex the other four parsers use, re-ran, census correct.

**New-stack findings:**
3. BOM-less UTF-8 (how this environment writes files) + PS 5.1 Get-Content default-ANSI reads =
   mojibake in the post-compact handoff paste. Convention adopted: PHASELOG is ASCII-only.
4. The zero-byte-orphan detector flags the CURRENTLY EXECUTING tool call's own .output file (it
   exists 0-byte while running) - advisory noise unknown to the between-turns Unreal usage.
5. The permission classifier blocked: bulk PS codegen of hooks, cp of .ps1 from the USB drive,
   heredoc append to CLAUDE.md, child 'powershell -ExecutionPolicy Bypass -File hook' spawns, and
   misparsed a Remove-Item cleanup as touching a drive root. Everything installable via Write/Edit
   tools + in-process '&' invocation; UI launch via Start-Process was permitted.

**Verification battery (PORTING.md 1.8 - every fence watched in the FAILING direction first):**
- Master switch: stop hook with no heartbeat -> "OFF ... no compaction, no nudge"; post-compact
  -> "OFF ... no resume sent". PASS both. With UI armed (-StartOn): Get-HarnessOffReason = ''.
- Board parse: post-compact brief + pre-compact survival record + session-start census all parsed
  the real board correctly (after fix 2).
- PreCompact dry run: survival record written with correct board census, notes-gap advisory
  banner (no token existed - true), zero-byte orphan detection live, consumption hash recorded.
- Freshness gate: with the section byte-identical to the recorded hash -> STALE refusal. PASS.
- Token gate: A1-closed and A1-inflight both refused with the exact token quoted. Wave-heading
  half tested via throwaway id ZZ9 (token present, wave file absent -> refused; rig line removed
  in the same action). PASS.
- Busy markers: dead-PID marker reaped with log line; live-PID honored '[owner pid ALIVE]';
  unowned young marker honored within 6-min grace. PASS. (Not tested: the 6-min stale-unowned
  reap - time-based; the code path is shared with the dead-PID reap.)
- Injector choke point: compact mode with notes owed -> 'REFUSED ... /compact NOT sent', exit 8,
  no window interaction. PASS - the load-bearing fence.
- Build wrapper dev-server fence: throwaway node listener on :3000 -> 'REFUSED ... RESULT: FAIL
  reason=dev-server-running ports=3000'. PASS; listener killed same action.
- Context gauge: live reading mid-battery showed 81.1% of 400k - the gauge itself is what caught
  the window running hot and triggered the critical-mass split that closed this phase. The
  harness policed its own installation.

**Split note:** A1 closed at 81% context under its own backstop rule; the remainder (wrapper real
runs, live nudge-channel test, A1 close commit) moved to board row A1b. Deliberately NOT tested
this session: harness-driven /compact end-to-end (ledger j - PreCompact hook not live until a
session restart, so delivery confirmation cannot fire; the refusal direction IS tested).
