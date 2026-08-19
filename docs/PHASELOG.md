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
- [complete]    A2 :: Recon done: 4 read-only Explore agents (public/admin/lib+config/API) returned 43 file:line findings, merged into wave-a.md, synthesized into wave B (pending) + wave C (proposed). 2 correctness HIGHs + 1 security HIGH + validation/silent-failure/lint/a11y clusters. Narrative: wave-a.md A2 headings.
- [pending]     B1 :: Admin portal resilience. Files: app/admin/bookings/[id]/BookingDetail.tsx (save():106, handleDelete():80, followupSent:236, labels :197/:268), app/admin/gallery/page.tsx (fetchAll:41, upload:58, delete:127/133, reorder:152/169), app/admin/login/page.tsx (callbackUrl:27, labels:50, role=alert:45). Gate every fetch on res.ok + try/catch/finally, surface errors, stop showing false success. DoD: each admin mutation shows correct success/failure in dev; check.ps1 + build green.
- [complete]    B2 :: Public gallery correctness + a11y DONE (commits f4cbd86 HoneycombGallery + e09e5a8 FlashGallery, both verified in dev via DOM query): lightbox ref bug fixed, hex+card keyboard buttons, meaningful alt, lazy imgs, EventListener casts. FlashGallery :54 mobile padding overflow deferred to B6. Narrative: wave-b.md.
- [complete]    B3 :: Booking submission reliability CORE done (commit 7dfee31, build verified): send-booking-email.ts now throws on Resend {error} (both sends); bookings route wraps the studio send best-effort (kills the duplicate-booking-on-500 path). The two type/lint items originally listed here (BookingFunnel keydown dep, signature_pad typing) are absorbed into B5. Narrative: wave-b.md.
- [pending]     B4 :: API input validation + error hygiene. app/api/bookings/route.ts:44 cap size/MIME/count + sharp re-encode uploads; app/api/gallery/route.ts try/catch + size cap + category whitelist + generic errors; status enum + notes cap (bookings/[id]); reorder id-validation + partial-failure checks; storage-remove result checks; videos url validation. RLS is off so this is the only guard. DoD: malformed uploads/inputs 400 cleanly, legit booking still succeeds in dev.
- [complete]    B5 :: Lint-clean DONE (commit 6693252, VERIFIED check.ps1 RESULT OK tsc=0 eslint=0). All 14 no-explicit-any gone (CSS-var->React.CSSProperties, signature_pad v5 API, EventListener casts, catch:unknown) + the page.tsx set-state-in-effect error (justified disable) + stale VideoCarousel directive. Funnel renders, --navSize resolves (verified). NOT done (were listed but are lower-value/riskier): Supabase Database generic (needs typegen or careful hand-typing) and the ~19 remaining exhaustive-deps WARNINGS (don't fail the gate; some are real refactors). Left as ledger item. Narrative: wave-b.md.
- [pending]     B6 :: SEO metadata + media perf. app/layout.tsx openGraph/twitter/metadataBase; app/booking/page.tsx metadata (+ noindex decision); components/VideoCarousel.tsx preload=metadata; VineTopFrame.tsx/VineMainDivider.tsx resize-restart debounce; FlashGallery.tsx mobile padding overflow. DoD: link-preview meta present, no homepage horizontal scroll at 375px, verified in browser.
- [proposed]    C1 :: Abuse & brute-force protection (rate-limit public bookings + healed-photos POST; admin-login lockout). Serverless has no shared memory - needs an infra choice (edge middleware + Upstash/Vercel KV, or similar). AWAITING user greenlight on the mechanism.
- [proposed]    C2 :: Security headers - add HSTS + Permissions-Policy + CSP in next.config.ts. CSP can break the live site (GSAP/framer/Supabase/inline styles); ship report-only first, then enforce. Prod-risky - AWAITING greenlight.
- [proposed]    C3 :: Dependency hardening - pin next-auth off the moving ^5.0.0-beta.30 and plan the stable-v5 upgrade. Touches the live admin auth gate - AWAITING greenlight.
<!-- PHASE-BOARD-END -->

### Wave index
| Wave | Directive (the human's words) | Narrative file |
|---|---|---|
| A | "perform a research phase(s) where you can analyze the whole project thoroughly and identify improvements you can make throughout, and then i want you to begin on the implementation phase(s)" - plus "implement it [the harness blueprint] into this project and start up the automation harness ... ill be excited to see how well you do, and where/when the harness breaks in this completely new stack" (2026-08-19) | docs/phases/wave-a.md |
| B | (same directive - the pre-greenlit implementation half: safe, dev-verifiable code fixes from the A2 recon) | docs/phases/wave-b.md |
| C | (same directive - the deferred half: prod-infra / live-path-risk / dependency items that need an explicit design greenlight) | docs/phases/wave-c.md |

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
- (q) PROJECT (verification boundary for wave B, 2026-08-19): B1 (admin error-handling) and B4 (API
  validation) can't be browser-verified locally - the admin portal needs an authenticated session
  and the API routes need Supabase env vars, neither present in local dev (the /api/gallery + /api/
  videos 500s prove it). Local verification for those = build + check.ps1 + code review only. B6 and
  the public UI phases ARE browser-verifiable. Options for B1/B4: user verifies on a deploy preview,
  or a local .env is provided, or build+review is accepted. Also deferred from B5: the Supabase
  Database generic (needs `supabase gen types` or careful hand-typing) and ~19 exhaustive-deps
  warnings (non-blocking; some are real refactors).
- (p) HARNESS (the decisive break, measured 2026-08-19 ~04:xx): the autonomous loop CANNOT cross the
  context ceiling on this stack without the user. Three cron fires in a row measured 79.6% -> 81.6%
  -> 94.9% -> 95.9%, climbing ~4k per fire, and NO reset fired at the ~380k point I expected. Refined
  insight: the 380,519 "compact boundary" I measured in transcript b2d5b0f4 was almost certainly a
  MANUAL /compact (this session opened with one), NOT the built-in auto-compact - so the true auto
  threshold is unknown and I am past 380k without a reset. Net: the harness's own /compact is
  classifier-blocked (m/n) AND the built-in is not firing where expected, so at the ceiling the loop
  can only DEFER; B1 (implementation = read+edit files, heavy) cannot start safely. RESOLUTION IS THE
  USER'S: a manual /compact hands a fresh window and B1 proceeds. Escalated to the user rather than
  spin the cron indefinitely. This is THE answer to "where does the harness break in this stack":
  it drives continuation and research (subagent notifications) fine, but depends on an external
  context-reset it cannot trigger here.
- (o) HARNESS (port adaptation, 2026-08-19): the 45% critical-mass "defer heavy work" rule assumes
  a CHEAP self-reset (the injector types /compact). On a stack where that channel is blocked (ledger
  m/n), deferring buys only an idle slow-climb, not a reset - so the adapted rule is: use the
  headroom to the built-in reset (~380k) for BOUNDED, checkpointed progress, and split before the
  ceiling. First applied at 81.6% to launch A2's recon fan-out via subagents (which run in their own
  windows, so orchestrator growth is just their bounded returns). This is arguably an IMPROVEMENT to
  fold back upstream: "bounded-progress-to-headroom" is safe whenever the unit of work fits and
  checkpoints durably, self-compaction or not.
- (n) HARNESS (the loop's ceiling on this stack, measured 2026-08-19 03:45): the autonomous loop
  can CONTINUE (cron re-invokes through the host) but cannot RESET CONTEXT on its own, because the
  only mechanism that types /compact is the classifier-blocked injector. So at high context (hit
  79.6% after the install wave) the loop correctly parks per its own guard and waits for an external
  reset (user /compact or the SDK's built-in summarisation). Consequence: unattended, it slow-climbs
  on cron fires until the built-in auto-compact (~380k/95%) resets it, THEN advances - functional
  but not the clean self-compaction the Unreal install had. A real fix would be a non-paste compaction
  trigger (e.g. if the host ever exposes a programmatic /compact, or a hook that can request one).
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

*Stamp 2026-08-19 ~06:20: **B5 CLOSED** (and B2, B3-core before it - implementation underway). The
window-figure crisis is RESOLVED: 400k was a misidentified manual /compact; ran to 413k fine;
$HarnessWindowTokens corrected to provisional 1M (commit 5dfd74c). Context is HEALTHY - judge by raw
tokens + actual operation, not the old bogus %. Commits so far this wave: 7dfee31 (B3 email), f4cbd86
(B2 HoneycombGallery), e09e5a8 (B2 FlashGallery), 6693252 (B5 lint-green), + 5dfd74c (harness window).
Board: A1/A1b/A2/B2/B3/B5 complete; B1/B4/B6 pending; C1-C3 proposed. Next work + what can't be
re-derived:*
- *NEXT: B1 (admin resilience), B4 (API validation - has the security HIGH: unbounded public upload),
  B6 (SEO/perf - browser-verifiable). VERIFICATION BOUNDARY (ledger q): B1+B4 are admin/server logic
  that CANNOT be browser-tested locally (no auth session, no Supabase env - the /api 500s prove it);
  local verification = build + check.ps1 + review only. B6 IS browser-verifiable. This was flagged to
  the user at the B5 checkpoint - they may want to verify B1/B4 themselves or accept build+review.*
- *check.ps1 is now GREEN and TRUSTWORTHY (repo passed its own lint for the first time). Run it after
  every edit. build.ps1 REFUSES under the dev server - stop the preview (serverId in preview_list)
  before building, or rely on check.ps1 (tsc+eslint, no .next conflict).*
- *Dev preview works: scripts/harness/dev.cmd (fixes node-PATH) via .claude/launch.json, port 3000.
  Browser pane NOT composited - screenshots + rAF time out; verify via read_page / get_page_text /
  javascript_tool DOM queries. Local galleries use FALLBACK images (no Supabase). Age gate: click Yes.*
- *A2 recon (43 findings) is in wave-a.md; per-phase file:line targets are on each B/C board row.
  C1-C3 [proposed] must NOT start without the user's explicit greenlight.*
- *(prior:) A2 CLOSED - research done, 43 findings synthesized into wave B/C. .inflight clear.*

- *NEXT WORK is B1 (admin resilience) then B2..B6 in order - all pre-greenlit, pure-code,
  dev-verifiable. C1-C3 are [proposed] and must NOT be started without the user's explicit
  greenlight (infra/live-path/dependency risk). Each B row on the board carries its own file:line
  targets + DoD - start cold from the row.*
- *CONTEXT was ~82% (330k+) at this close - a RESET SHOULD PRECEDE B1's implementation work (edit
  files + check.ps1 + build.ps1 + browser verify wants headroom). Per ledger o, do not start heavy
  editing above ~45%. On this stack the reset is the SDK built-in (~380k) or a user /compact - the
  harness can't self-compact (ledger m/n). The floor cron will re-wake to continue B1 after a reset.*
- *Two correctness HIGHs to fix early (B2, B3): HoneycombGallery single-imgRef bug (lightbox zoom
  binds wrong element); send-booking-email swallows Resend {error} (studio alert w/ consent PDF +
  photo ID silently "succeeds"). Plus a security HIGH (B4): unbounded public booking upload. RLS is
  off + service-role only, so B4 input validation is the ONLY guard (ledger a).*
- *Per-phase loop for B: read the file(s) -> edit -> scripts/harness/check.ps1 (eslint must reach 0
  by B5) -> scripts/harness/build.ps1 -> browser-verify in dev -> update board+wave-b.md+stamp ->
  local commit (NEVER push). Create docs/phases/wave-b.md at B1 start.*
- *Known-broken (do NOT attempt): harness-driven /compact + live injector paste (ledger j/m). Below,
  the durable prior (harness-install) handoff:*

*(prior close context, still current:) **A1b CLOSED** (and A1). Harness install + verification
done, committed 9cdf897 + 08ea52a. Board: A1 + A1b complete, A2 pending. Evidence in
docs/phases/wave-a.md under the A1 and A1b headings. What the next context cannot re-derive:*

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
