import { ConvexError, v } from "convex/values";
import { permissionIds, type PermissionId } from "../../lib/auth-permissions";
import { internal } from "../_generated/api";
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { getActiveSupportGrant } from "../lib/auth";
import { recordAudit, requireAuditReason } from "../lib/audit";
import { getPlatformMember, recordPlatformAudit, requirePlatformMember } from "../lib/platformAuth";
import { requirePlatformOrganization } from "./organizations";

const MAX_GRANT_HOURS = 8;

const viewPermissions: readonly PermissionId[] = [
  "ownChecks.view",
  "transfers.view",
  "invoices.view",
  "expenses.view",
  "count.viewStock",
  "waste.report",
  "dashboard.view",
  "dashboard.viewSales",
  "dashboard.viewFinancials",
  "sales.viewAggregate",
  "sales.viewDetail",
  "employees.schedule",
  "employees.directory",
];

// Full support can do everything an Administrator can, except manage API keys and roles.
const fullPermissions = permissionIds.filter(
  (permission) => permission !== "apiKeys.manage" && permission !== "roles.manage",
);

const modeLabels = { view: "visning", full: "fuld adgang" } as const;

async function endGrant(
  ctx: MutationCtx,
  actor: { userId: string; userName: string },
  grant: Doc<"supportGrants">,
) {
  const now = Date.now();
  await ctx.db.patch("supportGrants", grant._id, {
    endedAt: now,
    expiresAt: Math.min(grant.expiresAt, now),
  });
  await recordPlatformAudit(ctx, actor, {
    organizationId: grant.organizationId,
    action: "support.ended",
    summary: "Supportadgang afsluttet",
  });
  await recordAudit(
    ctx,
    {
      organizationId: grant.organizationId,
      principalKind: "support",
      userId: actor.userId,
      userName: `Support: ${actor.userName}`,
    },
    {
      action: "support.ended",
      entityTable: "supportGrants",
      entityId: grant._id,
      summary: "Support har afsluttet adgangen til organisationen",
    },
  );
}

export const start = mutation({
  args: {
    organizationId: v.string(),
    reason: v.string(),
    mode: v.union(v.literal("view"), v.literal("full")),
    hours: v.number(),
  },
  returns: v.id("supportGrants"),
  handler: async (ctx, args) => {
    const actor = await requirePlatformMember(ctx);
    const reason = requireAuditReason(args.reason);
    if (
      !Number.isInteger(args.hours) ||
      args.hours < 1 ||
      args.hours > MAX_GRANT_HOURS
    ) {
      throw new ConvexError(
        `Supportadgang kan vare fra 1 til ${MAX_GRANT_HOURS} timer`,
      );
    }
    const organization = await requirePlatformOrganization(
      ctx,
      args.organizationId,
    );
    const current = await getActiveSupportGrant(ctx, actor.userId);
    if (current) await endGrant(ctx, actor, current);
    const now = Date.now();
    const grantId = await ctx.db.insert("supportGrants", {
      organizationId: organization.id,
      platformUserId: actor.userId,
      platformUserName: actor.userName,
      reason,
      mode: args.mode,
      permissions: [...(args.mode === "view" ? viewPermissions : fullPermissions)],
      startedAt: now,
      expiresAt: now + args.hours * 60 * 60 * 1000,
    });
    // Queries do not rerun as time passes, so expiry writes the grant to invalidate them.
    await ctx.scheduler.runAt(
      now + args.hours * 60 * 60 * 1000,
      internal.platform.support.expire,
      { grantId },
    );
    const summary = `Supportadgang med ${modeLabels[args.mode]} i ${args.hours} ${args.hours === 1 ? "time" : "timer"}`;
    await recordPlatformAudit(ctx, actor, {
      organizationId: organization.id,
      action: "support.started",
      summary,
      reason,
    });
    await recordAudit(
      ctx,
      {
        organizationId: organization.id,
        principalKind: "support",
        userId: actor.userId,
        userName: `Support: ${actor.userName}`,
      },
      {
        action: "support.started",
        entityTable: "supportGrants",
        entityId: grantId,
        summary,
        reason,
      },
    );
    return grantId;
  },
});

export const expire = internalMutation({
  args: { grantId: v.id("supportGrants") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const grant = await ctx.db.get("supportGrants", args.grantId);
    if (grant && grant.endedAt === undefined) {
      await ctx.db.patch("supportGrants", grant._id, { endedAt: grant.expiresAt });
    }
    return null;
  },
});

export const end = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const actor = await requirePlatformMember(ctx);
    const grant = await getActiveSupportGrant(ctx, actor.userId);
    if (grant) await endGrant(ctx, actor, grant);
    return null;
  },
});

export const current = query({
  args: {},
  returns: v.union(
    v.object({
      organizationId: v.string(),
      organizationName: v.string(),
      organizationSlug: v.string(),
      organizationLogo: v.union(v.string(), v.null()),
      mode: v.union(v.literal("view"), v.literal("full")),
      expiresAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const member = await getPlatformMember(ctx);
    if (!member) return null;
    const grant = await getActiveSupportGrant(ctx, member.userId);
    if (!grant) return null;
    const organization = await requirePlatformOrganization(
      ctx,
      grant.organizationId,
    );
    return {
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      organizationLogo: organization.logo ?? null,
      mode: grant.mode,
      expiresAt: grant.expiresAt,
    };
  },
});
