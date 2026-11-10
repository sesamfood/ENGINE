"use client";

import { SparklesIcon } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { corners, textOutline, type Point, type Rect, type TextOutline } from "@/lib/receipt-scan/geometry";
import { detectText, type Region } from "@/lib/receipt-scan/ocr";

const LIVE_SCALE = 0.6; // live detection size relative to the frame; smaller misses text that is still readable
const MIN_LINE_HEIGHT = 28; // video pixels; below this rows start to pair wrongly
const LOST_LINE_HEIGHT = 26.5; // a readable receipt stays readable down to here, so the state doesn't flicker
const SHRINK_AFTER = 3; // detections in a row before a smaller or lost outline is believed
const STABLE_MS = 1000;
const FULL_FRAME_EVERY = 15;
const ZOOM_MS = 800;
const MIN_PROCESSING_MS = 1700; // the loading animation shows for a moment even when reading is quick
const UPLOAD_DETECT_SIDE = 1600; // uploads are often full-size photos; finding the receipt doesn't need every pixel
const MESSAGE_MS = 1800;
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

// Points along the edge in the order roundedQuad draws it, starting at the middle of the top edge.
function edgePath(quad: Point[]) {
  const top: Point = [(quad[0][0] + quad[1][0]) / 2, (quad[0][1] + quad[1][1]) / 2];
  const points = [top, quad[1], quad[2], quad[3], quad[0], top];
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  const length = lengths.reduce((a, b) => a + b);
  const at = (fraction: number): Point => {
    let d = (((fraction % 1) + 1) % 1) * length;
    for (const [i, segment] of lengths.entries()) {
      if (d <= segment) return [lerp(points[i][0], points[i + 1][0], d / segment), lerp(points[i][1], points[i + 1][1], d / segment)];
      d -= segment;
    }
    return top;
  };
  return { length, at };
}

// The organization's primary colour and two neighbouring hues, bright enough to glow on a camera image.
function brandPalette() {
  const primary = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "oklch(0.6 0.2 265)";
  const probe = document.createElement("span");
  document.body.append(probe);
  const colors = [-50, 0, 50].map((shift) => {
    probe.style.color = `oklch(from ${primary} 0.82 0.16 calc(h + ${shift}))`;
    return getComputedStyle(probe).color;
  });
  probe.remove();
  return colors;
}

type Comets = { count: number; length: number; width: number; alpha: number };

// Light trails circling the edge: a faint track with comets whose tails fade out behind a bright head. Returns
// where the heads are, as fractions of the edge.
function drawComets(ctx: CanvasRenderingContext2D, quad: Point[], phase: number, palette: string[], { count, length, width, alpha }: Comets) {
  const radius = quadRadius(quad, width * 10);
  const perimeter = edgePath(quad).length - (8 - 2 * Math.PI) * radius;
  ctx.save();
  ctx.lineCap = "round";
  ctx.globalAlpha = alpha * 0.35;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = width * 0.4;
  roundedQuad(ctx, quad, radius);
  ctx.stroke();
  const heads: number[] = [];
  const segments = 10;
  for (let c = 0; c < count; c++) {
    const head = (phase + c / count) % 1;
    heads.push(head);
    ctx.strokeStyle = palette[c % palette.length];
    const piece = (length * perimeter) / segments;
    for (let j = segments - 1; j >= 0; j--) {
      const fade = 1 - j / segments;
      ctx.setLineDash([piece + 1, Math.max(1, perimeter - piece - 1)]);
      ctx.lineDashOffset = -(head * perimeter - (j + 1) * piece);
      ctx.globalAlpha = alpha * fade * fade * 0.3;
      ctx.lineWidth = width * (2 + 4 * fade);
      roundedQuad(ctx, quad, radius);
      ctx.stroke();
      ctx.globalAlpha = alpha * fade;
      ctx.lineWidth = width * (0.5 + fade);
      roundedQuad(ctx, quad, radius);
      ctx.stroke();
    }
  }
  ctx.restore();
  return heads;
}

type Spark = { x: number; y: number; vx: number; vy: number; born: number; life: number; color: string; size: number };

// Four-pointed sparkles that drift outward from the comet heads and fade.
function spawnSparks(sparks: Spark[], quad: Point[], heads: number[], palette: string[], perSecond: number, dt: number, time: number, dpr: number) {
  const path = edgePath(quad);
  const cx = quad.reduce((s, p) => s + p[0], 0) / 4, cy = quad.reduce((s, p) => s + p[1], 0) / 4;
  heads.forEach((head, c) => {
    if (Math.random() > (perSecond * dt) / 1000) return;
    const [x, y] = path.at(head);
    const d = Math.hypot(x - cx, y - cy) || 1;
    const speed = (20 + Math.random() * 40) * dpr;
    sparks.push({
      x, y,
      vx: ((x - cx) / d) * speed + (Math.random() - 0.5) * 30 * dpr,
      vy: ((y - cy) / d) * speed + (Math.random() - 0.5) * 30 * dpr,
      born: time, life: 500 + Math.random() * 600, color: palette[c % palette.length], size: (3 + Math.random() * 4) * dpr,
    });
  });
  if (sparks.length > 80) sparks.splice(0, sparks.length - 80);
}

