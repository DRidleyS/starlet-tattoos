"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { generateVineSegment } from "./vineUtils";

export default function VineTopFrame() {
  const [vw, setVw] = useState(1200);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth || 1200);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const leftRef = useRef<SVGPathElement | null>(null);
  const rightRef = useRef<SVGPathElement | null>(null);

  // Top segments: left edge -> center, and right edge -> center
  const leftStart = 0;
  const leftEnd = vw / 2;
  const rightStart = vw;
  const rightEnd = vw / 2;

  const leftPath = useMemo(
    () => generateVineSegment(leftStart, leftEnd, 48, 6, 18, -6, 11),
    [vw],
  );
  const rightPath = useMemo(
    () => generateVineSegment(rightStart, rightEnd, 48, 6, 18, 6, 21),
    [vw],
  );

  useEffect(() => {
    const tl = gsap.timeline();
    [leftRef.current, rightRef.current].forEach((p) => {
      if (!p) return;
      const len = p.getTotalLength();
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;
    });

    // start the top frame almost immediately (short pause), then the divider will start after this finishes
    const startDelay = 0.2; // small pause before frame starts

    // do a slightly slower, stepped reveal to simulate a hand finishing the frame
    const frameSegments = 8;
    const frameTotal = 12; // seconds for full frame draw
    const stepDur = frameTotal / frameSegments;

    for (let i = 1; i <= frameSegments; i++) {
      const segTargetLeft = leftRef.current
        ? leftRef.current.getTotalLength() * (1 - i / frameSegments)
        : 0;
      const segTargetRight = rightRef.current
        ? rightRef.current.getTotalLength() * (1 - i / frameSegments)
        : 0;
      tl.to(
        leftRef.current,
        {
          strokeDashoffset: segTargetLeft,
          duration: stepDur,
          ease: "power1.out",
        },
        startDelay + (i - 1) * stepDur,
      );
      tl.to(
        rightRef.current,
        {
          strokeDashoffset: segTargetRight,
          duration: stepDur,
          ease: "power1.out",
        },
        startDelay + (i - 1) * stepDur + 0.12,
      );
      // small corrective wiggle
      tl.to(
        leftRef.current,
        {
          strokeDashoffset: Math.max(0, segTargetLeft - 0.8),
          duration: 0.1,
          yoyo: true,
          repeat: 1,
          ease: "sine.inOut",
        },
        startDelay + (i - 1) * stepDur + stepDur - 0.08,
      );
      tl.to(
        rightRef.current,
        {
          strokeDashoffset: Math.max(0, segTargetRight - 0.8),
          duration: 0.1,
          yoyo: true,
          repeat: 1,
          ease: "sine.inOut",
        },
        startDelay + (i - 1) * stepDur + stepDur - 0.06,
      );
    }
    return () => {
      tl.kill();
    };
  }, [leftPath, rightPath]);

  return (
    <svg
      aria-hidden
      style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      width="100%"
      height="120"
      viewBox={`0 0 ${vw} 120`}
      preserveAspectRatio="none"
    >
      <path
        ref={leftRef}
        d={leftPath}
        fill="none"
        stroke="rgba(28,20,18,0.55)"
        strokeWidth={1.4}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        ref={rightRef}
        d={rightPath}
        fill="none"
        stroke="rgba(28,20,18,0.55)"
        strokeWidth={1.4}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
