import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const DEFAULT_OWN_CHECK_CONFIGURATION = {
  lateSubmissionDays: 7,
  requireSecondPersonApproval: true,
  blockDuringCount: false,
} as const;

export type OwnCheckConfiguration = {
  lateSubmissionDays: number;
  requireSecondPersonApproval: boolean;
  blockDuringCount: boolean;
};

export function configurationFrom(
  row: Pick<Doc<"ownCheckSettings">, "lateSubmissionDays" | "requireSecondPersonApproval" | "blockDuringCount"> | null,
): OwnCheckConfiguration {
  return {
    lateSubmissionDays:
      row?.lateSubmissionDays ?? DEFAULT_OWN_CHECK_CONFIGURATION.lateSubmissionDays,
    requireSecondPersonApproval:
      row?.requireSecondPersonApproval ?? DEFAULT_OWN_CHECK_CONFIGURATION.requireSecondPersonApproval,
    blockDuringCount:
      row?.blockDuringCount ?? DEFAULT_OWN_CHECK_CONFIGURATION.blockDuringCount,
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
