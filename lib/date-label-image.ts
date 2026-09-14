import {
  formatLabelDate,
  labelDocument,
  labelFormats,
  type DateLabel,
  type LabelFormat,
} from "./date-label-print";

export function drawDateLabel(
  canvas: HTMLCanvasElement,
  label: DateLabel,
  format: LabelFormat,
) {
  labelDocument(label, format);
  const size = labelFormats.find((item) => item.value === format)!;
  const pixelsPerMm = 300 / 25.4;
  canvas.width = Math.round(size.width * pixelsPerMm);
  canvas.height = Math.round(size.height * pixelsPerMm);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Etiketten kunne ikke klargøres på denne enhed");
  const width = canvas.width - 6 * pixelsPerMm;
  const height = canvas.height - 4 * pixelsPerMm;
  const blocks = [
    { text: label.productName, bold: true, points: 11 },
    {
      text: `Prod.: ${formatLabelDate(label.producedAt, label.includeTime)}`,
      bold: false,
      points: 8,
    },
    {
      text: `Sidste anv.: ${formatLabelDate(label.expiresAt, label.includeTime)}`,
      bold: true,
      points: 8,
    },
    { text: label.locationName, bold: false, points: 7 },
  ];
  function layout(scale: number) {
    return blocks.map((block) => {
      const fontSize = block.points * (300 / 72) * scale;
      const font = `${block.bold ? "bold" : "normal"} ${fontSize}px Arial, sans-serif`;
      ctx!.font = font;
      const lines: string[] = [];
      let line = "";
      for (const word of block.text.split(/\s+/)) {
        if (line && ctx!.measureText(`${line} ${word}`).width > width) {
          lines.push(line);
          line = "";
        }
        for (const character of `${line ? " " : ""}${word}`) {
          if (line && ctx!.measureText(line + character).width > width) {
            lines.push(line);
            line = "";
          }
          line += character;
        }
      }
      if (line) lines.push(line);
      return { lines, font, lineHeight: fontSize * 1.2 };
    });
  }
  let scale = 1;
  let rows = layout(scale);
  const gap = pixelsPerMm * 0.7;
  const totalHeight = () =>
    rows.reduce((sum, row) => sum + row.lines.length * row.lineHeight, 0) +
    gap * (rows.length - 1);
  while (totalHeight() > height && scale > 0.6) {
    scale -= 0.05;
    rows = layout(scale);
  }
  if (totalHeight() > height)
    throw new Error("Teksten er for lang til etiketten. Vælg en større etiket");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "black";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let y = (canvas.height - totalHeight()) / 2;
  for (const row of rows) {
    ctx.font = row.font;
    for (const line of row.lines) {
      ctx.fillText(line, canvas.width / 2, y + row.lineHeight / 2);
      y += row.lineHeight;
    }
    y += gap;
  }
}

export function dateLabelImage(label: DateLabel, format: LabelFormat) {
  const canvas = document.createElement("canvas");
  drawDateLabel(canvas, label, format);
  return canvas.toDataURL("image/png").split(",")[1];
}
