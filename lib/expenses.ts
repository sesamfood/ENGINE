export const expenseCategories = [
  { id: "rent", label: "Husleje" },
  { id: "utilities", label: "Forsyning" },
  { id: "repairs", label: "Vedligeholdelse" },
  { id: "equipment", label: "Udstyr" },
  { id: "marketing", label: "Markedsføring" },
  { id: "other", label: "Andet" },
] as const;

export type ExpenseCategoryId = (typeof expenseCategories)[number]["id"];

export function parseExpenseAmount(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, "");
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(normalized)) {
    return null;
  }
  const [whole, fraction = ""] = normalized.replaceAll(".", "").split(",");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}

export function formatExpenseAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("da-DK", {
    style: "currency",
    currency,
  }).format(amount / 100);
}
