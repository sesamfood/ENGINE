import { v, type Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const foodSafetyPageValidator = v.union(
  v.literal("foodSafety.today"),
  v.literal("foodSafety.overview"),
  v.literal("foodSafety.documentation"),
  v.literal("foodSafety.allergens"),
  v.literal("foodSafety.guidance"),
  v.literal("foodSafety.cleaning"),
);

export type FoodSafetyPage = Infer<typeof foodSafetyPageValidator>;

export const DEFAULT_FOOD_SAFETY_CONFIGURATION = {
  lateSubmissionDays: 7,
  requireSecondPersonApproval: true,
  blockDuringCount: false,
} as const;

export type FoodSafetyConfiguration = {
  lateSubmissionDays: number;
  requireSecondPersonApproval: boolean;
  blockDuringCount: boolean;
  hiddenPages: FoodSafetyPage[];
};

export function configurationFrom(
  row: Pick<Doc<"foodSafetySettings">, "lateSubmissionDays" | "requireSecondPersonApproval" | "blockDuringCount" | "hiddenPages"> | null,
): FoodSafetyConfiguration {
  return {
    lateSubmissionDays:
      row?.lateSubmissionDays ?? DEFAULT_FOOD_SAFETY_CONFIGURATION.lateSubmissionDays,
    requireSecondPersonApproval:
      row?.requireSecondPersonApproval ?? DEFAULT_FOOD_SAFETY_CONFIGURATION.requireSecondPersonApproval,
    blockDuringCount:
      row?.blockDuringCount ?? DEFAULT_FOOD_SAFETY_CONFIGURATION.blockDuringCount,
    hiddenPages: row?.hiddenPages ?? [],
  };
}

export async function getFoodSafetyConfiguration(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
) {
  const row = await ctx.db
    .query("foodSafetySettings")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  return configurationFrom(row);
}
