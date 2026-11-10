// Main-thread client for the OCR worker. Frames are scaled down before they are handed over.
import type { Rect } from "./geometry";
import type { OcrBox, OcrEngine, OcrJob, OcrResponse } from "./ocr.worker";

export type { OcrBox, OcrEngine };
type ReadResult = { boxes: OcrBox[]; detectMs: number; readMs: number; regions: number };
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, Pending>();

function call<T>(request: OcrJob) {
  if (!worker) {
    worker = new Worker(new URL("./ocr.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<OcrResponse>) => {
      const job = pending.get(data.id);
      if (!job) return;
      pending.delete(data.id);
      if ("error" in data) job.reject(new Error(data.error));
      else job.resolve(data.result);
    };
  }
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: (value) => resolve(value as T), reject });
    worker!.postMessage({ ...request, id }, "bitmap" in request ? [request.bitmap] : []);
  });
}

export const loadOcr = () => call<OcrEngine>({ type: "load" });

export type Region = { x: number; y: number; w: number; h: number };

// Text regions in frame pixels, optionally only within a region. The browser crops and scales the frame while
// the main thread stays free; detection time grows with the pixel count.
export async function detectText(
  frame: HTMLVideoElement | HTMLCanvasElement,
  scale: number,
  region: Region = frame instanceof HTMLVideoElement ? { x: 0, y: 0, w: frame.videoWidth, h: frame.videoHeight } : { x: 0, y: 0, w: frame.width, h: frame.height },
) {
  const W = Math.max(32, Math.round((region.w * scale) / 32) * 32);
  const H = Math.max(32, Math.round((region.h * scale) / 32) * 32);
  const bitmap = await createImageBitmap(frame, region.x, region.y, region.w, region.h, { resizeWidth: W, resizeHeight: H, resizeQuality: "low" });
  const sx = region.w / bitmap.width, sy = region.h / bitmap.height;
  const rects = await call<Rect[]>({ type: "detect", bitmap, maxSide: Math.max(W, H) });
  return rects.map((r) => ({ ...r, cx: region.x + r.cx * sx, cy: region.y + r.cy * sy, w: r.w * sx, h: r.h * sy }));
}

// The worker gets its own copy, so the caller can keep drawing the bitmap.
export async function readText(bitmap: ImageBitmap) {
  return call<ReadResult>({ type: "read", bitmap: await createImageBitmap(bitmap) });
}
