import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const DEFAULT_TIME_ZONE = "Europe/Copenhagen";

export function requireTimeZone(value: string): string;
export function requireTimeZone(value: null | undefined): undefined;
export function requireTimeZone(
  value: string | null | undefined,
): string | undefined;
export function requireTimeZone(value: string | null | undefined) {
  if (!value) return undefined;
  const timeZone = value.trim();
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
  } catch {
    throw new ConvexError("Tidszonen er ugyldig");
  }
  return timeZone;
}

export async function resolveTimeZone(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  locationId?: Id<"locations">,
) {
  if (locationId) {
    const location = await ctx.db.get("locations", locationId);
    if (!location || location.organizationId !== organizationId) {
      throw new ConvexError("Lokationen blev ikke fundet");
    }
    if (location.timeZone) return location.timeZone;
    if (location.marketId) {
      const market = await ctx.db.get("markets", location.marketId);
      if (market?.organizationId === organizationId && market.timeZone) {
        return market.timeZone;
      }
    }
  }
  const settings = await ctx.db
    .query("organizationScheduleSettings")
    .withIndex("by_organizationId", (q) =>
      q.eq("organizationId", organizationId),
    )
    .unique();
  return settings?.timeZone ?? DEFAULT_TIME_ZONE;
}
