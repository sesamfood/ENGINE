import { v, type Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const ownCheckPageValidator = v.union(
  v.literal("ownChecks.today"),
  v.literal("ownChecks.overview"),
  v.literal("ownChecks.documentation"),
  v.literal("ownChecks.allergens"),
  v.literal("ownChecks.guidance"),
);

export type OwnCheckPage = Infer<typeof ownCheckPageValidator>;

export const DEFAULT_OWN_CHECK_CONFIGURATION = {
  lateSubmissionDays: 7,
  requireSecondPersonApproval: true,
  blockDuringCount: false,
} as const;

export type OwnCheckConfiguration = {
  lateSubmissionDays: number;
  requireSecondPersonApproval: boolean;
  blockDuringCount: boolean;
  hiddenPages: OwnCheckPage[];
};

export function configurationFrom(
  row: Pick<Doc<"ownCheckSettings">, "lateSubmissionDays" | "requireSecondPersonApproval" | "blockDuringCount" | "hiddenPages"> | null,
): OwnCheckConfiguration {
  return {
    lateSubmissionDays:
      row?.lateSubmissionDays ?? DEFAULT_OWN_CHECK_CONFIGURATION.lateSubmissionDays,
    requireSecondPersonApproval:
      row?.requireSecondPersonApproval ?? DEFAULT_OWN_CHECK_CONFIGURATION.requireSecondPersonApproval,
    blockDuringCount:
      row?.blockDuringCount ?? DEFAULT_OWN_CHECK_CONFIGURATION.blockDuringCount,
    hiddenPages: row?.hiddenPages ?? [],
  };
}

export async function getOwnCheckConfiguration(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
) {
  const row = await ctx.db
    .query("ownCheckSettings")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  return configurationFrom(row);
}
