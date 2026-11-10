// On-device OCR: PaddleOCR (PP-OCRv6 small) with onnxruntime-web. Mirrors RapidOCR's det/rec pre- and post-processing.
const ORT_URL = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.webgpu.min.js";
const MODELS = "/receipt-scan/models/";
const DET_MAX_SIDE = 1920;
const REC_H = 48;
const REC_MIN_W = 320;

type Tensor = { data: Float32Array; dims: readonly number[] };
type Session = { run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>> };
type Ort = {
  env: { wasm: { numThreads: number } };
  Tensor: new (type: "float32", data: Float32Array, dims: number[]) => Tensor;
  InferenceSession: { create(url: string, options: { executionProviders: string[] }): Promise<Session> };
};
declare global {
  interface Window {
    ort?: Ort;
  }
}

type Point = [number, number];
type Rect = { cx: number; cy: number; w: number; h: number; angle: number };
type Source = ImageBitmap | HTMLCanvasElement | HTMLVideoElement;
export type OcrBox = { box: Point[]; text: string; score: number };
export type TextOutline = { corners: Point[]; cx: number; cy: number; area: number; lineHeight: number };
export type OcrEngine = "webgpu" | "wasm";

let models: Promise<{ ort: Ort; det: Session; rec: Session; chars: string[]; engine: OcrEngine }> | undefined;
let queue: Promise<unknown> = Promise.resolve();

// The sessions accept one run at a time; the live camera and a full scan can overlap.
function serial<T>(fn: () => Promise<T>) {
  const next = queue.then(fn);
  queue = next.catch(() => {});
  return next;
}

function loadOrt() {
  return new Promise<Ort>((resolve, reject) => {
    if (window.ort) return resolve(window.ort);
    const script = document.createElement("script");
    script.src = ORT_URL;
    script.onload = () => (window.ort ? resolve(window.ort) : reject(new Error("OCR-motoren kunne ikke starte")));
    script.onerror = () => reject(new Error("OCR-motoren kunne ikke hentes"));
    document.head.append(script);
  });
}

export function loadOcr() {
  models ??= (async () => {
    const ort = await loadOrt();
    ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
    const engine: OcrEngine = "gpu" in navigator ? "webgpu" : "wasm";
    const options = { executionProviders: engine === "webgpu" ? ["webgpu", "wasm"] : ["wasm"] };
    const [det, rec, chars] = await Promise.all([
      ort.InferenceSession.create(`${MODELS}det.onnx`, options),
      ort.InferenceSession.create(`${MODELS}rec.onnx`, options),
      fetch(`${MODELS}dict.txt`).then((r) => r.text()).then((t) => ["", ...t.split("\n"), " "]),
    ]);
    return { ort, det, rec, chars, engine };
  })();
  models.catch(() => (models = undefined));
  return models.then((m) => m.engine);
}

