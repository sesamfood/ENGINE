export type CountSalesSource = "onlinePos" | "wolt" | "combined";

export function countCombinedWarning(source: CountSalesSource) {
  return source === "combined"
    ? "Combined lægger OnlinePOS- og Wolt-salg sammen. Det samme salg kan derfor blive talt med to gange."
    : null;
}

export function resolveCountSalesSource(
  savedSource: CountSalesSource | null,
  onlinePosConnected: boolean,
  woltConnected: boolean,
): CountSalesSource {
  if (savedSource) return savedSource;
  if (onlinePosConnected) return "onlinePos";
  if (woltConnected) return "wolt";
  return "onlinePos";
}
