"use client";

import { useEffect, useRef, useState } from "react";

type Video = { id: string; video_url: string; title?: string | null };

export default function VideoCarousel({ items }: { items: Video[] }) {
  const [active, setActive] = useState(0);
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);

  useEffect(() => {
    if (active >= items.length) setActive(0);
  }, [items.length, active]);

  // Play the active video, pause + rewind the others. Because every <video>
  // stays mounted with preload="auto", switching is instant — no remount, no
  // black flash while the next file fetches.
  const playActive = () => {
    const v = videoRefs.current[active];
    if (!v) return;
    v.muted = true;
    const p = v.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  };

  useEffect(() => {
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      v.muted = true;
      if (i === active) {
        const p = v.play();
        if (p && typeof p.catch === "function") p.catch(() => {});
      } else {
        try {
          v.pause();
          v.currentTime = 0;
        } catch {}
      }
    });
  }, [active, items]);

  // When the tab/window regains focus, browsers often leave the active <video>
  // paused. Re-kick playback so it doesn't appear frozen.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") playActive();
    };
    const onFocus = () => playActive();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  if (!items || items.length === 0) return null;

  const prevIdx = (active - 1 + items.length) % items.length;
  const nextIdx = (active + 1) % items.length;

  const go = (dir: -1 | 1) => {
    setActive((i) => (i + dir + items.length) % items.length);
  };

  return (
    <section className="w-full flex justify-center mt-6 sm:mt-10 mb-24 sm:mb-32">
      <div className="relative w-full max-w-6xl px-4">
        <div className="relative flex items-center justify-center gap-3 sm:gap-5">
          {/* prev peek */}
          {items.length > 1 && (
            <button
              onClick={() => setActive(prevIdx)}
              aria-label="Previous video"
              className="hidden sm:block flex-shrink-0 w-[14%] aspect-[9/16] rounded-xl overflow-hidden opacity-50 hover:opacity-80 transition bg-black"
            >
              {/* Mirror the active video element so the peek shows the real
                  first frame instantly without loading a second copy. */}
              <video
                src={items[prevIdx].video_url}
                muted
                playsInline
                preload="auto"
                className="w-full h-full object-cover pointer-events-none"
              />
            </button>
          )}

          {/* featured — all videos stay mounted, only the active one is visible */}
          <div className="flex-1 max-w-3xl aspect-video sm:aspect-[16/10] rounded-2xl overflow-hidden bg-black shadow-[0_25px_60px_rgba(0,0,0,0.25)] relative">
            {items.map((it, i) => (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                key={it.id}
                ref={(el) => {
                  videoRefs.current[i] = el;
                }}
                src={it.video_url}
                muted
                playsInline
                preload="auto"
                onEnded={i === active ? () => go(1) : undefined}
                className={
                  "absolute inset-0 w-full h-full object-cover transition-opacity duration-150 " +
                  (i === active ? "opacity-100 z-10" : "opacity-0 z-0")
                }
              />
            ))}
            {items[active].title && (
              <div className="absolute left-3 bottom-3 text-white/90 text-xs sm:text-sm font-medium drop-shadow z-20">
                {items[active].title}
              </div>
            )}
          </div>

          {/* next peek */}
          {items.length > 1 && (
            <button
              onClick={() => setActive(nextIdx)}
              aria-label="Next video"
              className="hidden sm:block flex-shrink-0 w-[14%] aspect-[9/16] rounded-xl overflow-hidden opacity-50 hover:opacity-80 transition bg-black"
            >
              <video
                src={items[nextIdx].video_url}
                muted
                playsInline
                preload="auto"
                className="w-full h-full object-cover pointer-events-none"
              />
            </button>
          )}
        </div>

        {/* arrow controls (mobile + a11y) */}
        {items.length > 1 && (
          <>
            <button
              onClick={() => go(-1)}
              aria-label="Previous video"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center text-lg"
            >
              &larr;
            </button>
            <button
              onClick={() => go(1)}
              aria-label="Next video"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center text-lg"
            >
              &rarr;
            </button>

            <div className="flex justify-center gap-2 mt-4">
              {items.map((it, i) => (
                <button
                  key={it.id}
                  onClick={() => setActive(i)}
                  aria-label={`Show video ${i + 1}`}
                  className={
                    "h-1.5 rounded-full transition-all " +
                    (i === active ? "w-6 bg-amber-600" : "w-2 bg-black/30")
                  }
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
