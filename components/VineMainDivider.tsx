"use client";
import React, { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { generateBarbedWireSegment } from "./vineUtils";

export default function VineMainDivider({
  width = 1200,
  centerY = 110,
}: {
  width?: number;
  centerY?: number;
}) {
  const wireARef = useRef<SVGPathElement | null>(null);
  const wireBRef = useRef<SVGPathElement | null>(null);
  const barbRefs = useRef<Array<SVGPathElement | null>>([]);

  const paths = useMemo(() => {
    const w = Math.max(780, width);
    const used = Math.min(920, w);
    const startX = Math.round((w - used) / 2);
    const endX = startX + used;
    return generateBarbedWireSegment(startX, endX, centerY, {
      wiggles: 9,
      amplitude: 4.2,
      barbEvery: 96,
      barbSize: 11,
      seedOffset: 42,
    });
  }, [width, centerY]);

  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    const wireA = wireARef.current;
    const wireB = wireBRef.current;
    barbRefs.current = barbRefs.current.slice(0, paths.barbs.length);
    const barbEls = barbRefs.current.filter(Boolean) as SVGPathElement[];
    if (!wireA || !wireB) return;

    const lenA = wireA.getTotalLength();
    const lenB = wireB.getTotalLength();

    (
      [
        [wireA, lenA],
        [wireB, lenB],
      ] as const
    ).forEach(([p, len]) => {
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;
    });

    barbEls.forEach((b) => {
      const l = b.getTotalLength();
      b.style.strokeDasharray = `${l}`;
      b.style.strokeDashoffset = `${l}`;
    });

    if (reduceMotion) {
      wireA.style.strokeDashoffset = "0";
      wireB.style.strokeDashoffset = "0";
      barbEls.forEach((b) => {
        b.style.strokeDashoffset = "0";
      });
      return;
    }

    const tl = gsap.timeline();
    // delay the divider until after the top frame completes so the top draws first
    const frameTotal = 12; // should match `VineTopFrame` frameTotal
    const startDelay = frameTotal + 1.2; // small pause after frame
    // slow, segmented drawing to mimic a hand drawing the divider
    const segments = 18;
    const totalDuration = 28; // seconds for full divider draw
    const stepDur = totalDuration / segments;

    // schedule wire draw in steps with absolute times
    for (let i = 1; i <= segments; i++) {
      const t = 1 - i / segments;
      const targetA = lenA * t;
      const targetB = lenB * t;

      const at = startDelay + (i - 1) * stepDur;
      tl.to(
        wireA,
        {
          strokeDashoffset: targetA,
          duration: stepDur,
          ease: "power1.out",
        },
        at,
      );
      tl.to(
        wireB,
        {
          strokeDashoffset: targetB,
          duration: stepDur,
          ease: "power1.out",
        },
        at,
      );
      // small corrective nudge to mimic hand adjustments
      tl.to(
        [wireA, wireB],
        {
          strokeDashoffset: (idx: number) =>
            Math.max(0, (idx === 0 ? targetA : targetB) - 1.6),
          duration: 0.12,
          yoyo: true,
          repeat: 1,
          ease: "sine.inOut",
        },
        at + stepDur - 0.06,
      );
    }

    // Animate each barb as its own short stroke.
    // "One hand" schedule: never draw two barbs at once.
    const barbDrawDur = 0.24;
    const barbGap = 0.06;
    let lastTime = startDelay + 0.2;
    for (let i = 0; i < paths.barbs.length; i++) {
      const el = barbRefs.current[i];
      if (!el) continue;
      const ideal = startDelay + paths.barbs[i].t * totalDuration;
      const when = Math.max(ideal, lastTime + barbGap);
      tl.to(
        el,
        {
          strokeDashoffset: 0,
          duration: barbDrawDur,
          ease: "power1.out",
        },
        when,
      );
      lastTime = when + barbDrawDur;
    }

    return () => {
      tl.kill();
    };
  }, [paths]);

  return (
    <svg
      width="100%"
      height="220"
      viewBox={`0 0 ${width} 220`}
      preserveAspectRatio="xMidYMid meet"
    >
      <path
        ref={wireARef}
        d={paths.wireA}
        fill="none"
        stroke="rgba(14,14,16,0.72)"
        strokeWidth={1.9}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        ref={wireBRef}
        d={paths.wireB}
        fill="none"
        stroke="rgba(255,255,255,0.18)"
        strokeWidth={1.15}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        opacity={0.85}
      />
      {paths.barbs.map((b, i) => (
        <path
          key={`dbarb-${i}`}
          ref={(el) => {
            barbRefs.current[i] = el;
          }}
          d={b.d}
          fill="none"
          stroke="rgba(12,12,14,0.68)"
          strokeWidth={1.05}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}
