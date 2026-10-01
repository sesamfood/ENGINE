import { requireOrganizationLocation as requireLocation } from "./lib/locations";
import { ConvexError, v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  requireLocationAccess,
  requireLocationManager,
  requirePermission,
} from "./lib/auth";
import { recordAudit } from "./lib/audit";
import {
  listCountExclusions,
  setCountExclusions,
} from "./lib/countExclusions";

async function requireCountSettingsManager(ctx: QueryCtx | MutationCtx) {
  const auth = await requirePermission(ctx, "count.settings");
  if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
  return auth;
}

export const getOrganization = query({
  args: {},
  returns: v.array(v.id("products")),
  handler: async (ctx) => {
    const { organizationId } = await requireCountSettingsManager(ctx);
    const rows = await listCountExclusions(ctx, organizationId);
    return rows.map((row) => row.productId);
  },
});

export const setOrganization = mutation({
  args: { productIds: v.array(v.id("products")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireCountSettingsManager(ctx);
    await setCountExclusions(ctx, organizationId, undefined, args.productIds);
    return null;
  },
});

export const getLocation = query({
  args: { locationId: v.id("locations") },
  returns: v.object({
    organizationProductIds: v.array(v.id("products")),
    locationProductIds: v.array(v.id("products")),
  }),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    requireLocationAccess(auth, args.locationId);
    await requireLocation(ctx, auth.organizationId, args.locationId);
    const [organizationRows, locationRows] = await Promise.all([
      listCountExclusions(ctx, auth.organizationId),
      listCountExclusions(ctx, auth.organizationId, args.locationId),
    ]);
    return {
      organizationProductIds: organizationRows.map((row) => row.productId),
      locationProductIds: locationRows.map((row) => row.productId),
    };
  },
});

export const setLocation = mutation({
  args: {
    locationId: v.id("locations"),
    productIds: v.array(v.id("products")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    requireLocationAccess(auth, args.locationId);
    const location = await requireLocation(
      ctx,
      auth.organizationId,
      args.locationId,
    );
    const changed = await setCountExclusions(
      ctx,
      auth.organizationId,
      location._id,
      args.productIds,
    );
    if (!changed) return null;
    await recordAudit(ctx, auth, {
      action: "locations.countExclusionsChanged",
      entityTable: "locations",
      entityId: location._id,
      locationId: location._id,
      summary: `${args.productIds.length} Produkter er udeladt fra Count på ${location.name}`,
    });
    return null;
  },
});
