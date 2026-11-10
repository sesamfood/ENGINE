// Fields on a POS cash report. Amounts are integer minor units (øre); transactions is a count.
export const cashReportFields = [
  { id: "total", label: "Total" },
  { id: "paymentCard", label: "Betalingskort" },
  { id: "giftCard", label: "Gavekort" },
  { id: "transactions", label: "Transaktioner" },
  { id: "cashBalance", label: "Kassebeholdning" },
  { id: "countedCash", label: "Optalt kontant" },
  { id: "countedCard", label: "Optalt betalingskort" },
  { id: "difference", label: "Difference" },
] as const;

export type CashReportField = (typeof cashReportFields)[number]["id"];
export type CashReportValues = Record<CashReportField, number | null>;

// Fields Engine also knows from the day's sales.
export const comparedCashReportFields = ["total", "paymentCard", "giftCard", "transactions"] as const;
export type ComparedCashReportField = (typeof comparedCashReportFields)[number];

// POS payment types are free text, so card and gift card payments are recognized by name.
export function paymentTypeKind(paymentType: string) {
  const name = paymentType.toLowerCase();
  if (/gave|gift|present|gutschein|voucher/.test(name)) return "giftCard";
  if (/kort|card|visa|master|maestro|amex|terminal/.test(name)) return "paymentCard";
  return null;
}
