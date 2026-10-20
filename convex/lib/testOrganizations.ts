import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { getDatabaseAdapter } from "../auth";

export async function getTestOrganization(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
) {
  return await ctx.db
    .query("testOrganizations")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
}

export async function getTestOrganizationForSource(
  ctx: QueryCtx | MutationCtx,
  sourceOrganizationId: string,
) {
  return await ctx.db
    .query("testOrganizations")
    .withIndex("by_sourceOrganizationId", (q) =>
      q.eq("sourceOrganizationId", sourceOrganizationId),
    )
    .unique();
}

export async function getCopiedId(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  sourceId: string,
) {
  const row = await ctx.db
    .query("testOrganizationCopies")
    .withIndex("by_organizationId_and_sourceId", (q) =>
      q.eq("organizationId", organizationId).eq("sourceId", sourceId),
    )
    .unique();
  return row?.targetId ?? null;
}

// Users reach a test organization through their source membership, so removing them
// from the source organization or changing their role or locations applies here too.
export async function resolveTestOrganizationMember(
  ctx: QueryCtx | MutationCtx,
  testOrganization: Doc<"testOrganizations">,
  userId: string,
) {
  if (testOrganization.status !== "ready") {
    throw new ConvexError("Testorganisationen er ikke klar. Prøv igen om lidt");
  }
  const source = await getDatabaseAdapter(ctx).findOne<{ role: string }>({
    model: "member",
    where: [
      { field: "organizationId", value: testOrganization.sourceOrganizationId },
      { field: "userId", value: userId },
    ],
  });
  if (!source) throw new ConvexError("Ingen aktiv organisation");
  const access = await ctx.db
    .query("memberLocationAccess")
    .withIndex("by_organizationId_and_userId", (q) =>
      q
        .eq("organizationId", testOrganization.sourceOrganizationId)
        .eq("userId", userId),
    )
    .unique();
  const copy = async (sourceId: string) => {
    const targetId = await getCopiedId(ctx, testOrganization.organizationId, sourceId);
    return targetId === null ? null : ctx.db.normalizeId("locations", targetId);
  };
  const locationIds = access
    ? (await Promise.all(access.locationIds.map(copy))).filter((id) => id !== null)
    : [];
  const operatorTargetId = access?.operatorId
    ? await getCopiedId(ctx, testOrganization.organizationId, access.operatorId)
    : null;
  const operatorId = operatorTargetId
    ? (ctx.db.normalizeId("operators", operatorTargetId) ?? undefined)
    : undefined;
  return {
    role: source.role,
    locationAccess: access ? { scope: access.scope, locationIds, operatorId } : null,
  };
}

export const TEST_ORGANIZATION_DELIVERY_ERROR =
  "Testorganisationer sender ikke e-mails eller data til andre systemer";

// Call inside the delivery's error handling so the record shows why nothing was sent.
export async function requireExternalDelivery(ctx: ActionCtx, organizationId: string) {
  if (await ctx.runQuery(internal.testOrganizations.isTestOrganization, { organizationId })) {
    throw new ConvexError(TEST_ORGANIZATION_DELIVERY_ERROR);
  }
}
