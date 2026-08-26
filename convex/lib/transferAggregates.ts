import type { Doc } from "../_generated/dataModel";

export function transferAggregates(
  items: readonly Pick<
    Doc<"transferItems">,
    "quantity" | "temperatureCelsius" | "maxTemperatureCelsius"
  >[],
) {
  return {
    itemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
    hasTemperatureDeviation: items.some(
      (item) =>
        item.temperatureCelsius !== undefined &&
        item.maxTemperatureCelsius !== undefined &&
        item.temperatureCelsius > item.maxTemperatureCelsius,
    ),
  };
}
