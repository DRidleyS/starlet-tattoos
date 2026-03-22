"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";

const NAV = [
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/gallery", label: "Gallery" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col md:flex-row font-body [&_h1]:font-body [&_h2]:font-body [&_h3]:font-body [&_h1]:text-white [&_h2]:text-white [&_h3]:text-white [&_h1]:mb-0 [&_h2]:mb-0 [&_h3]:mb-0">
      {/* Mobile top bar */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-neutral-900 border-b border-neutral-800">
        <Link href="/admin/bookings" className="text-lg font-bold text-rose-400">
          Starlet Admin
        </Link>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="text-neutral-400 hover:text-white p-1"
          aria-label="Toggle menu"
        >
          {menuOpen ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </header>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="md:hidden bg-neutral-900 border-b border-neutral-800 px-4 pb-3 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className={`block px-3 py-2 rounded-lg text-sm font-medium transition ${
                pathname.startsWith(item.href)
                  ? "bg-rose-500/20 text-rose-300"
                  : "text-neutral-400 hover:text-white hover:bg-neutral-800"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <button
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
            className="w-full text-left text-sm text-neutral-500 hover:text-white transition px-3 py-2 rounded-lg hover:bg-neutral-800"
          >
            Sign Out
          </button>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 bg-neutral-900 border-r border-neutral-800 flex-col">
        <div className="p-5 border-b border-neutral-800">
          <Link href="/admin/bookings" className="text-lg font-bold text-rose-400">
            Starlet Admin
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded-lg text-sm font-medium transition ${
                pathname.startsWith(item.href)
                  ? "bg-rose-500/20 text-rose-300"
                  : "text-neutral-400 hover:text-white hover:bg-neutral-800"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-neutral-800">
          <button
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
            className="w-full text-sm text-neutral-500 hover:text-white transition px-3 py-2 rounded-lg hover:bg-neutral-800"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">{children}</main>
    </div>
  );
}
