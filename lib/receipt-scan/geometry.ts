// Rotated-rectangle geometry shared by the OCR worker and the camera overlay.
export type Point = [number, number];
export type Rect = { cx: number; cy: number; w: number; h: number; angle: number };
export type TextOutline = Rect & { corners: Point[]; area: number; lineHeight: number };

export function convexHull(points: Point[]) {
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (pts: Point[]) => {
    const h: Point[] = [];
    for (const p of pts) {
      while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...half(points), ...half([...points].reverse())];
}

// Minimum-area rectangle by rotating calipers, normalized so the angle is within ±45°.
export function minAreaRect(hull: Point[]) {
  let best: (Rect & { area: number }) | null = null;
  for (let i = 0; i < hull.length; i++) {
    const [ax, ay] = hull[i];
    const [bx, by] = hull[(i + 1) % hull.length];
    const len = Math.hypot(bx - ax, by - ay);
    if (!len) continue;
    const ux = (bx - ax) / len, uy = (by - ay) / len;
    let minU = Infinity, maxU = -Infinity, minN = Infinity, maxN = -Infinity;
    for (const [x, y] of hull) {
      const u = x * ux + y * uy, n = -x * uy + y * ux;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u);
      minN = Math.min(minN, n); maxN = Math.max(maxN, n);
    }
    const area = (maxU - minU) * (maxN - minN);
    if (!best || area < best.area) {
      const cu = (minU + maxU) / 2, cn = (minN + maxN) / 2;
      best = { area, cx: cu * ux - cn * uy, cy: cu * uy + cn * ux, w: maxU - minU, h: maxN - minN, angle: Math.atan2(uy, ux) };
    }
  }
  if (!best) return null;
  while (best.angle > Math.PI / 4) { best.angle -= Math.PI / 2; [best.w, best.h] = [best.h, best.w]; }
  while (best.angle <= -Math.PI / 4) { best.angle += Math.PI / 2; [best.w, best.h] = [best.h, best.w]; }
  return best;
}

export function corners({ cx, cy, w, h, angle }: Rect): Point[] {
  const c = Math.cos(angle), s = Math.sin(angle);
  return ([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as Point[]).map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];

// Rotated rectangle around the receipt, plus the median height of its text lines. Only text lying in the reading
// direction counts, grouped with its neighbours; the largest group wins. Stray text nearby, such as a screen or a
// sign, and streaks or edges that look like vertical text are left out.
export function textOutline(rects: Rect[]): TextOutline | null {
  // Angles are normalized to ±45° with w along the angle, so reading-direction text is wider than tall.
  const lines = rects.filter((r) => r.w >= 1.5 * r.h);
  if (lines.length < 3) return null;
  const longLines = lines.filter((r) => r.w >= 3 * r.h);
  const lineHeight = median((longLines.length ? longLines : lines).map((r) => r.h));
  const angle = median(lines.map((r) => r.angle));
  const ux = Math.cos(angle), uy = Math.sin(angle);
  const placed = lines.map((r) => ({ r, u: r.cx * ux + r.cy * uy, n: -r.cx * uy + r.cy * ux }));

  // Neighbours along a row can be far apart (label and amount columns); rows above and below must be close.
  const parent = placed.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  for (let i = 0; i < placed.length; i++)
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i], b = placed[j];
      const alongGap = Math.abs(a.u - b.u) - (a.r.w + b.r.w) / 2;
      const acrossGap = Math.abs(a.n - b.n) - (a.r.h + b.r.h) / 2;
      if (alongGap < 12 * lineHeight && acrossGap < 2.5 * lineHeight) parent[root(i)] = root(j);
    }
  const sizes = new Map<number, number>();
  placed.forEach((_, i) => sizes.set(root(i), (sizes.get(root(i)) ?? 0) + 1));
  const largest = [...sizes].sort((a, b) => b[1] - a[1])[0][0];

  const rect = minAreaRect(convexHull(lines.filter((_, i) => root(i) === largest).flatMap(corners)));
  return rect && { ...rect, corners: corners(rect), lineHeight };
}
