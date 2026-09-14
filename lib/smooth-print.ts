import { z } from "zod";
import type { LabelFormat } from "./date-label-print";

export const smoothPrintDownloadUrl =
  "https://support.brother.com/g/s/es/htmldoc/smoothprint/overview/download/";

export function smoothPrintPlatform(): "ios" | "android" | null {
  if (typeof navigator === "undefined") return null;
  if (/Android/i.test(navigator.userAgent)) return "android";
  if (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  )
    return "ios";
  return null;
}

export const smoothPrintConnectionSchema = z.object({
  model: z.enum(["QL-820NWB", "QL-820NWBc"]),
  connection: z.enum(["WiFi", "BT"]),
  address: z.string().trim(),
  serial: z.string().trim().max(100),
});
export type SmoothPrintConnection = z.infer<typeof smoothPrintConnectionSchema>;

function appUrl(action: "connect" | "print", params: Record<string, string>) {
  return `brotherwebprint://${action}?${Object.entries(params)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&")}`;
}

export function smoothPrintConnectUrl(
  input: SmoothPrintConnection,
  platform: "ios" | "android",
) {
  const settings = smoothPrintConnectionSchema.parse(input);
  if (
    settings.connection === "WiFi" &&
    !z.ipv4().safeParse(settings.address).success
  )
    throw new Error("Angiv printerens IP-adresse, f.eks. 192.168.1.50");
  if (settings.connection === "BT") {
    if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(settings.address))
      throw new Error(
        "Angiv printerens Bluetooth-adresse, f.eks. 00:11:22:33:44:55",
      );
    if (platform === "ios" && !settings.serial)
      throw new Error(
        "Angiv printerens serienummer for Bluetooth på iPad eller iPhone",
      );
  }
  return appUrl("connect", {
    model: settings.model,
    connecttype: settings.connection,
    connectaddress: settings.address,
    ...(settings.serial ? { serialnum: settings.serial } : {}),
  });
}

export function smoothPrintUrl(
  pdf: string,
  format: LabelFormat,
  copies: number,
) {
  if (!Number.isInteger(copies) || copies < 1 || copies > 100)
    throw new Error("Vælg mellem 1 og 100 etiketter");
  const paper = {
    "62x29": "DieCutW62H29",
    "62x40": "RollW62",
    "90x29": "DieCutW29H90",
  }[format];
  if (!paper || !/^JVBERi0[A-Za-z0-9+/]*={0,2}$/.test(pdf))
    throw new Error("Etiketten kunne ikke klargøres");
  // Each job has its own filename so Smooth Print cannot reuse an earlier label.
  return appUrl("print", {
    filename: `datoetiket-${crypto.randomUUID()}.pdf`,
    fileattach: pdf,
    size: paper,
    copies: String(copies),
    orientation: "portrait",
    printMode: "original",
  });
}
