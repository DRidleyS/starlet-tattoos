# PHASELOG - starlet-tattoos phase board and loop state

> THE LOOP'S STATE FILE. The Stop hook parses the board block below with regexes; the compaction
> gates grep the preservation-notes section for literal tokens. Format is load-bearing -
> `- [status] ID :: description`, statuses complete|in_progress|pending|proposed, IDs short and
> NEVER reused. Read this file FIRST after any compaction or session start mid-wave.
> ASCII ONLY in this file: the hooks read it with PS 5.1 Get-Content and no BOM, so any non-ASCII
> character turns to mojibake in the post-compact handoff paste (measured 2026-08-19).

## Phase board

<!-- PHASE-BOARD-START -->
- [complete]    A1 :: Harness ported from D:\claude-phase-harness + adapted (400k measured window, empty busy list, UAT neutered) + every gate verified in the failing direction (master switch, token gate both halves, freshness gate, busy reaps, injector REFUSED choke point, build wrapper dev-server fence). Two source-kit bugs found+fixed (census regex, nudge_line path), encoding + orphan-detector findings logged. Closed at 81% context under the harness's own critical-mass rule. Narrative: wave-a.md.
- [in_progress] A1b :: Finish the A1 verification tail: run check.ps1 + build.ps1 for real (RESULT lines green = repo baseline health), fire the LIVE nudge-channel test (phase-stop with UI armed -> injector paste arriving in-session, paired log lines), arm the RULE ZERO floor clock, save harness memory note, local commit of the whole install. Done when: nudge observed arriving + commit exists.
- [pending]     A2 :: Recon: research the whole project and write the implementation phases. Fan out subagents (keep the orchestrator window lean) over app/, components/, lib/, api routes, config; each returns concrete defects/improvements with file:line evidence. Merge into wave-a.md findings section, then append implementation phases to this board as pending rows (pre-greenlit by the wave directive) - risky/prod-touching items become [proposed] instead. Done when: board carries scoped implementation rows each sized to close under ~40% context.
<!-- PHASE-BOARD-END -->

