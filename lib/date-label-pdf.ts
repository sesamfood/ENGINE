import { degrees, PDFDocument } from "pdf-lib";
import { labelFormats, type LabelFormat } from "./date-label-print";

export async function dateLabelPdf(image: string, format: LabelFormat) {
  const size = labelFormats.find((item) => item.value === format);
  if (!size) throw new Error("Vælg en gyldig etiketstørrelse");
  const pdf = await PDFDocument.create();
  const png = await pdf.embedPng(image);
  const width = (size.width * 72) / 25.4;
  const height = (size.height * 72) / 25.4;
  // The 90 × 29 layout is printed lengthways on a 29 mm roll.
  const rotated = format === "90x29";
  const page = pdf.addPage(rotated ? [height, width] : [width, height]);
  page.drawImage(png, {
    x: rotated ? height : 0,
    y: 0,
    width,
    height,
    rotate: degrees(rotated ? 90 : 0),
  });
  return pdf.saveAsBase64();
}
