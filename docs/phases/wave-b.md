# Wave B — pre-greenlit implementation (from the A2 recon)

Safe, dev-verifiable code fixes. Each phase: read -> edit -> build/check green -> browser-verify
where it's a UI change -> local commit (NEVER push). Findings + file:line targets are in wave-a.md.

Context note (2026-08-19): early in wave B the harness's window figure (400k) was found WRONG - it
came from a manual /compact, not the auto limit. Session ran past 413k tokens fine; corrected
$HarnessWindowTokens to a provisional 1M (commit 5dfd74c). The earlier turns of "defer at high
context" were a false alarm against a bad denominator.

## B3 (core) — booking submission reliability  [done: commit 7dfee31]

The defining bug — a HIGH — is fixed: `lib/send-booking-email.ts` `sendBookingEmail` and
`sendHealedPhotosEmail` ignored Resend's returned `{ error }`, so an API-level failure of the
studio's new-booking alert (which carries the consent PDF + photo ID) resolved as SUCCESS. Now both
destructure `{ error }` and throw. Paired change in `app/api/bookings/route.ts`: the studio send was
outside a try/catch, so a throw would 500 AFTER the row+uploads committed -> client retries ->
duplicate booking. Wrapped it best-effort (the booking is already saved; a missed studio email is
recoverable from the admin portal, a duplicate is not). Verified: build RESULT OK.
The two remaining B3 items (BookingFunnel keydown stale dep, signature_pad typing) are type/lint
issues — folded into B5 where they belong.

## B2 — public gallery correctness + a11y  [HoneycombGallery done: commit f4cbd86; FlashGallery pending]

HoneycombGallery.tsx (HIGH ref bug + a11y + perf, VERIFIED in dev):
- The single `imgRef` was set on every thumbnail, so the pinch/zoom/pan/double-tap effect bound to a
  grid hex, not the lightbox image (which had no ref). Moved the ref to the overlay `<img>`; the
  effect (keyed on `[selected]`) now binds to it. Also reset zoom/pan state on open/navigate so a
  prior image's zoom doesn't carry across.
- Hex tiles are now real keyboard buttons: role="button", tabIndex=0, Enter/Space onKeyDown, aria-label.
- Meaningful alt ("Tattoo work N", not "gallery 0") on thumbnails + overlay; `loading="lazy"
  decoding="async"` on all hex images.
- Replaced the 3 `removeEventListener(... as any)` casts with `as EventListener` (kills 3 of the 14
  lint errors).
- Browser verification (dev, fallback images since local has no Supabase env): DOM query confirmed 16
  keyboard-focusable hexes with aria-labels, 32 lazy images, sample alt "Tattoo work 1"; clicking a
  hex opens the lightbox with the ref'd `.hc-img` (src + alt + scroll-lock all correct).
- Added scripts/harness/dev.cmd — a dev-server launcher that prepends the Node dir to PATH (next dev
  shells out to `node`, which isn't on this machine's PATH) + .claude/launch.json for the preview.

FlashGallery.tsx still to do: same alt/img (lazy) treatment (its mobile padding overflow is B6).

## B5 — lint-clean + type safety  [done: commit 6693252, verified check.ps1 OK]

The repo did NOT pass its own `npm run lint` (14 errors); now it does (tsc=0, eslint=0).
- BookingFunnel.tsx: 6 CSS-var `as any` casts -> `as React.CSSProperties` (custom `--*` props) or
  no-cast (standard props); signature_pad to the v5 API — `pad.addEventListener("endStroke", ...)`
  (the old `(pad as any).onEnd` is a no-op in v5, which is why there was a manual Save button) and
  `pad.fromDataURL(...).catch(...)` (real method, async in v5); `catch (err: unknown)` + narrowing.
- HoneycombGallery.tsx: 3 `removeEventListener(... as any)` -> `as EventListener` (done in B2).
- app/page.tsx:165: a `react-hooks/set-state-in-effect` ERROR on the SSR age-gate. localStorage is
  unavailable during SSR so this single post-mount setState is unavoidable — justified disable.
- Removed a stale `jsx-a11y/media-has-caption` disable in VideoCarousel.
- VERIFIED in dev: booking funnel renders at Step 1/11, `--navSize` custom prop resolves
  (clamp(56px,6.5vw,76px), nav pill 76px) — the React.CSSProperties casts preserve behavior. The
  signature critical path (funnel Next -> imperative save()) is independent of the endStroke change.
