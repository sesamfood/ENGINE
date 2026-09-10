export function parseQuantity(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized || !/^\d+(?:\.\d+)?$/u.test(normalized)) return null;
  const quantity = Number(normalized);
  return Number.isFinite(quantity) ? quantity : null;
}
