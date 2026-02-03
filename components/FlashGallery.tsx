"use client";

import { useState } from "react";
import Image from "next/image";

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
                    className="relative bg-white w-64 md:w-72 lg:w-72 h-64 md:h-72 lg:h-72 p-3 shadow-2xl border border-slate-200 transition-transform duration-300 will-change-transform"
                    style={{
                      transform: isHovered ? hoveredTransform : baseTransform,
                      transformOrigin: "center center",
                    }}
                  >
                    <Image
                      src={it.paper}
                      alt={`flash-${idx}`}
                      fill
                      className="object-cover"
                      sizes="(max-width:640px) 256px, (max-width:1024px) 288px, 320px"
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
    </div>
  );
}