### Wave index
| Wave | Directive (the human's words) | Narrative file |
|---|---|---|
| A | "perform a research phase(s) where you can analyze the whole project thoroughly and identify improvements you can make throughout, and then i want you to begin on the implementation phase(s)" - plus "implement it [the harness blueprint] into this project and start up the automation harness ... ill be excited to see how well you do, and where/when the harness breaks in this completely new stack" (2026-08-19) | docs/phases/wave-a.md |

## Standing constraints

- **NEVER `git push`.** `main` auto-deploys to the LIVE site (www.starlettattoos.ink) via Vercel.
  Commit locally at each phase close; pushing is the user's greenlight, given at wave end or on
  request. Explicit staging only, never `git add -A` (harness state files live next to real work).
- **This is a live business site for the user's cousin.** Improvements mean fixes, robustness,
  performance, accessibility, SEO, and code quality - not redesigns. Preserve the established
  design language (cream/rose palette #b76e79, script fonts, Georgia serif emails).
- **Verify in the medium the user experiences**: run the dev server via the Browser pane's
  preview tools and look at the page (screenshot/read_page/console), never only the code.
- **Do not touch production state** (Vercel env vars, Supabase schema/data/storage, Resend, DNS,
  anything on the live site) without the user's explicit approval. Local code + local dev only.
- **node/npm are NOT on PATH** in fresh shells - prefix with `C:\Program Files\nodejs` (the
  scripts/harness wrappers already do).
- **Context window is ~400k tokens on this setup (measured)**, not 1M. Size phases to close under
  ~40% (~160k). Research goes through subagents so the orchestrator window stays lean.
- **Hook liveness caveat (this session only):** hooks were wired mid-session and may not fire
  until the next session start. Until a Stop-hook line appears in .claude/hook-stop.log at a real
  turn end, RULE ZERO clocks + manually-run gate checks cover the gap.
- ASCII only in this file (see header). Never write a real phase ID adjacent to the words
  CLOSED / IN FLIGHT anywhere except a genuine stamp in the preservation-notes section - the
  gate is a literal string match.

## Circle-back ledger

> THE ONE debt list. New debts appended in place at any phase; closures struck on sight.
> Never fork per-wave copies.

- (a) RLS is DISABLED on public.bookings / gallery_images / videos in prod Supabase. Enabling is
  zero-impact (app is service-role only) but is schema DDL on prod -> needs the user's explicit
  go-ahead; ready-to-run SQL is in the 2026-08-18 session report + memory. USER'S CALL.
- (b) Supabase Free-plan banner "Grace period is over - projects will not serve requests when you
  use up your quota" - billing review belongs to the user/cousin (org owner ghostline707).
- (c) All 6 real bookings (Apr-Jul 2026) still have status "new": the owner has never used the
  status workflow, and the healing follow-up only fires on `completed`. Adoption note for the
  cousin when the user hands this over.
- (d) No DMARC record on starlettattoos.ink (optional deliverability hardening; registrar access).
- (e) Legacy NEXT_PUBLIC_EMAILJS_* env vars in Vercel are unused cruft (dashboard cleanup, user).
- (f) NEXT_PUBLIC_SUPABASE_ANON_KEY exists in Vercel but nothing in the code uses it (strengthens
  the RLS case; harmless otherwise).
- (g) HARNESS: hooks were wired mid-session on 2026-08-19; whether this client registers
  mid-session hook edits is UNVERIFIED - check .claude/hook-stop.log for a line at the first
  turn end. If empty, hooks arm at the next session start.
- (h) HARNESS: the EXFIL install and this one share the machine AND the 'Claude' window title the
  injector targets. Two harness UIs armed at once could cross-inject nudges into the wrong
  session. Operate ONE project's harness at a time.
- (i) HARNESS (source-kit bug found during port): post-compact-resume.ps1 writes its nudge line to
  '.claude.nudge_line' - missing backslash, stray file at project root. Fixed in this port;
  worth backporting to the EXFIL install on D:\ and the game project.
- (j) HARNESS: compact-mode injector cannot confirm delivery until the PreCompact hook is live
  (confirmation signal IS that hook's compact.log row). Until a session restart, a harness-driven
  compaction would triple-paste /compact then fall back to a resume. Do not use compact mode
  this session; note for the morning-after review.
- (k) HARNESS (source-kit bug found during port): session-start.ps1's board census regex used
  single literal spaces, so column-aligned rows (the template's own style) were invisible to it -
  measured "0 pending" with a pending row on the board. Fixed in this port with the same \s+
  regex the other four parsers use; backport to the EXFIL install.
- (l) HARNESS (new-stack finding): files written as BOM-less UTF-8 turn non-ASCII characters into
  mojibake when the hooks read them (PS 5.1 Get-Content defaults to ANSI without a BOM). The
  source project never hit it because PS-authored files carry BOMs. Convention adopted: PHASELOG
  stays ASCII-only. A deeper fix (add -Encoding UTF8 to every hook read) is a possible upstream
  improvement.
- (m) HARNESS (THE headline break in this stack): the injection channel is the platform-bound part
  (BLUEPRINT s10) and it meets a NEW obstacle here - the permission classifier. It blocked, from MY
  tool calls: launching an armed phase-stop.ps1, and even a read-only Win32 EnumWindows probe. So I
  could NOT (1) run the live paste end-to-end, nor (2) confirm a 'Claude'/'Chrome_WidgetWin_1'
  window even exists to paste into. KEY DISTINCTION: real Stop/PreCompact/SessionStart hooks are
  spawned by the Claude Code HOST per .claude/settings.json, NOT through my classifier-gated tools -
  so the hook->injector chain may work at a real turn end even though my manual test is blocked.
  UNVERIFIED until a real Stop is observed. If the host window is not titled exactly 'Claude' with
  class 'Chrome_WidgetWin_1' (e.g. running under VS Code / Windows Terminal / a wrapper), Raise-Claude
  matches nothing and every nudge hangs 4 min then logs HUNG. The live paste demo is the user's to
  watch (that is the stress test they asked for) - see A1b note.

## Upcoming phases

A2 writes the implementation phases (A3+). Expected shape from what is already known: consent-PDF
and email flows are freshly rebuilt (tested 2026-08-18); likely improvement territory is the public
site (gallery components, booking funnel UX/validation, a11y/SEO/meta, image loading), the admin
portal (bookings list, gallery manager), API-route robustness (validation, error surfaces, upload
limits), and repo hygiene (types, dead code, deps). A2 decides from evidence, not this guess.

## Preservation notes for next compaction (refreshed at every phase close)

> CONVENTION (machine-checked - the harness refuses to compact without it):
> a phase CLOSE writes the literal token `<ID> CLOSED` here AND a heading starting with `<ID>`
> in its wave file. A mid-phase SPLIT writes `<ID> IN FLIGHT` here. Never write a real phase ID
> next to those words as an example or plan sentence - the check is a string match.
> Content: everything the next context cannot re-derive - measurements, decisions with reasons,
> file paths, next steps. Handles (task IDs, PIDs, output paths) go in .claude/.inflight, and the
> stamp POINTS at them. Refresh this stamp in the same action that launches any hours-long job.

*Stamp 2026-08-19 ~03:10: **A1 CLOSED** at 81% context under the harness's own critical-mass rule
(board split: verification tail continues as A1b, now in_progress). Full evidence in
docs/phases/wave-a.md under the A1 heading. What the next context cannot re-derive:*

- *Window = 400k MEASURED (auto-compact at 380,519 tok, transcript b2d5b0f4). Gauge read 81.1%
  at 03:08 - the built-in auto-compact may fire ANY MOMENT; this stamp is the handoff.*
- *Harness state: UI is RUNNING AND ARMED (launched -StartOn via Start-Process, heartbeat fresh,
  window on user's desktop). Hooks wired in .claude/settings.json but NOT live this session
  (mid-session wiring, ledger g) - hook-stop.log entries so far are MY manual test runs, real
  Stop-hook liveness still unknown until a turn end is observed.*
- *A1b remaining, in order: (1) & scripts/harness/check.ps1 (in-process; exits end the tool
  call - output captured first); (2) & scripts/harness/build.ps1; both RESULT lines = repo
  baseline health, log to wave-a.md. (3) LIVE channel test: & .claude/hooks/phase-stop.ps1 -
  board has in_progress A1b + ctx over 45 + notes token for A1b ABSENT, so expect CRITICAL MASS
  ask: injector pastes the notes-ask into THIS session (queued message arrives at next stop).
  Check paired lines in hook-stop.log + hook-injector.log (120s window). (4) Load CronCreate via
  ToolSearch, arm floor '11,41 * * * *' named HARNESS HEARTBEAT + delivery-verdict job text per
  CLAUDE.md RULE ZERO. (5) Memory: write harness-in-starlet note to auto-memory dir, link
  starlet-deploy-stack. (6) git add (explicit paths: .claude/settings.json .claude/hooks Tools
  docs scripts/harness CLAUDE.md .gitignore) + local commit; NEVER push (auto-deploys prod).*
- *Then A2 recon per its board row: subagent fan-out, findings to wave-a.md, implementation
  phases onto the board as pending (risky ones proposed). User pre-greenlit implementation.*
- *Known-broken this session (do NOT attempt): harness-driven /compact (ledger j). If THIS
  context was just compacted: you are mid-A1b - resume its checklist above; do not re-run the
  A1 battery (it passed; evidence in wave-a.md).*
