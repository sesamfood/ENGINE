"use client";

import { SparklesIcon } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { corners, textOutline, type Point, type Rect, type TextOutline } from "@/lib/receipt-scan/geometry";
import { detectText, type Region } from "@/lib/receipt-scan/ocr";

const LIVE_SCALE = 0.6; // live detection size relative to the frame; smaller misses text that is still readable
const MIN_LINE_HEIGHT = 28; // video pixels; below this rows start to pair wrongly
const STABLE_MS = 1000;
const FULL_FRAME_EVERY = 15;
const ZOOM_MS = 800;
const MIN_PROCESSING_MS = 1700; // the loading animation shows for a moment even when reading is quick
const MESSAGE_MS = 1800;
// Glow colours in the style of Apple Intelligence; the first repeats last so the conic gradient has no seam.
const MAGIC = ["#0894ff", "#c959dd", "#ff2e54", "#ff9004", "#0894ff"];
const MESSAGES = [
  "Kigger nærmere på kasserapporten…",
  "Tæller kronerne…",
  "Leder efter totalen…",
  "Holder øje med decimalerne…",
  "Finder gavekortene…",
  "Lægger tallene sammen…",
  "Næsten færdig…",
];

type Zoom = { frame: HTMLCanvasElement; crop: HTMLCanvasElement; paper: Rect; start: number };

// The receipt paper around the detected text: the text rectangle plus a margin of about one line.
const paperOf = (o: TextOutline): Rect => ({ cx: o.cx, cy: o.cy, w: o.w + 2 * o.lineHeight, h: o.h + 2 * o.lineHeight, angle: o.angle });

// Bounding box of the outline with a margin for movement, clamped to the frame.
function around(points: Point[], W: number, H: number): Region {
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const mx = (Math.max(...xs) - Math.min(...xs)) * 0.15, my = (Math.max(...ys) - Math.min(...ys)) * 0.15;
  const x = Math.max(0, Math.floor(Math.min(...xs) - mx)), y = Math.max(0, Math.floor(Math.min(...ys) - my));
  return { x, y, w: Math.min(W, Math.ceil(Math.max(...xs) + mx)) - x, h: Math.min(H, Math.ceil(Math.max(...ys) + my)) - y };
}

// Cuts the paper rectangle out of the frame and turns it upright.
function cropPaper(frame: HTMLCanvasElement, paper: Rect) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(paper.w);
  canvas.height = Math.round(paper.h);
  const ctx = canvas.getContext("2d");
  if (!ctx) return frame;
  ctx.fillStyle = "#fff"; // paper colour where the margin leaves the frame
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(-paper.angle);
  ctx.translate(-paper.cx, -paper.cy);
  ctx.drawImage(frame, 0, 0);
  return canvas;
}

function roundedQuad(ctx: CanvasRenderingContext2D, quad: Point[], radius: number) {
  const corner = (i: number) => quad[i % 4];
  ctx.beginPath();
  ctx.moveTo((quad[0][0] + quad[1][0]) / 2, (quad[0][1] + quad[1][1]) / 2);
  for (let i = 1; i <= 4; i++) ctx.arcTo(corner(i)[0], corner(i)[1], corner(i + 1)[0], corner(i + 1)[1], radius);
  ctx.closePath();
}

const quadRadius = (quad: Point[], size: number) =>
  Math.min(size, ...quad.map((p, i) => Math.hypot(quad[(i + 1) % 4][0] - p[0], quad[(i + 1) % 4][1] - p[1]) / 4));

// Rainbow edge with a soft glow: wide faint strokes under a crisp one, in a turning conic gradient.
function magicEdge(ctx: CanvasRenderingContext2D, quad: Point[], time: number, { width, glow, alpha }: { width: number; glow: number; alpha: number }) {
  const cx = quad.reduce((s, p) => s + p[0], 0) / 4, cy = quad.reduce((s, p) => s + p[1], 0) / 4;
  const gradient = ctx.createConicGradient(time / 700, cx, cy);
  MAGIC.forEach((color, i) => gradient.addColorStop(i / (MAGIC.length - 1), color));
  const radius = quadRadius(quad, width * 10);
  ctx.save();
  ctx.strokeStyle = gradient;
  ctx.lineJoin = "round";
  for (const [scale, a] of [[10, 0.08], [6, 0.16], [3, 0.4], [1, 1]]) {
    ctx.globalAlpha = alpha * a;
    ctx.lineWidth = width * (scale === 1 ? 1 : scale * glow);
    roundedQuad(ctx, quad, radius);
    ctx.stroke();
  }
  ctx.restore();
}

