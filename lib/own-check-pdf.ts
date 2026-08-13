import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import {
  evaluateCompliance,
  formatValue,
  ownCheckControlTypeLabels,
  ownCheckStatusLabels,
  type OwnCheckField,
  type OwnCheckValue,
} from "./own-checks";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const FOOTER_HEIGHT = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const MAX_RECORDS = 5_000;
const MAX_IMAGES = 2_000;
const MAX_OUTPUT_SIZE = 100 * 1024 * 1024;
const WIN_ANSI_EXTRA_CHARACTERS = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

export type InspectionPdfHeader = {
  organizationName: string;
  logoBytes?: Uint8Array | null;
  legalEntityName: string | null;
  registrationNumber: string | null;
  operatorName: string | null;
  marketName: string | null;
  locationName: string;
  fromDateKey: string;
  toDateKey: string;
  generatedAt: number;
  generatedBy: string;
  timeZone: string;
  completedCount: number;
  deviationCount: number;
  missingCount: number;
};

export type InspectionPdfAttachment = {
  fieldKey: string;
  fieldLabel: string;
  fileName: string;
  contentType: string;
  bytes: Uint8Array;
  addedAtRevision: number;
  removedAtRevision: number | null;
};

export type InspectionPdfRevision = {
  revision: number;
  kind: string;
  at: number;
  actorName: string;
  reason: string | null;
  changes: Array<{ label: string; from: string | null; to: string | null }>;
};

export type InspectionPdfRecord = {
  dueDateKey: string;
  dueAt: number;
  performedAt: number;
  name: string;
  controlType: keyof typeof ownCheckControlTypeLabels;
  status: "completed" | "deviation" | "approved";
  hasDeviation: boolean;
  performedByName: string;
  fields: OwnCheckField[];
  values: OwnCheckValue[];
  note: string | null;
  deviation: { description: string; recordedAt: number; recordedByName: string } | null;
  correctiveAction: { description: string; recordedAt: number; recordedByName: string } | null;
  approvedByName: string | null;
  attachments: InspectionPdfAttachment[];
  revisions: InspectionPdfRevision[];
};

export type InspectionPdfMissing = {
  dueDateKey: string;
  dueAt: number;
  name: string;
  responsibleRole: string | null;
};

export type InspectionPdfInput = {
  header: InspectionPdfHeader;
  records: InspectionPdfRecord[];
  missing: InspectionPdfMissing[];
};

export function sanitizePdfText(value: string) {
  return [...value].map((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint === 9 || codePoint === 10 || codePoint === 13) return character;
    if ((codePoint >= 32 && codePoint <= 126) || (codePoint >= 160 && codePoint <= 255) || WIN_ANSI_EXTRA_CHARACTERS.has(character)) return character;
    return "?";
  }).join("");
}

