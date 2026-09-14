"use client";

import { useState } from "react";
import { PrinterIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { LabelPrinter } from "@/hooks/use-label-printer";
import { labelFormats, type LabelFormat } from "@/lib/date-label-print";

type PrinterSetupProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  printer: LabelPrinter;
  format: LabelFormat;
  onFormatChange: (format: LabelFormat) => void;
};

export function PrinterSetup(props: PrinterSetupProps) {
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!props.printer.busy) props.onOpenChange(open);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tilslut etiketprinter</DialogTitle>
          <DialogDescription>
            Par denne enhed med en printer. Valget huskes for lokationen på
            denne enhed.
          </DialogDescription>
        </DialogHeader>
        <PrinterForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

function defaultHost() {
  if (
    typeof navigator !== "undefined" &&
    (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1))
  )
    return "";
  return "localhost";
}

function PrinterForm({
  printer,
  format,
  onFormatChange,
  onOpenChange,
}: PrinterSetupProps) {
  const [host, setHost] = useState(
    () => printer.pairing?.host ?? defaultHost(),
  );
  const [selected, setSelected] = useState<string | null>(
    printer.pairing?.printer ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const connected =
    printer.connected && printer.host === host.trim().toLowerCase();
  const options = connected
    ? printer.printers.map((name) => ({ value: name, label: name }))
    : [];
  const canPair = connected && selected && printer.printers.includes(selected);
  const saved =
    printer.pairing?.host === host.trim().toLowerCase() &&
    printer.pairing.printer === selected;

  async function connect() {
    setError(null);
    try {
      const printers = await printer.connect(host);
      setHost(host.trim().toLowerCase());
      setSelected(
        selected && printers.includes(selected)
          ? selected
          : printers.length === 1
            ? printers[0]
            : null,
      );
      if (!printers.length)
        setError(
          "Ingen printere fundet. Installér printerens driver på computeren med QZ Tray",
        );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Printerne kunne ikke findes",
      );
    }
  }
  async function testPrint() {
    setError(null);
    try {
      const now = Math.floor(Date.now() / 60_000) * 60_000;
      await printer.print(
        {
          productName: "Testetiket",
          locationName: "Datomærkning",
          producedAt: now,
          expiresAt: now + 86_400_000,
        },
        format,
        1,
      );
      toast.success("Testetiketten er sendt til printerkøen");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Testetiketten kunne ikke printes",
      );
    }
  }
  return (
    <>
      <FieldGroup>
        <Field>
          <div className="flex items-center gap-2">
            <FieldLabel htmlFor="printer-host">Printtjeneste</FieldLabel>
            <HelpTooltip
              label="printtjeneste"
              content="På en computer med QZ Tray: brug localhost. På en tablet: brug værtsnavnet på en computer med QZ Tray på samme netværk. Det er printtjenestens adresse, ikke printerens."
            />
          </div>
          <div className="flex gap-2">
            <Input
              id="printer-host"
              value={host}
              onChange={(event) => {
                setHost(event.target.value);
                setSelected(null);
              }}
              placeholder="print.example.dk"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={printer.busy}
              className="h-11 min-w-0"
            />
            <Button
              variant="outline"
              className="min-h-11 shrink-0"
              disabled={printer.busy || !host.trim()}
              onClick={() => void connect()}
            >
              {printer.busy ? <Spinner data-icon="inline-start" /> : null}Find
              printere
            </Button>
          </div>
          {connected ? (
            <FieldDescription>Forbundet med {printer.host}</FieldDescription>
          ) : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="paired-printer">Printer</FieldLabel>
          <Select
            items={options}
            value={
              options.some((item) => item.value === selected) ? selected : null
            }
            onValueChange={setSelected}
            disabled={printer.busy || !options.length}
          >
            <SelectTrigger id="paired-printer" className="h-11! w-full">
              <SelectValue placeholder="Find printere, og vælg en printer" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {options.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {printer.pairing ? (
            <FieldDescription>
              Gemt printer: {printer.pairing.printer}
            </FieldDescription>
          ) : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="label-format">Etiketstørrelse</FieldLabel>
          <Select
            items={labelFormats}
            value={format}
            onValueChange={(value) => {
              if (value) onFormatChange(value);
            }}
            disabled={printer.busy}
          >
            <SelectTrigger id="label-format" className="h-11! w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {labelFormats.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
      <Alert>
        <PrinterIcon />
        <AlertTitle>QZ Tray skal være installeret</AlertTitle>
        <AlertDescription>
          <p>
            Installér QZ Tray og printerens driver på en computer. En tablet
            bruger computerens printtjeneste over en sikker forbindelse.
          </p>
          <p>
            <a
              href="https://qz.io/download/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              Hent QZ Tray
            </a>
            {" · "}
            <a
              href="https://qz.io/docs/print-server"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              Opsæt printtjeneste til tablets
            </a>
          </p>
        </AlertDescription>
      </Alert>
      {connected && !printer.signed ? (
        <p className="text-sm text-muted-foreground">
          Godkend print i QZ Tray. En Administrator kan konfigurere signering,
          så print kan godkendes én gang og huskes.
        </p>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="min-h-11"
          disabled={printer.busy || !saved}
          onClick={() => void testPrint()}
        >
          <PrinterIcon data-icon="inline-start" />
          Print testetiket
        </Button>
        {printer.pairing ? (
          <Button
            variant="ghost"
            className="min-h-11"
            disabled={printer.busy}
            onClick={() => {
              printer.forget();
              setSelected(null);
              toast.success("Printervalget er fjernet fra denne enhed");
            }}
          >
            Glem printer
          </Button>
        ) : null}
      </div>
      <DialogFooter>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={printer.busy}
          onClick={() => onOpenChange(false)}
        >
          Luk
        </Button>
        <Button
          className="min-h-11"
          disabled={printer.busy || !canPair}
          onClick={() => {
            if (!selected) return;
            try {
              printer.pair(host, selected);
              toast.success("Printeren er parret med denne enhed");
              onOpenChange(false);
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Printeren kunne ikke parres",
              );
            }
          }}
        >
          Par printer
        </Button>
      </DialogFooter>
    </>
  );
}
