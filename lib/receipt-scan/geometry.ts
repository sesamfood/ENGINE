// Rotated-rectangle geometry shared by the OCR worker and the camera overlay.
export type Point = [number, number];
export type Rect = { cx: number; cy: number; w: number; h: number; angle: number };
export type TextOutline = { corners: Point[]; cx: number; cy: number; area: number; lineHeight: number };

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

// Rotated rectangle around all text regions, plus the median height of line-shaped regions.
export function textOutline(rects: Rect[]): TextOutline | null {
  if (!rects.length) return null;
  const rect = minAreaRect(convexHull(rects.flatMap(corners)));
  const lines = rects.filter((r) => Math.max(r.w, r.h) >= 3 * Math.min(r.w, r.h));
  const heights = (lines.length ? lines : rects).map((r) => Math.min(r.w, r.h)).sort((a, b) => a - b);
  return rect && { corners: corners(rect), cx: rect.cx, cy: rect.cy, area: rect.w * rect.h, lineHeight: heights[heights.length >> 1] };
}
