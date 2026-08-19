# Wave D — first push to production, live verification, mobile scroll fix (2026-08-19)

User greenlight, verbatim: "id like you to push now, and then i want you to use chrome to verify you
didnt break anything." So this wave is the first time ANY of waves A-C reached the live site.

## D1 — push waves B+C, verify live in Chrome, fix mobile first-load scroll  [done]

### The push

16 commits, `661a713..efe0723`. Vercel auto-deployed to production: **Ready in 26s**. A second push
followed for the mobile fix below (`caa97b1`, Ready in 27s). Nothing was force-pushed and no history
was rewritten.

### Verified live on www.starlettattoos.ink (real Supabase data, first time)

- **Gallery (B2):** 47/47 images loaded, zero failures, 46 served from Supabase. 23 honeycomb cells,
  all carrying an image, all `role=button` + `tabIndex=0`, all with meaningful alt text. NOTE FOR
  FUTURE READERS: the page LOOKS like it has many empty hexagons — it does not. Only 23 hex-shaped
  elements exist in the DOM and every one holds a loaded image; the surrounding honeycomb is a
  decorative background pattern. This was checked twice because the screenshot is misleading.
- **SEO (B6):** og:title / og:image / og:url / twitter:card all present, absolute URLs (metadataBase
  working), and the title template live ("Book an Appointment | Starlet Tattoos").
- **CSP (C2), the measurement ledger (r) was waiting for:** homepage scrolled end to end plus the
  booking funnel, against real Supabase images and videos — **ZERO CSP violations, zero site console
  errors**. The only console output came from a browser extension of the user's, not the site.
- **Admin (B1):** `/admin/gallery` correctly bounced to `/admin/login?callbackUrl=https://.../admin/gallery`
  — the deep-link handling is live in production. Both labels resolve to their controls with correct
  autocomplete tokens. NOT verified: the signed-in admin surface, because the browser profile has no
  admin session and signing in on the user's behalf is out of bounds.

### The mobile scroll bug (user-reported mid-turn)

"on first page load on mobile the page is scrolled down past the header animation and the videos are
in view. id like first page load to start at the top."

NOT reproducible in an emulated 375px viewport — `scrollY` stayed 0 through a full first-visit run
including the age gate. So the cause is something only real mobile browsers do, and several candidates
are indistinguishable without the device: scroll restoration on revisit, the `min-h-svh` hero resizing
as the URL bar collapses, and lazily-loaded gallery images plus the video carousel reflowing the
document after first paint.

Rather than bet on one, `app/page.tsx` re-asserts the top across the short window in which those
settle (immediately, then 50/250/600ms), plus `focus({ preventScroll: true })` on the age gate's Yes
button — moving focus into the dialog otherwise asks the browser to scroll that button into view.

Two deliberate limits, both of which matter more than the fix itself:
- back/forward navigation is skipped (`PerformanceNavigationTiming.type === "back_forward"`), so
  returning to the page keeps your place;
- the first wheel / touchstart / keydown releases the pin, so it can never fight someone already
  reading.

Verified at 375px: loads at scrollY 0, age gate still focuses Yes, and a scroll to 1200 STAYS at 1200.
Confirmed on production after deploy: scrollY 0, no horizontal overflow, zero videos in view on load.
HONEST LIMIT: verified in an emulated viewport and a narrow window, NOT on a physical phone. The user
should confirm on their actual device.

Gates: `RESULT: OK tsc=0 eslint=0`, `RESULT: OK exit=0 buildId=cJUL4bdOBV0sA_UdblfkP`.

### Findings that are NOT ours to fix silently — see ledger (u) and (v)

The homepage videos do not play in Chrome at all, and Vercel is warning that builds will start failing
on 2026-09-30. Both are recorded in the ledger and were reported to the user.
