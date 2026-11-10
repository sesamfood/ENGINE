// On-device OCR worker: PaddleOCR (PP-OCRv6 small) with onnxruntime-web, off the main thread so the camera stays smooth.
// Mirrors RapidOCR's det/rec pre- and post-processing.
import { convexHull, corners, minAreaRect, type Point, type Rect } from "./geometry";

const ORT_URL = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.webgpu.min.mjs";
const MODELS = "/receipt-scan/models/";
const REC_H = 48;
const REC_MIN_W = 320;

type Tensor = { data: Float32Array; dims: readonly number[] };
type Session = { run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>> };
type Ort = {
  env: { wasm: { numThreads: number } };
  Tensor: new (type: "float32", data: Float32Array, dims: number[]) => Tensor;
  InferenceSession: { create(url: string, options: { executionProviders: string[] }): Promise<Session> };
};

export type OcrEngine = "webgpu" | "wasm";
export type OcrBox = { box: Point[]; text: string; score: number };
export type OcrJob =
  | { type: "load" }
  | { type: "detect"; bitmap: ImageBitmap; maxSide: number }
  | { type: "read"; bitmap: ImageBitmap };
type OcrRequest = OcrJob & { id: number };
export type OcrResponse =
  | { id: number; error: string }
  | { id: number; progress: [number, number] }
  | { id: number; result: unknown };

let models: Promise<{ ort: Ort; det: Session; rec: Session; chars: string[]; engine: OcrEngine }> | undefined;

function load() {
  models ??= (async () => {
    const ort: Ort = await import(/* webpackIgnore: true */ ORT_URL);
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
  return models;
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

// Text regions in bitmap pixels.
async function detect(bitmap: ImageBitmap, maxSide: number) {
  const { ort, det } = await load();
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const W = Math.max(32, Math.round((bitmap.width * scale) / 32) * 32);
  const H = Math.max(32, Math.round((bitmap.height * scale) / 32) * 32);
  const out = await det.run({ x: toTensor(ort, pixels(W, H, (ctx) => ctx.drawImage(bitmap, 0, 0, W, H))) });
  const sx = bitmap.width / W, sy = bitmap.height / H;
  return boxesFromMap(Object.values(out)[0].data, W, H).map((r) => ({ ...r, cx: r.cx * sx, cy: r.cy * sy, w: r.w * sx, h: r.h * sy }));
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

async function read(bitmap: ImageBitmap, onProgress: (done: number, total: number) => void) {
  const { ort, rec, chars } = await load();
  const t0 = performance.now();
  const rects = await detect(bitmap, 1920);
  const t1 = performance.now();
  const boxes: OcrBox[] = [];
  for (const [i, rect] of rects.entries()) {
    onProgress(i + 1, rects.length);
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
    const result = decode(Object.values(out)[0], chars);
    if (result.text && result.score > 0.5) boxes.push({ box: corners(rect), ...result });
  }
  return { boxes, detectMs: t1 - t0, readMs: performance.now() - t1, regions: rects.length };
}

const reply = (message: OcrResponse) => (self as unknown as Worker).postMessage(message);
let queue: Promise<unknown> = Promise.resolve();

// The sessions accept one run at a time, so requests are handled in order.
self.onmessage = ({ data }: MessageEvent<OcrRequest>) => {
  queue = queue.then(async () => {
    try {
      const result =
        data.type === "load"
          ? (await load()).engine
          : data.type === "detect"
            ? await detect(data.bitmap, data.maxSide)
            : await read(data.bitmap, (done, total) => reply({ id: data.id, progress: [done, total] }));
      reply({ id: data.id, result });
    } catch (error) {
      reply({ id: data.id, error: error instanceof Error ? error.message : String(error) });
    } finally {
      if (data.type !== "load") data.bitmap.close();
    }
  });
};
