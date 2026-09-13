import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";

const MAX_ALLOWANCES_PER_ORGANIZATION = 10 * 20;

export async function getStaffFoodCategoryIds(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
) {
  const allowances = await ctx.db
    .query("staffFoodRuleAllowances")
    .withIndex("by_organizationId_and_categoryId", (q) =>
      q.eq("organizationId", organizationId),
    )
    .take(MAX_ALLOWANCES_PER_ORGANIZATION + 1);
  if (allowances.length > MAX_ALLOWANCES_PER_ORGANIZATION) {
    throw new ConvexError("Organisationen har for mange Staff food-regler");
  }
  return new Set(
    allowances.flatMap((allowance) =>
      allowance.categoryIds ?? [allowance.categoryId],
    ),
  );
}
