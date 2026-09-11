import { v } from "convex/values";

export const nullableKpiNumber = v.union(v.number(), v.null());
export const nullableKpiString = v.union(v.string(), v.null());
export const monthlyKpiCellValidator = v.object({
  value: nullableKpiNumber,
  reason: nullableKpiString,
  estimated: v.boolean(),
  status: v.union(v.literal("missing"), v.literal("provisional"), v.literal("approved"), v.literal("ready")),
  source: nullableKpiString,
});
export const monthlyKpiAmountsValidator = v.object({
  sales: monthlyKpiCellValidator, transactions: monthlyKpiCellValidator,
  labour: monthlyKpiCellValidator, cogs: monthlyKpiCellValidator, waste: monthlyKpiCellValidator,
  rent: monthlyKpiCellValidator, utilities: monthlyKpiCellValidator, other: monthlyKpiCellValidator,
});
export const monthlyKpiInputsValidator = v.object({
  organizationId: v.string(), month: v.string(), through: nullableKpiString, currency: nullableKpiString,
  periods: v.array(v.object({ month: v.string(), through: v.string() })),
  locations: v.array(v.object({
    id: v.id("locations"), name: v.string(), currency: v.string(),
    periods: v.array(monthlyKpiAmountsValidator.extend({ month: v.string() })),
    budget: monthlyKpiAmountsValidator.extend({ guestScore: monthlyKpiCellValidator }),
  })),
  updatedAt: nullableKpiNumber, revision: v.string(),
});
export const monthlyKpiReportValidator = v.object({
  month: v.string(), through: nullableKpiString, currency: nullableKpiString,
  rows: v.array(v.object({
    id: v.union(v.literal("salesRevenue"), v.literal("salesOrderCount"), v.literal("averageBasket"),
      v.literal("cogsPercent"), v.literal("labourPercent"), v.literal("grossMarginPercent"), v.literal("wastePercent"),
      v.literal("rentPercent"), v.literal("utilitiesPercent"), v.literal("primeCostPercent"), v.literal("ebitdaPercent"), v.literal("guestScore")),
    label: v.string(), unit: v.union(v.literal("currency"), v.literal("count"), v.literal("percent"), v.literal("score")),
    actual: monthlyKpiCellValidator, budget: monthlyKpiCellValidator, variance: monthlyKpiCellValidator,
    lastMonth: monthlyKpiCellValidator, ytd: monthlyKpiCellValidator,
  })),
  updatedAt: nullableKpiNumber, revision: v.string(),
});
