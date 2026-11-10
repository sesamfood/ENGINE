// Pairs cash report labels with amounts from OCR boxes. Works on any OCR output with rotated boxes.
import type { OcrBox } from "./ocr";

export const receiptFields = {
  total: { label: "Total", words: ["total", "i alt", "sum", "totalt", "summe", "gesamt", "grand total"] },
  paymentCard: { label: "Betalingskort", words: ["betalingskort", "kort", "card", "cards", "kortbetaling", "karte"] },
  giftCard: { label: "Gavekort", words: ["gavekort", "gift card", "giftcard", "presentkort", "gutschein"] },
  transactions: { label: "Transaktioner", words: ["transaktioner", "transactions", "antal kunder", "transaktionen", "kvitteringer"] },
  cashBalance: { label: "Kassebeholdning", words: ["kasse beholdning", "kassebeholdning", "cash in drawer", "kassabehållning", "kassenbestand", "expected cash"] },
  countedCash: { label: "Optalt kontant", words: ["optalt kontant", "counted cash", "talt kontant", "räknat kontant"] },
  countedCard: { label: "Optalt betalingskort", words: ["optalt betalingskort", "counted card", "optalt kort", "talt kort"] },
  difference: { label: "Difference", words: ["dif", "diff", "difference", "differens", "afvigelse", "differenz"] },
};

export type ReceiptField = keyof typeof receiptFields;
export type LearnedLabels = Partial<Record<ReceiptField, string[]>>;
export type ReceiptValue = { value: number; label: OcrBox; amount: OcrBox };

export const normalizeLabel = (s: string) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}% ]/gu, " ").replace(/\s+/g, " ").trim();

function similarity(a: string, b: string) {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]++;
    for (let j = 1; j <= b.length; j++) {
      const cur = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return 1 - d[b.length] / Math.max(a.length, b.length, 1);
}

// "4.764,00" "4,764.00" "4 764,00" "35" -> number; anything else -> null
export function parseAmount(raw: string) {
  const s = raw.replace(/\s/g, "").replace(/(kr|dkk|sek|nok|eur|€|\$)\.?$/i, "");
  if (!/^-?[\d.,']+$/.test(s) || !/\d/.test(s)) return null;
  const m = s.match(/^(-?[\d.,']*?)[.,'](\d{1,2})$/);
  const int = (m ? m[1] : s).replace(/[.,']/g, "");
  if (!/^-?\d+$/.test(int)) return null;
  return Number(`${int}.${m ? m[2].padEnd(2, "0") : "0"}`);
}

const center = (b: OcrBox) => [b.box.reduce((s, p) => s + p[0], 0) / 4, b.box.reduce((s, p) => s + p[1], 0) / 4];
const height = (b: OcrBox) => Math.hypot(b.box[3][0] - b.box[0][0], b.box[3][1] - b.box[0][1]);
const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

export function extractReceipt(boxes: OcrBox[], learned: LearnedLabels = {}) {
  // Text-line slope from nearby wide boxes, so rows can be followed across a tilted, perspective-distorted photo.
  const wide = boxes
    .filter((b) => b.box[1][0] - b.box[0][0] > 60)
    .map((b) => ({ y: center(b)[1], s: (b.box[1][1] - b.box[0][1]) / (b.box[1][0] - b.box[0][0]) }));
  const slopeAt = (y: number) =>
    median(wide.filter((w) => Math.abs(w.y - y) < 80).map((w) => w.s)) || median(wide.map((w) => w.s));
  const amounts = boxes.flatMap((b) => {
    const v = parseAmount(b.text);
    return v === null ? [] : [{ b, v, c: center(b) }];
  });

  const amountFor = (label: OcrBox) => {
    const [lx, ly] = center(label);
    const right = Math.max(...label.box.map((p) => p[0]));
    const slope = slopeAt(ly);
    const hits = amounts
      .map((a) => ({ ...a, dy: Math.abs(a.c[1] - (ly + slope * (a.c[0] - lx))) }))
      .filter((a) => a.c[0] > right && a.dy < height(label) * 0.6);
    return hits.sort((a, b) => a.dy - b.dy)[0] ?? null;
  };

  const fields = {} as Record<ReceiptField, ReceiptValue | null>;
  for (const [field, { words }] of Object.entries(receiptFields) as [ReceiptField, (typeof receiptFields)[ReceiptField]][]) {
    const own = learned[field] ?? [];
    const pairs = boxes
      .filter((b) => {
        if (parseAmount(b.text) !== null) return false;
        const t = normalizeLabel(b.text);
        return own.includes(t) || Math.max(...words.map((w) => similarity(t, w))) >= 0.8;
      })
      .flatMap((label) => {
        const amount = amountFor(label);
        return amount ? [{ label, amount }] : [];
      });
    // Group subtotals reuse the same label; the grand total is the largest.
    const pick = field === "total" ? pairs.sort((a, b) => b.amount.v - a.amount.v)[0] : pairs.at(-1);
    fields[field] = pick ? { value: pick.amount.v, label: pick.label, amount: pick.amount.b } : null;
  }

  const v = (f: ReceiptField) => fields[f]?.value ?? null;
  const total = v("total"), card = v("paymentCard"), balance = v("cashBalance"), difference = v("difference");
  const checks = [
    {
      label: "Total = betalingskort + gavekort + optalt kontant",
      ok: total !== null && card !== null && Math.abs(total - card - (v("giftCard") ?? 0) - (v("countedCash") ?? 0)) < 0.01,
    },
    {
      label: "Difference = optalt kontant + optalt betalingskort − kassebeholdning",
      ok: difference !== null && balance !== null && Math.abs((v("countedCash") ?? 0) + (v("countedCard") ?? 0) - balance - difference) < 0.01,
    },
  ];
  return { fields, checks };
}
