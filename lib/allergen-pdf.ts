import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { allergenIconPaths } from "./allergen-icons";
import { allergens, type AllergenId } from "./allergens";
import { sanitizePdfText } from "./own-check-pdf";

// A4 landscape.
const PAGE_WIDTH = 841.89;
const PAGE_HEIGHT = 595.28;
const MARGIN = 16;
const FRAME = 7;
const NAME_WIDTH = 200;
const HEADER_HEIGHT = 68;
const FOOTER_HEIGHT = 26;
const MIN_ROW_HEIGHT = 13;
const MAX_ROW_HEIGHT = 24;

export type AllergenPdfInput = {
  locationName: string;
  primaryColor: string;
  // PNG shown in each cell that contains the allergen; a dot is used without it.
  markPng: Uint8Array | null;
  products: Array<{ name: string; allergens: AllergenId[] }>;
};

function hexColor(value: string) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : "#4F46E5";
  return rgb(
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  );
}

function fitText(text: string, font: PDFFont, size: number, width: number) {
  let value = sanitizePdfText(text);
  if (font.widthOfTextAtSize(value, size) <= width) return value;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}…`, size) > width) value = value.slice(0, -1);
  return `${value}…`;
}

function wrapWords(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const word of text.split(" ")) {
    const last = lines.at(-1);
    if (last && font.widthOfTextAtSize(`${last} ${word}`, size) <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

export async function buildAllergenPdf(input: AllergenPdfInput) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(sanitizePdfText(`Allergener – ${input.locationName}`));
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const primary = hexColor(input.primaryColor);
  const white = rgb(1, 1, 1);
  const mark: PDFImage | null = input.markPng ? await pdf.embedPng(input.markPng) : null;

  const left = MARGIN + FRAME;
  const right = PAGE_WIDTH - MARGIN - FRAME;
  const top = PAGE_HEIGHT - MARGIN - FRAME;
  const bottom = MARGIN + FRAME;
  const columnWidth = (right - left - NAME_WIDTH) / allergens.length;
  const tableHeight = top - HEADER_HEIGHT - bottom - FOOTER_HEIGHT;
  const rowHeight = Math.min(
    MAX_ROW_HEIGHT,
    Math.max(MIN_ROW_HEIGHT, tableHeight / Math.max(input.products.length, 1)),
  );
  const rowsPerPage = Math.max(1, Math.floor(tableHeight / rowHeight));
  const pageCount = Math.max(1, Math.ceil(input.products.length / rowsPerPage));

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const rows = input.products.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage);
    const line = (x1: number, y1: number, x2: number, y2: number) =>
      page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 1.2, color: primary });

    page.drawRectangle({
      x: MARGIN + FRAME / 2,
      y: MARGIN + FRAME / 2,
      width: PAGE_WIDTH - MARGIN * 2 - FRAME,
      height: PAGE_HEIGHT - MARGIN * 2 - FRAME,
      borderColor: primary,
      borderWidth: FRAME,
    });

    // Header: title, then one pictogram per allergen.
    const headerBottom = top - HEADER_HEIGHT;
    const titleSize = 26;
    page.drawText("ALLERGENER", {
      x: left + 8,
      y: headerBottom + HEADER_HEIGHT / 2 - 2,
      size: titleSize,
      font: bold,
      color: primary,
    });
    page.drawText(fitText(input.locationName, bold, 9, NAME_WIDTH - 16), {
      x: left + 9,
      y: headerBottom + 14,
      size: 9,
      font: bold,
      color: primary,
    });
    allergens.forEach((allergen, index) => {
      drawPictogram(page, allergen.id, hexColor(allergen.color), white, left + NAME_WIDTH + columnWidth * (index + 0.5), top - 25, 19);
      const labelLines = wrapWords(sanitizePdfText(allergen.label), bold, 5.5, columnWidth - 4).slice(0, 2);
      labelLines.forEach((text, lineIndex) => {
        page.drawText(text, {
          x: left + NAME_WIDTH + columnWidth * (index + 0.5) - bold.widthOfTextAtSize(text, 5.5) / 2,
          y: top - 52 - lineIndex * 6.5,
          size: 5.5,
          font: bold,
          color: rgb(0.15, 0.15, 0.15),
        });
      });
    });

    // Table grid and rows.
    const tableBottom = headerBottom - rows.length * rowHeight;
    rows.forEach((product, rowIndex) => {
      const rowTop = headerBottom - rowIndex * rowHeight;
      const center = rowTop - rowHeight / 2;
      const nameSize = Math.min(10, rowHeight * 0.55);
      page.drawText(fitText(product.name, bold, nameSize, NAME_WIDTH - 14), {
        x: left + 7,
        y: center - nameSize * 0.35,
        size: nameSize,
        font: bold,
        color: primary,
      });
      const contained = new Set(product.allergens);
      allergens.forEach((allergen, index) => {
        if (!contained.has(allergen.id)) return;
        const x = left + NAME_WIDTH + columnWidth * (index + 0.5);
        if (mark) {
          const size = Math.min(rowHeight - 5, columnWidth - 8, 14);
          const scaled = mark.scaleToFit(size, size);
          page.drawImage(mark, { x: x - scaled.width / 2, y: center - scaled.height / 2, width: scaled.width, height: scaled.height });
        } else {
          page.drawCircle({ x, y: center, size: Math.min(rowHeight / 4, 4.5), color: primary });
        }
      });
      line(left, rowTop - rowHeight, right, rowTop - rowHeight);
    });
    line(left, headerBottom, right, headerBottom);
    line(left + NAME_WIDTH, top, left + NAME_WIDTH, tableBottom);
    for (let index = 1; index < allergens.length; index += 1) {
      const x = left + NAME_WIDTH + columnWidth * index;
      line(x, top, x, tableBottom);
    }

    page.drawText("*Kan indeholde spor af allergener.", {
      x: left + 8,
      y: tableBottom - FOOTER_HEIGHT / 2 - 3,
      size: 9,
      font: bold,
      color: primary,
    });
    if (pageCount > 1) {
      const label = `Side ${pageIndex + 1} af ${pageCount}`;
      page.drawText(label, {
        x: right - 8 - bold.widthOfTextAtSize(label, 8),
        y: tableBottom - FOOTER_HEIGHT / 2 - 3,
        size: 8,
        font: bold,
        color: primary,
      });
    }
  }

  return await pdf.save();
}

function drawPictogram(
  page: PDFPage,
  allergen: AllergenId,
  color: ReturnType<typeof rgb>,
  white: ReturnType<typeof rgb>,
  x: number,
  y: number,
  radius: number,
) {
  page.drawCircle({ x, y, size: radius, color });
  page.drawCircle({ x, y, size: radius * 0.89, borderColor: white, borderWidth: 0.9 });
  // The icon sits in the middle 42 of its 64-unit canvas, matching AllergenIcon.
  const scale = (radius * 2 * 0.656) / 64;
  for (const d of allergenIconPaths[allergen]) {
    page.drawSvgPath(d, { x: x - 32 * scale, y: y + 32 * scale, scale, color: white });
  }
}