- NOT done (deferred, see ledger): the Supabase `Database` generic (needs `supabase gen types`
  against the project, or careful hand-typing) and ~19 `react-hooks/exhaustive-deps` WARNINGS (they
  don't fail the gate; several — goNext/goBack/submit useCallback wrapping — are real refactors with
  behavior risk, not mechanical).

## Remaining wave B (B1 admin, B4 API, B6 SEO/perf) — a verification boundary

B6 is now DONE (commit 413670e, browser-verified: og:/twitter: tags in the head, no 375px overflow).
The two remaining phases are BLOCKED on a user decision, so the loop STOPPED and the floor cron was
deleted. B1 (admin error-handling) and B4 (API validation, incl. the security HIGH) are server/admin
logic that CANNOT be browser-verified locally: the admin portal needs an authenticated session and
the API routes need Supabase env vars, neither present in local dev (the /api 500s prove it). Options
given to the user: (a) accept build+review, (b) provide a local .env, (c) hold them. C1-C3 [proposed]
await a greenlight. Resume when the user chooses.

## Verification environment note

Local dev has NO Supabase env vars, so `/api/gallery` + `/api/videos` return 500 and the galleries
fall back to hardcoded public images (tat*.png / flash*.PNG) — a pre-existing condition, fine for UI
verification. The Browser pane is not composited here, so screenshots + requestAnimationFrame waits
time out; verify via read_page / get_page_text / direct DOM queries (javascript_tool) instead.
Admin-portal phases (B1) can't be browser-tested locally (no auth env) — verify by build + review.
SUPERSEDED at B1: a throwaway local `.env.local` (auth vars only, no Supabase) makes the whole admin
UI reachable without any production secret. See the B1 heading below.

## B1 — make the admin portal tell the truth when something fails  [done, browser-verified]

Proceeded under the user's option (a) — implement, verify by gate + review, they confirm on a preview
before any push — because it was the only option that is safe under EVERY answer they might still
give: admin-only, no public page touched, and nothing is pushed regardless. If they later prefer
option (b), the code is already written and only needs re-confirming.

### The dishonest failures that were fixed

`app/admin/bookings/[id]/BookingDetail.tsx`
- `save()` set `saved` UNCONDITIONALLY, so a rejected save still flashed "Saved!" — the owner would
  walk away believing a status change had been written. Now only success sets it; failures raise a
  `role="alert"` banner, and 401/403 gets its own "your sign-in has expired" wording because a portal
  left open for days expires far more often than the server actually breaks.
- Neither `save()` nor `handleDelete()` had a try/catch, so a dropped connection left the button on
  "Saving..."/"Deleting..." forever. Both now recover; delete deliberately stays disabled on success
  because the navigation is the feedback.
- `followupSent` required only `emailId`, letting a row with no `scheduled_for` reach the "Sent ..."
  branch where `scheduledFor!` handed `new Date(null)` to the formatter and rendered **31 December
  1969**. Now the date is required, and `formatFollowupDate` returns "an unknown date" for anything
  unparseable rather than a confident wrong date.
- `<label>`s had no `htmlFor` and the controls no `id`; the "Healing follow-up" label pointed at no
  control at all (it heads a status panel) and is now a `<p>`. Added an `sr-only` `role="status"`.

`app/admin/gallery/page.tsx`
- `fetchAll()` had no try/catch, and `await imgRes.json()` on a 500 (an HTML error body) throws — so
  `setLoading(false)` never ran and the page sat on "Loading..." forever. THIS IS THE ONE WATCHED
  FAILING AND THEN PASSING (see below).
- `uploadImage()` discarded the response entirely: a rejected upload was indistinguishable from a
  successful one — the refetch simply returned without the image. Now throws with the reason.
- Both deletes removed the item from the grid unconditionally, so a failed delete looked identical to
  a successful one until a refresh brought the item back. Now the grid changes only after the server
  confirms.
- Both reorders ignored the response, leaving the admin grid and the public gallery disagreeing.
  Now the optimistic move is ROLLED BACK on failure.
- `alert()` replaced with an inline `role="alert"` banner carrying a **Retry**; tabs got `aria-pressed`.

`app/admin/login/page.tsx`
- The post-login destination was hardcoded to `/admin/bookings`, so a deep link to the gallery manager
  always landed elsewhere. Now honours `callbackUrl`.
