import { z } from "zod";
import { labelFormats, type LabelFormat } from "./date-label-print";

export const printerRequestSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("certificate"),
      locationId: z.string().min(1).max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("find"),
      locationId: z.string().min(1).max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("print"),
      locationId: z.string().min(1).max(100),
      printer: z
        .string()
        .min(1)
        .max(250)
        .regex(/^[^\x00-\x1f]+$/),
      format: z.enum(["62x29", "62x40", "90x29"]),
      copies: z.number().int().min(1).max(100),
      image: z
        .string()
        .max(1_000_000)
        .regex(/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/),
    })
    .strict(),
]);

export type PrinterRequest = z.infer<typeof printerRequestSchema>;

export const printerResponseSchema = z.object({
  certificate: z.string().nullable(),
  signature: z.string(),
  hash: z.string().nullable(),
  timestamp: z.number(),
});

export function qzPrintOptions(format: LabelFormat, copies: number) {
  const size = labelFormats.find((item) => item.value === format)!;
  return {
    colorType: "blackwhite" as const,
    copies,
    density: 300,
    jobName: "Datomærkning",
    margins: 0,
    scaleContent: true,
    size: { width: size.width, height: size.height },
    units: "mm" as const,
  };
}

export function qzPrintJob(
  printer: string,
  image: string,
  format: LabelFormat,
  copies: number,
) {
  // Keep the full QZ 2.2+ option set identical on both sides of the signature.
  return {
    printer: { name: printer },
    options: Object.assign(
      {
        bounds: null,
        colorType: "color" as const,
        copies: 1,
        density: 0,
        duplex: false,
        fallbackDensity: null,
        interpolation: "bicubic" as const,
        jobName: null,
        legacy: false,
        margins: 0,
        orientation: null,
        paperThickness: null,
        printerTray: null,
        rasterize: false,
        rotation: 0,
        scaleContent: true,
        size: null,
        units: "in" as const,
        forceRaw: false,
        encoding: null,
        spool: null,
      },
      qzPrintOptions(format, copies),
    ),
    data: [
      {
        type: "pixel" as const,
        format: "image" as const,
        flavor: "base64" as const,
        data: image,
      },
    ],
  };
}
