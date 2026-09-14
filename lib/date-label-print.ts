import { dateTimeFormatter, DEFAULT_TIME_ZONE } from "./date";

export const labelFormats = [
  { value: "62x29", label: "62 × 29 mm", width: 62, height: 29 },
  { value: "62x40", label: "62 × 40 mm", width: 62, height: 40 },
  { value: "90x29", label: "90 × 29 mm", width: 90, height: 29 },
] as const;
export type LabelFormat = (typeof labelFormats)[number]["value"];
export type DateLabel = {
  productName: string;
  locationName: string;
  producedAt: number;
  expiresAt: number;
  includeTime: boolean;
};

export function formatLabelDate(timestamp: number, includeTime = false) {
  return dateTimeFormatter("da-DK", {
    timeZone: DEFAULT_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: includeTime ? "2-digit" : undefined,
    minute: includeTime ? "2-digit" : undefined,
  }).format(timestamp);
}

function escapeHtml(text: string) {
  return text.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

export function labelDocument(
  label: DateLabel,
  format: LabelFormat,
  copies = 1,
  toolbar = false,
) {
  const size = labelFormats.find((item) => item.value === format);
  if (!size || !Number.isInteger(copies) || copies < 1 || copies > 100)
    throw new Error("Vælg mellem 1 og 100 etiketter");
  if (
    !Number.isFinite(label.producedAt) ||
    !Number.isFinite(label.expiresAt) ||
    label.expiresAt <= label.producedAt
  )
    throw new Error("Kontrollér datoerne på etiketten");
  const markup = `<section class="label"><strong>${escapeHtml(label.productName)}</strong><div>Prod.: ${escapeHtml(formatLabelDate(label.producedAt, label.includeTime))}</div><div class="expiry">Sidste anv.: ${escapeHtml(formatLabelDate(label.expiresAt, label.includeTime))}</div><small>${escapeHtml(label.locationName)}</small></section>`;
  const compact = label.productName.length + label.locationName.length > 100;
  return `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Datoetiketter</title><style>
    @page { size: ${size.width}mm ${size.height}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: white; color: black; font-family: Arial, sans-serif; }
    .label { width: ${size.width}mm; height: ${size.height}mm; padding: 2mm 3mm; display: flex; flex-direction: column; justify-content: center; gap: ${compact ? 0.5 : 1}mm; text-align: center; font-size: ${compact ? 7 : 8}pt; line-height: 1.15; break-after: page; break-inside: avoid; }
    .label:last-child { break-after: auto; }
    strong { font-size: ${compact ? 8 : label.productName.length > 55 ? 9 : 11}pt; overflow-wrap: anywhere; }
    .expiry { font-weight: bold; }
    small { font-size: ${compact ? 6 : 7}pt; overflow-wrap: anywhere; }
    nav { padding: 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; font-size: 14px; }
    button { padding: 12px 20px; cursor: pointer; }
    @media print { nav { display: none; } }
  </style></head><body>${toolbar ? '<nav><button id="print" type="button">Print etiketter</button><span>Vælg din etiketprinter og den rette papirstørrelse. Brug 100 % skalering uden sidehoved og sidefod.</span></nav>' : ""}${markup.repeat(copies)}</body></html>`;
}

export function printDateLabels(
  label: DateLabel,
  format: LabelFormat,
  copies: number,
) {
  const html = labelDocument(label, format, copies, true);
  const printWindow = window.open("", "_blank");
  if (!printWindow)
    throw new Error("Tillad pop op-vinduer for at åbne etiketterne");
  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.document
    .getElementById("print")
    ?.addEventListener("click", () => printWindow.print());
  printWindow.focus();
  printWindow.print();
}
