"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { generateVerticalVine } from "./vineUtils";

export default function VineSides() {
  const [vw, setVw] = useState(1200);
  const [vh, setVh] = useState(800);
  useEffect(() => {
    const onResize = () => {
      setVw(window.innerWidth || 1200);
      setVh(window.innerHeight || 800);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const leftRef = useRef<SVGPathElement | null>(null);
  const rightRef = useRef<SVGPathElement | null>(null);

  const strokeWidth = 1.4;
  // move the side vines very near the edges (e.g. 2% / 98%)
  const leftBaseX = Math.round(vw * 0.01);
  const rightBaseX = Math.round(vw * 0.99);

  const leftPath = useMemo(
    () => generateVerticalVine(0, vh, leftBaseX, 8, 18, -6, 7),
    [vh, leftBaseX],
  );
  const rightPath = useMemo(
    () => generateVerticalVine(0, vh, rightBaseX, 8, 18, 6, 17),
    [vh, vw, rightBaseX],
  );

  useEffect(() => {
    const tl = gsap.timeline();
    [leftRef.current, rightRef.current].forEach((p) => {
      if (!p) return;
      const len = p.getTotalLength();
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;
    });
    const sideDelay = 8.3; // start after top frame+main divider
    tl.to(
      leftRef.current,
      { strokeDashoffset: 0, duration: 3.5, ease: "power2.out" },
      sideDelay,
    );
    tl.to(
      rightRef.current,
      { strokeDashoffset: 0, duration: 3.5, ease: "power2.out" },
      sideDelay + 0.18,
    );
    return () => {
      tl.kill();
    };
  }, [leftPath, rightPath]);

  return (
    <svg
      aria-hidden
      style={{ position: "fixed", inset: 0, pointerEvents: "none" }}
      width="100vw"
      height="100vh"
      viewBox={`0 0 ${vw} ${vh}`}
      preserveAspectRatio="none"
    >
      <path
        ref={leftRef}
        d={leftPath}
        fill="none"
        stroke="rgba(28,20,18,0.55)"
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
      />
      <path
        ref={rightRef}
        d={rightPath}
        fill="none"
        stroke="rgba(28,20,18,0.55)"
        strokeWidth={strokeWidth}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
      />
    </svg>
  );
}
