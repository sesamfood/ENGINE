"use client";

import { CameraIcon, CircleCheckIcon, CircleXIcon, ImageIcon } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { usePermission } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import {
  extractReceipt,
  normalizeLabel,
  receiptFields,
  type LearnedLabels,
  type ReceiptField,
} from "@/lib/receipt-scan/extract";
import { textOutline, type Point, type TextOutline } from "@/lib/receipt-scan/geometry";
import { detectText, loadOcr, readText, type OcrBox, type OcrEngine } from "@/lib/receipt-scan/ocr";

const LEARNED_KEY = "receipt-scan-learned-labels";
const LIVE_SCALE = 0.6; // live detection size relative to the frame; smaller misses text that is still readable
const MIN_LINE_HEIGHT = 28; // video pixels; below this rows start to pair wrongly
const STABLE_MS = 1000;

const fieldOptions = Object.entries(receiptFields).map(([value, { label }]) => ({ value: value as ReceiptField, label }));
const amountFormatter = new Intl.NumberFormat("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Scan = { bitmap: ImageBitmap; boxes: OcrBox[]; seconds: number; regions: number };

function readLearned(): LearnedLabels {
  try {
    return JSON.parse(localStorage.getItem(LEARNED_KEY) ?? "{}");
  } catch {
    return {};
  }
}

const themeColor = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function strokePolygon(ctx: CanvasRenderingContext2D, points: number[][], color: string, fillAlpha = 0) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  if (fillAlpha) {
    ctx.globalAlpha = fillAlpha;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.stroke();
}

export function ReceiptScanTest() {
  const canManage = usePermission("organization.settings");
  const [engine, setEngine] = useState<OcrEngine | "loading" | "error">("loading");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState<Scan | null>(null);
  const [learned, setLearned] = useState<LearnedLabels>(() => (typeof window === "undefined" ? {} : readLearned()));
  const [selected, setSelected] = useState<OcrBox | null>(null);
  const [teachField, setTeachField] = useState<ReceiptField>("total");
  const [cameraOpen, setCameraOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const result = useMemo(() => scan && extractReceipt(scan.boxes, learned), [scan, learned]);

  useEffect(() => {
    if (!canManage) return;
    let active = true;
    loadOcr().then(
      (loaded) => active && setEngine(loaded),
      () => active && setEngine("error"),
    );
    return () => {
      active = false;
    };
  }, [canManage]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !scan || !result) return;
    canvas.width = scan.bitmap.width;
    canvas.height = scan.bitmap.height;
    ctx.drawImage(scan.bitmap, 0, 0);
    ctx.lineWidth = Math.max(2, scan.bitmap.width / 500);
    const used = new Map<OcrBox, string>();
    for (const field of Object.values(result.fields)) {
      if (!field) continue;
      used.set(field.label, themeColor("--success"));
      used.set(field.amount, themeColor("--info"));
    }
    const other = themeColor("--destructive");
    for (const b of scan.boxes) {
      if (b === selected) continue;
      ctx.globalAlpha = used.has(b) ? 1 : 0.5;
      strokePolygon(ctx, b.box, used.get(b) ?? other);
    }
    ctx.globalAlpha = 1;
    if (selected) strokePolygon(ctx, selected.box, themeColor("--warning"), 0.25);
  }, [scan, result, selected]);

  async function runScan(source: Blob | HTMLCanvasElement) {
    setBusy(true);
    setSelected(null);
    setStatus("Læser kasserapporten…");
    try {
      const bitmap = await createImageBitmap(source);
      const read = await readText(bitmap, (done, total) => setStatus(`Læser tekst ${done} af ${total}…`));
      const seconds = (read.detectMs + read.readMs) / 1000;
      setScan({ bitmap, boxes: read.boxes, seconds, regions: read.regions });
      setStatus(`Færdig på ${seconds.toFixed(1)} s.`);
    } catch {
      setStatus("");
      toast.error("Billedet kunne ikke læses. Prøv igen.");
    } finally {
      setBusy(false);
    }
  }

  function takePhoto() {
    if (window.isSecureContext && "mediaDevices" in navigator) setCameraOpen(true);
    else fileRef.current?.click();
  }

  function selectBox(event: React.MouseEvent<HTMLCanvasElement>) {
    if (!scan) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * scan.bitmap.width;
    const y = ((event.clientY - rect.top) / rect.height) * scan.bitmap.height;
    setSelected(
      scan.boxes.find((b) => {
        const xs = b.box.map((p) => p[0]), ys = b.box.map((p) => p[1]);
        return x >= Math.min(...xs) && x <= Math.max(...xs) && y >= Math.min(...ys) && y <= Math.max(...ys);
      }) ?? null,
    );
  }

  function saveLearned(next: LearnedLabels) {
    setLearned(next);
    try {
      localStorage.setItem(LEARNED_KEY, JSON.stringify(next));
    } catch {}
  }

  function teach() {
    if (!selected) return;
    const label = normalizeLabel(selected.text);
    saveLearned({ ...learned, [teachField]: [...new Set([...(learned[teachField] ?? []), label])] });
    setSelected(null);
    toast.success(`“${selected.text}” bruges nu som ${receiptFields[teachField].label}.`);
  }

  if (!canManage) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>Du har ikke adgang til at teste scanning af kasserapporter.</AlertDescription>
      </Alert>
    );
  }

  const ready = engine === "webgpu" || engine === "wasm";

  return (
    <div className="flex flex-col gap-6 pb-10">
      <Card className="max-w-3xl">
        <CardHeader>
          <div className="flex items-center gap-1">
            <CardTitle>Scan kasserapport</CardTitle>
            <HelpTooltip
              label="Scan kasserapport"
              content="Teksten læses med en OCR-model, der kører i browseren. Første gang hentes ca. 31 MB. Tryk på en label i billedet for at knytte den til et felt, hvis den ikke bliver genkendt."
            />
          </div>
          <CardDescription>Test aflæsningen af en kasserapport. Billedet behandles kun på denne enhed og gemmes ikke.</CardDescription>
        </CardHeader>
        <CardContent appearance="stacked">
          <div className="flex flex-wrap gap-3">
            <Button size="lg" onClick={takePhoto} disabled={!ready || busy}>
              <CameraIcon data-icon="inline-start" />
              Tag billede
            </Button>
            <Button size="lg" variant="outline" onClick={() => fileRef.current?.click()} disabled={!ready || busy}>
              <ImageIcon data-icon="inline-start" />
              Vælg billede
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) runScan(file);
              }}
            />
          </div>
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            {(engine === "loading" || busy) && <Spinner />}
            {engine === "loading"
              ? "Henter OCR-model…"
              : engine === "error"
                ? "OCR-modellen kunne ikke hentes. Genindlæs siden, og prøv igen."
                : status || "Klar. Tag et billede af kasserapporten."}
          </p>
        </CardContent>
      </Card>

      {scan && result && (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Aflæste værdier</CardTitle>
            </CardHeader>
            <CardContent appearance="stacked">
              <Table>
                <TableBody>
                  {fieldOptions.map(({ value, label }) => {
                    const field = result.fields[value];
                    return (
                      <TableRow key={value}>
                        <TableCell>{label}</TableCell>
                        <TableCell appearance="total" className="text-right">
                          {field ? (
                            value === "transactions" ? field.value : amountFormatter.format(field.value)
                          ) : (
                            <span className="text-muted-foreground">Ikke fundet</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <ul className="flex flex-col gap-2 text-sm">
                {result.checks.map((check) => (
                  <li key={check.label} className="flex items-start gap-2">
                    {check.ok ? (
                      <CircleCheckIcon className="size-5 shrink-0 text-success" aria-label="Stemmer" />
                    ) : (
                      <CircleXIcon className="size-5 shrink-0 text-destructive" aria-label="Stemmer ikke" />
                    )}
                    {check.label}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Billede</CardTitle>
              <CardDescription>Tryk på en label i billedet for at knytte den til et felt.</CardDescription>
            </CardHeader>
            <CardContent appearance="stacked">
              {selected && (
                <div className="flex flex-col gap-3 rounded-lg border p-3">
                  <p className="text-sm">
                    Label: <span className="font-medium">“{selected.text}”</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Select items={fieldOptions} value={teachField} onValueChange={(value) => value && setTeachField(value)}>
                      <SelectTrigger className="min-h-11 min-w-56" aria-label="Felt">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {fieldOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={teach}>Gem</Button>
                    <Button variant="outline" onClick={() => setSelected(null)}>
                      Annullér
                    </Button>
                  </div>
                </div>
              )}
              <canvas
                ref={canvasRef}
                onClick={selectBox}
                className="mx-auto max-h-svh max-w-full cursor-pointer touch-manipulation rounded-md"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Collapsible>
                  <CollapsibleTrigger render={<Button variant="ghost" />}>Rå OCR-tekst</CollapsibleTrigger>
                  <CollapsibleContent>
                    <pre className="whitespace-pre-wrap text-xs text-muted-foreground">
                      {`${scan.regions} tekstområder, ${scan.seconds.toFixed(1)} s, ${engine === "webgpu" ? "WebGPU" : "WASM"}\n\n`}
                      {scan.boxes.map((b) => `${b.text}  (${b.score.toFixed(2)})`).join("\n")}
                    </pre>
                  </CollapsibleContent>
                </Collapsible>
                <Button variant="outline" onClick={() => saveLearned({})} disabled={!Object.keys(learned).length}>
                  Nulstil indlærte labels
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {cameraOpen && (
        <ReceiptCamera
          onCapture={(frame) => {
            setCameraOpen(false);
            runScan(frame);
          }}
          onCancel={() => setCameraOpen(false)}
          onUnavailable={() => {
            setCameraOpen(false);
            toast.error("Kameraet er ikke tilgængeligt. Brug Vælg billede.");
          }}
        />
      )}
    </div>
  );
}

// Live camera with an outline around detected text. Captures by itself once the text is readable and steady.
function ReceiptCamera({
  onCapture,
  onCancel,
  onUnavailable,
}: {
  onCapture: (frame: HTMLCanvasElement) => void;
  onCancel: () => void;
  onUnavailable: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const captureRef = useRef<() => void>(() => {});
  const [hint, setHint] = useState("Starter kamera…");
  const capture = useEffectEvent(onCapture);
  const unavailable = useEffectEvent(onUnavailable);
  const cancel = useEffectEvent(onCancel);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && cancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const video = videoRef.current!;
    const overlay = overlayRef.current!;
    let stream: MediaStream | undefined;
    let live = true;
    let last: TextOutline | null = null;
    let stableSince = 0;
    const stop = () => {
      live = false;
      stream?.getTracks().forEach((track) => track.stop());
    };
    captureRef.current = () => {
      if (!live) return;
      const frame = document.createElement("canvas");
      frame.width = video.videoWidth;
      frame.height = video.videoHeight;
      frame.getContext("2d")?.drawImage(video, 0, 0);
      stop();
      capture(frame);
    };

    const colors = { readable: themeColor("--success"), far: themeColor("--warning") };
    let readable = false;
    let shown: Point[] | null = null;

    // Detection runs a few times a second in the worker; the outline eases toward it on every frame.
    const render = () => {
      if (!live) return;
      const W = video.videoWidth, H = video.videoHeight;
      const ctx = overlay.getContext("2d");
      if (W && ctx) {
        if (overlay.width !== W || overlay.height !== H) {
          overlay.width = W;
          overlay.height = H;
        }
        const target = last?.corners;
        shown = target ? (shown ? shown.map(([x, y], i) => [x + (target[i][0] - x) * 0.35, y + (target[i][1] - y) * 0.35]) : target) : null;
        ctx.clearRect(0, 0, W, H);
        if (shown) {
          ctx.lineWidth = Math.max(W, H) / 150;
          ctx.lineJoin = "round";
          strokePolygon(ctx, shown, readable ? colors.readable : colors.far, 0.15);
        }
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
      setHint(!outline ? "Hold kameraet tæt på kasserapporten" : !readable ? "Kom tættere på" : ready ? "Tager billede…" : "Hold stille");
      if (ready) captureRef.current();
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        });
        if (!live) return stop();
        video.srcObject = stream;
        await video.play();
      } catch {
        if (live) unavailable();
        return;
      }
      requestAnimationFrame(render);
      while (live) {
        const W = video.videoWidth, H = video.videoHeight;
        if (!W) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          continue;
        }
        const rects = (await detectText(video, Math.max(W, H) * LIVE_SCALE)).filter((r) => Math.min(r.w, r.h) < Math.min(W, H) / 10);
        if (live) update(rects.length >= 8 ? textOutline(rects) : null, W, H);
      }
    })();
    return stop;
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 bg-background" role="dialog" aria-modal="true" aria-label="Kamera">
      <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 size-full object-contain" />
      <canvas ref={overlayRef} className="absolute inset-0 size-full object-contain" />
      <p
        role="status"
        className="absolute top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-background/90 px-4 py-2 font-medium shadow-sm"
      >
        {hint}
      </p>
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
    </div>,
    document.body,
  );
}