- **Open-redirect guard added.** `callbackUrl` arrives in the query string and is attacker-
  controllable, so `safeCallbackUrl()` resolves it against the current origin and rejects anything
  off-origin or outside `/admin`. MEASURED: the middleware supplies it as an ABSOLUTE url
  (`http://localhost:3000/admin/gallery`), so a naive `startsWith("/")` check would have rejected
  every real callback and silently preserved the old behaviour.
- `if (res?.error)` treated a MISSING response as success and redirected into /admin with no session;
  now `!res || res.error`. Added `role="alert"`, `htmlFor`/`id`, and autocomplete tokens.

`app/admin/error.tsx` (NEW — beyond the row's file list, added on evidence)
Only visible once logged in: a server-side failure on `/admin/bookings` dropped the owner onto Next's
built-in "This page couldn't load" above a bare `ERROR 108595751`. Same class of dishonest failure the
phase exists to remove, so the segment got a real boundary: human explanation, a working "Try again"
(`reset()`), and the digest shown while the raw message is NOT — thrown messages can carry table and
column names to the screen.

### How it was verified (the boundary in ledger q turned out to be soft)

A throwaway `.env.local` — auth vars ONLY, no Supabase, no production value anywhere, gitignored via
the existing `.env*` rule — made the entire admin UI reachable. Leaving Supabase absent was the point:
with auth working and the database missing, `/api/gallery` returns 500, which IS the failure B1 fixes.

Watched live in the browser:
- deep-link `/admin/gallery` -> middleware bounce -> sign in -> landed on **`/admin/gallery`**, not the
  old hardcoded bookings page.
- wrong password -> stayed on the page, `role="alert"` reading "Invalid email or password.", button
  recovered to "Sign In" (no stuck "Signing in...").
- `/admin/gallery` against a 500 -> `role="alert"` "Could not load the gallery." + **Retry**, and the
  Retry re-fires the request (confirmed in the network log). Previously: "Loading..." forever.
- `/admin/bookings` against a dead database -> the new boundary, admin nav intact, digest shown.
- tabs report `aria-pressed` true/false; both login labels resolve to their real controls via
  `label.control`.
- public homepage regression check: renders, scrollWidth == clientWidth == 1265, no overflow.

NOT browser-verified: `BookingDetail.tsx` itself needs a real booking row, so it is covered by
tsc + eslint + production build + review only. Stated plainly rather than implied.

### A trap worth remembering

The first login attempt failed with a VALID password. Next.js runs `.env` values through variable
expansion, and it does so **even for single-quoted values** — the bcrypt hash `$2b$10$2OrXcw...`
arrived as `/F/fbaWjctfnnqe...` (47 chars, not 60) because `$2b`, `$10` and `$2OrXcw` were each
substituted with an empty string. Diagnosed by loading the file through Next's own `@next/env` rather
than guessing, and fixed by backslash-escaping each `$`. This will bite anyone putting a real
`ADMIN_PASSWORD_HASH` in a local env file. Logged as ledger (t).

Gates: `RESULT: OK tsc=0 eslint=0`, `RESULT: OK exit=0 buildId=CMrvrzVBL4fJl3kGcHcPo`. The gate also
earned its keep here — it failed the first run on a raw `<a>` in the new error boundary
(`@next/next/no-html-link-for-pages`), fixed to `<Link>`.

## B4 — stop the API accepting anything anyone sends it  [done, caps proven in both directions]

Started on the harness's nudge, but the real unlock was noticing that the stated blocker was weaker
than assumed: **validation runs BEFORE any Supabase call**, so locally a rejected request answers 400
and an accepted one reaches `createServerClient()` and dies 500. That gives a clean two-valued signal
without a database — 400 means "validation rejected it", 500 means "validation passed it end to end".
So the caps could be tested in BOTH directions after all.

### Caps were sized from the funnel, not invented

`components/BookingFunnel.tsx` resizes every image to 1600px / JPEG q0.8 and passes a file through
untouched ONLY when it is already <=1600px AND <=1.5MB, capping references at 3 (`MAX_REFERENCE_PHOTOS`).
So a genuine submission is one photo ID plus at most 3 files of ~1.5MB worst case. Chosen limits:
15MB per file (~10x the largest realistic one), 40MB total, 6 reference photos (double the funnel's
own cap), 5000-char description, 320-char email, 2MB signature/initials data URLs. Every one sits far
above real traffic on purpose — turning away a real customer is the expensive failure here.

### What was actually wrong

`app/api/bookings/route.ts` (the public one, and the security HIGH)
- NO size, count or type limit on uploads, and files were buffered whole with
  `Buffer.from(await file.arrayBuffer())`. RLS is off and the app is service-role only (ledger a), so
  this validation is the only guard, against a project already near its storage quota (ledger b).
- Uploads ran INLINE as fields were read, so a request that failed partway still left orphaned files
  in the bucket. Now every check runs first and nothing touches storage until all of them pass.
- The stored file extension came from `extFromType(file.type)` — the caller's CLAIMED MIME. Now every
  image goes through sharp and is stored as a real `.jpg`; decoding IS the type check, so a video (or
  a shell script) renamed `.jpg` cannot survive. This also bounds what LANDS in storage regardless of
  what was sent. `extFromType` is gone.
- `initialsPngDataUrl` / `signaturePngDataUrl` were arbitrary strings flowing straight into a Buffer
  and an upload; now shape- and size-checked.
- Text fields were unbounded and the email unvalidated (permissive regex — a strict one's failure mode
  is rejecting a real customer).

`app/api/gallery/route.ts` — the public GET echoed the raw Postgres error message (table/column names)
to anyone who called it. `category` flowed unchecked into a STORAGE PATH (`${category}/${id}.jpg`), so
it is now matched against a fixed list rather than sanitised. Added a size cap, an alt-text cap, a
try/catch, and a 400 (not an opaque 500) when sharp can't decode. If the DB insert fails after upload,
the uploaded object is now removed rather than orphaned.

Reorder routes (gallery + videos) — `await Promise.all(updates)` DISCARDED every result. Supabase
reports a failed update in the result rather than throwing, so every reorder returned `ok: true` even
when nothing was written. This is the exact server-side counterpart to B1: the admin page now reverts
its optimistic move on a non-2xx, which is only meaningful if a 2xx actually means something. Also
added JSON guards, UUID validation, and a 500-id cap (one statement is issued per id).

Delete routes (gallery + videos + bookings) — storage `remove()` results were discarded. The row is
still deleted first ON PURPOSE (an orphaned file is invisible and costs quota; a surviving row pointing
at a deleted file would be a broken image on the public site), but leaks are now logged by name. For
bookings this matters most: those files are the client's photo ID and signature, so a silent failure
leaves identity documents in the bucket after the owner believes the booking was erased.

`app/api/bookings/[id]/route.ts` — `status` was written to the database with no validation at all;
now checked against the five real statuses. Notes capped, ids UUID-checked, JSON guarded,
`followupAction` validated, raw error messages replaced with generic ones.

`app/api/videos/route.ts` — `video_url` was stored unvalidated and is rendered as a `<video src>` on
the PUBLIC homepage, so it is now pinned to this project's own Supabase storage origin.
`app/api/videos/upload-url/route.ts` — the extension came from the caller's filename and the bucket is
public, which made the studio's domain a host for arbitrary files; now chosen from a video whitelist.

### Verified in both directions (7 probes, scratchpad b4-probe.mjs)

REALISTIC — must NOT be rejected:
- 1 photo ID + 2 reference photos + normal text -> **500** (passed all validation, died at the absent DB)
- minimal submission, no photos at all -> **500** (same)

ABUSE — must be rejected, with a message safe to show the public:
- one 16MB file -> **400** "Each photo must be under 15MB."
- 7 reference photos -> **400** "Please attach at most 6 reference photos."
- non-image bytes renamed `.jpg` WITH an `image/jpeg` MIME -> **400** "Your photo ID could not be read
  as an image. Please upload a JPG or PNG." (the claimed type cannot lie past sharp — this is the HIGH)
- malformed email -> **400**; 6000-char description -> **400**

The rate limiter caps this at 5/hour from one IP, so the probes ran in two batches with a dev-server
restart between them to clear the in-process window — itself a live demonstration of ledger (s).

Public regression: homepage renders (33 images, no overflow), booking funnel renders Step 1/11 with
the title template, console shows only the expected Supabase 500s.

### Residual gap, stated plainly

No booking has been submitted end-to-end against a real database, because local dev has no Supabase.
What IS proven: realistic submissions pass every new check, and abusive ones are refused. What is NOT
proven: that the write path still succeeds afterwards — though that path is unchanged except that
photo ID and reference photos are now stored as re-encoded `.jpg`. Old bookings are unaffected: the
admin page signs whatever path is recorded on each row.

Gates: `RESULT: OK tsc=0 eslint=0`, `RESULT: OK exit=0 buildId=YVu6XAi4A37M68ggKTFqd`.