// A soft band of light sweeping diagonally across the picture while it is read.
function shimmer(ctx: CanvasRenderingContext2D, quad: Point[], time: number, alpha: number) {
  const xs = quad.map((p) => p[0]), ys = quad.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const [w, h] = [x1 - x0, y1 - y0];
  const p = 0.2 + ((time / 1800) % 1) * 0.6; // the band enters and leaves outside the picture
  const gradient = ctx.createLinearGradient(x0 - w / 2, y0 - h / 2, x1 + w / 2, y1 + h / 2);
  gradient.addColorStop(p - 0.08, "rgba(255, 255, 255, 0)");
  gradient.addColorStop(p, `rgba(255, 255, 255, ${0.45 * alpha})`);
  gradient.addColorStop(p + 0.08, "rgba(255, 255, 255, 0)");
  ctx.save();
  roundedQuad(ctx, quad, quadRadius(quad, 24));
  ctx.clip();
  ctx.fillStyle = gradient;
  ctx.fillRect(x0, y0, w, h);
  ctx.restore();
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Live camera with a glowing outline around the receipt. Captures by itself once the text is readable and steady,
// then zooms into the receipt and keeps it on screen while it is read.
export function ReceiptCamera({
  onCapture,
  onDone,
  onCancel,
  onUnavailable,
}: {
  onCapture: (frame: HTMLCanvasElement) => Promise<void>;
  onDone: () => void;
  onCancel: () => void;
  onUnavailable: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLCanvasElement>(null);
  const captureRef = useRef<() => void>(() => {});
  const [hint, setHint] = useState("Starter kamera…");
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState(0);
  const capture = useEffectEvent(onCapture);
  const done = useEffectEvent(onDone);
  const unavailable = useEffectEvent(onUnavailable);
  const cancel = useEffectEvent(() => !processing && onCancel());

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && cancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => setMessage((i) => Math.min(i + 1, MESSAGES.length - 1)), MESSAGE_MS);
    return () => clearInterval(timer);
  }, [processing]);

  useEffect(() => {
    const video = videoRef.current!;
    const stage = stageRef.current!;
    let stream: MediaStream | undefined;
    let live = true;
    let running = true;
    let last = null as TextOutline | null;
    let stableSince = 0;
    let readable = false;
    let shown: Rect | null = null;
    let opacity = 0;
    let zoom: Zoom | null = null;
    let lastFrame = performance.now();
    const stop = () => {
      live = false;
      stream?.getTracks().forEach((track) => track.stop());
    };

    captureRef.current = () => {
      if (!live || !video.videoWidth) return;
      const frame = document.createElement("canvas");
      frame.width = video.videoWidth;
      frame.height = video.videoHeight;
      frame.getContext("2d")?.drawImage(video, 0, 0);
      const paper = last ? paperOf(last) : { cx: frame.width / 2, cy: frame.height / 2, w: frame.width, h: frame.height, angle: 0 };
      const crop = cropPaper(frame, paper);
      stop();
      zoom = { frame, crop, paper, start: performance.now() };
      setProcessing(true);
      Promise.all([capture(crop), new Promise((resolve) => setTimeout(resolve, MIN_PROCESSING_MS))]).then(() => done());
    };

    const drawLive = (ctx: CanvasRenderingContext2D, time: number, ease: number, dpr: number) => {
      const W = video.videoWidth, H = video.videoHeight;
      if (!W) return;
      const { width: cw, height: ch } = stage;
      const k = Math.min(cw / W, ch / H), ox = (cw - W * k) / 2, oy = (ch - H * k) / 2;
      const target = last && paperOf(last);
      if (target) {
        const from = shown ?? target;
        shown = { cx: lerp(from.cx, target.cx, ease), cy: lerp(from.cy, target.cy, ease), w: lerp(from.w, target.w, ease), h: lerp(from.h, target.h, ease), angle: lerp(from.angle, target.angle, ease) };
      }
      opacity += ((target ? 1 : 0) - opacity) * ease;
      if (!shown || opacity < 0.01) {
        if (!target) shown = null; // faded out; the next outline starts where it is found
        return;
      }
      const quad = corners(shown).map(([x, y]): Point => [ox + x * k, oy + y * k]);
      ctx.globalAlpha = opacity;
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.fillRect(0, 0, cw, ch);
      roundedQuad(ctx, quad, quadRadius(quad, 25 * dpr));
      ctx.globalCompositeOperation = "destination-out";
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      const progress = readable ? Math.min(1, (performance.now() - stableSince) / STABLE_MS) : 0;
      magicEdge(ctx, quad, time, { width: 2.5 * dpr, glow: readable ? 1 + progress : 0.6, alpha: opacity * (readable ? 1 : 0.5) });
    };

    // The frozen frame moves, turns and scales so the receipt ends upright and as large as fits, while the
    // surroundings fade to black.
    const drawZoom = (ctx: CanvasRenderingContext2D, time: number, { frame, crop, paper, start }: Zoom, dpr: number) => {
      const { width: cw, height: ch } = stage;
      const k = Math.min(cw / frame.width, ch / frame.height);
      const top = 80 * dpr, side = 24 * dpr, bottom = 40 * dpr;
      const k1 = Math.min((cw - 2 * side) / paper.w, (ch - top - bottom) / paper.h);
      const t = Math.min(1, (time - start) / ZOOM_MS);
      const e = 1 - (1 - t) ** 3;
      const cx = lerp((cw - frame.width * k) / 2 + paper.cx * k, cw / 2, e);
      const cy = lerp((ch - frame.height * k) / 2 + paper.cy * k, top + (ch - top - bottom) / 2, e);
      const angle = paper.angle * (1 - e);
      const scale = k * (k1 / k) ** e;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, cw, ch);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.scale(scale, scale);
      ctx.save();
      ctx.globalAlpha = 0.65 * (1 - e);
      ctx.rotate(-paper.angle);
      ctx.translate(-paper.cx, -paper.cy);
      ctx.drawImage(frame, 0, 0);
      ctx.restore();
      ctx.drawImage(crop, -paper.w / 2, -paper.h / 2, paper.w, paper.h);
      ctx.restore();

      const quad = corners({ cx, cy, w: paper.w * scale, h: paper.h * scale, angle });
      shimmer(ctx, quad, time, e);
      magicEdge(ctx, quad, time, { width: 2.5 * dpr, glow: 1.2 + 0.3 * Math.sin(time / 300), alpha: 1 });
    };

    // Detection runs in the worker; drawing follows the latest result on every display frame.
    const render = (time: number) => {
      if (!running) return;
      const ease = 1 - Math.exp(-(time - lastFrame) / 60);
      lastFrame = time;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = Math.round(stage.clientWidth * dpr), ch = Math.round(stage.clientHeight * dpr);
      if (stage.width !== cw || stage.height !== ch) {
        stage.width = cw;
        stage.height = ch;
      }
      const ctx = stage.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, cw, ch);
        if (zoom) drawZoom(ctx, time, zoom, dpr);
        else drawLive(ctx, time, ease, dpr);
      }
      requestAnimationFrame(render);
    };

    const update = (outline: TextOutline | null, W: number, H: number) => {
      const now = performance.now();
      const moved =
        !outline ||
        !last ||
        Math.hypot(outline.cx - last.cx, outline.cy - last.cy) > 0.02 * Math.max(W, H) ||
        Math.abs(outline.area / last.area - 1) > 0.1;
      if (moved) stableSince = now;
      last = outline;
      readable = !!outline && outline.lineHeight >= MIN_LINE_HEIGHT;
      const ready = readable && now - stableSince >= STABLE_MS;
      setHint(!outline ? "Hold kameraet tæt på kasserapporten" : !readable ? "Kom tættere på" : "Hold stille");
      if (ready) captureRef.current();
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
        });
        if (!live) return stop();
        video.srcObject = stream;
        await video.play();
      } catch {
        if (live) unavailable();
        return;
      }
      requestAnimationFrame(render);
      // Two detections in flight: the worker prepares one frame while the model runs the other.
      let next = 0, applied = -1;
      const track = async () => {
        while (live) {
          const W = video.videoWidth, H = video.videoHeight;
          if (!W) {
            await new Promise((resolve) => setTimeout(resolve, 50));
            continue;
          }
          const n = next++;
          // Track around the last outline; scan the whole frame now and then to catch a receipt that moved.
          const region = last && n % FULL_FRAME_EVERY ? around(last.corners, W, H) : undefined;
          const rects = (await detectText(video, LIVE_SCALE, region)).filter((r) => Math.min(r.w, r.h) < Math.min(W, H) / 10);
          if (!live || n < applied) continue;
          applied = n;
          update(rects.length >= 8 ? textOutline(rects) : null, W, H);
        }
      };
      track();
      track();
    })();
    return () => {
      stop();
      running = false;
    };
  }, []);

  return createPortal(
    <div className="dark fixed inset-0 z-50 bg-background text-foreground" role="dialog" aria-modal="true" aria-label="Kamera">
      <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 size-full object-contain" />
      <canvas ref={stageRef} className="absolute inset-0 size-full" />
      <p
        key={processing ? message : "hint"}
        role="status"
        className="absolute top-4 left-1/2 flex -translate-x-1/2 animate-in items-center gap-2 whitespace-nowrap rounded-full bg-background/80 px-4 py-2 font-medium shadow-sm backdrop-blur-sm fade-in slide-in-from-top-1"
      >
        {processing && <SparklesIcon className="size-4" />}
        {processing ? MESSAGES[message] : hint}
      </p>
      {!processing && (
        <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-8 pb-safe-inset">
          <Button size="lg" variant="secondary" onClick={onCancel} autoFocus>
            Annullér
          </Button>
          <button
            type="button"
            aria-label="Tag billede"
            onClick={() => captureRef.current()}
            className="size-20 rounded-full border-4 border-primary bg-background shadow-md outline-none focus-visible:ring-4 focus-visible:ring-ring"
          />
        </div>
      )}
    </div>,
    document.body,
  );
}
