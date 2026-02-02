"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import HoneycombGallery from "@/components/HoneycombGallery";
import FlashGallery from "@/components/FlashGallery";
import VineTopFrame from "@/components/VineTopFrame";
import VineMainDivider from "@/components/VineMainDivider";
import BookNowLauncher from "@/components/BookNowLauncher";

const AGE_GATE_KEY = "starlet_age_gate_ok_v1";

function AgeGateModal({
  open,
  onYes,
  onNo,
}: {
  open: boolean;
  onYes: () => void;
  onNo: () => void;
}) {
  const yesRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => yesRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-100 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Age verification"
    >
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onNo}
        aria-hidden
      />
      <div className="relative w-full max-w-md rounded-3xl border border-white/15 bg-white p-6 shadow-[0_25px_80px_rgba(0,0,0,0.35)]">
        <div className="font-title text-4xl leading-[0.95] text-black">
          Are you 18?
        </div>
        <p className="mt-3 text-sm text-black/70">
          You must be 18+ to view this site.
        </p>

        <div className="mt-6 flex gap-3">
          <button
            ref={yesRef}
            type="button"
            onClick={onYes}
            className="flex-1 btn-accent-flow rounded-full px-5 py-3 text-sm font-semibold"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={onNo}
            className="flex-1 rounded-full px-5 py-3 text-sm font-semibold border border-black/15 hover:bg-black/5"
          >
            No
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [tab, setTab] = useState<"gallery" | "flash">("gallery");
  const [ageGateOpen, setAgeGateOpen] = useState(false);
  const [ageDenied, setAgeDenied] = useState(false);

  useEffect(() => {
    try {
      const ok = localStorage.getItem(AGE_GATE_KEY);
      if (ok === "yes") return;
    } catch {
      // ignore
    }
    setAgeGateOpen(true);
  }, []);

  useEffect(() => {
    if (!ageGateOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [ageGateOpen]);

  const acceptAge = () => {
    try {
      localStorage.setItem(AGE_GATE_KEY, "yes");
    } catch {
      // ignore
    }
    setAgeGateOpen(false);
  };

  const denyAge = () => {
    // Don't persist "no" (per request). If a previous value exists, clear it.
    try {
      localStorage.removeItem(AGE_GATE_KEY);
    } catch {
      // ignore
    }

    // Best-effort attempt to close the tab/window.
    // Most browsers only allow this if the window was opened by script.
    try {
      window.close();
    } catch {
      // ignore
    }
    try {
      window.open("about:blank", "_self");
      window.close();
    } catch {
      // ignore
    }
    try {
      window.location.replace("about:blank");
    } catch {
      // ignore
    }

    // Fallback: keep a blocked screen if the browser refuses to close.
    setAgeGateOpen(false);
    setAgeDenied(true);
  };

  return (
    <>
      <AgeGateModal open={ageGateOpen} onYes={acceptAge} onNo={denyAge} />

      {ageDenied ? (
        <div className="fixed inset-0 z-90 bg-white flex items-center justify-center px-6">
          <div className="max-w-md text-center">
            <div className="font-title text-5xl text-black leading-[0.95]">
              18+ only
            </div>
            <p className="mt-3 text-sm text-black/70">
              This page is unavailable.
            </p>
          </div>
        </div>
      ) : null}

      <main className="flex flex-col items-center justify-start bg-white px-4">
        <div className="w-full relative min-h-svh flex flex-col">
          <VineTopFrame />

          {/* Hero content biased lower (closer to the divider) */}
          <div className="flex-1 flex flex-col items-center justify-end px-4 pt-24 sm:pt-28 pb-8 sm:pb-10 gap-6 sm:gap-7">
            <Image
              src="/starletlogo.jpg"
              alt="Starlet Tattoos Logo"
              width={320}
              height={120}
              priority
              className="select-none"
            />

            <p className="text-lg text-ink text-center max-w-xl">
              Fine line and custom tattoo studio in Santa Clarita, CA
            </p>

            {/* Book now button (intake flow) */}
            <div className="flex gap-4">
              <BookNowLauncher />
            </div>
          </div>

          {/* Main divider anchored near the bottom of the viewport */}
          <div className="w-full flex justify-center pb-3 sm:pb-4">
            <VineMainDivider width={1200} centerY={110} />
          </div>
        </div>
        {/* Next sections: intro, featured artist, mini gallery, etc. */}
        {/* Mini gallery preview with tabs for Gallery / Flash Designs */}
        <section className="w-full flex flex-col items-center mt-10 sm:mt-14">
          <div className="w-full max-w-5xl">
            <div className="w-full flex justify-center">
              <div className="flex gap-6 mt-8 sm:mt-10">
                <button
                  onClick={() => setTab("gallery")}
                  className={
                    "text-base " +
                    (tab === "gallery"
                      ? "text-amber-600 font-semibold"
                      : "text-black")
                  }
                >
                  Gallery
                </button>
                <button
                  onClick={() => setTab("flash")}
                  className={
                    "text-base " +
                    (tab === "flash"
                      ? "text-amber-600 font-semibold"
                      : "text-black")
                  }
                >
                  Flash Designs
                </button>
              </div>
            </div>

            {/* Explicit gap between tabs and gallery */}
            <div className="h-14 sm:h-20" aria-hidden />

            {tab === "gallery" ? (
              <HoneycombGallery
                items={[
                  { paper: "/tat1.png", onBody: "/tat1.png" },
                  { paper: "/tat2.png", onBody: "/tat2.png" },
                  { paper: "/tat3.png", onBody: "/tat3.png" },
                  { paper: "/tat4.png", onBody: "/tat4.png" },
                  { paper: "/tat5.png", onBody: "/tat5.png" },
                  { paper: "/tat6.png", onBody: "/tat6.png" },
                  { paper: "/tat7.png", onBody: "/tat7.png" },
                  { paper: "/tat8.png", onBody: "/tat8.png" },
                  { paper: "/tat9.png", onBody: "/tat9.png" },
                  { paper: "/tat10.png", onBody: "/tat10.png" },
                  { paper: "/tat11.png", onBody: "/tat11.png" },
                  { paper: "/tat12.png", onBody: "/tat12.png" },
                  { paper: "/tat13.png", onBody: "/tat13.png" },
                  { paper: "/tat14.PNG", onBody: "/tat14.PNG" },
                  { paper: "/tat15.png", onBody: "/tat15.png" },
                  { paper: "/tat16.png", onBody: "/tat16.png" },
                ]}
              />
            ) : (
              <FlashGallery
                items={[
                  { paper: "/flash1.PNG" },
                  { paper: "/flash2.PNG" },
                  { paper: "/flash3.PNG" },
                  { paper: "/flash4.PNG" },
                  { paper: "/flash5.PNG" },
                  { paper: "/flash6.PNG" },
                  { paper: "/flash7.PNG" },
                  { paper: "/flash8.PNG" },
                ]}
              />
            )}
          </div>
        </section>
      </main>
    </>
  );
}
