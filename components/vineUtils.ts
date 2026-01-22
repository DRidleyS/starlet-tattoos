// Utility generators for vine paths (deterministic)
export const generateVineSegment = (
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

export const generateVerticalVine = (
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
