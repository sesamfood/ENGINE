import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { metricRegistry } from "../lib/dashboard/registry";
import { targetPeriodLabels, targetUsesPeriod } from "../lib/dashboard/target";
import type { MetricId } from "../lib/dashboard/types";
import { hasPermission } from "../lib/auth-permissions";
import { recordAudit } from "./lib/audit";
import {
  requireDashboardViewer,
  requireHumanPrincipal,
  requireLocationAccess,
  requirePermission,
} from "./lib/auth";
import { metricIdValidator, targetPeriodValidator } from "./lib/dashboardValidators";
import { requireOrganizationLocation } from "./lib/locations";
import { canViewBuiltinMetric } from "./dashboard";

export const list = query({
  args: { locationId: v.id("locations") },
  returns: v.object({
    canManage: v.boolean(),
    targets: v.array(v.object({
      metricId: metricIdValidator,
      amount: v.number(),
      period: targetPeriodValidator,
      updatedAt: v.number(),
    })),
  }),
  handler: async (ctx, args) => {
    const auth = await requireDashboardViewer(ctx);
    requireLocationAccess(auth, args.locationId);
    await requireOrganizationLocation(ctx, auth.organizationId, args.locationId);
    const rows = await ctx.db.query("locationTargets")
      .withIndex("by_organizationId_and_locationId_and_metricId", (q) =>
        q.eq("organizationId", auth.organizationId).eq("locationId", args.locationId))
      .take(100);
    return {
      canManage: auth.principalKind !== "apiKey" && !auth.kioskModeEnabled
        && hasPermission(auth.role, auth.permissions, "dashboard.manageTargets"),
      targets: rows
        .filter((row) => metricRegistry[row.metricId]?.targetable && canViewBuiltinMetric(auth, row.metricId))
        .map(({ metricId, amount, period, updatedAt }) => ({ metricId, amount, period, updatedAt })),
    };
  },
});

async function requireTargetManager(ctx: MutationCtx, locationId: Id<"locations">, metricId: MetricId) {
  const auth = requireHumanPrincipal(await requirePermission(ctx, "dashboard.manageTargets"));
  if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
  requireLocationAccess(auth, locationId);
  const location = await requireOrganizationLocation(ctx, auth.organizationId, locationId);
  const definition = metricRegistry[metricId];
  if (!definition.targetable) throw new ConvexError("Målingen understøtter ikke lokationsmål");
  if (!canViewBuiltinMetric(auth, metricId)) throw new ConvexError("Du har ikke adgang til denne måling");
  const existing = await ctx.db.query("locationTargets")
    .withIndex("by_organizationId_and_locationId_and_metricId", (q) =>
      q.eq("organizationId", auth.organizationId).eq("locationId", locationId).eq("metricId", metricId))
    .unique();
  return { auth, location, definition, existing };
}

export const upsert = mutation({
  args: {
    locationId: v.id("locations"),
    metricId: metricIdValidator,
    amount: v.number(),
    period: targetPeriodValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { auth, location, definition, existing } = await requireTargetManager(ctx, args.locationId, args.metricId);
    if (!Number.isFinite(args.amount) || args.amount < 0) throw new ConvexError("Angiv et mål på 0 eller mere");
    if (definition.unit === "percent" && args.amount > 100) throw new ConvexError("Angiv en procent på højst 100");
    // Averages and percentages are levels, not amounts per period.
    const period = targetUsesPeriod({ kind: "builtin", id: args.metricId }) ? args.period : "day";
    const fields = { amount: args.amount, period, updatedAt: Date.now(), updatedBy: auth.userId };
    const targetId = existing
      ? existing._id
      : await ctx.db.insert("locationTargets", {
          organizationId: auth.organizationId,
          locationId: args.locationId,
          metricId: args.metricId,
          ...fields,
        });
    if (existing) await ctx.db.patch("locationTargets", existing._id, fields);
    await recordAudit(ctx, auth, {
      action: "locationTargets.updated",
      entityTable: "locationTargets",
      entityId: targetId,
      summary: `Målet for ${definition.label} på ${location.name} blev sat til ${args.amount}${
        targetUsesPeriod({ kind: "builtin", id: args.metricId }) ? ` pr. ${targetPeriodLabels[period].toLowerCase()}` : ""}`,
      locationId: args.locationId,
    });
    return null;
  },
});

export const remove = mutation({
  args: { locationId: v.id("locations"), metricId: metricIdValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { auth, location, definition, existing } = await requireTargetManager(ctx, args.locationId, args.metricId);
    if (!existing) return null;
    await ctx.db.delete("locationTargets", existing._id);
    await recordAudit(ctx, auth, {
      action: "locationTargets.removed",
      entityTable: "locationTargets",
      entityId: existing._id,
      summary: `Målet for ${definition.label} på ${location.name} blev fjernet`,
      locationId: args.locationId,
    });
    return null;
  },
});
