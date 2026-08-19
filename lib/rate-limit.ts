/**
 * Small in-process sliding-window rate limiter.
 *
 * WHY THIS SHAPE. The public endpoints here (booking submission, healed-photo
 * upload) each do real work per request — Supabase uploads, sharp re-encoding,
 * PDF generation, and outbound email — so an unthrottled caller costs storage
 * quota and Resend credits, not just CPU. The admin login does a bcrypt compare
 * against a single known email, which is the classic brute-force shape.
 *
 * HONEST LIMITATION: state lives in the module scope of ONE serverless instance.
 * Vercel reuses warm instances, so a burst from a single caller mostly lands on
 * the same instance and does get throttled — but this is NOT a distributed limit,
 * and a determined attacker spreading requests across cold starts can dilute it.
 * That trade was taken deliberately: it needs no external service, no signup, and
 * no new env vars, which for a studio site taking a handful of bookings a month is
 * the right cost/benefit. Every entry point below goes through `hit()`/`peek()`,
 * so swapping in a durable store (Vercel KV, Upstash, or a Postgres table) later
 * means reimplementing those two functions and nothing else.
 *
 * FAILS OPEN, ALWAYS. Every public function is wrapped so that a bug in here can
 * never reject a legitimate booking or lock the owner out of her own admin portal.
 * A limiter that breaks the business it protects is worse than no limiter.
 */

type Timestamps = number[];

const buckets = new Map<string, Timestamps>();

/** Safety valve so a flood of unique keys can't grow the map without bound. */
const MAX_TRACKED_KEYS = 5000;

export type RateLimitVerdict = {
  /** false = the caller is over the limit and should be refused. */
  allowed: boolean;
  /** Seconds until the oldest hit falls out of the window (for Retry-After). */
  retryAfterSec: number;
};

const ALLOW: RateLimitVerdict = { allowed: true, retryAfterSec: 0 };

function prune(list: Timestamps, cutoff: number): Timestamps {
  let i = 0;
  while (i < list.length && list[i] <= cutoff) i++;
  return i > 0 ? list.slice(i) : list;
}

/** Drop whole buckets that are entirely expired. Cheap, runs only when large. */
function sweep(now: number, windowMs: number) {
  if (buckets.size <= MAX_TRACKED_KEYS) return;
  const cutoff = now - windowMs;
  for (const [k, list] of buckets) {
    const kept = prune(list, cutoff);
    if (kept.length === 0) buckets.delete(k);
    else buckets.set(k, kept);
  }
}

/**
 * Record a request against `key` and report whether it is allowed.
 * Counts the current request, so call it once per request.
 */
export function hit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitVerdict {
  try {
    const now = Date.now();
    const cutoff = now - windowMs;
    const list = prune(buckets.get(key) ?? [], cutoff);

    if (list.length >= limit) {
      buckets.set(key, list);
      const retryAfterSec = Math.max(
        1,
        Math.ceil((list[0] + windowMs - now) / 1000)
      );
      return { allowed: false, retryAfterSec };
    }

    list.push(now);
    buckets.set(key, list);
    sweep(now, windowMs);
    return ALLOW;
  } catch {
    return ALLOW;
  }
}

/**
 * Check `key` WITHOUT recording a request. Used by the login path, which must
 * count failures only — a correct password should never consume allowance.
 */
export function peek(
  key: string,
  limit: number,
  windowMs: number
): RateLimitVerdict {
  try {
    const now = Date.now();
    const list = prune(buckets.get(key) ?? [], now - windowMs);
    if (list.length >= limit) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((list[0] + windowMs - now) / 1000)
      );
      return { allowed: false, retryAfterSec };
    }
    return ALLOW;
  } catch {
    return ALLOW;
  }
}

/** Record one failure against `key` (login path). */
export function recordFailure(key: string, windowMs: number): void {
  try {
    const now = Date.now();
    const list = prune(buckets.get(key) ?? [], now - windowMs);
    list.push(now);
    buckets.set(key, list);
    sweep(now, windowMs);
  } catch {
    // never let bookkeeping break a sign-in attempt
  }
}

/** Clear a key — called on a successful sign-in so one good login resets it. */
export function clearKey(key: string): void {
  try {
    buckets.delete(key);
  } catch {
    // ignore
  }
}

/**
 * Best-effort client IP. Vercel populates x-forwarded-for; the first entry is
 * the original client. Falls back to a shared bucket when no header is present
 * (local dev), which is fine — it only makes the limit stricter, never looser.
 */
export function clientIp(req: Request): string {
  try {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) {
      const first = xff.split(",")[0]?.trim();
      if (first) return first;
    }
    return req.headers.get("x-real-ip")?.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

/** Standard 429 body + Retry-After header. */
export function tooManyRequests(
  message: string,
  retryAfterSec: number
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfterSec),
    },
  });
}
