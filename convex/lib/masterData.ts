import { ConvexError } from "convex/values";

const MAX_NAME_LENGTH = 100;

export function normalizeMasterDataName(value: string, label: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new ConvexError(`${label} skal udfyldes`);
  if (name.length > MAX_NAME_LENGTH) {
    throw new ConvexError(`${label} må højst være ${MAX_NAME_LENGTH} tegn`);
  }
  return { name, normalizedName: name.toLocaleLowerCase("da") };
}

export function requireCurrency(value: string | null | undefined) {
  if (!value) return undefined;
  const currency = value.trim();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new ConvexError(
      "Valuta skal være en ISO 4217-kode med tre store bogstaver",
    );
  }
  return currency;
}

export function optionalText(value: string | null | undefined) {
  return value?.trim() || undefined;
}
