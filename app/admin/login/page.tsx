"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

/**
 * Resolves the post-login destination to a path on THIS site, or nothing.
 *
 * `callbackUrl` is supplied by the middleware when it bounces an unauthenticated
 * request, which means it arrives through the query string and is attacker-
 * controllable. Sending the owner wherever it points would turn the login form
 * into an open redirect with its own credibility behind it, so the value is
 * resolved against the current origin and rejected unless it stays here and
 * stays inside /admin. Absolute, protocol-relative and backslash forms all fail
 * this check.
 */
function safeCallbackUrl(raw: string | null): string {
  const fallback = "/admin/bookings";
  if (!raw) return fallback;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return fallback;
    if (!url.pathname.startsWith("/admin")) return fallback;
    // Landing back on the login page would loop.
    if (url.pathname === "/admin/login") return fallback;
    return url.pathname + url.search;
  } catch {
    return fallback;
  }
}

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      // A missing response was previously treated as success and redirected
      // into /admin with no session, which bounced straight back to here.
      if (!res || res.error) {
        setError("Invalid email or password.");
        setLoading(false);
        return;
      }
      // Return the owner to the page they were actually trying to reach; the
      // destination used to be hardcoded to the bookings list, so a deep link
      // to the gallery manager always landed somewhere else. Read from the URL
      // rather than useSearchParams() so the page needs no Suspense boundary.
      const destination = safeCallbackUrl(
        new URLSearchParams(window.location.search).get("callbackUrl")
      );
      // Full page load so the server layout picks up the new session cookie
      window.location.href = destination;
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 font-body">
      <form
        onSubmit={handleSubmit}
        className="bg-neutral-900 p-8 rounded-xl w-full max-w-sm space-y-5 shadow-xl"
      >
        <h1 className="text-2xl font-bold text-white text-center font-body">
          Admin Login
        </h1>

        {/* role=alert so a screen reader announces the rejection; without it
            the only signal was a colour change the user may never see. */}
        {error && (
          <p role="alert" className="text-red-400 text-sm text-center">
            {error}
          </p>
        )}

        <div>
          <label
            htmlFor="admin-email"
            className="block text-sm text-neutral-400 mb-1"
          >
            Email
          </label>
          <input
            id="admin-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full bg-neutral-800 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-rose-400"
          />
        </div>

        <div>
          <label
            htmlFor="admin-password"
            className="block text-sm text-neutral-400 mb-1"
          >
            Password
          </label>
          <input
            id="admin-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full bg-neutral-800 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-rose-400"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-rose-500 hover:bg-rose-600 text-white font-semibold py-2 rounded-lg transition disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}
