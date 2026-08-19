import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content-Security-Policy, shipped REPORT-ONLY first (see the header list below).
 *
 * Report-Only means the browser evaluates the policy and logs every violation to
 * the console WITHOUT blocking anything, so this cannot break the live site. It is
 * a measuring instrument: whatever shows up as a violation is exactly what an
 * enforcing policy would have broken. Only after that list is empty (or understood)
 * should the header be switched to the enforcing `Content-Security-Policy`.
 *
 * Why the permissive entries are here rather than being tightened up front:
 *   script-src 'unsafe-inline' — Next.js bootstraps hydration with inline scripts.
 *     Removing it requires per-request nonces threaded through middleware, which
 *     forces dynamic rendering on otherwise static pages. Not worth it for a
 *     brochure site with no user-generated HTML.
 *   style-src 'unsafe-inline'  — styled-jsx, Tailwind's runtime bits, framer-motion
 *     and GSAP all set inline styles; this is unavoidable without a rewrite.
 *   'unsafe-eval' / ws: — DEV ONLY, for React Refresh and the HMR socket. They are
 *     omitted in production so the reported policy reflects what prod actually needs.
 *   *.supabase.co — gallery images, videos, and the signed-URL API calls.
 *   blob: / data: — signature_pad canvases and locally-previewed uploads in the
 *     booking funnel.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "media-src 'self' blob: https://*.supabase.co",
  "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co${isDev ? " ws: wss:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
]
  .filter(Boolean)
  .join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },

          // Turns off browser features this site never uses, so a future
          // dependency compromise cannot silently reach for them. Deliberately
          // limited to well-supported features: unknown ones only produce console
          // noise. Note the booking funnel uses plain file inputs (no `capture`),
          // so denying camera does not affect photo-ID or reference uploads.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },

          // MEASURE FIRST, ENFORCE LATER. Report-Only cannot block a single
          // request; switching the key to "Content-Security-Policy" is the
          // one-line change that makes it binding, and must not happen until the
          // violation list has been reviewed.
          { key: "Content-Security-Policy-Report-Only", value: csp },

          // PRODUCTION ONLY, on purpose. HSTS pins the origin to HTTPS in the
          // browser for its max-age; sending it from http://localhost risks the
          // browser forcing https on the dev server and breaking local work.
          // `preload` is deliberately omitted — that list is hard to get out of.
          ...(isDev
            ? []
            : [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=63072000; includeSubDomains",
                },
              ]),
        ],
      },
    ];
  },
};

export default nextConfig;
