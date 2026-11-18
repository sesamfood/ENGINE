import { Migrations } from "@convex-dev/migrations";
import { ConvexError } from "convex/values";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { storedFeatures, type FeatureId } from "./lib/features";
import { normalizeKioskDayTasks } from "./lib/kioskDay";
import { unitPriceFromLineTotal } from "./integrations/onlinepos/lib/api";
import { backfillDailyPaymentTypes } from "./lib/salesRollup";
import { gramsPerUnit } from "../lib/containers";
import { syncTargetDashboard } from "./lib/targetDashboards";

const ONLINE_POS_SOURCE = "onlinePos";

export const migrations = new Migrations<DataModel>(components.migrations);

export const fixOnlinePosLinePrices = migrations.define({
  table: "salesLines",
  batchSize: 50,
  migrateOne: async (ctx, line) => {
    if (line.source !== ONLINE_POS_SOURCE || line.pricingVersion === 1) return;

    const revenue = line.unitPrice;
    const unitPrice = unitPriceFromLineTotal(revenue, line.quantity);
    const revenueDelta = revenue - line.revenue;

    if (!Number.isSafeInteger(revenue) || !Number.isSafeInteger(unitPrice)) {
      throw new ConvexError("OnlinePOS-salgslinjen har ugyldige beløb");
    }

    if (revenueDelta !== 0) {
      const order = await ctx.db.get("salesOrders", line.orderId);
      if (
        !order ||
        order.organizationId !== line.organizationId ||
        order.locationId !== line.locationId ||
        order.source !== ONLINE_POS_SOURCE
      ) {
        throw new ConvexError("OnlinePOS-salgslinjen mangler sin salgsordre");
      }

      const daily = await ctx.db
        .query("salesDaily")
        .withIndex("by_organizationId_and_locationId_and_dayStart", (q) =>
          q
            .eq("organizationId", line.organizationId)
            .eq("locationId", line.locationId)
            .eq("dayStart", order.dayStart),
        )
        .unique();
      if (!daily) {
        throw new ConvexError("OnlinePOS-salgslinjen mangler sit dagstotal");
      }

      const orderRevenue = order.revenue + revenueDelta;
      const dailyRevenue = daily.revenue + revenueDelta;
      if (
        !Number.isSafeInteger(orderRevenue) ||
        !Number.isSafeInteger(dailyRevenue)
      ) {
        throw new ConvexError("OnlinePOS-salgstotalen er ugyldig");
      }

      const now = Date.now();
      await ctx.db.patch("salesOrders", order._id, {
        revenue: orderRevenue,
        updatedAt: now,
      });
      await ctx.db.patch("salesDaily", daily._id, {
        revenue: dailyRevenue,
        updatedAt: now,
      });
    }

    await ctx.db.patch("salesLines", line._id, {
      unitPrice,
      revenue,
      pricingVersion: 1,
    });
  },
});

// Seeds salesDaily.paymentTypes from retained orders.
export const backfillSalesDailyPaymentTypes = migrations.define({
  table: "salesDaily",
  batchSize: 10,
  migrateOne: async (ctx, daily) => {
    await backfillDailyPaymentTypes(ctx, daily);
  },
});

// Turns unit packaging weights into unlinked containers so the weights are
// kept. Units without a weight conversion keep their old value.
export const packagingWeightsToContainers = migrations.define({
  table: "productUnits",
  batchSize: 50,
  migrateOne: async (ctx, row) => {
    if (row.packagingWeight === undefined) return;
    const product = await ctx.db.get("products", row.productId);
    if (!product || product.organizationId !== row.organizationId) return;
    const siblings = await ctx.db
      .query("productUnits")
      .withIndex("by_organizationId_and_productId", (q) =>
        q
          .eq("organizationId", row.organizationId)
          .eq("productId", row.productId),
      )
      .take(200);
    const units = await Promise.all(
      siblings.map(async (sibling) => ({
        name: (await ctx.db.get("units", sibling.unitId))?.name ?? "",
        factorToDefault: sibling.factorToDefault,
      })),
    );
    const grams = gramsPerUnit(units, { name: "", factorToDefault: row.factorToDefault });
    if (!grams) return;

    const weightGrams = Math.round(row.packagingWeight * grams * 1000) / 1000;
    const name = `Beholder ${
      weightGrams >= 1000
        ? `${(weightGrams / 1000).toLocaleString("da-DK")} kg`
        : `${weightGrams.toLocaleString("da-DK")} g`
    }`;
    const normalizedName = name.toLocaleLowerCase("da");
    const existing = await ctx.db
      .query("containers")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q
          .eq("organizationId", row.organizationId)
          .eq("normalizedName", normalizedName),
      )
      .first();
    if (!existing) {
      await ctx.db.insert("containers", {
        organizationId: row.organizationId,
        name,
        normalizedName,
        weightGrams,
        status: "active",
        createdBy: product.createdBy,
        updatedAt: Date.now(),
      });
    }
    await ctx.db.patch("productUnits", row._id, { packagingWeight: undefined });
  },
});

// Creates the generated target dashboards for targets set before they existed.
export const createLocationTargetDashboards = migrations.define({
  table: "locationTargets",
  batchSize: 50,
  migrateOne: async (ctx, target) => {
    await syncTargetDashboard(ctx, target.organizationId, target.locationId, target.updatedBy);
  },
});

// Food safety rename: renames stored ids and points audit rows at the foodSafety* copies.
// Run once with `npx convex run migrations:runFoodSafetyRename`; every step is idempotent.

type FoodSafetyTable =
  | "foodSafetyTemplates"
  | "foodSafetyTemplateVersions"
  | "foodSafetyEntries"
  | "foodSafetyEntryRevisions"
  | "foodSafetyAttachments"
  | "foodSafetySettings";

