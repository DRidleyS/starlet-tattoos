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
- [complete]    A1b :: A1 verification tail done: check.ps1 ran (RESULT: FAIL - surfaced a real baseline, 14 eslint no-explicit-any errors + 20 warnings; the wrapper worked), build.ps1 ran (RESULT: OK, buildId minted). RULE ZERO floor clock armed (cron 90937956). Harness memory note written. Install committed locally (9cdf897). DEFERRED to the user: the live injector-paste demo (classifier-gated from Claude's tools; it is the user's to watch). Narrative: wave-a.md.
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

*Stamp 2026-08-19 ~03:14: **A1b CLOSED** (and A1 before it). The whole harness install + verification
wave-front is done and committed (9cdf897). Board now: A1 + A1b complete, A2 pending (the research
pass). Full evidence in docs/phases/wave-a.md under the A1 and A1b headings. What the next context
cannot re-derive:*

- *Window = 400k MEASURED (auto-compact at 380,519 tok, transcript b2d5b0f4). Context was ~81% when
  this wave-front closed - a reset (built-in auto-compact, or a user /compact) SHOULD happen before
  A2's subagent fan-out; do not start heavy work above ~45%.*
- *Harness state: UI RUNNING + ARMED (heartbeat fresh). Hooks wired in settings.json but real
  Stop-hook liveness UNVERIFIED this session (mid-session wiring). RULE ZERO floor cron 90937956
  armed ("11,41 * * * *", 7-day expiry) - it wakes the loop through the HOST scheduler (works
  regardless of the blocked paste channel) and its prompt already contains the A2 instructions.*
- *A2 is next (the user pre-greenlit research + implementation). Its board row is the spec: fan out
  Explore subagents over app/ components/ lib/ API-routes/ config; each returns bounded file:line
  findings so THIS orchestrator window stays lean; merge into wave-a.md; append implementation
  phases as [pending] rows ([proposed] for risky/prod-touching). First A2 lead already in hand:
  `npm run lint` FAILS on this repo - 14 @typescript-eslint/no-explicit-any errors (~lines
  884/886/947/973/983 of one file + HoneycombGallery 161-163) + 20 warnings (raw <img>, unused
  vars, useMemo deps). tsc is clean; production build is GREEN (lint-dirty but shippable).*
- *Known-broken this session (do NOT attempt): harness-driven /compact and the live injector paste
  (classifier-gated from Claude's tools; ledger j+m). The live paste demo is the USER's to watch.
  If THIS context was just compacted: the install is DONE - go straight to A2; do not re-run the
  A1/A1b battery (it passed, evidence in wave-a.md).*
