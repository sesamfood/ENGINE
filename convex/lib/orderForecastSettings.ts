import { ConvexError, v } from "convex/values";
import {
  DEFAULT_BUFFER_PERCENT,
  DEFAULT_COVERAGE_DAYS,
  validForecastSettings,
} from "../../lib/ordering-forecast";

export const forecastSettingsFields = {
  coverageDays: v.number(),
  bufferPercent: v.number(),
};

export function forecastSettings(
  doc: { coverageDays?: number; bufferPercent?: number } | null | undefined,
) {
  return {
    coverageDays: doc?.coverageDays ?? DEFAULT_COVERAGE_DAYS,
    bufferPercent: doc?.bufferPercent ?? DEFAULT_BUFFER_PERCENT,
  };
}

export function requireForecastSettings(args: {
  coverageDays: number;
  bufferPercent: number;
}) {
  if (!validForecastSettings(args.coverageDays, args.bufferPercent)) {
    throw new ConvexError(
      "Vælg en dækning fra 1 til 28 dage og en buffer fra 0 til 100 %",
    );
  }
  return { coverageDays: args.coverageDays, bufferPercent: args.bufferPercent };
}
