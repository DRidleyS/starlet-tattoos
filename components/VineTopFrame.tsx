"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { generateBarbedWireSegment } from "./vineUtils";

export default function VineTopFrame() {
  const [vw, setVw] = useState(1200);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth || 1200);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const leftWireARef = useRef<SVGPathElement | null>(null);
  const leftWireBRef = useRef<SVGPathElement | null>(null);
  const leftBarbRefs = useRef<Array<SVGPathElement | null>>([]);
  const rightWireARef = useRef<SVGPathElement | null>(null);
  const rightWireBRef = useRef<SVGPathElement | null>(null);
  const rightBarbRefs = useRef<Array<SVGPathElement | null>>([]);

  // Top segments: left edge -> center, and right edge -> center
  const leftStart = 0;
  const leftEnd = vw / 2;
  const rightStart = vw;
  const rightEnd = vw / 2;

  const left = useMemo(
    () =>
      generateBarbedWireSegment(leftStart, leftEnd, 46, {
        wiggles: 7,
        amplitude: 3.2,
        barbEvery: 88,
        barbSize: 9,
        seedOffset: 11,
      }),
    [vw],
  );
  const right = useMemo(
    () =>
      generateBarbedWireSegment(rightStart, rightEnd, 46, {
        wiggles: 7,
        amplitude: 3.2,
        barbEvery: 88,
        barbSize: 9,
        seedOffset: 21,
      }),
    [vw],
  );

  useEffect(() => {
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    const tl = gsap.timeline();

    // ensure ref arrays don't keep stale entries across resizes
    leftBarbRefs.current = leftBarbRefs.current.slice(0, left.barbs.length);
    rightBarbRefs.current = rightBarbRefs.current.slice(0, right.barbs.length);

    const paths = [
      leftWireARef.current,
      leftWireBRef.current,
      rightWireARef.current,
      rightWireBRef.current,
      ...leftBarbRefs.current,
      ...rightBarbRefs.current,
    ].filter(Boolean) as SVGPathElement[];

    paths.forEach((p) => {
      if (!p) return;
      const len = p.getTotalLength();
      p.style.strokeDasharray = `${len}`;
      p.style.strokeDashoffset = `${len}`;
    });

    if (reduceMotion) {
      paths.forEach((p) => {
        p.style.strokeDashoffset = "0";
      });
      return () => {
        tl.kill();
      };
    }

    // start the top frame almost immediately (short pause), then the divider will start after this finishes
    const startDelay = 0.2; // small pause before frame starts

    // do a slightly slower, stepped reveal to simulate a hand finishing the frame
    const frameSegments = 8;
    const frameTotal = 12; // seconds for full frame draw
    const stepDur = frameTotal / frameSegments;

    // Animate barbs as individual strokes.
    // Use a "one hand" schedule: at most one barb drawing at a time,
    // alternating sides while staying roughly synced to the wire draw.
    const barbDrawDur = 0.26;
    const barbGap = 0.06;

    const leftBarbs = left.barbs
      .map((b, i) => ({ ...b, i }))
      .sort((a, b) => a.t - b.t);
    const rightBarbs = right.barbs
      .map((b, i) => ({ ...b, i }))
      .sort((a, b) => a.t - b.t);

    let li = 0;
    let ri = 0;
    let lastTime = startDelay + 0.14;
    let nextSide: "left" | "right" = "left";

    const popNext = (side: "left" | "right") => {
      if (side === "left") {
        if (li >= leftBarbs.length) return null;
        return { side, item: leftBarbs[li++] };
      }
      if (ri >= rightBarbs.length) return null;
      return { side, item: rightBarbs[ri++] };
    };

    while (li < leftBarbs.length || ri < rightBarbs.length) {
      let picked = popNext(nextSide);
      if (!picked) {
        picked = popNext(nextSide === "left" ? "right" : "left");
        if (!picked) break;
      }

      const { side, item } = picked;
      const el =
        side === "left"
          ? leftBarbRefs.current[item.i]
          : rightBarbRefs.current[item.i];
      if (el) {
        // Align barb timing with the local wire progress.
        // Right wire is offset by ~0.12s in the hand-drawn frame.
        const sideOffset = side === "right" ? 0.12 : 0;
        const ideal = startDelay + sideOffset + item.t * frameTotal;
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

      nextSide = side === "left" ? "right" : "left";
    }

    for (let i = 1; i <= frameSegments; i++) {
      const leftTargetA = leftWireARef.current
        ? leftWireARef.current.getTotalLength() * (1 - i / frameSegments)
        : 0;
      const leftTargetB = leftWireBRef.current
        ? leftWireBRef.current.getTotalLength() * (1 - i / frameSegments)
        : leftTargetA;

      const rightTargetA = rightWireARef.current
        ? rightWireARef.current.getTotalLength() * (1 - i / frameSegments)
        : 0;
      const rightTargetB = rightWireBRef.current
        ? rightWireBRef.current.getTotalLength() * (1 - i / frameSegments)
        : rightTargetA;

      const leftT = startDelay + (i - 1) * stepDur;
      const rightT = leftT + 0.12;

      tl.to(
        leftWireARef.current,
        {
          strokeDashoffset: leftTargetA,
          duration: stepDur,
          ease: "power1.out",
        },
        leftT,
      );
      tl.to(
        leftWireBRef.current,
        {
          strokeDashoffset: leftTargetB,
          duration: stepDur,
          ease: "power1.out",
        },
        leftT,
      );

      tl.to(
        rightWireARef.current,
        {
          strokeDashoffset: rightTargetA,
          duration: stepDur,
          ease: "power1.out",
        },
        rightT,
      );
      tl.to(
        rightWireBRef.current,
        {
          strokeDashoffset: rightTargetB,
          duration: stepDur,
          ease: "power1.out",
        },
        rightT,
      );
      // small corrective wiggle
      tl.to(
        [leftWireARef.current, leftWireBRef.current].filter(
          Boolean,
        ) as SVGPathElement[],
        {
          strokeDashoffset: (idx: number) =>
            Math.max(0, (idx === 0 ? leftTargetA : leftTargetB) - 0.8),
          duration: 0.1,
          yoyo: true,
          repeat: 1,
          ease: "sine.inOut",
        },
        startDelay + (i - 1) * stepDur + stepDur - 0.08,
      );
      tl.to(
        [rightWireARef.current, rightWireBRef.current].filter(
          Boolean,
        ) as SVGPathElement[],
        {
          strokeDashoffset: (idx: number) =>
            Math.max(0, (idx === 0 ? rightTargetA : rightTargetB) - 0.8),
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
  }, [left, right]);

  return (
    <svg
      aria-hidden
      style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}
      width="100%"
      height="120"
      viewBox={`0 0 ${vw} 120`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="wireSheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
          <stop offset="50%" stopColor="rgba(255,255,255,0.05)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.12)" />
        </linearGradient>
      </defs>

      {/* Left */}
      <path
        ref={leftWireARef}
        d={left.wireA}
        fill="none"
        stroke="rgba(14,14,16,0.72)"
        strokeWidth={1.8}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        ref={leftWireBRef}
        d={left.wireB}
        fill="none"
        stroke="url(#wireSheen)"
        strokeWidth={1.2}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        opacity={0.9}
      />
      {left.barbs.map((b, i) => (
        <path
          key={`lbarb-${i}`}
          ref={(el) => {
            leftBarbRefs.current[i] = el;
          }}
          d={b.d}
          fill="none"
          stroke="rgba(12,12,14,0.68)"
          strokeWidth={1.05}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {/* Right */}
      <path
        ref={rightWireARef}
        d={right.wireA}
        fill="none"
        stroke="rgba(14,14,16,0.72)"
        strokeWidth={1.8}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        ref={rightWireBRef}
        d={right.wireB}
        fill="none"
        stroke="url(#wireSheen)"
        strokeWidth={1.2}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        opacity={0.9}
      />
      {right.barbs.map((b, i) => (
        <path
          key={`rbarb-${i}`}
          ref={(el) => {
            rightBarbRefs.current[i] = el;
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
