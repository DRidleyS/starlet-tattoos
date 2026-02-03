// Utility generators for barbed-wire paths (deterministic)
//
// These are used by components that were previously "vine"-themed.
// We keep the original exports to avoid churn in the rest of the codebase.

type BarbedWirePaths = {
  wireA: string;
  wireB: string;
  barbs: Array<{ d: string; t: number }>;
};

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

const makeRand = (seed: number) => (n: number) => {
  // deterministic-ish 0..1
  return Math.sin(seed * 999 + n * 17.23) * 0.5 + 0.5;
};

type Pt = { x: number; y: number; t: number };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const pointsToSmoothCubicPath = (pts: Pt[]) => {
  if (pts.length < 2) return "";
  let d = `M ${Math.round(pts[0].x)} ${Math.round(pts[0].y)}`;

  // Catmull-Rom -> cubic Bezier
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${Math.round(c1x)} ${Math.round(c1y)} ${Math.round(c2x)} ${Math.round(c2y)} ${Math.round(p2.x)} ${Math.round(p2.y)}`;
  }

  return d;
};

const samplePoints = (
  startX: number,
  endX: number,
  baseY: number,
  wiggles: number,
  amplitude: number,
  phase: number,
  seed: number,
) => {
  const rand = makeRand(seed);
  const total = endX - startX;
  const len = Math.abs(total);

  // More samples on longer wires; still bounded.
  const steps = clamp(Math.round((wiggles + 2) * 10 + len / 110), 24, 140);
  const sagStrength = clamp(len / 1600, 0.35, 0.95);

  const pts: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = startX + total * t;
    const sag =
      (Math.sin(t * Math.PI) * 3.5 + Math.sin(t * Math.PI * 2) * 0.8) *
      sagStrength;
    const wave = Math.sin(t * Math.PI * wiggles + phase) * amplitude;
    const noise = (rand(i) - 0.5) * 1.15;
    const y = baseY + sag + wave + noise;
    pts.push({ x, y, t });
  }
  return pts;
};

const pointAtT = (pts: Pt[], t: number) => {
  const clampedT = clamp(t, 0, 1);
  if (pts.length === 0) return { x: 0, y: 0, t: clampedT };
  if (clampedT <= 0) return pts[0];
  if (clampedT >= 1) return pts[pts.length - 1];

  const idx = clampedT * (pts.length - 1);
  const i0 = Math.floor(idx);
  const i1 = Math.min(pts.length - 1, i0 + 1);
  const lt = idx - i0;
  const p0 = pts[i0];
  const p1 = pts[i1];
  return {
    x: lerp(p0.x, p1.x, lt),
    y: lerp(p0.y, p1.y, lt),
    t: clampedT,
  };
};

const tangentAtT = (pts: Pt[], t: number) => {
  const eps = 1 / Math.max(pts.length - 1, 1);
  const p0 = pointAtT(pts, t - eps);
  const p1 = pointAtT(pts, t + eps);
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const m = Math.hypot(dx, dy) || 1;
  return { tx: dx / m, ty: dy / m };
};

const generateWireStrand = (
  startX: number,
  endX: number,
  baseY: number,
  wiggles: number,
  amplitude: number,
  phase: number,
  seed: number,
) => {
  const pts = samplePoints(
    startX,
    endX,
    baseY,
    wiggles,
    amplitude,
    phase,
    seed,
  );
  return { d: pointsToSmoothCubicPath(pts), pts };
};

export const generateBarbedWireSegment = (
  startX: number,
  endX: number,
  baseY: number,
  {
    wiggles = 7,
    amplitude = 3.2,
    barbEvery = 92,
    barbSize = 10,
    seedOffset = 0,
  }: {
    wiggles?: number;
    amplitude?: number;
    barbEvery?: number;
    barbSize?: number;
    seedOffset?: number;
  } = {},
): BarbedWirePaths => {
  const seed = 1234 + seedOffset;
  const rand = makeRand(seed);

  const wireARes = generateWireStrand(
    startX,
    endX,
    baseY,
    wiggles,
    amplitude,
    0.15,
    seed + 1,
  );
  const wireBRes = generateWireStrand(
    startX,
    endX,
    baseY,
    wiggles,
    amplitude,
    Math.PI,
    seed + 2,
  );

  const wireA = wireARes.d;
  const wireB = wireBRes.d;

  const total = endX - startX;
  const len = Math.abs(total);
  const count = Math.max(1, Math.floor(len / barbEvery));

  const barbs: Array<{ d: string; t: number }> = [];
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);

    // Center barb on the actual wire position.
    const pA = pointAtT(wireARes.pts, t);
    const pB = pointAtT(wireBRes.pts, t);
    const x = (pA.x + pB.x) / 2;
    const yMid = (pA.y + pB.y) / 2;

    // slight jitter along the normal so it feels hand-drawn
    const jitterN = (rand(i * 3) - 0.5) * 1.4;

    const { tx, ty } = tangentAtT(wireARes.pts, t);
    const nx = -ty;
    const ny = tx;

    const s = barbSize + (rand(i * 7) - 0.5) * 1.8;
    // A simple X reads cleaner than complex barbs at small sizes.
    // Build it in the tangent/normal basis so it follows the wire direction.
    const across = s * (0.85 + (rand(i * 11) - 0.5) * 0.12);
    const along = s * (0.65 + (rand(i * 13) - 0.5) * 0.1);

    const cx = x + nx * jitterN;
    const cy = yMid + ny * jitterN;

    const d1a = {
      x: cx - tx * along - nx * across,
      y: cy - ty * along - ny * across,
    };
    const d1b = {
      x: cx + tx * along + nx * across,
      y: cy + ty * along + ny * across,
    };
    const d2a = {
      x: cx - tx * along + nx * across,
      y: cy - ty * along + ny * across,
    };
    const d2b = {
      x: cx + tx * along - nx * across,
      y: cy + ty * along - ny * across,
    };

    // Single continuous stroke: diagonal -> center -> diagonal -> center -> diagonal.
    const d =
      `M ${Math.round(d1a.x)} ${Math.round(d1a.y)}` +
      ` L ${Math.round(cx)} ${Math.round(cy)}` +
      ` L ${Math.round(d1b.x)} ${Math.round(d1b.y)}` +
      ` L ${Math.round(cx)} ${Math.round(cy)}` +
      ` L ${Math.round(d2a.x)} ${Math.round(d2a.y)}` +
      ` L ${Math.round(cx)} ${Math.round(cy)}` +
      ` L ${Math.round(d2b.x)} ${Math.round(d2b.y)}`;
    barbs.push({ d, t });
  }

  return { wireA, wireB, barbs };
};

// Back-compat: components still import this name.
// We ignore vine-specific params and map them to wire defaults.
export const generateVineSegment = (
  startX: number,
  endX: number,
  baseY: number,
  peaks = 7,
  tipHeight = 18,
  _pull = -8,
  seedOffset = 0,
) => {
  const { wireA } = generateBarbedWireSegment(startX, endX, baseY, {
    wiggles: clamp(peaks, 4, 12),
    amplitude: clamp(tipHeight / 8, 2.4, 5.4),
    seedOffset,
  });
  return wireA;
};

export const generateVerticalVine = (
  startY: number,
  endY: number,
  baseX: number,
  peaks = 6,
  tipWidth = 22,
  pull = -8,
  seedOffset = 0,
) => {
  // Keeping this export for compatibility; if/when vertical wire is needed,
  // we can add a dedicated generator.
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
