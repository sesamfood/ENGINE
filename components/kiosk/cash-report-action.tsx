"use client";

import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { CameraIcon, CircleCheckIcon, ImageIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ReceiptCamera } from "@/components/organization/receipt-camera";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import {
  cashReportFields,
  comparedCashReportFields,
  type CashReportField,
  type CashReportValues,
  type ComparedCashReportField,
} from "@/lib/cash-report";
import { dateTimeFormatter } from "@/lib/date";
import { extractReceipt, parseAmount } from "@/lib/receipt-scan/extract";
import { readText } from "@/lib/receipt-scan/ocr";
import { getUserErrorMessage } from "@/lib/user-errors";

export type CashReport = NonNullable<FunctionReturnType<typeof api.kioskDay.getCashReport>>;
type Inputs = Record<CashReportField, string>;

const amountFormatter = new Intl.NumberFormat("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signedFormatter = new Intl.NumberFormat("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "always" });
const emptyInputs = Object.fromEntries(cashReportFields.map(({ id }) => [id, ""])) as Inputs;

// Amounts are stored in øre; transactions is a plain count.
const toMinor = (field: CashReportField, value: number) => (field === "transactions" ? value : Math.round(value * 100));
const format = (field: CashReportField, minor: number) =>
  field === "transactions" ? String(minor) : amountFormatter.format(minor / 100);

function parse(field: CashReportField, input: string): number | null | "invalid" {
  if (!input.trim()) return null;
  const value = parseAmount(input);
  if (value === null || (field === "transactions" && !Number.isInteger(value))) return "invalid";
  return toMinor(field, value);
}

const isCompared = (field: CashReportField): field is ComparedCashReportField =>
  (comparedCashReportFields as readonly string[]).includes(field);