// RGBA pixels -> NCHW float32 in BGR order, normalized to [-1, 1], padded with zeros to padW.
function toTensor(ort: Ort, { data, width, height }: ImageData, padW = width) {
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

function pixels(w: number, h: number, draw: (ctx: OffscreenCanvasRenderingContext2D) => void) {
  const ctx = new OffscreenCanvas(w, h).getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas er ikke tilgængelig");
  draw(ctx);
  return ctx.getImageData(0, 0, w, h);
}

function convexHull(points: Point[]) {
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
function minAreaRect(hull: Point[]) {
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

function corners({ cx, cy, w, h, angle }: Rect): Point[] {
  const c = Math.cos(angle), s = Math.sin(angle);
  return ([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as Point[]).map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}

// DB post-processing: threshold, dilate, connected components, min-area rect, unclip.
function boxesFromMap(prob: Float32Array, W: number, H: number) {
  const bits = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      bits[i] = prob[i] > 0.3 || (x && prob[i - 1] > 0.3) || (y && prob[i - W] > 0.3) || (x && y && prob[i - W - 1] > 0.3) ? 1 : 0;
    }
  const seen = new Uint8Array(W * H);
  const rects: Rect[] = [];
  const stack: number[] = [];
  for (let start = 0; start < W * H; start++) {
    if (!bits[start] || seen[start]) continue;
    seen[start] = 1;
    stack.push(start);
    const rows = new Map<number, [number, number]>();
    let sum = 0, count = 0;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % W, y = (i / W) | 0;
      sum += prob[i]; count++;
      const r = rows.get(y);
      if (r) { r[0] = Math.min(r[0], x); r[1] = Math.max(r[1], x); } else rows.set(y, [x, x]);
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1])
        if (j >= 0 && bits[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
    }
    if (count < 10 || sum / count < 0.5) continue;
    const pts: Point[] = [];
    for (const [y, [x0, x1]] of rows) pts.push([x0, y], [x1 + 1, y], [x0, y + 1], [x1 + 1, y + 1]);
    const rect = minAreaRect(convexHull(pts));
    if (!rect || Math.min(rect.w, rect.h) < 3) continue;
    const d = (rect.w * rect.h * 1.6) / (2 * (rect.w + rect.h));
    rects.push({ ...rect, w: rect.w + 2 * d, h: rect.h + 2 * d });
  }
  return rects;
}

const sourceSize = (source: Source) =>
  source instanceof HTMLVideoElement ? [source.videoWidth, source.videoHeight] : [source.width, source.height];

// Text regions in source pixels.
export function detectText(source: Source, maxSide = DET_MAX_SIDE) {
  return serial(async () => {
    const { ort, det } = await models!;
    const [sw, sh] = sourceSize(source);
    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    const W = Math.max(32, Math.round((sw * scale) / 32) * 32);
    const H = Math.max(32, Math.round((sh * scale) / 32) * 32);
    const out = await det.run({ x: toTensor(ort, pixels(W, H, (ctx) => ctx.drawImage(source, 0, 0, W, H))) });
    return boxesFromMap(Object.values(out)[0].data, W, H).map((r) => ({ ...r, cx: (r.cx * sw) / W, cy: (r.cy * sh) / H, w: (r.w * sw) / W, h: (r.h * sh) / H }));
  });
}

// Rotated rectangle around all text regions, plus the median height of line-shaped regions.
export function textOutline(rects: Rect[]): TextOutline | null {
  if (!rects.length) return null;
  const rect = minAreaRect(convexHull(rects.flatMap(corners)));
  const lines = rects.filter((r) => Math.max(r.w, r.h) >= 3 * Math.min(r.w, r.h));
  const heights = (lines.length ? lines : rects).map((r) => Math.min(r.w, r.h)).sort((a, b) => a - b);
  return rect && { corners: corners(rect), cx: rect.cx, cy: rect.cy, area: rect.w * rect.h, lineHeight: heights[heights.length >> 1] };
}

// CTC greedy decode: drop blanks and repeats.
function decode({ data, dims }: Tensor, chars: string[]) {
  const [, T, C] = dims;
  let text = "", prev = -1;
  const scores: number[] = [];
  for (let t = 0; t < T; t++) {
    let best = 0, bestP = -Infinity;
    for (let c = 0; c < C; c++) {
      const p = data[t * C + c];
      if (p > bestP) { bestP = p; best = c; }
    }
    if (best && best !== prev) { text += chars[best] ?? ""; scores.push(bestP); }
    prev = best;
  }
  return { text: text.trim(), score: scores.length ? scores.reduce((a, b) => a + b) / scores.length : 0 };
}

export async function readText(bitmap: ImageBitmap, onProgress: (done: number, total: number) => void = () => {}) {
  const t0 = performance.now();
  const rects = await detectText(bitmap);
  const t1 = performance.now();
  const boxes: OcrBox[] = [];
  for (const [i, rect] of rects.entries()) {
    onProgress(i + 1, rects.length);
    const result = await serial(async () => {
      const { ort, rec, chars } = await models!;
      let { w, h, angle } = rect;
      if (h / w >= 1.5) { angle += Math.PI / 2; [w, h] = [h, w]; }
      const outW = Math.max(1, Math.round((REC_H * w) / h));
      const crop = pixels(outW, REC_H, (ctx) => {
        ctx.translate(outW / 2, REC_H / 2);
        ctx.scale(outW / w, REC_H / h);
        ctx.rotate(-angle);
        ctx.translate(-rect.cx, -rect.cy);
        ctx.drawImage(bitmap, 0, 0);
      });
      const out = await rec.run({ x: toTensor(ort, crop, Math.max(outW, REC_MIN_W)) });
      return decode(Object.values(out)[0], chars);
    });
    if (result.text && result.score > 0.5) boxes.push({ box: corners(rect), ...result });
  }
  return { boxes, detectMs: t1 - t0, readMs: performance.now() - t1, regions: rects.length };
}