// Every foodSafety* table has the same by_legacyId index.
async function findCopy(ctx: MutationCtx, table: FoodSafetyTable, legacyId: string) {
  return await ctx.db.query(table as "foodSafetyTemplates")
    .withIndex("by_legacyId", (q) => q.eq("legacyId", legacyId))
    .unique();
}

const auditTables: Record<string, FoodSafetyTable> = {
  ownCheckTemplates: "foodSafetyTemplates",
  ownCheckEntries: "foodSafetyEntries",
  ownCheckSettings: "foodSafetySettings",
};

export const renameFoodSafetyAuditLog = migrations.define({
  table: "auditLog",
  migrateOne: async (ctx, row) => {
    const action = renameFoodSafetyId(row.action);
    const table = auditTables[row.entityTable];
    if (!table) return action === row.action ? undefined : { action };
    const copy = await findCopy(ctx, table, row.entityId);
    return { action, entityTable: table, entityId: copy?._id ?? row.entityId };
  },
});

function renameFoodSafetyId(id: string) {
  if (id === "ownChecks") return "foodSafety";
  return id.startsWith("ownChecks.") ? `foodSafety.${id.slice("ownChecks.".length)}` : id;
}

function renameIds<T extends string>(ids: readonly T[]) {
  const renamed = ids.map(renameFoodSafetyId);
  return renamed.some((id, index) => id !== ids[index]) ? [...new Set(renamed)] : null;
}

function renamedFeatures(features: readonly string[]) {
  return renameIds(features) ? storedFeatures(features as FeatureId[]) : null;
}

export const renameFoodSafetyRolePermissions = migrations.define({
  table: "rolePermissions",
  migrateOne: (_ctx, row) => {
    const permissions = renameIds(row.permissions);
    if (permissions) return { permissions };
  },
});

export const renameFoodSafetyApiKeyPermissions = migrations.define({
  table: "apiKeyPolicies",
  migrateOne: (_ctx, row) => {
    const permissions = renameIds(row.permissions);
    if (permissions) return { permissions };
  },
});

export const renameFoodSafetySupportPermissions = migrations.define({
  table: "supportGrants",
  migrateOne: (_ctx, row) => {
    const permissions = renameIds(row.permissions);
    if (permissions) return { permissions };
  },
});

export const renameFoodSafetyEntitlements = migrations.define({
  table: "organizationEntitlements",
  migrateOne: (_ctx, row) => {
    const features = renamedFeatures(row.features);
    if (features) return { features };
  },
});

export const renameFoodSafetyPlans = migrations.define({
  table: "plans",
  migrateOne: (_ctx, row) => {
    const features = renamedFeatures(row.features);
    if (features) return { features };
  },
});

export const renameFoodSafetyAddOns = migrations.define({
  table: "addOns",
  migrateOne: (_ctx, row) => {
    const features = renamedFeatures(row.features);
    if (features) return { features };
  },
});

export const renameFoodSafetyFeatureSettings = migrations.define({
  table: "featureSettings",
  migrateOne: (_ctx, row) => {
    const disabledFeatures = renamedFeatures(row.disabledFeatures);
    if (disabledFeatures) return { disabledFeatures };
  },
});

export const renameFoodSafetyKioskSettings = migrations.define({
  table: "kioskSettings",
  migrateOne: (_ctx, row) => {
    const homePage = renameFoodSafetyId(row.homePage);
    const enabledPages = renameIds(row.enabledPages);
    const pinFeatures = row.pinFeatures && renameIds(row.pinFeatures);
    if (homePage === row.homePage && !enabledPages && !pinFeatures) return;
    return {
      homePage,
      ...(enabledPages && { enabledPages }),
      ...(pinFeatures && { pinFeatures }),
    };
  },
});

export const renameFoodSafetySidebarSettings = migrations.define({
  table: "sidebarSettings",
  migrateOne: (_ctx, row) => {
    const itemOrder = renameIds(row.itemOrder);
    if (itemOrder) return { itemOrder };
  },
});

export const renameFoodSafetyKioskDayTasks = migrations.define({
  table: "kioskDayTasks",
  migrateOne: (_ctx, row) => {
    const hasLegacyLink = (tasks: typeof row.endOfDay) =>
      tasks.some((task) => typeof task !== "string" && task.link?.startsWith("ownChecks."));
    if (!hasLegacyLink(row.endOfDay) && !hasLegacyLink(row.startOfDay)) return;
    return {
      endOfDay: normalizeKioskDayTasks(row.endOfDay),
      startOfDay: normalizeKioskDayTasks(row.startOfDay),
    };
  },
});

export const renameFoodSafetyFeedback = migrations.define({
  table: "feedbackSubmissions",
  migrateOne: (_ctx, row) => {
    if (row.area === "ownChecks") return { area: "foodSafety" };
  },
});

// Ids first so access survives the deploy; audit last.
export const runFoodSafetyRename = migrations.runner([
  internal.migrations.renameFoodSafetyRolePermissions,
  internal.migrations.renameFoodSafetyApiKeyPermissions,
  internal.migrations.renameFoodSafetySupportPermissions,
  internal.migrations.renameFoodSafetyEntitlements,
  internal.migrations.renameFoodSafetyPlans,
  internal.migrations.renameFoodSafetyAddOns,
  internal.migrations.renameFoodSafetyFeatureSettings,
  internal.migrations.renameFoodSafetyKioskSettings,
  internal.migrations.renameFoodSafetySidebarSettings,
  internal.migrations.renameFoodSafetyKioskDayTasks,
  internal.migrations.renameFoodSafetyFeedback,
  internal.migrations.renameFoodSafetyAuditLog,
]);
