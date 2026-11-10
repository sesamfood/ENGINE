// PROTOTYPE: pair receipt labels with amounts from OCR boxes ({ box: [TL, TR, BR, BL], text }).
export const FIELDS = {
  total: { label: "Total", words: ["total", "i alt", "sum", "totalt", "summe", "gesamt", "grand total"] },
  paymentCard: { label: "Betalingskort", words: ["betalingskort", "kort", "card", "cards", "kortbetaling", "karte"] },
  giftCard: { label: "Gavekort", words: ["gavekort", "gift card", "giftcard", "presentkort", "gutschein"] },
  transactions: { label: "Transaktioner", words: ["transaktioner", "transactions", "antal kunder", "transaktionen", "kvitteringer"] },
  cashBalance: { label: "Kassebeholdning", words: ["kasse beholdning", "kassebeholdning", "cash in drawer", "kassabehållning", "kassenbestand", "expected cash"] },
  countedCash: { label: "Optalt kontant", words: ["optalt kontant", "counted cash", "talt kontant", "räknat kontant"] },
  countedCard: { label: "Optalt betalingskort", words: ["optalt betalingskort", "counted card", "optalt kort", "talt kort"] },
  difference: { label: "Difference", words: ["dif", "diff", "difference", "differens", "afvigelse", "differenz"] },
};

export const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}% ]/gu, " ").replace(/\s+/g, " ").trim();

function similarity(a, b) {
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
export function parseAmount(raw) {
  const s = raw.replace(/\s/g, "").replace(/(kr|dkk|sek|nok|eur|€|\$)\.?$/i, "");
  if (!/^-?[\d.,']+$/.test(s) || !/\d/.test(s)) return null;
  const m = s.match(/^(-?[\d.,']*?)[.,'](\d{1,2})$/);
  const int = (m ? m[1] : s).replace(/[.,']/g, "");
  if (!/^-?\d+$/.test(int)) return null;
  return Number(`${int}.${m ? m[2].padEnd(2, "0") : "0"}`);
}

const center = (b) => [b.box.reduce((s, p) => s + p[0], 0) / 4, b.box.reduce((s, p) => s + p[1], 0) / 4];
const height = (b) => Math.hypot(b.box[3][0] - b.box[0][0], b.box[3][1] - b.box[0][1]);
const median = (xs) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

export function extract(boxes, learned = {}) {
  // Text-line slope from nearby wide boxes, so rows can be followed across a tilted, perspective-distorted photo.
  const wide = boxes.filter((b) => b.box[1][0] - b.box[0][0] > 60).map((b) => ({ y: center(b)[1], s: (b.box[1][1] - b.box[0][1]) / (b.box[1][0] - b.box[0][0]) }));
  const slopeAt = (y) => median(wide.filter((w) => Math.abs(w.y - y) < 80).map((w) => w.s)) || median(wide.map((w) => w.s));
  const amounts = boxes.flatMap((b) => { const v = parseAmount(b.text); return v === null ? [] : [{ b, v, c: center(b) }]; });

  const amountFor = (label) => {
    const [lx, ly] = center(label);
    const right = Math.max(...label.box.map((p) => p[0]));
    const slope = slopeAt(ly);
    const hits = amounts
      .map((a) => ({ ...a, dy: Math.abs(a.c[1] - (ly + slope * (a.c[0] - lx))) }))
      .filter((a) => a.c[0] > right && a.dy < height(label) * 0.6);
    return hits.sort((a, b) => a.dy - b.dy)[0] ?? null;
  };

  const fields = {};
  for (const [field, { words }] of Object.entries(FIELDS)) {
    const own = learned[field] ?? [];
    const pairs = boxes
      .filter((b) => {
        if (parseAmount(b.text) !== null) return false;
        const t = norm(b.text);
        return own.includes(t) || Math.max(...words.map((w) => similarity(t, w))) >= 0.8;
      })
      .map((label) => ({ label, amount: amountFor(label) }))
      .filter((p) => p.amount);
    // Group subtotals reuse the same label; the grand total is the largest.
    const pick = field === "total" ? pairs.sort((a, b) => b.amount.v - a.amount.v)[0] : pairs[pairs.length - 1];
    fields[field] = pick ? { value: pick.amount.v, label: pick.label, amount: pick.amount.b } : null;
  }
  const v = (f) => fields[f]?.value ?? null;
  const checks = {
    "Total = betalingskort + gavekort + optalt kontant":
      v("total") !== null && v("paymentCard") !== null && Math.abs(v("total") - v("paymentCard") - (v("giftCard") ?? 0) - (v("countedCash") ?? 0)) < 0.01,
    "Difference = optalt kontant + optalt betalingskort − kassebeholdning":
      v("difference") !== null && v("cashBalance") !== null && Math.abs((v("countedCash") ?? 0) + (v("countedCard") ?? 0) - v("cashBalance") - v("difference")) < 0.01,
  };
  return { fields, checks };
}
