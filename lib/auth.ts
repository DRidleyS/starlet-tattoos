import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { clientIp, peek, recordFailure, clearKey } from "@/lib/rate-limit";

// Brute-force gate on the single admin account. Deliberately generous: the owner
// fat-fingering her password a few times must never lock her out, and only FAILED
// attempts count — a correct password both succeeds and clears the counter.
const MAX_LOGIN_FAILURES = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const adminEmail = process.env.ADMIN_EMAIL;
        const adminHash = process.env.ADMIN_PASSWORD_HASH;
        // Server misconfiguration, not a failed attempt — never counted.
        if (!adminEmail || !adminHash) return null;

        // Per-IP failure budget. When no real client IP is available (local dev,
        // or any host that doesn't set x-forwarded-for) the gate is SKIPPED rather
        // than folded into one shared bucket: a shared bucket would let a stranger's
        // failures lock out the owner, turning a brute-force guard into a denial of
        // service against the person it protects. On Vercel the platform always
        // sets the header, so the gate is live where it matters.
        const ip = request ? clientIp(request) : "unknown";
        const key = ip !== "unknown" ? `login:${ip}` : null;

        if (key && !peek(key, MAX_LOGIN_FAILURES, LOGIN_WINDOW_MS).allowed) {
          return null;
        }

        if (email !== adminEmail) {
          if (key) recordFailure(key, LOGIN_WINDOW_MS);
          return null;
        }
        const valid = await compare(password, adminHash);
        if (!valid) {
          if (key) recordFailure(key, LOGIN_WINDOW_MS);
          return null;
        }

        if (key) clearKey(key);
        return { id: "1", email: adminEmail, name: "Admin" };
      },
    }),
  ],
  pages: {
    signIn: "/admin/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    authorized({ auth: session, request }) {
      const isAdmin = request.nextUrl.pathname.startsWith("/admin");
      const isLogin = request.nextUrl.pathname === "/admin/login";
      if (isAdmin && !isLogin && !session?.user) return false;
      return true;
    },
  },
});
