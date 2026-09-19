export const MAX_EXPENSE_CATEGORIES = 100;

export const defaultExpenseCategories = [
  { id: "rent", label: "Husleje", enabled: true },
  { id: "utilities", label: "Forsyning", enabled: true },
  { id: "repairs", label: "Vedligeholdelse", enabled: true },
  { id: "equipment", label: "Udstyr", enabled: true },
  { id: "marketing", label: "Markedsføring", enabled: true },
  { id: "other", label: "Andet", enabled: true },
];

export function expenseCategoryLabel(expense: { categoryId: string; categoryLabel?: string }) {
  return expense.categoryLabel ?? defaultExpenseCategories.find((category) => category.id === expense.categoryId)?.label ?? expense.categoryId;
}

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
