import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const MAX_COUNT_AREAS = 50;
export const MAX_COUNT_AREA_PRODUCTS = 500;

type CountAreaCtx = QueryCtx | MutationCtx;

export async function listCountAreas(
  ctx: CountAreaCtx,
  organizationId: string,
  locationId: Id<"locations">,
) {
  const areas = await ctx.db
    .query("countAreas")
    .withIndex("by_organizationId_and_locationId_and_normalizedName", (q) =>
      q.eq("organizationId", organizationId).eq("locationId", locationId),
    )
    .take(MAX_COUNT_AREAS + 1);
  if (areas.length > MAX_COUNT_AREAS) {
    throw new ConvexError("Lokationen har for mange Barer");
  }
  return areas;
}

export async function requireCountArea(
  ctx: CountAreaCtx,
  organizationId: string,
  locationId: Id<"locations">,
  countAreaId: Id<"countAreas">,
) {
  const area = await ctx.db.get("countAreas", countAreaId);
  if (
    !area ||
    area.organizationId !== organizationId ||
    area.locationId !== locationId
  ) {
    throw new ConvexError("Baren blev ikke fundet");
  }
  return area;
}

export async function getCountAreaProductOrder(
  ctx: CountAreaCtx,
  organizationId: string,
  countAreaId: Id<"countAreas">,
) {
  const rows = await ctx.db
    .query("countAreaProducts")
    .withIndex("by_organizationId_and_countAreaId_and_position", (q) =>
      q.eq("organizationId", organizationId).eq("countAreaId", countAreaId),
    )
    .take(MAX_COUNT_AREA_PRODUCTS + 1);
  if (rows.length > MAX_COUNT_AREA_PRODUCTS) {
    throw new ConvexError("Baren har for mange Produkter");
  }
  return rows;
}
