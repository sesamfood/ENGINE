"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PrinterIcon } from "lucide-react";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { useSmoothPrint } from "@/hooks/use-smooth-print";
import { labelFormats, printDateLabels } from "@/lib/date-label-print";
import { useLabelFormat } from "@/lib/date-label-prefs";
import {
  smoothPrintConnectUrl,
  smoothPrintDownloadUrl,
  type SmoothPrintConnection,
} from "@/lib/smooth-print";

const models = [
  { value: "QL-820NWB", label: "Brother QL-820NWB" },
  { value: "QL-820NWBc", label: "Brother QL-820NWBc" },
];
const connections = [
  { value: "WiFi", label: "Wi-Fi" },
  { value: "BT", label: "Bluetooth" },
];

export function PrinterSettings({
  locationId,
}: {
  locationId: Id<"locations"> | null;
}) {
  const labelSettings = useQuery(
    api.dateLabels.getSettings,
    locationId ? { locationId } : "skip",
  );
  const [format, onFormatChange] = useLabelFormat();
  const [settings, setSettings] = useState<SmoothPrintConnection>({
    model: "QL-820NWB",
    connection: "WiFi",
    address: "",
    serial: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [testLabel] = useState(() => {
    const now = Math.floor(Date.now() / 60_000) * 60_000;
    return {
      productName: "Testetiket",
      locationName: "Datomærkning",
      producedAt: now,
      expiresAt: now + 86_400_000,
    };
  });
  const label = {
    ...testLabel,
    includeTime: labelSettings?.includeTime ?? false,
  };
  const printer = useSmoothPrint(label, format, 1);

  return (
    <Card id="printer" className="scroll-mt-28">
      <CardHeader>
        <CardTitle>Printer</CardTitle>
        <CardDescription>
          Gælder denne enhed. Etiketstørrelsen gemmes automatisk.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert>
          <PrinterIcon />
          <AlertTitle>Brother Smooth Print</AlertTitle>
          <AlertDescription>
            <a
              href={smoothPrintDownloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              Hent Smooth Print til iPad eller Android
            </a>
          </AlertDescription>
          <AlertAction>
            <HelpTooltip
              label="Brother Smooth Print"
              content="Installér appen på hver tablet. Vælg printeren i Smooth Print via Wi-Fi eller Bluetooth, eller brug felterne herunder. Kontrollér printervalget, når du skifter lokation. Printstatus og fejl vises i Smooth Print."
            />
          </AlertAction>
        </Alert>
        <FieldGroup>
          {printer.platform ? (
            <>
              <Field>
                <FieldLabel htmlFor="printer-model">Printermodel</FieldLabel>
                <Select
                  items={models}
                  value={settings.model}
                  onValueChange={(value) => {
                    if (value === "QL-820NWB" || value === "QL-820NWBc")
                      setSettings({ ...settings, model: value });
                  }}
                >
                  <SelectTrigger id="printer-model" className="h-11! w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {models.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="printer-connection">
                  Forbindelse
                </FieldLabel>
                <Select
                  items={connections}
                  value={settings.connection}
                  onValueChange={(value) => {
                    if (value === "WiFi" || value === "BT")
                      setSettings({
                        ...settings,
                        connection: value,
                        address: "",
                      });
                  }}
                >
                  <SelectTrigger
                    id="printer-connection"
                    className="h-11! w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {connections.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <div className="flex items-center gap-2">
                  <FieldLabel htmlFor="printer-address">
                    {settings.connection === "WiFi"
                      ? "Printerens IP-adresse"
                      : "Printerens Bluetooth-adresse"}
                  </FieldLabel>
                  <HelpTooltip
                    label="printeradresse"
                    content={
                      settings.connection === "WiFi"
                        ? "Brug adressen fra printerens netværksindstillinger. Enheden og printeren skal være på samme netværk."
                        : "Par først printeren i enhedens Bluetooth-indstillinger. Find MAC-adressen i printerens indstillinger, eller vælg printeren direkte i Smooth Print."
                    }
                  />
                </div>
                <Input
                  id="printer-address"
                  value={settings.address}
                  onChange={(event) =>
                    setSettings({ ...settings, address: event.target.value })
                  }
                  placeholder={
                    settings.connection === "WiFi"
                      ? "192.168.1.50"
                      : "00:11:22:33:44:55"
                  }
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="h-11"
                />
              </Field>
              {settings.connection === "BT" && printer.platform === "ios" ? (
                <Field>
                  <div className="flex items-center gap-2">
                    <FieldLabel htmlFor="printer-serial">
                      Printerens serienummer
                    </FieldLabel>
                    <HelpTooltip
                      label="serienummer"
                      content="Serienummeret står på printeren og kræves ved Bluetooth-forbindelse fra iPad og iPhone."
                    />
                  </div>
                  <Input
                    id="printer-serial"
                    value={settings.serial}
                    onChange={(event) =>
                      setSettings({ ...settings, serial: event.target.value })
                    }
                    maxLength={100}
                    autoCorrect="off"
                    spellCheck={false}
                    className="h-11"
                  />
                </Field>
              ) : null}
              <Button
                variant="outline"
                className="min-h-11"
                disabled={!settings.address.trim()}
                onClick={() => {
                  if (!printer.platform) return;
                  try {
                    window.location.assign(
                      smoothPrintConnectUrl(settings, printer.platform),
                    );
                    setConnecting(true);
                    setError(null);
                  } catch (error) {
                    setError(
                      error instanceof Error
                        ? error.message
                        : "Forbindelsen kunne ikke åbnes",
                    );
                  }
                }}
              >
                Tilslut i Smooth Print
              </Button>
              {connecting ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Fuldfør forbindelsen i Smooth Print, og vend tilbage for at
                  printe. Hvis appen ikke åbner, kontrollér at den er
                  installeret, og tillad browseren at åbne den.
                </p>
              ) : null}
            </>
          ) : null}
          <Field>
            <FieldLabel htmlFor="label-format">Etiketstørrelse</FieldLabel>
            <Select
              items={labelFormats}
              value={format}
              onValueChange={(value) => {
                if (value) onFormatChange(value);
              }}
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
            <FieldDescription>
              {format === "62x40"
                ? "Brug en sort/hvid, 62 mm bred endeløs rulle."
                : "Brug udstansede etiketter i den valgte størrelse."}
            </FieldDescription>
          </Field>
        </FieldGroup>
        {error || printer.error ? (
          <Alert variant="destructive">
            <AlertDescription>{error ?? printer.error}</AlertDescription>
          </Alert>
        ) : null}
        {printer.opened ? (
          <p role="status" className="text-sm text-muted-foreground">
            Kontrollér testetiketten i Smooth Print. Hvis appen ikke åbner,
            kontrollér at den er installeret, og tillad browseren at åbne den.
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          className="min-h-11"
          disabled={
            printer.preparing ||
            Boolean(printer.error) ||
            Boolean(locationId && !labelSettings)
          }
          onClick={() => {
            try {
              if (printer.platform) printer.open();
              else printDateLabels(label, format, 1);
              setError(null);
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Testetiketten kunne ikke åbnes",
              );
            }
          }}
        >
          {printer.preparing ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <PrinterIcon data-icon="inline-start" />
          )}
          Print testetiket
        </Button>
      </CardFooter>
    </Card>
  );
}
