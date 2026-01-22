"use client";
import React, { useState, useEffect, useRef } from "react";

type Item = { paper: string; onBody: string; alt?: string };

export default function HoneycombGallery({ items = [] }: { items?: Item[] }) {
  const [active, setActive] = useState<Record<number, boolean>>({});
  const [cols, setCols] = useState(4);

  useEffect(() => {
    const hexW = 220; // matches layout math below
    const gap = 18;
    const horizGap = 1; // extra horizontal spacing to avoid squish (reduced)
    const calc = () => {
      const w = window.innerWidth;
      // prefer dynamic columns based on available width, clamp between 2 and 6
      const available = Math.max(600, w - 240); // leave some page padding
      // account for extra horizGap when computing how many will fit
      const possible = Math.floor(available / (hexW + gap + horizGap));
      const colsCalculated = Math.max(2, Math.min(6, possible));
      setCols(colsCalculated);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  const toggle = (i: number) => setActive((s) => ({ ...s, [i]: !s[i] }));
  const [selected, setSelected] = useState<number | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const lastTapRef = useRef<number | null>(null);
  const pinchState = useRef({
    startDist: 0,
    startScale: 1,
    scale: 1,
    panX: 0,
    panY: 0,
    startPanX: 0,
    startPanY: 0,
    panning: false,
    lastClientX: undefined as number | undefined,
    lastClientY: undefined as number | undefined,
  });

  const openOverlay = (i: number) => setSelected(i);
  const closeOverlay = () => setSelected(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeOverlay();
        return;
      }
      if (e.key === "ArrowLeft") {
        setSelected((prev) => {
          if (prev === null) return null;
          return (prev - 1 + items.length) % items.length;
        });
      }
      if (e.key === "ArrowRight") {
        setSelected((prev) => {
          if (prev === null) return null;
          return (prev + 1) % items.length;
        });
      }
    };
    if (selected !== null) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", onKey);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [selected, items.length]);

  // gesture handlers: pinch to zoom, pan, double-tap to toggle zoom
  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;

    const apply = () => {
      const s = pinchState.current.scale;
      const x = pinchState.current.panX;
      const y = pinchState.current.panY;
      el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
    };

    const getDist = (t1: Touch, t2: Touch) => {
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      return Math.hypot(dx, dy);
    };

    const onTouchStart = (ev: TouchEvent) => {
      if (ev.touches.length === 2) {
        pinchState.current.startDist = getDist(ev.touches[0], ev.touches[1]);
        pinchState.current.startScale = pinchState.current.scale || 1;
        pinchState.current.panning = false;
      } else if (ev.touches.length === 1) {
        const t = ev.touches[0];
        pinchState.current.startPanX = pinchState.current.panX;
        pinchState.current.startPanY = pinchState.current.panY;
        pinchState.current.panning = true;
        pinchState.current.lastClientX = t.clientX;
        pinchState.current.lastClientY = t.clientY;
      }
    };

    const onTouchMove = (ev: TouchEvent) => {
      if (ev.touches.length === 2) {
        const d = getDist(ev.touches[0], ev.touches[1]);
        const newScale = Math.max(
          1,
          Math.min(
            3,
            (d / (pinchState.current.startDist || d)) *
              pinchState.current.startScale,
          ),
        );
        pinchState.current.scale = newScale;
        apply();
      } else if (
        ev.touches.length === 1 &&
        pinchState.current.panning &&
        pinchState.current.scale > 1
      ) {
        const t = ev.touches[0];
        const dx = t.clientX - (pinchState.current.lastClientX || t.clientX);
        const dy = t.clientY - (pinchState.current.lastClientY || t.clientY);
        pinchState.current.panX += dx;
        pinchState.current.panY += dy;
        pinchState.current.lastClientX = t.clientX;
        pinchState.current.lastClientY = t.clientY;
        apply();
      }
    };

    const onTouchEnd = (_ev: TouchEvent) => {
      pinchState.current.panning = false;
      pinchState.current.lastClientX = undefined;
      pinchState.current.lastClientY = undefined;
      const now = Date.now();
      if (lastTapRef.current && now - lastTapRef.current < 350) {
        pinchState.current.scale = pinchState.current.scale > 1.1 ? 1 : 2;
        apply();
        lastTapRef.current = null;
      } else {
        lastTapRef.current = now;
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);

    return () => {
      el.removeEventListener("touchstart", onTouchStart as any);
      el.removeEventListener("touchmove", onTouchMove as any);
      el.removeEventListener("touchend", onTouchEnd as any);
    };
  }, [selected]);

  // layout math (flat-top regular hex tiling)
  const hexW = 220; // px (width = 2 * side)
  const a = hexW / 2; // side length
  const hexH = +(Math.sqrt(3) * a).toFixed(2); // height = sqrt(3) * a
  const horizGap = 1; // px extra between hex columns (reduced)
  const horizStep = 1.5 * a + horizGap; // base center-to-center horizontal step

  // compute container dims
  const rows = Math.ceil(items.length / cols);
  const containerWidth = Math.max(0, horizStep * (cols - 1) + hexW);
  const containerHeight = Math.ceil(hexH * (rows + 0.5));

  return (
    <div className="w-full flex justify-center py-12">
      <div
        className="honeycomb-grid"
        style={{
          width: containerWidth,
          height: containerHeight,
          position: "relative",
        }}
      >
        {items.map((it, i) => {
          const isActive = !!active[i];
          const col = i % cols;
          const row = Math.floor(i / cols);
          const left = horizStep * col;
          const top = hexH * (row + (col % 2 === 1 ? 0.5 : 0));
          return (
            <div
              key={i}
              className={`hex-wrap ${isActive ? "active" : ""}`}
              onClick={() => openOverlay(i)}
              onMouseEnter={() => setActive((s) => ({ ...s, [i]: true }))}
              onMouseLeave={() => setActive((s) => ({ ...s, [i]: false }))}
              style={{
                cursor: "pointer",
                position: "absolute",
                left: `${left}px`,
                top: `${top}px`,
                width: `${hexW}px`,
                height: `${hexH}px`,
              }}
            >
              <div className={`hex ${isActive ? "active" : ""}`} aria-hidden>
                <img
                  ref={imgRef}
                  src={it.paper}
                  alt={it.alt || `gallery ${i}`}
                  className="hex-img base"
                />
                <img
                  src={it.onBody}
                  alt={it.alt || `gallery ${i} on body`}
                  className={`hex-img overlay ${isActive ? "show" : ""}`}
                />
                <svg
                  className="hex-stroke"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  <polygon
                    points="25,0 75,0 100,50 75,100 25,100 0,50"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .honeycomb-grid {
          outline: none;
        }
        .hex-wrap {
          display: flex;
          justify-content: center;
          z-index: 1;
          position: relative;
        }
        /* colored halo behind the hex border using a pseudo-element so it isn't clipped */
        .hex-wrap::before {
          content: "";
          position: absolute;
          inset: -6px;
          clip-path: polygon(
            25% 0%,
            75% 0%,
            100% 50%,
            75% 100%,
            25% 100%,
            0% 50%
          );
          background: #fef3c7;
          filter: blur(10px);
          opacity: 0;
          transition: opacity 360ms cubic-bezier(0.2, 0.9, 0.2, 1);
          z-index: 0;
          pointer-events: none;
        }
        .hex-wrap:hover,
        .hex-wrap.active {
          z-index: 60;
        }
        /* equilateral hex: height = sqrt(3)/2 * width */
        .hex {
          width: 100%;
          height: 100%;
          clip-path: polygon(
            25% 0%,
            75% 0%,
            100% 50%,
            75% 100%,
            25% 100%,
            0% 50%
          );
          overflow: hidden;
          box-sizing: border-box;
          border: none; /* stroke drawn by SVG overlay */
          color: #000; /* used by SVG stroke via currentColor */
          background: #f6f6f6;
          transition:
            transform 360ms cubic-bezier(0.2, 0.9, 0.2, 1),
            color 360ms cubic-bezier(0.2, 0.9, 0.2, 1),
            box-shadow 360ms cubic-bezier(0.2, 0.9, 0.2, 1);
          transform-origin: center center;
          box-shadow: none;
          position: relative;
          z-index: 2;
        }
        /* zoom images by 10% by default */
        .hex-img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition:
            opacity 420ms ease,
            transform 420ms ease,
            filter 260ms ease;
          display: block;
          transform: scale(1.1);
        }
        /* start greyscale, restore color on hover/active */
        .hex-img.base {
          filter: grayscale(100%) contrast(0.95) brightness(0.95);
        }
        .hex-img.overlay {
          opacity: 0;
          transform: scale(1.1);
          filter: grayscale(100%) contrast(0.95) brightness(0.95);
        }
        .hex-img.overlay.show {
          opacity: 1;
          transform: scale(1.1);
          filter: none;
        }
        .hex-stroke {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          z-index: 3;
          pointer-events: none;
        }
        .hex:hover {
          transform: scale(1.09);
        }
        .hex:hover .hex-img.base,
        .hex.active .hex-img.base {
          filter: none;
        }
        /* amber-100 outline + glow timed with grow */
        .hex-wrap.active .hex,
        .hex-wrap:hover .hex {
          color: #fef3c7;
          box-shadow:
            0 10px 34px rgba(250, 204, 21, 0.22),
            0 0 18px rgba(250, 204, 21, 0.18);
          transform: scale(1.09);
        }
        /* reveal the colored halo pseudo-element in sync with the grow */
        .hex-wrap.active::before,
        .hex-wrap:hover::before {
          opacity: 0.36;
        }
      `}</style>
      {selected !== null && (
        <div
          className="hc-overlay"
          onClick={closeOverlay}
          role="dialog"
          aria-modal="true"
        >
          <button
            className="hc-close"
            onClick={closeOverlay}
            aria-label="Close overlay"
          >
            ✕
          </button>
          <button
            className="hc-nav hc-nav-left"
            onClick={(e) => {
              e.stopPropagation();
              setSelected((s) =>
                s === null ? null : (s - 1 + items.length) % items.length,
              );
            }}
            aria-label="Previous"
          >
            ◀
          </button>
          <button
            className="hc-nav hc-nav-right"
            onClick={(e) => {
              e.stopPropagation();
              setSelected((s) => (s === null ? null : (s + 1) % items.length));
            }}
            aria-label="Next"
          >
            ▶
          </button>
          <img
            src={items[selected].onBody || items[selected].paper}
            alt={items[selected].alt || `gallery ${selected}`}
            className="hc-img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <style jsx>{`
        .hc-overlay {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.78);
          z-index: 1100;
        }
        .hc-img {
          max-width: 92vw;
          max-height: 92vh;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
          border-radius: 6px;
          transform-origin: center center;
          transition: transform 260ms ease;
        }
        .hc-close {
          position: fixed;
          right: 28px;
          top: 24px;
          z-index: 1110;
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          border: none;
          font-size: 22px;
          padding: 8px 12px;
          border-radius: 8px;
          cursor: pointer;
          backdrop-filter: blur(6px);
        }

        /* Nav arrows (left/right) */
        .hc-nav {
          position: fixed;
          top: 50%;
          transform: translateY(-50%);
          z-index: 1110;
          width: 56px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.06),
            rgba(255, 255, 255, 0.02)
          );
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.06);
          font-size: 22px;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
          transition:
            transform 180ms ease,
            background 180ms ease,
            box-shadow 180ms ease;
          backdrop-filter: blur(6px);
        }
        .hc-nav:active {
          transform: translateY(-50%) scale(0.96);
        }
        .hc-nav:hover {
          transform: translateY(-50%) scale(1.03);
          box-shadow: 0 14px 36px rgba(0, 0, 0, 0.5);
        }

        .hc-nav-left {
          left: 22px;
        }
        .hc-nav-right {
          right: 22px;
        }

        /* Slight amber accent on hover/focus to match gallery halo */
        .hc-nav:hover,
        .hc-nav:focus {
          background: linear-gradient(
            180deg,
            rgba(254, 243, 199, 0.12),
            rgba(254, 243, 199, 0.06)
          );
          color: #111827;
          border-color: rgba(250, 204, 21, 0.18);
        }

        /* Mobile: make navs smaller and inset a bit */
        @media (max-width: 640px) {
          .hc-nav {
            width: 44px;
            height: 44px;
            font-size: 18px;
          }
          .hc-nav-left {
            left: 12px;
          }
          .hc-nav-right {
            right: 12px;
          }
          .hc-close {
            right: 12px;
            top: 12px;
          }
        }
      `}</style>
    </div>
  );
}
