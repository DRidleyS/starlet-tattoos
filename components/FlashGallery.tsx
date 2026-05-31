"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type Item = { paper: string };

export default function FlashGallery({ items }: { items: Item[] }) {
  // Soft accent-pink background using layered gradients for texture
  const accentBackground = {
    backgroundColor: "#f7e7ea",
    backgroundImage:
      "radial-gradient(rgba(183,110,121,0.14) 1px, transparent 1px), repeating-linear-gradient(45deg, rgba(183,110,121,0.06) 0 6px, transparent 6px 12px), linear-gradient(180deg, rgba(0,0,0,0.02), rgba(255,255,255,0.28))",
    backgroundSize: "6px 6px, 28px 28px, 100% 100%",
    backgroundBlendMode: "overlay, normal, normal",
  } as React.CSSProperties;

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const closeOverlay = () => setSelected(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeOverlay();
        return;
      }
      if (e.key === "ArrowLeft") {
        setSelected((prev) =>
          prev === null ? null : (prev - 1 + items.length) % items.length,
        );
      }
      if (e.key === "ArrowRight") {
        setSelected((prev) =>
          prev === null ? null : (prev + 1) % items.length,
        );
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

  return (
    <div className="w-full flex justify-center mt-12">
      <div className="relative w-full rounded-lg p-40" style={accentBackground}>
        {/* subtle vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            boxShadow:
              "inset 0 60px 80px rgba(0,0,0,0.06), inset 0 -60px 80px rgba(255,255,255,0.02)",
          }}
        />

        <div className="relative z-10 px-16 max-w-6xl mx-auto">
          <div className="h-16 md:h-28 lg:h-40" />

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-2 gap-x-20 lg:gap-x-12 gap-y-56 justify-items-center">
            {items.map((it, idx) => {
              // deterministic but modest angles/offsets per index (clamped to avoid overflow)
              const angle = ((idx * 31) % 9) - 4; // -4..4 degrees
              const yOffset = ((idx * 17) % 13) - 6; // -6..6 px vertical offset
              const xOffset = ((idx * 23) % 7) - 3; // -3..3 px horizontal jitter

              const baseTransform = `translateX(${xOffset}px) rotate(${angle}deg) translateY(${yOffset}px)`;
              const hoveredTransform = `translateX(${xOffset}px) rotate(0deg) translateY(${Math.max(yOffset - 6, -12)}px) scale(1.06)`;

              const isHovered = hoveredIndex === idx;

              return (
                <div
                  key={idx}
                  className="relative"
                  style={{ zIndex: isHovered ? 40 : "auto" }}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  <div
                    className="relative bg-white w-64 md:w-72 lg:w-72 h-64 md:h-72 lg:h-72 p-3 shadow-2xl border border-slate-200 transition-transform duration-300 will-change-transform cursor-pointer"
                    style={{
                      transform: isHovered ? hoveredTransform : baseTransform,
                      transformOrigin: "center center",
                    }}
                    onClick={() => setSelected(idx)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(idx);
                      }
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={it.paper}
                      alt={`flash-${idx}`}
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                  </div>

                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 filter drop-shadow-xl">
                    <svg
                      width="26"
                      height="30"
                      viewBox="0 0 26 30"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <ellipse
                        cx="13"
                        cy="6.2"
                        rx="6.6"
                        ry="5.6"
                        fill="#ef4444"
                        stroke="#991b1b"
                        strokeWidth="0.8"
                      />
                      <rect
                        x="12.1"
                        y="10"
                        width="1.8"
                        height="12"
                        rx="0.9"
                        fill="#4b5563"
                      />
                      <path
                        d="M12 24 L8 20 L18 20 Z"
                        fill="#374151"
                        opacity="0.95"
                      />
                    </svg>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="h-16 md:h-28 lg:h-40" />
        </div>
      </div>

      {selected !== null && (
        <div
          className="fg-overlay"
          onClick={closeOverlay}
          role="dialog"
          aria-modal="true"
        >
          <button
            className="fg-close"
            onClick={closeOverlay}
            aria-label="Close overlay"
          >
            <X size={28} strokeWidth={2.5} aria-hidden />
          </button>
          <button
            className="fg-nav fg-nav-left"
            onClick={(e) => {
              e.stopPropagation();
              setSelected((s) =>
                s === null ? null : (s - 1 + items.length) % items.length,
              );
            }}
            aria-label="Previous"
          >
            <ChevronLeft size={36} strokeWidth={2.5} aria-hidden />
          </button>
          <button
            className="fg-nav fg-nav-right"
            onClick={(e) => {
              e.stopPropagation();
              setSelected((s) => (s === null ? null : (s + 1) % items.length));
            }}
            aria-label="Next"
          >
            <ChevronRight size={36} strokeWidth={2.5} aria-hidden />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={items[selected].paper}
            alt={`flash-${selected}`}
            className="fg-img"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <style jsx>{`
        .fg-overlay {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.78);
          z-index: 1100;
        }
        .fg-img {
          max-width: 92vw;
          max-height: 92vh;
          width: auto;
          height: auto;
          object-fit: contain;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
          border-radius: 6px;
        }
        .fg-close {
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
        .fg-nav {
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
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
          transition:
            transform 180ms ease,
            background 180ms ease,
            box-shadow 180ms ease;
          backdrop-filter: blur(6px);
        }
        .fg-nav:active {
          transform: translateY(-50%) scale(0.96);
        }
        .fg-nav:hover {
          transform: translateY(-50%) scale(1.03);
          box-shadow: 0 14px 36px rgba(0, 0, 0, 0.5);
        }
        .fg-nav-left {
          left: 22px;
        }
        .fg-nav-right {
          right: 22px;
        }
        .fg-nav:hover,
        .fg-nav:focus {
          background: linear-gradient(
            180deg,
            rgba(254, 243, 199, 0.12),
            rgba(254, 243, 199, 0.06)
          );
          color: #111827;
          border-color: rgba(250, 204, 21, 0.18);
        }
        @media (max-width: 640px) {
          .fg-nav {
            width: 44px;
            height: 44px;
          }
          .fg-nav-left {
            left: 12px;
          }
          .fg-nav-right {
            right: 12px;
          }
          .fg-close {
            right: 12px;
            top: 12px;
          }
        }
      `}</style>
    </div>
  );
}