function drawSparks(ctx: CanvasRenderingContext2D, sparks: Spark[], dt: number, time: number) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    const age = (time - s.born) / s.life;
    if (age >= 1) {
      sparks.splice(i, 1);
      continue;
    }
    s.x += (s.vx * dt) / 1000;
    s.y += (s.vy * dt) / 1000;
    const r = s.size * (1 - age * 0.6);
    ctx.globalAlpha = 1 - age;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4 + age * 2;
      const len = k % 2 ? r * 0.3 : r;
      ctx.lineTo(s.x + Math.cos(a) * len, s.y + Math.sin(a) * len);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// A glowing line sweeping down the picture with a soft trail of light behind it.
function drawScanLine(ctx: CanvasRenderingContext2D, quad: Point[], time: number, color: string, alpha: number, dpr: number) {
  const f = ((time / 2200) % 1) * 1.25 - 0.05; // the trail leaves the picture before the next pass
  const across = (t: number): [Point, Point] => {
    const v = Math.min(1, Math.max(0, t));
    return [
      [lerp(quad[0][0], quad[3][0], v), lerp(quad[0][1], quad[3][1], v)],
      [lerp(quad[1][0], quad[2][0], v), lerp(quad[1][1], quad[2][1], v)],
    ];
  };
  ctx.save();
  roundedQuad(ctx, quad, quadRadius(quad, 24 * dpr));
  ctx.clip();
  ctx.fillStyle = color;
  const bands = 8, trail = 0.14;
  for (let b = 0; b < bands; b++) {
    const [l0, r0] = across(f - trail + (b * trail) / bands), [l1, r1] = across(f - trail + ((b + 1) * trail) / bands);
    ctx.globalAlpha = alpha * 0.35 * ((b + 1) / bands) ** 2;
    ctx.beginPath();
    ctx.moveTo(l0[0], l0[1]);
    ctx.lineTo(r0[0], r0[1]);
    ctx.lineTo(r1[0], r1[1]);
    ctx.lineTo(l1[0], l1[1]);
    ctx.fill();
  }
  const [l, r] = across(f);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14 * dpr;
  ctx.lineWidth = 3 * dpr;
  ctx.beginPath();
  ctx.moveTo(l[0], l[1]);
  ctx.lineTo(r[0], r[1]);
  ctx.stroke();
  ctx.restore();
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Live camera with light trails circling the receipt. Captures by itself once the text is readable and steady,
// then zooms into the receipt and keeps it on screen while it is read. Given an uploaded image instead, it skips
// the camera: the picture is shown while the receipt is found, then zoomed into and read the same way.
export function ReceiptCamera({
  image,
  onCapture,
  onDone,
  onCancel,
  onUnavailable,
}: {
  image?: ImageBitmap;
  onCapture: (frame: HTMLCanvasElement) => Promise<void>;
  onDone: () => void;
  onCancel: () => void;
  onUnavailable: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLCanvasElement>(null);
  const captureRef = useRef<() => void>(() => {});
  const [hint, setHint] = useState("Starter kamera…");
  const [processing, setProcessing] = useState(!!image);
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
    let lastText: Point[] = []; // corners of all text in the last detection, receipt or not
    let anchor = null as TextOutline | null; // where the receipt was when holding still began
    let stableSince = 0;
    let shrinks = 0;
    let readable = false;
    let shown: Rect | null = null;
    let opacity = 0;
    let zoom: Zoom | null = null;
    let lastFrame = performance.now();
    let phase = 0;
    const sparks: Spark[] = [];
    const palette = brandPalette();
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

    const drawLive = (ctx: CanvasRenderingContext2D, time: number, dt: number, ease: number, dpr: number) => {
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
      // Too far: short, slow trails. Readable: faster, and the tails grow while the receipt is held still until
      // they close the loop as the picture is taken.
      const progress = readable ? Math.min(1, (performance.now() - stableSince) / STABLE_MS) : 0;
      phase += (readable ? 0.32 : 0.12) * (dt / 1000);
      const heads = drawComets(ctx, quad, phase, palette, {
        count: 2,
        length: readable ? 0.14 + 0.36 * progress : 0.08,
        width: 2.5 * dpr,
        alpha: opacity * (readable ? 1 : 0.6),
      });
      spawnSparks(sparks, quad, heads, palette, readable ? 16 : 3, dt, time, dpr);
      drawSparks(ctx, sparks, dt, time);
    };

    // The frozen frame moves, turns and scales so the receipt ends upright and as large as fits, while the
    // surroundings fade to black.
    const drawZoom = (ctx: CanvasRenderingContext2D, time: number, dt: number, { frame, crop, paper, start }: Zoom, dpr: number) => {
      const { width: cw, height: ch } = stage;
      const k = Math.min(cw / frame.width, ch / frame.height);
      const top = 32 * dpr, side = 24 * dpr, bottom = 32 * dpr;
      const k1 = Math.min((cw - 2 * side) / paper.w, (ch - top - bottom) / paper.h);
      const t = Math.min(1, Math.max(0, (time - start) / ZOOM_MS));
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
      drawScanLine(ctx, quad, time, palette[1], e, dpr);
      phase += 0.35 * (dt / 1000);
      const heads = drawComets(ctx, quad, phase, palette, { count: 3, length: 0.16, width: 2.5 * dpr, alpha: 1 });
      spawnSparks(sparks, quad, heads, palette, 10, dt, time, dpr);
      drawSparks(ctx, sparks, dt, time);
    };

    // Detection runs in the worker; drawing follows the latest result on every display frame.
    const render = (time: number) => {
      if (!running) return;
      const dt = Math.min(100, time - lastFrame);
      const ease = 1 - Math.exp(-dt / 60);
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
        if (zoom) drawZoom(ctx, time, dt, zoom, dpr);
        else drawLive(ctx, time, dt, ease, dpr);
      }
      requestAnimationFrame(render);
    };

    const update = (found: TextOutline | null, W: number, H: number) => {
      const now = performance.now();
      // A detection that misses part of the receipt, or all of it, is usually noise: a smaller outline only counts
      // once it shows up a few times in a row. A larger one counts straight away.
      const shrank = last && (!found || found.w < last.w * 0.9 || found.h < last.h * 0.9);
      shrinks = shrank ? shrinks + 1 : 0;
      const outline = shrank && shrinks < SHRINK_AFTER ? last : found;
      // Compared with where holding still began, so small shakes and detection noise don't restart the count.
      const moved =
        !outline ||
        !anchor ||
        Math.hypot(outline.cx - anchor.cx, outline.cy - anchor.cy) > 0.03 * Math.max(W, H) ||
        Math.abs(outline.area / anchor.area - 1) > 0.15;
      if (moved) [anchor, stableSince] = [outline, now];
      last = outline;
      readable = !!outline && outline.lineHeight >= (readable ? LOST_LINE_HEIGHT : MIN_LINE_HEIGHT);
      const ready = readable && now - stableSince >= STABLE_MS;
      setHint(!outline ? "Hold kameraet tæt på kasserapporten" : !readable ? "Kom tættere på" : "Hold stille");
      if (ready) captureRef.current();
    };

    if (image) {
      const frame = document.createElement("canvas");
      frame.width = image.width;
      frame.height = image.height;
      frame.getContext("2d")?.drawImage(image, 0, 0);
      const whole: Rect = { cx: frame.width / 2, cy: frame.height / 2, w: frame.width, h: frame.height, angle: 0 };
      zoom = { frame, crop: frame, paper: whole, start: Infinity }; // held at the start pose until the receipt is found
      requestAnimationFrame(render);
      detectText(frame, Math.min(1, UPLOAD_DETECT_SIDE / Math.max(frame.width, frame.height)))
        .then((rects) => (rects.length >= 8 ? textOutline(rects) : null), () => null)
        .then((outline) => {
          if (!running) return;
          const paper = outline ? paperOf(outline) : whole;
          const crop = outline ? cropPaper(frame, paper) : frame;
          zoom = { frame, crop, paper, start: performance.now() };
          return Promise.all([capture(crop), new Promise((resolve) => setTimeout(resolve, MIN_PROCESSING_MS))]).then(() => done());
        });
      return () => {
        running = false;
      };
    }

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
          // Track around the receipt and all other text from the last detection, so a detection that misses part of
          // the receipt can't shrink the next one. The whole frame is scanned now and then to catch a receipt that moved.
          const region = last && n % FULL_FRAME_EVERY ? around([...last.corners, ...lastText], W, H) : undefined;
          const rects = (await detectText(video, LIVE_SCALE, region)).filter((r) => Math.min(r.w, r.h) < Math.min(W, H) / 10);
          if (!live || n < applied) continue;
          applied = n;
          lastText = rects.flatMap(corners);
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
  }, [image]);

  return createPortal(
    <div className="dark fixed inset-0 z-50 bg-background text-foreground" role="dialog" aria-modal="true" aria-label="Kamera">
      <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 size-full object-contain" />
      <canvas ref={stageRef} className="absolute inset-0 size-full" />
      <p
        key={processing ? message : "hint"}
        role="status"
        className={cn(
          "absolute left-1/2 flex -translate-x-1/2 animate-in items-center gap-2 whitespace-nowrap rounded-full bg-background/80 px-4 py-2 font-medium shadow-sm backdrop-blur-sm fade-in",
          processing ? "top-1/2 -translate-y-1/2 zoom-in-95" : "top-4 slide-in-from-top-1",
        )}
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
