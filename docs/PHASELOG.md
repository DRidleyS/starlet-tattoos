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
- [complete]    B1 :: THE ADMIN PORTAL NOW TELLS THE TRUTH WHEN SOMETHING FAILS - DONE and browser-verified. The portal used to lie in four ways, all now fixed: a rejected save still flashed "Saved!"; a failed photo delete vanished from the screen anyway (and came back on refresh); a rejected upload did nothing at all with no error; and a dropped connection could park the page on "Loading..." or a button on "Saving..." forever. Every failure now says what went wrong, an expired sign-in says so in those words, and failed reorders roll back instead of leaving the admin grid and the public gallery disagreeing. Also fixed: a follow-up with no date rendered as "Sent 31 December 1969"; logging in from a deep link now returns you to the page you wanted (with an open-redirect guard, since that destination comes from the URL and is attacker-controllable); and a server error in the portal shows a real explanation with a working retry instead of a bare "ERROR 108595751". Plus labels wired to their controls and screen-reader announcements. VERIFIED IN THE BROWSER using a throwaway local .env.local (auth only, NO Supabase, no production value, gitignored): deep link -> login -> landed on /admin/gallery not the old hardcoded page; wrong password -> inline alert, no stuck button; gallery against a 500 -> error banner + working Retry instead of hanging; dead database -> the new error boundary. NOT browser-verified: BookingDetail.tsx needs a real booking row, so it is gate + review only. Gates OK (tsc=0 eslint=0, buildId CMrvrzVBL4fJl3kGcHcPo). Files: BookingDetail.tsx, app/admin/gallery/page.tsx, app/admin/login/page.tsx, + NEW app/admin/error.tsx. Narrative: wave-b.md.
- [complete]    B2 :: Public gallery correctness + a11y DONE (commits f4cbd86 HoneycombGallery + e09e5a8 FlashGallery, both verified in dev via DOM query): lightbox ref bug fixed, hex+card keyboard buttons, meaningful alt, lazy imgs, EventListener casts. FlashGallery :54 mobile padding overflow deferred to B6. Narrative: wave-b.md.
- [complete]    B3 :: Booking submission reliability CORE done (commit 7dfee31, build verified): send-booking-email.ts now throws on Resend {error} (both sends); bookings route wraps the studio send best-effort (kills the duplicate-booking-on-500 path). The two type/lint items originally listed here (BookingFunnel keydown dep, signature_pad typing) are absorbed into B5. Narrative: wave-b.md.
- [complete]    B4 :: THE PUBLIC BOOKING FORM NO LONGER ACCEPTS ANYTHING ANYONE SENDS IT - DONE, and the limits were tested in BOTH directions. The form used to take files with no limit on size, type or count, so someone could have uploaded a 2GB file, or 500 files, or a video renamed .jpg, and the server would have processed and stored all of it. That mattered more than it sounds because row-level security is off (ledger a), making this validation the only thing between a stranger and your database, and because your Supabase quota warning (ledger b) means filling storage takes the WHOLE SITE down, not just the form. Now: every upload is re-encoded through an image processor, so a file that is not really an image cannot get in on the strength of its name or its claimed type; caps are 15MB per photo, 40MB total, 6 reference photos; and nothing is written to storage until every check has passed, so a rejected submission no longer leaves debris behind. Raw database errors (table and column names) are no longer shown to the public. Also fixed across the other endpoints: an arbitrary booking status could be written straight to the database; reordering photos always reported success even when it saved nothing; failed file deletions were silently ignored, including client photo IDs left behind after a booking was deleted; and a video could be pointed at any address on the internet and shown on your homepage. THE CAPS WERE SET FROM YOUR OWN FORM, NOT GUESSED: it already shrinks photos to 1600px and allows 3 references, so a real submission is ~1.5MB per file at worst and every cap sits about 10x above that. PROVEN LOCALLY: realistic submissions (with and without photos) passed every check; a 16MB file, 7 photos, a disguised non-image, a malformed email and an over-long description were each refused with a message safe to show a customer. RESIDUAL GAP: no booking has been submitted end-to-end against a real database, so the write path after validation is unchanged-but-unproven; a real submission still needs Supabase credentials. Gates OK (tsc=0 eslint=0, buildId YVu6XAi4A37M68ggKTFqd). Files: app/api/bookings/route.ts, app/api/bookings/[id]/route.ts, app/api/gallery/route.ts, app/api/gallery/[id]/route.ts, app/api/gallery/reorder/route.ts, app/api/videos/route.ts, app/api/videos/[id]/route.ts, app/api/videos/reorder/route.ts, app/api/videos/upload-url/route.ts. Narrative: wave-b.md.
- [complete]    B6 :: SEO metadata + media perf DONE (commit 413670e, VERIFIED in dev): layout.tsx metadataBase+OpenGraph+Twitter+title template, booking-page metadata, FlashGallery p-40 -> responsive (no 375px horizontal overflow, verified), VideoCarousel inactive/peek videos preload=metadata (build-verified only - no local video data). Deferred: Vine resize-debounce (animation-internals, modest payoff; + its exhaustive-deps warnings). Narrative: wave-b.md.
- [complete]    B5 :: Lint-clean DONE (commit 6693252, VERIFIED check.ps1 RESULT OK tsc=0 eslint=0). All 14 no-explicit-any gone (CSS-var->React.CSSProperties, signature_pad v5 API, EventListener casts, catch:unknown) + the page.tsx set-state-in-effect error (justified disable) + stale VideoCarousel directive. Funnel renders, --navSize resolves (verified). NOT done (were listed but are lower-value/riskier): Supabase Database generic (needs typegen or careful hand-typing) and the ~19 remaining exhaustive-deps WARNINGS (don't fail the gate; some are real refactors). Left as ledger item. Narrative: wave-b.md.
- [complete]    C1 :: Abuse & brute-force protection DONE (VERIFIED: limiter watched firing). New lib/rate-limit.ts (in-process sliding window, fails open everywhere) applied to POST /api/bookings (5/hr/IP, checked before body parse), POST /api/healed-photos (10/hr/IP), and the admin-login failure path (10 failed attempts/15min/IP; only failures count, success clears, gate SKIPPED when no real IP so a stranger can't lock out the owner). Dev proof: 7 rapid booking POSTs -> 1-5 passed to validation (400), 6 returned 429 + Retry-After 3600, 7 stayed 429. Limitation documented: per-instance, not distributed; swap point is hit()/peek(). Narrative: wave-c.md.
- [complete]    C2 :: Security headers DONE (VERIFIED in dev, LAYOUT INTACT). next.config.ts adds Permissions-Policy (camera/mic/geo/payment/usb off - safe, funnel uses plain file inputs, no capture attr), HSTS max-age=63072000 includeSubDomains PRODUCTION-ONLY (localhost HSTS would force https on dev), and Content-Security-Policy-REPORT-ONLY (cannot block anything; 'unsafe-inline' needed for Next hydration + styled-jsx/framer/GSAP; unsafe-eval+ws dev-only). Verified on the wire: report-only present, enforcing CSP null, HSTS absent in dev. Layout: desktop no overflow + 158 CSS rules + 4 styled-jsx blocks + fonts resolved; mobile 375 overflowPx 0 / zero offenders; lightbox + canvas-toDataURL + booking funnel all fine; ZERO CSP violations. Narrative: wave-c.md.
- [complete]    C3 :: Dependency hardening DONE. package.json next-auth "^5.0.0-beta.30" -> exact "5.0.0-beta.30" (the installed, working version), so a plain npm install can no longer pull a newer BETA into the live admin auth gate unchosen. No-op today, guardrail tomorrow; stable-v5 upgrade stays a deliberate future task. check+build green. Narrative: wave-c.md.
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
  STILL OPEN, but the exposure it created is now much smaller: B4 (2026-08-19) added the input
  validation that was the ONLY guard while RLS is off. RLS remains worth enabling as defence in depth.
- (b) Supabase Free-plan banner "Grace period is over - projects will not serve requests when you
  use up your quota" - billing review belongs to the user/cousin (org owner ghostline707).
- (c) All 6 real bookings (Apr-Jul 2026) still have status "new": the owner has never used the
  status workflow, and the healing follow-up only fires on `completed`. Adoption note for the
  cousin when the user hands this over.
- (d) No DMARC record on starlettattoos.ink (optional deliverability hardening; registrar access).
- (e) Legacy NEXT_PUBLIC_EMAILJS_* env vars in Vercel are unused cruft (dashboard cleanup, user).
- (f) NEXT_PUBLIC_SUPABASE_ANON_KEY exists in Vercel but nothing in the code uses it (strengthens
  the RLS case; harmless otherwise).
- (g) HARNESS - ANSWERED 2026-08-19 ~06:45 (user observation, log-verified): hooks wired
  mid-session NEVER LOAD in this client. Evidence: UI armed (heartbeat alive) across 10+ real turn
  ends after 03:07, and hook-stop.log contains ONLY the 3 manual rig lines from 03:02-03:06 - a
  live Stop hook logs SOMETHING at every stop, so zero lines = zero firings. Ergo THIS SESSION the
  hook+injector machinery did literally nothing autonomous: no nudges, no pastes, no compactions -
  context grew monotonically ~200k -> ~560k, exactly the balloon the harness exists to prevent. The
  only autonomous drivers were the CronCreate floor (RULE ZERO, agent-contract half - a native
  scheduled prompt, not the PS machinery) and subagent task notifications. THE HOOK HALF REMAINS
  UNTESTED, NOT DEAD: it can only load at a session start. One restart with the UI armed is the
  whole test: SessionStart output appearing in the fresh context proves liveness instantly, and the
  first turn end shows phase-stop lines + the injector's first real raise/paste attempt.
  **RESOLVED 2026-08-19 11:50 - THE HARNESS WORKS END-TO-END.** After the session restart: (1)
  SessionStart:resume hook fired and injected the board brief; (2) the Stop hook fired autonomously
  (11:41:40 - first ever) and correctly stayed silent because [proposed] rows gate nudges (a real
  discovery: the proposed-check precedes the pending-check, so a board with any proposed row parks
  the loop - by design); (3) with the proposed rows temporarily lifted, the Stop hook nudged
  (11:50:12) and the injector delivered (11:50:13-22): LineFile channel carried the 224-char line,
  Raise-Claude MATCHED the window (foreground=[Claude] class=[Chrome_WidgetWin_1] - the big unknown,
  now confirmed), paste landed, Enter submitted, and the nudge arrived as a real turn. Every link in
  ledger m proven live. The ONLY reason it "never did anything" all prior session: hooks wired
  mid-session never load - they need a session start, which this session finally had.
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
- (s) PROJECT (debt knowingly taken in C1, 2026-08-19): the rate limiter in lib/rate-limit.ts keeps
  state in ONE serverless instance's memory, so it is NOT a distributed limit - Vercel reuses warm
  instances (so real bursts do get throttled) but an attacker spreading requests across cold starts
  can dilute it. Accepted deliberately: no external service, no signup, no new env vars, which suits
  a studio taking a handful of bookings a month. UPGRADE PATH IS DESIGNED IN: every call site goes
  through hit()/peek(), so moving to Vercel KV / Upstash / a Postgres table means reimplementing
  those two functions and nothing else. Revisit if the site ever attracts real abuse.
- (r) PROJECT (open decision from wave C, 2026-08-19): the CSP is REPORT-ONLY - measuring, not
  enforcing. Flipping the header key in next.config.ts from "Content-Security-Policy-Report-Only" to
  "Content-Security-Policy" is a ONE-LINE change that makes it binding. Do NOT flip it yet: dev is
  not prod (next dev differs from a real build) and local dev has no Supabase data, so image/media/
  connect to *.supabase.co was never exercised. Sequence: ship report-only to prod, let it run
  against real traffic + real Supabase content, review reported violations, THEN enforce.
- (q) PROJECT (verification boundary for wave B, 2026-08-19): B1 (admin error-handling) and B4 (API
  validation) can't be browser-verified locally - the admin portal needs an authenticated session
  and the API routes need Supabase env vars, neither present in local dev (the /api/gallery + /api/
  videos 500s prove it). Local verification for those = build + check.ps1 + code review only. B6 and
  the public UI phases ARE browser-verifiable. Options for B1/B4: user verifies on a deploy preview,
  or a local .env is provided, or build+review is accepted. Also deferred from B5: the Supabase
  Database generic (needs `supabase gen types` or careful hand-typing) and ~19 exhaustive-deps
  warnings (non-blocking; some are real refactors).
  PARTLY DISSOLVED AT B1 (2026-08-19): the AUTH half of this boundary was self-inflicted. A throwaway
  .env.local holding only NEXTAUTH_SECRET / AUTH_SECRET / NEXTAUTH_URL / ADMIN_EMAIL /
  ADMIN_PASSWORD_HASH (invented values, NO production secret, gitignored by the existing `.env*`
  rule) makes the ENTIRE admin UI reachable locally. Leaving SUPABASE_* absent is a FEATURE: auth up
  + database down is exactly the failure state the error handling exists for, so the 500s became the
  test fixture instead of the blocker. What genuinely still needs data is anything rendering a real
  row (BookingDetail.tsx) and the Supabase half of B4. Credentials are in the file's own header;
  delete the file to revert.
  FURTHER DISSOLVED AT B4 (2026-08-19): the API half was soft too. Validation runs BEFORE any Supabase
  call, so without a database a rejected request answers 400 and an accepted one reaches
  createServerClient() and dies 500 - a clean two-valued signal that let every cap be tested in BOTH
  directions locally. WHAT REMAINS GENUINELY UNPROVEN is only the write path AFTER validation, i.e. a
  real booking landing in a real database. That still wants the user's Vercel preview or real creds.
- (t) PROJECT (trap measured at B1, 2026-08-19): Next.js runs .env values through VARIABLE EXPANSION,
  and does so even for SINGLE-QUOTED values. A bcrypt hash starting `$2b$10$...` is therefore
  destroyed on load - `$2b`, `$10` and the following `$...` run are each replaced with an empty
  string, so a 60-char hash arrived as 47 chars and every login failed with a CORRECT password, with
  no error anywhere except a generic CredentialsSignin. Escape each `$` with a backslash. Diagnosed
  by loading the file through Next's own `@next/env` and printing the parsed value rather than
  theorizing. Relevant to the user directly: putting a real ADMIN_PASSWORD_HASH in any local env file
  hits this.
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

*Stamp 2026-08-19 ~12:50: **B4 CLOSED** - THE BOARD IS NOW EMPTY. Every phase A1/A1b/A2/B1-B6/C1-C3
is complete; there is NO pending or proposed row left, so the loop STOPS here and waits for the human.
Do NOT invent new phases without the user asking. Committed locally, NOT pushed. What a fresh context
cannot re-derive:*

- ***NOTHING IS PUSHED AND THAT IS DELIBERATE.*** *main auto-deploys to the LIVE site
  (www.starlettattoos.ink) via Vercel. The user's standing instruction is that pushing is THEIR
  greenlight. The repo is many commits ahead of origin/main on purpose.*
- *B4's stated blocker turned out to be SOFT, same lesson as B1: validation runs BEFORE any Supabase
  call, so locally a rejected request answers 400 and an accepted one reaches createServerClient() and
  dies 500. That two-valued signal let the caps be tested in BOTH directions with no database. Probe
  script kept at scratchpad/b4-probe.mjs (needs createRequire pointed at the project to resolve sharp).*
- *CAPS WERE DERIVED FROM components/BookingFunnel.tsx, NOT INVENTED: it resizes to 1600px/JPEG q0.8
  and passes files through untouched only when already <=1600px AND <=1.5MB, MAX_REFERENCE_PHOTOS = 3.
  So real traffic is ~1.5MB/file worst case and the server caps (15MB/file, 40MB total, 6 photos) sit
  ~10x above it. If anyone ever "tightens" these, re-derive from the funnel first - the expensive
  failure mode is rejecting a real customer, not accepting a big file.*
- *THE SECURITY HIGH IS CLOSED: uploads are re-encoded through sharp, so decoding IS the type check
  and a non-image renamed .jpg WITH an image/jpeg MIME is refused (measured). extFromType() is gone -
  the stored extension no longer comes from the caller's claimed type. New photo IDs/references are
  stored as .jpg; OLD bookings are unaffected because the admin page signs whatever path is on the row.*
- *Reorder routes previously discarded every Promise.all result, and Supabase reports failures in the
  result rather than throwing - so every reorder returned ok:true regardless. That is the SERVER half
  of B1's client-side revert-on-failure; the two only make sense together. Do not "simplify" either.*
- *Delete routes keep row-first ordering ON PURPOSE (orphan = invisible + quota cost; the reverse =
  broken image on the public site). Storage-removal failures are now logged by name, which matters
  most for bookings because those files are client photo IDs.*
- *RESIDUAL GAP, told to the user plainly: no booking has been submitted end-to-end against a real
  database. Proven = realistic submissions pass every check and abusive ones are refused. NOT proven =
  the write path afterwards. Still needs real Supabase creds; recommend the user do this on a Vercel
  preview or supply creds locally before pushing.*
- *The .env.local from B1 is STILL PRESENT (auth only, invented values, gitignored). Delete to revert.*
- *Dev server RUNNING on port 3000 (serverId 52f20abe-2d8b-418f-b26b-e7540debff51). build.ps1 REFUSES
  while it holds the port. Rate limiter is 5/hr and in-process, so probe batches need a restart between
  them (a live demonstration of ledger s).*

*(prior stamp, still accurate:) Stamp 2026-08-19 ~12:35: **B1 CLOSED** - the admin portal now reports failure honestly. Committed
locally, NOT pushed. Board: A1/A1b/A2/B1/B2/B3/B5/B6/C1/C2/C3 complete; only B4 remains, and it is
STILL the user's call. What a fresh context cannot re-derive:*

- ***A LOCAL `.env.local` NOW EXISTS AND I CREATED IT.*** *Auth vars only (NEXTAUTH_SECRET,
  AUTH_SECRET, NEXTAUTH_URL, ADMIN_EMAIL, ADMIN_PASSWORD_HASH), all INVENTED - no production secret
  is in it, and it is gitignored by the existing `.env*` rule. Login for the dev server:
  local-admin@example.test / b1-local-test-only. SUPABASE_* is deliberately ABSENT so /api/gallery
  keeps returning 500 - that 500 is the test fixture for B1's error handling, not a problem to fix.
  Deleting the file reverts everything. TELL THE USER IT EXISTS if it has not already been said.*
- *THE ENV TRAP (ledger t) cost real time and will bite the user: Next expands $VAR inside .env
  values EVEN IN SINGLE QUOTES, so a bcrypt hash `$2b$10$...` loads mangled (60 chars -> 47) and a
  CORRECT password fails with only a generic CredentialsSignin to show for it. Backslash-escape every
  `$`. Diagnosed by parsing the file through Next's own `@next/env`, not by guessing.*
- *B1 evidence is under the `## B1` heading in wave-b.md. Watched live: deep link -> login -> landed
  on /admin/gallery (the old code hardcoded /admin/bookings); wrong password -> inline role=alert and
  a recovered button; /admin/gallery against a 500 -> error banner + Retry that genuinely re-fires
  (network log) instead of "Loading..." forever; dead DB -> the NEW app/admin/error.tsx boundary.
  HONEST GAP: BookingDetail.tsx could NOT be browser-verified (needs a real booking row) - gate +
  review only. Gates: tsc=0 eslint=0; buildId CMrvrzVBL4fJl3kGcHcPo.*
- *NOTE the middleware supplies callbackUrl as an ABSOLUTE url (http://localhost:3000/admin/gallery),
  so the open-redirect guard resolves against window.location.origin; a `startsWith("/")` check would
  reject every real callback and silently restore the old hardcoded behaviour. Do not "simplify" it.*
- ***B4 IS THE ONLY WORK LEFT AND IT IS STILL THE USER'S DECISION.*** *It changes the LIVE public
  booking path (file size/type/count caps), which is how the business gets customers, so a wrong cap
  rejects real clients. The auth half of the old blocker is now dissolved (see ledger q), but B4's
  Supabase half is NOT - a real end-to-end submission still needs real Supabase creds. Standing
  recommendation unchanged: B4 deserves a real submission, not code review.*
- *Dev server was restarted three times during B1 and is RUNNING again on port 3000 (serverId
  f739de3e-da8a-4fc9-b779-439f1c730896). build.ps1 REFUSES while it holds the port - stop the preview
  first. Public homepage re-checked after all edits: scrollWidth == clientWidth == 1265, no overflow.*

*(prior stamp, still accurate:) Stamp 2026-08-19 ~12:20: **C1 CLOSED**, **C2 CLOSED**, **C3 CLOSED** - wave C (security hardening)
is DONE, committed locally as e5e4043, and deliberately NOT PUSHED (repo is 13 commits ahead of
origin/main; pushing auto-deploys prod, and the user wants to eyeball layout first). This stamp was
written because the harness's own boundary notes-gate REFUSED to compact without it - that gate is
now proven live alongside the Stop hook and injector. What a fresh context cannot re-derive:*

- ***A DEV SERVER IS STILL RUNNING*** *on port 3000 (Browser-pane preview, serverId
  aaaafa57-3f37-455a-ae9f-f855a745f676, started via scripts/harness/dev.cmd). It was left up ON
  PURPOSE so the user can inspect layout themselves. CONSEQUENCE: `scripts/harness/build.ps1` will
  REFUSE while it holds the port - stop the preview first, or use check.ps1 (tsc+eslint, no conflict).*
- *THE CSP IS REPORT-ONLY AND MUST STAY THAT WAY FOR NOW (ledger r). Flipping the key in
  next.config.ts from "Content-Security-Policy-Report-Only" to "Content-Security-Policy" is a
  one-line change that makes it BINDING and could white-screen the live site. Local dev has no
  Supabase data, so img/media/connect to *.supabase.co was NEVER exercised against the policy.
  Correct sequence: ship report-only to prod -> observe real violations -> only then enforce.*
- *Wave C evidence (all in wave-c.md, headings C1/C2/C3): the rate limiter was watched FIRING - 7
  rapid POSTs to /api/bookings gave 400,400,400,400,400 then 429 with Retry-After 3600 on #6 and #7.
  Dev layout verified intact: desktop no overflow + 158 CSS rules/5 sheets/4 styled-jsx blocks +
  fonts resolved; mobile 375 overflowPx 0, zero offenders; lightbox, canvas->toDataURL, and the
  booking funnel all fine; ZERO CSP violations anywhere.*
- *AWAITING THE USER (do not start these): B1 + B4 are [pending] but blocked on their
  verification-approach choice - (a) build+review then they confirm on a Vercel preview, (b) they
  supply a local .env so a real booking can be submitted end-to-end, or (c) hold. Both rows were
  REWRITTEN INTO PLAIN ENGLISH at the user's request - keep them that way. My standing recommendation,
  already given: B4 is the highest-value item left and deserves option (b), because it changes the
  LIVE intake path and should be proven with a real submission rather than code review.*
- *Harness status: hooks are fully live after the session restart (SessionStart, Stop, injector paste,
  and now the notes gate all observed firing). RULE ZERO floor cron is NOT armed right now - re-arm
  ("11,41 * * * *") only if resuming autonomous operation; a board awaiting a user greenlight gets no
  timer. Note the Stop hook goes SILENT whenever any [proposed] row exists (proposed-check precedes
  pending-check) - there are none now, so it will nudge toward B1 at turn end.*
- *(prior stamp, still accurate:) B6 CLOSED - WAVE B CONVERGED. All browser-verifiable pre-greenlit work
is done (B2 galleries, B3 email reliability, B5 lint-green, B6 SEO/perf). The loop has reached the
point where EVERYTHING remaining needs the user, so the RULE ZERO floor cron was DELETED (per "a wave
awaiting a human greenlight gets no timer") and the loop STOPS here. Commits this session: 5dfd74c
(harness window fix), 7dfee31 (B3), f4cbd86 + e09e5a8 (B2), 6693252 (B5), 413670e (B6), + board
commits. Board: A1/A1b/A2/B2/B3/B5/B6 complete. AWAITING USER:*
- *B1 (admin) + B4 (API validation, has the security HIGH) are [pending] but BLOCKED on the user's
  verification-approach decision (ledger q): they can't be browser-verified locally (no auth/Supabase
  env). Options given to the user: (a) accept build+review, (b) provide a local .env, (c) hold them.
  Do NOT start B1/B4 until the user answers - resume when they do, honoring their choice.*
- *C1-C3 [proposed] await an explicit greenlight (rate-limiting mechanism, CSP report-only, next-auth
  pin). Do NOT start without it.*
- *To resume after the user responds: re-read this board; check.ps1 is the green gate (run after every
  edit); build.ps1 refuses under the dev server (stop the preview first). Dev preview via
  scripts/harness/dev.cmd + .claude/launch.json (port 3000); pane not composited so verify via DOM
  queries. If re-arming autonomous operation, re-create the floor cron ("11,41 * * * *") per CLAUDE.md
  RULE ZERO. Full trace in wave-a.md (research) + wave-b.md (implementation).*
- *(prior context, still valid:) window figure was corrected from a bad 400k to provisional 1M
  (5dfd74c); the 43-finding recon is in wave-a.md; per-phase file:line targets are on each board row.*
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
