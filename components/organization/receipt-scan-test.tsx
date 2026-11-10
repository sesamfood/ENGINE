"use client";

import { CameraIcon, CircleCheckIcon, CircleXIcon, ImageIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { loadOcr, readText, type OcrBox, type OcrEngine } from "@/lib/receipt-scan/ocr";
import { ReceiptCamera } from "./receipt-camera";

const LEARNED_KEY = "receipt-scan-learned-labels";

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
      const read = await readText(bitmap);
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
          onCapture={runScan}
          onDone={() => setCameraOpen(false)}
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
