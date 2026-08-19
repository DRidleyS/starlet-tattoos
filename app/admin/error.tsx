"use client";

import Link from "next/link";

/**
 * Error boundary for every /admin route.
 *
 * Without it, a server-side failure (most likely the database being briefly
 * unreachable) drops the owner onto Next's built-in screen: "This page couldn't
 * load" above a bare error number. That is technically honest and practically
 * useless — it does not say what failed, whether anything was lost, or what to
 * do next.
 *
 * The digest is shown deliberately but the raw message is not: digests are
 * opaque correlation ids, whereas a thrown message can carry table and column
 * names straight to whoever is looking at the screen.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-lg w-full mx-auto py-16" role="alert">
      <h1 className="text-2xl font-bold mb-3">This page didn&apos;t load</h1>
      <p className="text-neutral-400 mb-2">
        Something went wrong reaching the server. Nothing you had already saved
        has been changed.
      </p>
      <p className="text-neutral-400 mb-6">
        Try again in a moment. If it keeps happening, the site&apos;s database
        may be temporarily unavailable.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={reset}
          className="bg-rose-500 hover:bg-rose-600 text-white font-semibold px-5 py-2 rounded-lg transition"
        >
          Try again
        </button>
        <Link
          href="/admin/bookings"
          className="text-sm text-neutral-500 hover:text-white transition"
        >
          Back to bookings
        </Link>
      </div>

      {error.digest && (
        <p className="text-xs text-neutral-600 mt-8">
          Reference code: {error.digest}
        </p>
      )}
    </div>
  );
}
