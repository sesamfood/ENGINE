// Main-thread client for the OCR worker. Frames are scaled down before they are handed over.
import type { Rect } from "./geometry";
import type { OcrBox, OcrEngine, OcrJob, OcrResponse } from "./ocr.worker";

export type { OcrBox, OcrEngine };
type ReadResult = { boxes: OcrBox[]; detectMs: number; readMs: number; regions: number };
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; onProgress?: (done: number, total: number) => void };

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, Pending>();

function call<T>(request: OcrJob, onProgress?: Pending["onProgress"]) {
  if (!worker) {
    worker = new Worker(new URL("./ocr.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<OcrResponse>) => {
      const job = pending.get(data.id);
      if (!job) return;
      if ("progress" in data) return job.onProgress?.(...data.progress);
      pending.delete(data.id);
      if ("error" in data) job.reject(new Error(data.error));
      else job.resolve(data.result);
    };
  }
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: (value) => resolve(value as T), reject, onProgress });
    worker!.postMessage({ ...request, id }, "bitmap" in request ? [request.bitmap] : []);
  });
}

export const loadOcr = () => call<OcrEngine>({ type: "load" });

// Text regions in video pixels. The browser scales the frame while the main thread stays free.
export async function detectText(video: HTMLVideoElement, maxSide: number) {
  const sw = video.videoWidth, sh = video.videoHeight;
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const bitmap = await createImageBitmap(video, {
    resizeWidth: Math.max(32, Math.round((sw * scale) / 32) * 32),
    resizeHeight: Math.max(32, Math.round((sh * scale) / 32) * 32),
    resizeQuality: "low",
  });
  const sx = sw / bitmap.width, sy = sh / bitmap.height;
  const rects = await call<Rect[]>({ type: "detect", bitmap, maxSide });
  return rects.map((r) => ({ ...r, cx: r.cx * sx, cy: r.cy * sy, w: r.w * sx, h: r.h * sy }));
}

// The worker gets its own copy, so the caller can keep drawing the bitmap.
export async function readText(bitmap: ImageBitmap, onProgress?: (done: number, total: number) => void) {
  return call<ReadResult>({ type: "read", bitmap: await createImageBitmap(bitmap) }, onProgress);
}