function displayDate(dateKey: string) {
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${dateKey}T12:00:00Z`));
}

function displayTime(timestamp: number, timeZone: string) {
  return new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short", timeZone }).format(timestamp);
}

function displayClock(timestamp: number, timeZone: string) {
  return new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit", timeZone }).format(timestamp);
}

export function pdfLimitText(field: OwnCheckField) {
  if (field.type !== "number") return "—";
  const unit = field.unit ? ` ${field.unit}` : "";
  const number = (value: number) => String(value).replace(".", ",");
  if (field.min !== undefined && field.max !== undefined) return `${number(field.min)}–${number(field.max)}${unit}`;
  if (field.min !== undefined) return `Mindst ${number(field.min)}${unit}`;
  if (field.max !== undefined) return `Højst ${number(field.max)}${unit}`;
  return "—";
}

export function pdfRevisionChanges(changes: Array<{ label: string; from: string | null; to: string | null }>) {
  return changes.map((change) => `${change.label}: ${change.from ?? "—"} -> ${change.to ?? "—"}`).join("; ");
}

function wrapText(font: PDFFont, value: string, size: number, maxWidth: number) {
  const words = sanitizePdfText(value).split(/\s+/u).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) {
      line = next;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function dateGroup(records: InspectionPdfRecord[]) {
  const grouped = new Map<string, InspectionPdfRecord[]>();
  for (const record of records) grouped.set(record.dueDateKey, [...(grouped.get(record.dueDateKey) ?? []), record]);
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function revisionKind(kind: string) {
  return kind === "submitted" ? "Oprindelig registrering" : kind === "edited" ? "Rettelse" : kind === "approved" ? "Godkendelse" : kind === "correctiveActionRecorded" ? "Korrigerende handling" : "Afvigelse registreret";
}

function imageDimensions(image: PDFImage, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  return { width: image.width * scale, height: image.height * scale };
}

export async function buildInspectionPdf(input: InspectionPdfInput) {
  if (input.records.length > MAX_RECORDS || input.missing.length > MAX_RECORDS || input.records.reduce((sum, record) => sum + record.attachments.filter((attachment) => attachment.contentType.startsWith("image/")).length, 0) > MAX_IMAGES) {
    throw new Error("PDF-eksporten er for stor. Vælg en kortere periode.");
  }

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const generatedDate = new Date(input.header.generatedAt);
  pdf.setCreationDate(generatedDate);
  pdf.setModificationDate(generatedDate);
  pdf.setTitle(sanitizePdfText(`Egenkontrol ${input.header.locationName}`));
  pdf.setAuthor(sanitizePdfText(input.header.generatedBy));

  const pages: PDFPage[] = [];
  let page: PDFPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  pages.push(page);
  let cursor = PAGE_HEIGHT - MARGIN;

  function newPage() {
    page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    pages.push(page);
    cursor = PAGE_HEIGHT - MARGIN;
    return page;
  }

  function ensure(height: number) {
    if (!page || cursor - height < MARGIN + FOOTER_HEIGHT) newPage();
  }

  function text(value: string, x: number, y: number, size = 10, font = regular, color = rgb(0.12, 0.12, 0.14)) {
    page.drawText(sanitizePdfText(value), { x, y, size, font, color });
  }

  function paragraph(value: string, size = 9, color = rgb(0.2, 0.2, 0.22), lineHeight = size + 3) {
    const lines = wrapText(regular, value, size, CONTENT_WIDTH);
    ensure(lines.length * lineHeight + 2);
    for (const line of lines) {
      text(line, MARGIN, cursor, size, regular, color);
      cursor -= lineHeight;
    }
    cursor -= 2;
  }

  function heading(value: string, size = 14) {
    ensure(size + 12);
    text(value, MARGIN, cursor, size, bold);
    cursor -= size + 8;
  }

  function labelValue(label: string, value: string | null) {
    if (!value) return;
    ensure(15);
    text(`${label}:`, MARGIN, cursor, 9, bold, rgb(0.35, 0.35, 0.38));
    text(value, MARGIN + 112, cursor, 9);
    cursor -= 14;
  }

  if (input.header.logoBytes) {
    try {
      const image = input.header.logoBytes[0] === 0x89 ? await pdf.embedPng(input.header.logoBytes) : await pdf.embedJpg(input.header.logoBytes);
      const size = imageDimensions(image, 220, 72);
      page.drawImage(image, { x: MARGIN, y: cursor - size.height, width: size.width, height: size.height });
      cursor -= size.height + 28;
    } catch {
      // A broken logo should not prevent the inspection document from opening.
    }
  }
  text("Egenkontroldokumentation", MARGIN, cursor, 24, bold);
  cursor -= 36;
  paragraph(input.header.organizationName, 14, rgb(0.2, 0.2, 0.22), 19);
  cursor -= 8;
  labelValue("Lokation", input.header.locationName);
  labelValue("Periode", `${displayDate(input.header.fromDateKey)} – ${displayDate(input.header.toDateKey)}`);
  labelValue("Juridisk enhed", input.header.legalEntityName);
  labelValue("CVR-/registreringsnr.", input.header.registrationNumber);
  labelValue("Operatør", input.header.operatorName);
  labelValue("Marked", input.header.marketName);
  labelValue("Genereret", displayTime(input.header.generatedAt, input.header.timeZone));
  labelValue("Genereret af", input.header.generatedBy);
  cursor -= 18;
  heading("Sammenfatning", 16);
  paragraph(`${input.header.completedCount} udførte kontroller · ${input.header.deviationCount} afvigelser · ${input.header.missingCount} manglende kontroller`, 12);
  paragraph("Dokumentet viser de registreringer og den revisionshistorik, der var tilgængelig ved genereringstidspunktet.", 9, rgb(0.35, 0.35, 0.38));

  for (const [dateKey, records] of dateGroup(input.records)) {
    newPage();
    heading(displayDate(dateKey), 16);
    for (const record of records) {
      ensure(100);
      if (record.hasDeviation) page.drawRectangle({ x: MARGIN - 12, y: cursor - 6, width: 4, height: 86, color: rgb(0.78, 0.12, 0.12) });
      text(record.name, MARGIN, cursor, 12, bold);
      cursor -= 17;
      text(`${ownCheckControlTypeLabels[record.controlType]} · Planlagt kl. ${displayClock(record.dueAt, input.header.timeZone)} · Udført ${displayTime(record.performedAt, input.header.timeZone)} af ${record.performedByName}`, MARGIN, cursor, 8, regular, rgb(0.35, 0.35, 0.38));
      cursor -= 16;
      text(`Status: ${ownCheckStatusLabels[record.status]}`, MARGIN, cursor, 9, bold, record.hasDeviation ? rgb(0.7, 0.08, 0.08) : rgb(0.15, 0.35, 0.2));
      cursor -= 15;
      const valueMap = new Map(record.values.map((value) => [value.key, value]));
      const compliance = evaluateCompliance(record.fields, record.values);
      const violations = new Map(compliance.violations.map((violation) => [violation.key, violation]));
      for (const field of record.fields) {
        ensure(27);
        const value = formatValue(field, valueMap.get(field.key));
        const violation = violations.get(field.key);
        text(field.label, MARGIN, cursor, 8, bold);
        text(value, MARGIN + 128, cursor, 8);
        text(pdfLimitText(field), MARGIN + 330, cursor, 8, regular, rgb(0.35, 0.35, 0.38));
        text(violation ? "Uden for grænsen" : "Inden for grænsen", MARGIN + 420, cursor, 7, regular, violation ? rgb(0.7, 0.08, 0.08) : rgb(0.2, 0.4, 0.25));
        cursor -= 13;
      }
      if (record.note) { text("Note", MARGIN, cursor, 8, bold); cursor -= 11; paragraph(record.note, 8); }
      if (record.deviation) { text("Afvigelse", MARGIN, cursor, 8, bold, rgb(0.7, 0.08, 0.08)); cursor -= 11; paragraph(`${record.deviation.description} (${record.deviation.recordedByName}, ${displayTime(record.deviation.recordedAt, input.header.timeZone)})`, 8); }
      if (record.correctiveAction) { text("Korrigerende handling", MARGIN, cursor, 8, bold); cursor -= 11; paragraph(`${record.correctiveAction.description} (${record.correctiveAction.recordedByName}, ${displayTime(record.correctiveAction.recordedAt, input.header.timeZone)})`, 8); }
      if (record.approvedByName) { text(`Godkendt af ${record.approvedByName}`, MARGIN, cursor, 8, regular, rgb(0.35, 0.35, 0.38)); cursor -= 13; }
      if (record.revisions.length > 1) {
        text("Revisionshistorik", MARGIN, cursor, 8, bold);
        cursor -= 11;
        for (const revision of record.revisions) {
          const changes = pdfRevisionChanges(revision.changes);
          paragraph(`${revisionKind(revision.kind)} ${revision.revision} · ${displayTime(revision.at, input.header.timeZone)} · ${revision.actorName}${revision.reason ? ` · Årsag: ${revision.reason}` : ""}${changes ? ` · ${changes}` : ""}`, 7, rgb(0.35, 0.35, 0.38), 10);
        }
      }
      const imageAttachments = record.attachments.filter((attachment) => attachment.contentType.startsWith("image/"));
      for (const attachment of imageAttachments) {
        ensure(150);
        try {
          const image = attachment.contentType === "image/png" ? await pdf.embedPng(attachment.bytes) : await pdf.embedJpg(attachment.bytes);
          const size = imageDimensions(image, CONTENT_WIDTH / 2, 180);
          page.drawImage(image, { x: MARGIN, y: cursor - size.height, width: size.width, height: size.height });
          cursor -= size.height + 12;
          text(`${attachment.fieldLabel} · ${attachment.fileName} · Tilføjet i revision ${attachment.addedAtRevision}${attachment.removedAtRevision === null ? "" : ` · Fjernet i revision ${attachment.removedAtRevision}`}`, MARGIN, cursor, 7, regular, rgb(0.35, 0.35, 0.38));
          cursor -= 14;
        } catch {
          paragraph(`${attachment.fieldLabel}: Billedet kunne ikke indsættes.`, 8, rgb(0.7, 0.08, 0.08));
        }
      }
      cursor -= 10;
    }
  }

  if (input.missing.length) {
    newPage();
    heading("Manglende egenkontroller", 16);
    paragraph("Disse planlagte kontroller havde ingen registrering i den valgte periode.", 9, rgb(0.35, 0.35, 0.38));
    for (const missing of input.missing) {
      ensure(28);
      text(displayDate(missing.dueDateKey), MARGIN, cursor, 8, bold);
      text(missing.name, MARGIN + 90, cursor, 8, regular);
      text(`Planlagt kl. ${displayClock(missing.dueAt, input.header.timeZone)}`, MARGIN + 330, cursor, 8, regular, rgb(0.35, 0.35, 0.38));
      cursor -= 13;
      if (missing.responsibleRole) { text(`Ansvarlig rolle: ${missing.responsibleRole}`, MARGIN + 90, cursor, 7, regular, rgb(0.35, 0.35, 0.38)); cursor -= 11; }
    }
  }

  const pdfAttachments = input.records.flatMap((record) => record.attachments.filter((attachment) => attachment.contentType === "application/pdf").map((attachment) => ({ record, attachment })));
  if (pdfAttachments.length) {
    newPage();
    heading("Bilag", 16);
    paragraph("PDF-bilag er indsat efter den kronologiske dokumentation.", 9, rgb(0.35, 0.35, 0.38));
    for (const { record, attachment } of pdfAttachments) {
      ensure(28);
      text(`${record.name} · ${attachment.fieldLabel} · ${attachment.fileName}`, MARGIN, cursor, 8, bold);
      cursor -= 14;
      try {
        const source = await PDFDocument.load(attachment.bytes);
        const copiedPages = await pdf.copyPages(source, source.getPageIndices());
        for (const copiedPage of copiedPages) pdf.addPage(copiedPage);
      } catch {
        paragraph("PDF-bilaget kunne ikke indsættes, fordi filen ikke er et gyldigt PDF-dokument.", 8, rgb(0.7, 0.08, 0.08));
      }
      page = pdf.getPages().at(-1) ?? page;
      cursor = MARGIN + FOOTER_HEIGHT + 8;
    }
  }

  const totalPages = pdf.getPageCount();
  for (const [index, footerPage] of pdf.getPages().entries()) {
    footerPage.drawLine({ start: { x: MARGIN, y: 38 }, end: { x: PAGE_WIDTH - MARGIN, y: 38 }, thickness: 0.5, color: rgb(0.82, 0.82, 0.84) });
    footerPage.drawText(sanitizePdfText(`${input.header.locationName} · ${displayDate(input.header.fromDateKey)} – ${displayDate(input.header.toDateKey)}`), { x: MARGIN, y: 24, size: 7, font: regular, color: rgb(0.4, 0.4, 0.42) });
    const pageNumber = `Side ${index + 1} af ${totalPages}`;
    footerPage.drawText(pageNumber, { x: PAGE_WIDTH - MARGIN - regular.widthOfTextAtSize(pageNumber, 7), y: 24, size: 7, font: regular, color: rgb(0.4, 0.4, 0.42) });
  }

  const bytes = await pdf.save();
  if (bytes.byteLength > MAX_OUTPUT_SIZE) throw new Error("PDF-eksporten er for stor. Vælg en kortere periode.");
  return bytes;
}
