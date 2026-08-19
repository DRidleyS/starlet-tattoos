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

B1 (admin error-handling) and B4 (API validation) are server/admin logic that CANNOT be
browser-verified locally: the admin portal needs an authenticated session and the API routes need
Supabase env vars, neither of which exist in local dev (see the 500s above). Local verification for
those phases is limited to build + check.ps1 + code review. B6 (SEO metadata + media perf + the
FlashGallery mobile padding) IS browser-verifiable. Flagged to the user at the B5 checkpoint.

## Verification environment note

Local dev has NO Supabase env vars, so `/api/gallery` + `/api/videos` return 500 and the galleries
fall back to hardcoded public images (tat*.png / flash*.PNG) — a pre-existing condition, fine for UI
verification. The Browser pane is not composited here, so screenshots + requestAnimationFrame waits
time out; verify via read_page / get_page_text / direct DOM queries (javascript_tool) instead.
Admin-portal phases (B1) can't be browser-tested locally (no auth env) — verify by build + review.
