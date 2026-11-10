// PROTOTYPE: PaddleOCR (PP-OCRv6 small) in the browser with onnxruntime-web. Mirrors RapidOCR's det/rec pre- and post-processing.
const ort = window.ort;
const base = new URL("./models/", import.meta.url);
const DET_MAX_SIDE = 1920;
const REC_H = 48;
const REC_MIN_W = 320;

let det, rec, chars;

export async function load(ep) {
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
  const opts = { executionProviders: ep === "wasm" ? ["wasm"] : [ep, "wasm"] };
  [det, rec, chars] = await Promise.all([
    ort.InferenceSession.create(new URL("det.onnx", base).href, opts),
    ort.InferenceSession.create(new URL("rec.onnx", base).href, opts),
    fetch(new URL("dict.txt", base)).then((r) => r.text()).then((t) => ["", ...t.split("\n"), " "]),
  ]);
}

// RGBA pixels -> NCHW float32 in BGR order, normalized to [-1, 1], padded with zeros to padW.
function toTensor({ data, width, height }, padW = width) {
  const out = new Float32Array(3 * height * padW);
  const plane = height * padW;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const o = y * padW + x;
      out[o] = data[i + 2] / 127.5 - 1;
      out[plane + o] = data[i + 1] / 127.5 - 1;
      out[2 * plane + o] = data[i] / 127.5 - 1;
    }
  return new ort.Tensor("float32", out, [1, 3, height, padW]);
}

function pixels(source, w, h, draw) {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  draw(ctx);
  return ctx.getImageData(0, 0, w, h);
}

function convexHull(points) {
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (pts) => {
    const h = [];
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
function minAreaRect(hull) {
  let best = null;
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

function corners({ cx, cy, w, h, angle }) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}

// DB post-processing: threshold, dilate, connected components, min-area rect, unclip.
function boxesFromMap(prob, W, H) {
  const bits = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      bits[i] = prob[i] > 0.3 || (x && prob[i - 1] > 0.3) || (y && prob[i - W] > 0.3) || (x && y && prob[i - W - 1] > 0.3) ? 1 : 0;
    }
  const seen = new Uint8Array(W * H);
  const rects = [];
  const stack = [];
  for (let start = 0; start < W * H; start++) {
    if (!bits[start] || seen[start]) continue;
    seen[start] = 1;
    stack.push(start);
    const rows = new Map();
    let sum = 0, count = 0;
    while (stack.length) {
      const i = stack.pop();
      const x = i % W, y = (i / W) | 0;
      sum += prob[i]; count++;
      const r = rows.get(y);
      if (r) { r[0] = Math.min(r[0], x); r[1] = Math.max(r[1], x); } else rows.set(y, [x, x]);
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1])
        if (j >= 0 && bits[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
    }
    if (count < 10 || sum / count < 0.5) continue;
    const pts = [];
    for (const [y, [x0, x1]] of rows) pts.push([x0, y], [x1 + 1, y], [x0, y + 1], [x1 + 1, y + 1]);
    const rect = minAreaRect(convexHull(pts));
    if (!rect || Math.min(rect.w, rect.h) < 3) continue;
    const d = (rect.w * rect.h * 1.6) / (2 * (rect.w + rect.h));
    rects.push({ ...rect, w: rect.w + 2 * d, h: rect.h + 2 * d, score: sum / count });
  }
  return rects;
}

function recognize(bitmap, rect) {
  let { cx, cy, w, h, angle } = rect;
  if (h / w >= 1.5) { angle += Math.PI / 2; [w, h] = [h, w]; }
  const outW = Math.max(1, Math.round((REC_H * w) / h));
  const img = pixels(bitmap, outW, REC_H, (ctx) => {
    ctx.translate(outW / 2, REC_H / 2);
    ctx.scale(outW / w, REC_H / h);
    ctx.rotate(-angle);
    ctx.translate(-cx, -cy);
    ctx.drawImage(bitmap, 0, 0);
  });
  return toTensor(img, Math.max(outW, REC_MIN_W));
}

// CTC greedy decode: drop blanks and repeats.
function decode(out) {
  const [, T, C] = out.dims;
  const data = out.data;
  let text = "", scores = [], prev = -1;
  for (let t = 0; t < T; t++) {
    let best = 0, bestP = -Infinity;
    for (let c = 0; c < C; c++) { const p = data[t * C + c]; if (p > bestP) { bestP = p; best = c; } }
    if (best && best !== prev) { text += chars[best] ?? ""; scores.push(bestP); }
    prev = best;
  }
  return { text: text.trim(), score: scores.length ? scores.reduce((a, b) => a + b) / scores.length : 0 };
}

// Text regions in source pixels. Source can be an ImageBitmap, canvas or playing video.
export async function detect(source, maxSide = DET_MAX_SIDE) {
  const sw = source.videoWidth || source.width, sh = source.videoHeight || source.height;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const W = Math.max(32, Math.round((sw * scale) / 32) * 32);
  const H = Math.max(32, Math.round((sh * scale) / 32) * 32);
  const detOut = await det.run({ x: toTensor(pixels(source, W, H, (ctx) => ctx.drawImage(source, 0, 0, W, H))) });
  return boxesFromMap(Object.values(detOut)[0].data, W, H).map((r) => {
    const sx = sw / W, sy = sh / H;
    return { ...r, cx: r.cx * sx, cy: r.cy * sy, w: r.w * sx, h: r.h * sy };
  });
}

// Rotated rectangle around all text regions, plus the median height of line-shaped regions.
export function outline(rects) {
  if (!rects.length) return null;
  const rect = minAreaRect(convexHull(rects.flatMap(corners)));
  const lines = rects.filter((r) => Math.max(r.w, r.h) >= 3 * Math.min(r.w, r.h));
  const heights = (lines.length ? lines : rects).map((r) => Math.min(r.w, r.h)).sort((a, b) => a - b);
  return rect && { corners: corners(rect), cx: rect.cx, cy: rect.cy, area: rect.w * rect.h, lineHeight: heights[heights.length >> 1] };
}

export async function run(bitmap, onProgress = () => {}) {
  const t0 = performance.now();
  const rects = await detect(bitmap);
  const W = bitmap.width, H = bitmap.height;
  const t1 = performance.now();
  const results = [];
  for (const [i, rect] of rects.entries()) {
    onProgress(i + 1, rects.length);
    const out = await rec.run({ x: recognize(bitmap, rect) });
    const { text, score } = decode(Object.values(out)[0]);
    if (text && score > 0.5) results.push({ box: corners(rect), text, score });
  }
  return { boxes: results, timings: { detMs: t1 - t0, recMs: performance.now() - t1, size: `${W}x${H}`, regions: rects.length } };
}