export function CashReportAction({
  title,
  report,
  preview,
  simulated,
  timeZone,
}: {
  title: string;
  report: CashReport | null | undefined;
  preview: boolean;
  simulated: boolean;
  timeZone: string | null;
}) {
  const save = useMutation(api.kioskDay.saveCashReport);
  const [open, setOpen] = useState(false);
  const [scanner, setScanner] = useState<"camera" | ImageBitmap | null>(null);
  const [inputs, setInputs] = useState(emptyInputs);
  const [pending, setPending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraFileRef = useRef<HTMLInputElement>(null);
  const saved = report?.saved ?? null;
  const sales = report?.sales ?? null;
  const parsed = Object.fromEntries(cashReportFields.map(({ id }) => [id, parse(id, inputs[id])])) as Record<
    CashReportField,
    number | null | "invalid"
  >;
  const invalid = Object.values(parsed).includes("invalid");
  const mismatch =
    sales !== null &&
    comparedCashReportFields.some((id) => typeof parsed[id] === "number" && parsed[id] !== sales[id]);
  const time = dateTimeFormatter("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: timeZone ?? undefined });

  function takePhoto() {
    if (window.isSecureContext && "mediaDevices" in navigator) setScanner("camera");
    else cameraFileRef.current?.click();
  }

  function start() {
    setInputs(
      saved
        ? (Object.fromEntries(
            cashReportFields.map(({ id }) => [id, saved.values[id] === null ? "" : format(id, saved.values[id])]),
          ) as Inputs)
        : emptyInputs,
    );
    setOpen(true);
    if (!saved) takePhoto();
  }

  function openPicture(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) createImageBitmap(file).then(setScanner, () => toast.error("Billedet kunne ikke åbnes. Prøv et andet."));
  }

  async function read(source: HTMLCanvasElement) {
    try {
      const bitmap = await createImageBitmap(source);
      const { boxes } = await readText(bitmap);
      bitmap.close();
      const { fields } = extractReceipt(boxes);
      setInputs(
        Object.fromEntries(
          cashReportFields.map(({ id }) => {
            const field = fields[id];
            return [id, field ? format(id, toMinor(id, field.value)) : ""];
          }),
        ) as Inputs,
      );
    } catch {
      toast.error("Billedet kunne ikke læses. Prøv igen, eller indtast tallene.");
    }
  }

  async function submit() {
    if (invalid) return;
    setPending(true);
    try {
      await save({ values: parsed as CashReportValues, ...(simulated ? { simulateEndOfDay: true } : {}) });
      toast.success("Kasserapporten er gemt");
      setOpen(false);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Kasserapporten kunne ikke gemmes. Prøv igen."));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        variant={saved ? "default" : "outline"}
        size="lg"
        disabled={preview || !report}
        aria-label={`${title}: ${saved ? "gemt, åbn kasserapporten" : "scan kasserapporten"}`}
        onClick={start}
      >
        {saved ? "Udført" : "Scan kasserapport"}
        {saved ? <CircleCheckIcon data-icon="inline-end" /> : <CameraIcon data-icon="inline-end" />}
      </Button>
      {/* Without `capture` the device offers its photo library; with it, the camera opens directly. */}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={openPicture} />
      <input ref={cameraFileRef} type="file" accept="image/*" capture="environment" hidden onChange={openPicture} />

      {/* The dialog steps aside while the full-screen camera is open. */}
      <Dialog open={open && !scanner} onOpenChange={setOpen}>
        <DialogContent className="max-h-(--spacing-viewport-inset) overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Kasserapport</DialogTitle>
            <DialogDescription>
              Tjek tallene fra kasserapporten, og ret dem, hvis de er læst forkert.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="lg" onClick={takePhoto}>
              <CameraIcon data-icon="inline-start" />
              Tag billede
            </Button>
            <Button variant="outline" size="lg" onClick={() => fileRef.current?.click()}>
              <ImageIcon data-icon="inline-start" />
              Vælg billede
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {cashReportFields.map(({ id, label }) => {
              const value = parsed[id];
              const engine = sales && isCompared(id) ? sales[id] : null;
              return (
                <Field key={id} data-invalid={value === "invalid" || undefined}>
                  <FieldLabel htmlFor={`cash-report-${id}`}>{label}</FieldLabel>
                  <Input
                    id={`cash-report-${id}`}
                    inputMode={id === "transactions" ? "numeric" : "decimal"}
                    appearance="amount"
                    value={inputs[id]}
                    aria-invalid={value === "invalid" || undefined}
                    onChange={(event) => setInputs((current) => ({ ...current, [id]: event.target.value }))}
                  />
                  {value === "invalid" ? (
                    <FieldError>Skriv et tal{id === "transactions" ? " uden decimaler" : ""}.</FieldError>
                  ) : engine !== null ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <FieldDescription>Engine: {format(id, engine)}</FieldDescription>
                      {typeof value === "number" ? (
                        value === engine ? (
                          <Badge variant="success">Stemmer</Badge>
                        ) : (
                          <Badge variant="destructive">
                            Forskel {id === "transactions" ? String(value - engine) : signedFormatter.format((value - engine) / 100)}
                          </Badge>
                        )
                      ) : null}
                    </div>
                  ) : null}
                </Field>
              );
            })}
          </div>
          <p className="text-sm text-muted-foreground">
            {sales
              ? `Engine viser salget i butikken siden kl. ${time.format(sales.since)}. Seneste salg er kl. ${time.format(sales.latestSaleAt)}.`
              : "Engine har ingen salg for i dag, så tallene kan ikke sammenlignes."}
          </p>
          {mismatch ? (
            <Alert>
              <AlertDescription>
                Nogle tal afviger fra Engine. Du kan stadig gemme, og afvigelsen gemmes med kasserapporten.
              </AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button size="lg" variant="outline" onClick={() => setOpen(false)}>
              Annullér
            </Button>
            <Button size="lg" disabled={pending || invalid || !inputs.total.trim()} onClick={submit}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Gem kasserapport
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {scanner && (
        <ReceiptCamera
          image={scanner === "camera" ? undefined : scanner}
          onCapture={read}
          onDone={() => setScanner(null)}
          onCancel={() => setScanner(null)}
          onUnavailable={() => {
            setScanner(null);
            toast.error("Kameraet er ikke tilgængeligt. Brug Vælg billede.");
          }}
        />
      )}
    </>
  );
}
