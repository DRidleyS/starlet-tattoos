"use client";
import React, { useRef, useEffect } from "react";
import gsap from "gsap";

export default function Divider({
  className = "",
  color = "#B76E79",
  duration = 1.2,
}) {
  const pathRef = useRef<SVGPathElement | null>(null);

  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const length = path.getTotalLength();
    gsap.set(path, { strokeDasharray: length, strokeDashoffset: length });
    gsap.to(path, {
      strokeDashoffset: 0,
      duration,
      ease: "power2.out",
    });
  }, [duration]);

  return (
    <svg
      className={className}
      width="320"
      height="8"
      viewBox="0 0 320 8"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        ref={pathRef}
        d="M4 4 Q160 12 316 4"
        stroke={color}
        strokeWidth="2"
        fill="none"
      />
    </svg>
  );
}
