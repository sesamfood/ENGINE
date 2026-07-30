import { ConvexError } from "convex/values";
import {
  activePeriod,
  countWindow,
} from "../../lib/count-window";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type CountLockContext = QueryCtx | MutationCtx;

export async function otherFeaturesLocked(
  ctx: CountLockContext,
  organizationId: string,
  locationId: Id<"locations">,
  now: number,
) {
  const location = await ctx.db.get("locations", locationId);
  if (!location || location.organizationId !== organizationId) {
    throw new ConvexError("Locationen blev ikke fundet");
  }

  const settings = await ctx.db
    .query("countSettings")
    .withIndex("by_organizationId", (q) =>
      q.eq("organizationId", organizationId),
    )
    .unique();
  if (!settings?.lockOtherFeaturesDuringCount) return false;

  const periodKey = activePeriod(now, settings);
  const window = countWindow(periodKey, settings);
  if (now < window.opensAt || now >= window.closesAt) return false;

  const count = await ctx.db
    .query("counts")
    .withIndex("by_organizationId_and_locationId_and_periodKey", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("locationId", locationId)
        .eq("periodKey", periodKey),
    )
    .unique();
  return count?.status !== "submitted";
}

export async function requireOtherFeaturesUnlocked(
  ctx: MutationCtx,
  organizationId: string,
  locationId: Id<"locations">,
) {
  if (
    await otherFeaturesLocked(ctx, organizationId, locationId, Date.now())
  ) {
    throw new ConvexError(
      "Andre funktioner er låst, indtil denne location har registreret count",
    );
  }
}
