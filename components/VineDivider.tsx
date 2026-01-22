"use client";
import React, { useRef, useEffect, useMemo, useState } from "react";
import gsap from "gsap";

export default function VineDivider({
  className = "",
  duration = 16.0,
}: {
  className?: string;
  duration?: number;
}) {
  const vineRef = useRef<SVGPathElement | null>(null);

  // viewport size for full-bleed overlays (client-only)
  const [vw, setVw] = useState<number>(1200);
  const [vh, setVh] = useState<number>(220);

  useEffect(() => {
    const onResize = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const frameWidth = Math.max(1200, vw);
  const frameHeight = Math.max(600, vh);

  const topCenter = Math.round(frameWidth / 2);
  const roseCx = topCenter - 80;
  const fishCx = topCenter + 120;

  // refs for top frame thorn lines
  const leftRef = useRef<SVGPathElement | null>(null);
  const rightRef = useRef<SVGPathElement | null>(null);

  // reusable vine-like segment generator (deterministic for SSR parity)
  const generateVineSegment = (
    startX: number,
    endX: number,
    baseY: number,
    peaks = 6,
    tipHeight = 24,
    pull = -8,
    seedOffset = 0,
  ) => {
    const seedLocal = 100 + seedOffset;
    const randLocal = (n: number) => Math.sin(seedLocal + n) * 0.5 + 0.5;
    const total = endX - startX;
    const spacing = total / peaks;
    let cursor = startX;
    let p = `M${startX} ${baseY}`;

    const cubicManualLocal = (
      c1x: number,
      c1y: number,
      c2x: number,
      c2y: number,
      x1: number,
      y1: number,
    ) =>
      ` C ${Math.round(c1x)} ${Math.round(c1y)} ${Math.round(c2x)} ${Math.round(c2y)} ${Math.round(x1)} ${Math.round(y1)}`;

    for (let i = 0; i < peaks; i++) {
      const center = Math.round(startX + (i + 1) * spacing);
      const halfW = Math.max(8, Math.round(Math.abs(spacing) * 0.18));
      const leftX = center - halfW;
      const rightX = center + halfW;
      const tipX = center + pull;
      const isUp = i % 2 === 0;
      const tipY = baseY + (isUp ? -tipHeight : tipHeight);

      const approachOffset = Math.round(
        (12 + (randLocal(i) - 0.5) * 6) * Math.sin((i / peaks) * Math.PI),
      );
      const approachSign = isUp
        ? -10 + Math.round((randLocal(i + 5) - 0.5) * 6)
        : 10 + Math.round((randLocal(i + 5) - 0.5) * 6);
      const c1ax = Math.round(cursor + (leftX - cursor) * 0.33);
      const c2ax = Math.round(cursor + (leftX - cursor) * 0.66);
      p += ` C ${c1ax} ${baseY + approachOffset} ${c2ax} ${baseY + approachSign} ${leftX} ${baseY}`;

      const up_c1x =
        leftX + Math.round((tipX - leftX) * (0.32 + randLocal(i) * 0.08));
      const up_c1y =
        baseY +
        (isUp
          ? -6 - Math.round((randLocal(i + 6) - 0.5) * 6)
          : 6 + Math.round((randLocal(i + 6) - 0.5) * 6));
      const up_c2x = tipX - (10 + Math.round((randLocal(i + 7) - 0.5) * 6));
      const up_c2y =
        tipY +
        (isUp
          ? 6 + Math.round((randLocal(i + 8) - 0.5) * 4)
          : -6 - Math.round((randLocal(i + 8) - 0.5) * 4));
      p += cubicManualLocal(up_c1x, up_c1y, up_c2x, up_c2y, tipX, tipY);

      const down_c1x = tipX - (8 + Math.round((randLocal(i + 9) - 0.5) * 6));
      const down_c1y =
        tipY +
        (isUp
          ? 6 + Math.round((randLocal(i + 10) - 0.5) * 4)
          : -6 - Math.round((randLocal(i + 10) - 0.5) * 4));
      const down_c2x = Math.round(rightX - (rightX - tipX) * 0.36);
      const down_c2y =
        baseY +
        (isUp
          ? -6 - Math.round((randLocal(i + 11) - 0.5) * 4)
          : 6 + Math.round((randLocal(i + 11) - 0.5) * 4));
      p += cubicManualLocal(
        down_c1x,
        down_c1y,
        down_c2x,
        down_c2y,
        rightX,
        baseY,
      );

      cursor = rightX;
    }
    const tailC1x = Math.round(cursor + (endX - cursor) * 0.33);
    const tailC2x = Math.round(cursor + (endX - cursor) * 0.66);
    p += ` C ${tailC1x} ${baseY} ${tailC2x} ${baseY} ${endX} ${baseY}`;
    return p;
  };

  // generate a vertical vine (top->bottom) using similar logic to the horizontal generator
  const generateVerticalVine = (
    startY: number,
    endY: number,
    baseX: number,
    peaks = 6,
    tipWidth = 22,
    pull = -8,
    seedOffset = 0,
  ) => {
    const seedLocal = 200 + seedOffset;
    const randLocal = (n: number) => Math.sin(seedLocal + n) * 0.5 + 0.5;
    const total = endY - startY;
    const spacing = total / peaks;
    let cursor = startY;
    let p = `M ${baseX} ${startY}`;

    const cubicManualV = (
      c1x: number,
      c1y: number,
      c2x: number,
      c2y: number,
      x1: number,
      y1: number,
    ) =>
      ` C ${Math.round(c1x)} ${Math.round(c1y)} ${Math.round(c2x)} ${Math.round(c2y)} ${Math.round(x1)} ${Math.round(y1)}`;

    for (let i = 0; i < peaks; i++) {
      const centerY = Math.round(startY + (i + 1) * spacing);
      const halfH = Math.max(6, Math.round(Math.abs(spacing) * 0.18));
      const topY = centerY - halfH;
      const bottomY = centerY + halfH;
      const tipY = centerY + pull;
      const isLeft = i % 2 === 0;
      const tipX = baseX + (isLeft ? -tipWidth : tipWidth);

      const approachOffsetX = Math.round(
        (8 + (randLocal(i) - 0.5) * 6) * Math.sin((i / peaks) * Math.PI),
      );
      const c1ay = Math.round(cursor + (topY - cursor) * 0.33);
      const c2ay = Math.round(cursor + (topY - cursor) * 0.66);
      p += ` C ${baseX + approachOffsetX} ${c1ay} ${baseX + approachOffsetX * 0.6} ${c2ay} ${baseX} ${topY}`;

      const up_c1x =
        baseX + Math.round((tipX - baseX) * (0.32 + randLocal(i) * 0.08));
      const up_c1y = topY + Math.round((tipY - topY) * 0.28);
      const up_c2x =
        tipX +
        (isLeft
          ? 6 + Math.round((randLocal(i + 7) - 0.5) * 6)
          : -6 - Math.round((randLocal(i + 7) - 0.5) * 6));
      const up_c2y = tipY - Math.round((tipY - topY) * 0.22);
      p += cubicManualV(up_c1x, up_c1y, up_c2x, up_c2y, tipX, tipY);

      const down_c1x =
        tipX +
        (isLeft
          ? 6 + Math.round((randLocal(i + 9) - 0.5) * 4)
          : -6 - Math.round((randLocal(i + 9) - 0.5) * 4));
      const down_c1y = tipY + Math.round((bottomY - tipY) * 0.36);
      const down_c2x = baseX + Math.round((baseX - tipX) * 0.34);
      const down_c2y = bottomY - Math.round((bottomY - tipY) * 0.22);
      p += cubicManualV(down_c1x, down_c1y, down_c2x, down_c2y, baseX, bottomY);

      cursor = bottomY;
    }
    const tailC1y = Math.round(cursor + (endY - cursor) * 0.33);
    const tailC2y = Math.round(cursor + (endY - cursor) * 0.66);
    p += ` C ${baseX} ${tailC1y} ${baseX} ${tailC2y} ${baseX} ${endY}`;
    return p;
  };

  // frame lines (two horizontal lines with thorny peaks) — use viewport width so they reach corners
  const frame = useMemo(() => {
    const left: { d: string; startX: number; endX: number } = {
      d: "",
      startX: 0,
      endX: 0,
    };
    const right: { d: string; startX: number; endX: number } = {
      d: "",
      startX: 0,
      endX: 0,
    };
    const y = 28; // top overlay y
    const startX = 0;
    const endX = Math.max(1200, vw);
    const center = Math.round((startX + endX) / 2);
    const gapWidth = Math.min(360, Math.round(endX * 0.34)); // scaled gap for logo
    const leftEnd = center - Math.round(gapWidth / 2);
    const rightStart = center + Math.round(gapWidth / 2);

    const thornSpacing = 28;

    // generate left so stroke direction draws outward from center to left corner
    left.d = generateVineSegment(leftEnd, startX, y, 6, 22, -8, 7);
    left.startX = startX;
    left.endX = leftEnd;

    // generate right so it draws outward from center to right corner
    right.d = generateVineSegment(rightStart, endX, y, 6, 22, -8, 11);
    right.startX = rightStart;
    right.endX = endX;

    return { left, right, thornSpacing };
  }, [vw]);

  const d = useMemo(() => {
    const baseY = 110;
    const startX = 20;
    const endX = 1160;
    const peaks = 6;
    const total = endX - startX;
    const spacing = total / peaks;

    let path = `M${startX} ${baseY}`;

    const cubicManual = (
      c1x: number,
      c1y: number,
      c2x: number,
      c2y: number,
      x1: number,
      y1: number,
    ) => {
      return ` C ${Math.round(c1x)} ${Math.round(c1y)} ${Math.round(c2x)} ${Math.round(c2y)} ${Math.round(x1)} ${Math.round(y1)}`;
    };

    const cubic = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      c1yOffset: number,
      c2yOffset: number,
    ) => {
      const c1x = Math.round(x0 + (x1 - x0) * 0.33);
      const c2x = Math.round(x0 + (x1 - x0) * 0.66);
      const c1y = y0 + c1yOffset;
      const c2y = y1 + c2yOffset;
      return ` C ${c1x} ${c1y} ${c2x} ${c2y} ${x1} ${y1}`;
    };

    // use a deterministic seed for server/client parity during initial render
    // (randomness for timing/jitter kept client-side to avoid hydration mismatches)
    const seed = 42;
    const rand = (n: number) => Math.sin(seed + n) * 0.5 + 0.5;

    let cursorX = startX;
    for (let i = 0; i < peaks; i++) {
      const center = Math.round(startX + (i + 1) * spacing);
      const halfW = 18; // peak half-width
      const leftX = center - halfW;
      const rightX = center + halfW;
      const tipHeight = 30; // consistent tip height

      const pull = -8; // pull all peaks to the left
      const tipX = center + pull;
      const isUp = i % 2 === 0;
      const tipY = baseY + (isUp ? -tipHeight : tipHeight);

      // approach from cursorX to leftX (add small random variation)
      const approachOffset = Math.round(
        (18 + (rand(i) - 0.5) * 8) * Math.sin((i / peaks) * Math.PI),
      );
      const approachSign = isUp
        ? -14 + Math.round((rand(i + 10) - 0.5) * 6)
        : 14 + Math.round((rand(i + 10) - 0.5) * 6);
      path += cubic(cursorX, baseY, leftX, baseY, approachOffset, approachSign);

      if (isUp) {
        const up_c1x =
          leftX + Math.round((tipX - leftX) * (0.28 + rand(i) * 0.1));
        const up_c1y = baseY - (8 + Math.round((rand(i + 5) - 0.5) * 6));
        const up_c2x = tipX - (12 + Math.round((rand(i + 6) - 0.5) * 6)); // left pull with variation
        const up_c2y = tipY + (8 + Math.round((rand(i + 7) - 0.5) * 6));
        path += cubicManual(up_c1x, up_c1y, up_c2x, up_c2y, tipX, tipY);

        const down_c1x = tipX - (12 + Math.round((rand(i + 8) - 0.5) * 6));
        const down_c1y = tipY + (8 + Math.round((rand(i + 9) - 0.5) * 6));
        const down_c2x = Math.round(
          rightX - (rightX - tipX) * (0.33 + (rand(i + 11) - 0.5) * 0.08),
        );
        const down_c2y = baseY - (8 + Math.round((rand(i + 12) - 0.5) * 6));
        path += cubicManual(
          down_c1x,
          down_c1y,
          down_c2x,
          down_c2y,
          rightX,
          baseY,
        );
      } else {
        const up_c1x =
          leftX + Math.round((tipX - leftX) * (0.28 + rand(i) * 0.1));
        const up_c1y = baseY + (8 + Math.round((rand(i + 5) - 0.5) * 6));
        const up_c2x = tipX - (12 + Math.round((rand(i + 6) - 0.5) * 6)); // still pull left
        const up_c2y = tipY - (8 + Math.round((rand(i + 7) - 0.5) * 6));
        path += cubicManual(up_c1x, up_c1y, up_c2x, up_c2y, tipX, tipY);

        const down_c1x = tipX - (12 + Math.round((rand(i + 8) - 0.5) * 6));
        const down_c1y = tipY - (8 + Math.round((rand(i + 9) - 0.5) * 6));
        const down_c2x = Math.round(
          rightX - (rightX - tipX) * (0.33 + (rand(i + 11) - 0.5) * 0.08),
        );
        const down_c2y = baseY + (8 + Math.round((rand(i + 12) - 0.5) * 6));
        path += cubicManual(
          down_c1x,
          down_c1y,
          down_c2x,
          down_c2y,
          rightX,
          baseY,
        );
      }

      cursorX = rightX;
    }

    // tail from last cursorX to endX
    path += cubic(cursorX, baseY, endX, baseY, 0, 0);
    return path;
  }, []);

  // rose and ichthys (Christian fish) small decorative paths
  const roseRef = useRef<SVGPathElement | null>(null);
  const fishRef = useRef<SVGPathElement | null>(null);
  const leftSideRef = useRef<SVGPathElement | null>(null);
  const rightSideRef = useRef<SVGPathElement | null>(null);
  const rosePath = useMemo(() => {
    // larger rose spiral, positioned up-left relative to viewport center
    const cx = Math.round(frameWidth / 2) - 80; // left of center
    const cy = 28; // top overlay y
    const r = 14; // larger
    return `M ${cx} ${cy}
      C ${cx + r} ${cy - r} ${cx + r * 0.6} ${cy + r * 0.6} ${cx} ${cy + r * 0.28}
      C ${cx - r * 0.4} ${cy - r * 0.22} ${cx + r * 0.2} ${cy - r * 0.66} ${cx + r * 0.6} ${cy - r * 0.22}
      C ${cx + r * 1.0} ${cy + r * 0.14} ${cx + r * 0.3} ${cy + r * 1.1} ${cx - r * 0.2} ${cy + r * 0.18}`;
  }, [frameWidth]);

  const fishPath = useMemo(() => {
    // ichthys positioned to the right of center in the top overlay
    const cx = Math.round(frameWidth / 2) + 120;
    const cy = 36;
    const w = 32;
    const h = 14;
    // main body
    const body = `M ${cx - w} ${cy}
      C ${cx - w / 2} ${cy - h} ${cx - w / 4} ${cy - h} ${cx} ${cy}
      C ${cx - w / 4} ${cy + h} ${cx - w / 2} ${cy + h} ${cx - w} ${cy}`;
    // tail fin: two small curves extending left from the body's start
    const tail = ` M ${cx - w} ${cy} C ${cx - w - 6} ${cy - 6} ${cx - w - 14} ${cy - 2} ${cx - w - 10} ${cy} C ${cx - w - 14} ${cy + 2} ${cx - w - 6} ${cy + 6} ${cx - w} ${cy}`;
    return body + tail;
  }, [frameWidth]);

  // Star to place somewhere in the page field (main SVG) — deterministic coords
  const starFieldRef = useRef<SVGPathElement | null>(null);
  const starFieldPath = useMemo(() => {
    const cx = 180;
    const cy = 69; // vertically between frame (28) and divider (110)
    const s = 18;
    const t1 = `M ${cx} ${cy - s} L ${cx - s * 0.86} ${cy + s * 0.5} L ${cx + s * 0.86} ${cy + s * 0.5} Z`;
    const t2 = `M ${cx} ${cy + s} L ${cx - s * 0.86} ${cy - s * 0.5} L ${cx + s * 0.86} ${cy - s * 0.5} Z`;
    return `${t1} ${t2}`;
  }, []);

  const leftSidePath = useMemo(() => {
    // vertical vine down left viewport edge
    const x = 0; // anchor at left viewport edge
    const startY = 12; // start near top of viewport
    const endY = frameHeight - 12; // extend near bottom
    return generateVerticalVine(startY, endY, x, 14, 36, -10, 5);
  }, [frameHeight, frameWidth]);

  const rightSidePath = useMemo(() => {
    const x = frameWidth; // anchor at right viewport edge
    const startY = 12;
    const endY = frameHeight - 12;
    return generateVerticalVine(startY, endY, x, 14, 36, -10, 9);
  }, [frameWidth, frameHeight]);

  useEffect(() => {
    const vine = vineRef.current;
    if (!vine) return;
    const len = vine.getTotalLength();
    gsap.set(vine, { strokeDasharray: len, strokeDashoffset: len });

    // hand-drawn timing: larger random variation in draw speed so overall draw is slower
    const randFactor = 1.0 + Math.random() * 0.6; // between 1.0 and 1.6
    const drawDuration = duration * randFactor;

    const tl = gsap.timeline();
    tl.to(vine, {
      strokeDashoffset: 0,
      duration: drawDuration,
      ease: "power2.out",
    });

    // subtle jitter after draw to feel hand-drawn (small translations)
    const jitterX = (Math.random() - 0.5) * 0.8;
    const jitterY = (Math.random() - 0.5) * 0.8;
    tl.to(
      vine,
      {
        x: jitterX,
        y: jitterY,
        duration: 0.06,
        repeat: 8,
        yoyo: true,
        ease: "sine.inOut",
      },
      "-=" + Math.min(0.4, drawDuration * 0.2),
    );
    // After vine draws, start slowly drawing thorned frame lines
    const left = leftRef.current;
    const right = rightRef.current;
    if (!left || !right) return;

    const leftLen = left.getTotalLength();
    const rightLen = right.getTotalLength();
    gsap.set(left, { strokeDasharray: leftLen, strokeDashoffset: leftLen });
    gsap.set(right, { strokeDasharray: rightLen, strokeDashoffset: rightLen });

    // Draw top frame sides smoothly to their corners (avoid springy segmented animation)
    const frameDur = Math.max(0.8, Math.min(2.4, drawDuration * 0.18));
    tl.to(
      left,
      { strokeDashoffset: 0, duration: frameDur, ease: "power2.out" },
      ">=",
    );
    tl.to(
      right,
      { strokeDashoffset: 0, duration: frameDur, ease: "power2.out" },
      "<",
    );

    // after thorn frame draws, draw a small rose then an ichthys
    const rose = roseRef.current;
    const fish = fishRef.current;
    if (rose) {
      const rl = rose.getTotalLength();
      gsap.set(rose, { strokeDasharray: rl, strokeDashoffset: rl });
      tl.to(
        rose,
        { strokeDashoffset: 0, duration: 2.4, ease: "sine.out" },
        "+=0.8",
      );
    }
    if (fish) {
      const fl = fish.getTotalLength();
      gsap.set(fish, { strokeDasharray: fl, strokeDashoffset: fl });
      tl.to(
        fish,
        { strokeDashoffset: 0, duration: 2.6, ease: "sine.out" },
        "+=1.8",
      );
    }
    // overlay star removed earlier; main field star draws later as starField
    const starField = starFieldRef.current;
    if (starField) {
      const sfl = starField.getTotalLength();
      gsap.set(starField, { strokeDasharray: sfl, strokeDashoffset: sfl });
      tl.to(
        starField,
        { strokeDashoffset: 0, duration: 1.8, ease: "sine.out" },
        "+=0.4",
      );
    }

    // after field star, draw side vines down the page using segmented alternation
    const leftSide = leftSideRef.current;
    const rightSide = rightSideRef.current;
    if (leftSide && rightSide) {
      const ll = leftSide.getTotalLength();
      const rl = rightSide.getTotalLength();
      gsap.set(leftSide, { strokeDasharray: ll, strokeDashoffset: ll });
      gsap.set(rightSide, { strokeDasharray: rl, strokeDashoffset: rl });

      // smooth downward draws that match top frame pacing
      const sideDur = Math.max(1.2, frameDur * 1.4);
      tl.to(
        leftSide,
        { strokeDashoffset: 0, duration: sideDur, ease: "power2.out" },
        ">+0.2",
      );
      tl.to(
        rightSide,
        { strokeDashoffset: 0, duration: sideDur, ease: "power2.out" },
        "<-0.6",
      );
    }
  }, [duration, d, frame.left.d, frame.right.d, frame.thornSpacing]);

  return (
    <>
      {/* fixed full-bleed overlay for top framing lines (above hero) */}
      <svg
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: 60,
          pointerEvents: "none",
          zIndex: 9999,
        }}
        viewBox={`0 0 ${Math.max(1200, vw)} 60`}
        preserveAspectRatio="none"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          ref={leftRef}
          d={frame.left.d}
          stroke="#6B6B6B"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="miter"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        <path
          ref={rightRef}
          d={frame.right.d}
          stroke="#6B6B6B"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="miter"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        <path
          ref={roseRef}
          d={rosePath}
          stroke="#6B6B6B"
          strokeWidth="1.0"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        <path
          ref={fishRef}
          d={fishPath}
          transform={`rotate(18 ${fishCx} 36)`}
          stroke="#6B6B6B"
          strokeWidth="1.0"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <svg
        className={className}
        style={{ width: "80vw", height: "auto", maxWidth: "1200px" }}
        viewBox="0 0 1200 220"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* full-height fixed SVG for side vines so they start at viewport corners */}
        <svg
          aria-hidden="true"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            pointerEvents: "none",
            zIndex: 9998,
          }}
          viewBox={`0 0 ${Math.max(1200, vw)} ${Math.max(600, vh)}`}
          preserveAspectRatio="none"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            ref={leftSideRef}
            d={leftSidePath}
            stroke="#6B6B6B"
            strokeWidth="1.0"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
          <path
            ref={rightSideRef}
            d={rightSidePath}
            stroke="#6B6B6B"
            strokeWidth="1.0"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <path
          ref={vineRef}
          d={d}
          stroke="#6B6B6B"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="miter"
          strokeMiterlimit={2}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        <path
          ref={starFieldRef}
          d={starFieldPath}
          stroke="#6B6B6B"
          strokeWidth="0.9"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </>
  );
}
