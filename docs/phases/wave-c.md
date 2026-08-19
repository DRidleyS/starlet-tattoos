# Wave C — security hardening (greenlit 2026-08-19)

User greenlight: "go ahead and start on the proposed rows but dont push anything, i want to see if
layout breaks in my dev server before pushing to prod." So: implemented + verified in dev, committed
locally, NOT pushed. The layout question is squarely about C2 (the CSP), which is why it ships
report-only.

## C3 — pin next-auth off the moving prerelease  [done]

`package.json`: `"next-auth": "^5.0.0-beta.30"` -> `"5.0.0-beta.30"` (exact). The caret let a plain
`npm install` pull a NEWER BETA into the live admin auth gate without anyone choosing it — betas
carry breaking changes by definition. Pinned to the version already installed and working, so this
is a no-op today and a guardrail tomorrow. Verified: installed version is 5.0.0-beta.30, check +
build green. Upgrade to stable v5 remains a deliberate future task, not an accident.

## C1 — abuse & brute-force protection  [done, limiter proven firing]

New `lib/rate-limit.ts`: in-process sliding window, **fails open everywhere** (a bug in the limiter
can never reject a real booking or lock the owner out).

Applied at three entry points:
- `POST /api/bookings` — 5/hour/IP, checked BEFORE the multipart body is parsed (parsing is itself
  the expensive part). Each submission writes storage, renders a PDF, and sends two emails.
- `POST /api/healed-photos` — 10/hour/IP. The per-booking caps already bound total storage; this
  bounds the RATE so a leaked follow-up link can't be replayed to spray the studio inbox.
- Admin login (`lib/auth.ts`) — 10 FAILED attempts per 15 min per IP. Only failures count; a correct
  password succeeds and clears the counter. **When no real client IP is available the gate is SKIPPED
  rather than shared** — a shared bucket would let a stranger's failures lock out the owner, turning
  a brute-force guard into a denial of service against the person it protects. Vercel always sets
  x-forwarded-for, so it's live where it matters.

VERIFIED IN DEV (fence watched in both directions): 7 rapid POSTs to /api/bookings —
requests 1-5 passed the limiter and reached validation (400 "Name and email are required"),
request 6 returned **429 with `Retry-After: 3600`** and the friendly message, request 7 stayed 429.
healed-photos uses the identical `hit()` machinery with a different key/limit (build-verified).

HONEST LIMITATION (documented in the module header): state lives in ONE serverless instance's memory.
Vercel reuses warm instances so bursts from one caller mostly get throttled, but this is NOT a
distributed limit. Chosen deliberately: no external service, no signup, no new env vars — right
cost/benefit for a studio taking a handful of bookings a month. Every call site goes through
`hit()`/`peek()`, so swapping in Vercel KV / Upstash / a Postgres table means reimplementing two
functions and nothing else.

## C2 — security headers + CSP  [done, REPORT-ONLY, zero violations]

`next.config.ts` keeps the existing four headers and adds:
- **Permissions-Policy** `camera=(), microphone=(), geolocation=(), payment=(), usb=()` — turns off
  browser features the site never uses. Safe: the booking funnel uses plain file inputs with NO
  `capture` attribute (grep-verified), so denying camera does not affect photo-ID/reference uploads.
- **Strict-Transport-Security** `max-age=63072000; includeSubDomains` — **production only, on
  purpose**: sending HSTS from http://localhost risks the browser forcing https on the dev server.
  `preload` deliberately omitted (that list is hard to get out of).
- **Content-Security-Policy-Report-Only** — a measuring instrument, not a fence. It cannot block a
  single request; it logs what an enforcing policy WOULD have broken. `'unsafe-inline'` is present
  for scripts (Next hydration bootstraps inline; removing it needs per-request nonces that force
  dynamic rendering) and styles (styled-jsx + framer-motion + GSAP). `'unsafe-eval'`/`ws:` are DEV
  ONLY so the reported policy reflects what prod actually needs.

VERIFIED IN DEV — headers confirmed on the wire: report-only header present with the dev variant,
`Content-Security-Policy` (enforcing) **null**, Permissions-Policy present, HSTS **absent in dev**
(the production gate works).

LAYOUT INTEGRITY (the user's actual question) — **nothing broke**:
- Desktop 1280: no horizontal overflow (scrollWidth == clientWidth == 1265), body/hero fonts resolve
  to the real Inter face, **5 stylesheets + 158 reachable CSS rules + 4 inline styled-jsx blocks**
  (blocked CSS would show as zero), 16 gallery tiles rendered.
- Mobile 375: **overflowPx 0, zero elements extending past the viewport** (an initial "overflow"
  reading was a mid-resize artifact; re-measured after it settled).
- Gallery lightbox opens and its image loads (`/tat1.png`); thumbnails correctly report not-loaded
  because they are `loading="lazy"` below the fold.
- Signature-pad path exercised directly: canvas -> `toDataURL` -> `<img>` works, blob URLs work.
- Booking page renders Step 1/11; title template live ("Book an Appointment | Starlet Tattoos").
- **CSP violations found: ZERO** (console filtered for Content Security / Refused / violation across
  homepage, galleries, lightbox, and the booking funnel). Console errors present are only the
  pre-existing Supabase 500s and my own rate-limit test's 400s/429s.

## Open decision left by this wave

The CSP is measuring, not enforcing. Flipping the header key from
`Content-Security-Policy-Report-Only` to `Content-Security-Policy` is a ONE-LINE change that makes it
binding — but dev is not prod: `next dev` differs from a real build, and local dev has no Supabase
data, so image/media/connect to `*.supabase.co` was never exercised here. Recommended sequence:
push report-only to production first, let it run against real traffic and real Supabase content,
review the reported violations, and only then enforce. Logged as ledger item (r).
