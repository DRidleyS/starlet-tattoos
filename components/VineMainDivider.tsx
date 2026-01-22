"use client";
import React, { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { generateVineSegment } from "./vineUtils";

export default function VineMainDivider({
  width = 1200,
  centerY = 110,
}: {
  width?: number;
  centerY?: number;
}) {
  const pathRef = useRef<SVGPathElement | null>(null);

  const d = useMemo(() => {
    const w = Math.max(780, width);
    const used = Math.min(920, w);
    const startX = Math.round((w - used) / 2);
    const endX = startX + used;
    return generateVineSegment(startX, endX, centerY, 9, 26, -8, 42);
  }, [width, centerY]);

  useEffect(() => {
    if (!pathRef.current) return;
    const p = pathRef.current;
    const len = p.getTotalLength();
    p.style.strokeDasharray = `${len}`;
    p.style.strokeDashoffset = `${len}`;

    const tl = gsap.timeline();
    // delay the divider until after the top frame completes so the top draws first
    const frameTotal = 12; // should match `VineTopFrame` frameTotal
    const startDelay = frameTotal + 1.2; // small pause after frame
    tl.to({}, { duration: startDelay });
    // slow, segmented drawing to mimic a hand drawing the divider
    const segments = 18;
    const totalDuration = 28; // seconds for full divider draw
    const stepDur = totalDuration / segments;
    for (let i = 1; i <= segments; i++) {
      const target = len * (1 - i / segments);
      tl.to(p, {
        strokeDashoffset: target,
        duration: stepDur,
        ease: "power1.out",
      });
      // small corrective nudge to mimic hand adjustments
      tl.to(
        p,
        {
          strokeDashoffset: Math.max(0, target - 1.6),
          duration: 0.12,
          yoyo: true,
          repeat: 1,
          ease: "sine.inOut",
        },
        "+=0.02",
      );
    }
    return () => {
      tl.kill();
    };
  }, [d]);

  return (
    <svg
      width="100%"
      height="220"
      viewBox={`0 0 ${width} 220`}
      preserveAspectRatio="xMidYMid meet"
    >
      <path
        ref={pathRef}
        d={d}
        fill="none"
        stroke="rgba(28,20,18,0.55)"
        strokeWidth={1.4}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
