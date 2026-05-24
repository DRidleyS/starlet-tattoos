# Starlet Tattoos

Brochure web app for a tattoo studio. Public site advertises the studio and funnels visitors into a booking intake form. A private admin portal lets the owner manage gallery content and review/respond to booking inquiries.

## Stack

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript
- **Styling:** Tailwind CSS 4
- **Storage / DB:** Supabase (Postgres + Storage buckets)
- **Auth:** next-auth v5, credentials provider, JWT sessions, bcrypt password hash
- **Image processing:** `sharp` (server-side resize + JPEG compression)
- **Email:** Resend (booking notifications)
- **Animation:** Framer Motion, GSAP; `signature_pad` for consent capture

## App structure

### Public site
- `/` — Homepage. Hero, two gallery tabs, booking CTA.
- `/booking` — Multi-step intake funnel (contact info, tattoo description, photo ID upload, reference photos, signature + initials, generated consent form).

### Two galleries
Both galleries are powered by a single `gallery_images` table in Supabase, distinguished by a `category` field. Same data shape, different display components:

| | **Work gallery** | **Flash designs** |
|---|---|---|
| `category` | `"gallery"` | `"flash"` |
| Component | `components/HoneycombGallery.tsx` | `components/FlashGallery.tsx` |
| Style | Hexagonal honeycomb grid, grayscale → color on hover, pinch-zoom / pan / keyboard nav | Polaroid cards with random tilt + pin SVG, straightens on hover |
| Purpose | Finished tattoo work photos | Pre-drawn flash designs available to book |

Both fetch from `GET /api/gallery` and filter by category client-side. Hardcoded fallback images live in `/public` (`tat1..16.png`, `flash1..8.PNG`).

### Admin portal
- `/admin/login` — Email + password sign-in.
- `/admin/gallery` — Manage both galleries (tabbed UI).
- `/admin/bookings` — List of submitted booking inquiries.
- `/admin/bookings/[id]` — Per-booking detail: status, notes, attachments (consent form, photo ID, reference photos, signature) via 1-hour signed Supabase URLs.

`middleware.ts` guards all `/admin/*` routes and redirects unauthenticated requests to `/admin/login`. Layout shell: `app/admin/layout.tsx` + `app/admin/AdminShell.tsx`.

## How the owner manages gallery pictures

Single page handles both galleries: `app/admin/gallery/page.tsx`. A tab switches between **Gallery** (work photos) and **Flash Designs** — the only thing that changes is the `category` value sent to the API.

### Upload
- UI: file picker + optional alt text on `/admin/gallery`.
- API: `POST /api/gallery` (`app/api/gallery/route.ts`).
- Server pipeline:
  1. Receive file via `FormData`.
  2. `sharp` resizes to fit within **1600×1600** (no enlargement) and re-encodes as **JPEG quality 80**.
  3. Upload to Supabase Storage bucket `gallery` at path `{category}/{uuid}.jpg`.
  4. Insert row into `gallery_images` with `category`, `image_url` (public URL), `alt_text`, `sort_order`.

### Delete
- UI: delete button on each thumbnail.
- API: `DELETE /api/gallery/{id}` removes the row and the underlying file in Supabase Storage (path is extracted from the public URL).

### Reorder
- UI: drag-to-reorder thumbnails.
- API: `POST /api/gallery/reorder` accepts an ordered array of IDs and rewrites `sort_order` (0, 1, 2, …) in a batch.
- Public galleries render in `sort_order` ascending, so the owner's order on the admin page is what visitors see.

### `gallery_images` schema
```
id          uuid (pk)
category    text  -- "gallery" | "flash"
image_url   text  -- public Supabase URL
alt_text    text  -- nullable
sort_order  int
created_at  timestamp
```

## How the owner manages bookings

- `/admin/bookings` — sortable list (table on desktop, cards on mobile). Status badges: `new`, `contacted`, `booked`, `completed`, `cancelled`.
- `/admin/bookings/[id]` — view full submission, edit status + private notes (`PATCH /api/bookings/{id}`), or delete the booking which also wipes its files in the `booking-uploads` bucket (`DELETE /api/bookings/{id}`).
- Attachments are served via short-lived signed URLs since `booking-uploads` is a private bucket.

Booking submissions come in through `POST /api/bookings`: files go to `booking-uploads/{bookingId}/…`, a consent form PNG is generated server-side (`lib/generate-consent-form.ts`), and Resend emails the consent form + reference photos to the studio inbox.

## Environment variables

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ADMIN_EMAIL
ADMIN_PASSWORD_HASH         # bcrypt hash
RESEND_API_KEY
EMAIL_FROM                  # optional, defaults to bookings@starlettattoos.ink
EMAIL_TO                    # optional, defaults to bookings@starlettattoos.ink
NEXTAUTH_SECRET
NEXTAUTH_URL
```

## Key files

**Admin pages**
- `app/admin/login/page.tsx`
- `app/admin/layout.tsx`, `app/admin/AdminShell.tsx`
- `app/admin/gallery/page.tsx`
- `app/admin/bookings/page.tsx`
- `app/admin/bookings/[id]/page.tsx`, `app/admin/bookings/[id]/BookingDetail.tsx`

**Gallery API**
- `app/api/gallery/route.ts` — list + upload (sharp resize/compress)
- `app/api/gallery/[id]/route.ts` — delete
- `app/api/gallery/reorder/route.ts` — batch reorder

**Bookings API**
- `app/api/bookings/route.ts` — public submission
- `app/api/bookings/[id]/route.ts` — admin update/delete

**Lib**
- `lib/auth.ts` — next-auth config
- `lib/supabase-server.ts` — service-role Supabase client
- `lib/send-booking-email.ts` — Resend wrapper
- `lib/generate-consent-form.ts` — consent form PNG renderer

**Public components**
- `components/HoneycombGallery.tsx`
- `components/FlashGallery.tsx`
- `components/BookingFunnel.tsx`

**Other**
- `middleware.ts` — `/admin/*` auth guard
- `next.config.ts` — security headers
