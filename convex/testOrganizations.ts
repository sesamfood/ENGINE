import { ConvexError, v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { getDatabaseAdapter } from "./auth";
import {
  getActiveSupportGrant,
  getUserSession,
  isApiKeyIdentity,
  requireOrganization,
} from "./lib/auth";
import {
  getTestOrganization,
  getTestOrganizationForSource,
} from "./lib/testOrganizations";

export const isTestOrganization = internalQuery({
  args: { organizationId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) =>
    (await getTestOrganization(ctx, args.organizationId)) !== null,
});

export const current = query({
  args: {},
  returns: v.union(
    v.object({
      kind: v.literal("test"),
      sourceOrganizationId: v.string(),
      sourceName: v.string(),
    }),
    v.object({ kind: v.literal("source"), testOrganizationId: v.string() }),
    v.null(),
  ),
  handler: async (ctx) => {
    // Reads the session instead of requireOrganization, so users can leave a test
    // organization while it is being reset.
    const identity = await ctx.auth.getUserIdentity();
    if (!identity || isApiKeyIdentity(identity)) return null;
    const session = await getUserSession(ctx, identity);
    const organizationId = session?.activeOrganizationId;
    if (!session || !organizationId || session.isKioskAccount) return null;
    if (await getActiveSupportGrant(ctx, session.userId)) return null;
    const test = await getTestOrganization(ctx, organizationId);
    if (test) {
      const source = await getDatabaseAdapter(ctx).findOne<{ name: string }>({
        model: "organization",
        where: [{ field: "id", value: test.sourceOrganizationId }],
      });
      return {
        kind: "test" as const,
        sourceOrganizationId: test.sourceOrganizationId,
        sourceName: source?.name ?? "",
      };
    }
    const member = await getDatabaseAdapter(ctx).findOne({
      model: "member",
      where: [
        { field: "organizationId", value: organizationId },
        { field: "userId", value: session.userId },
      ],
    });
    if (!member) return null;
    const available = await getTestOrganizationForSource(ctx, organizationId);
    return available?.status === "ready"
      ? { kind: "source" as const, testOrganizationId: available.organizationId }
      : null;
  },
});

// Adds the user to the test organization so Better Auth can make it active. The stored
// role is only for Better Auth; access is resolved from the source membership.
export const enter = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const auth = await requireOrganization(ctx);
    if (auth.principalKind !== "user" || !auth.userId || auth.isKioskAccount) {
      throw new ConvexError("Du har ikke adgang til testorganisationen");
    }
    const test = await getTestOrganizationForSource(ctx, auth.organizationId);
    if (test?.status !== "ready") {
      throw new ConvexError("Testorganisationen er ikke klar");
    }
    const adapter = getDatabaseAdapter(ctx);
    const member = await adapter.findOne<{ id: string; role: string }>({
      model: "member",
      where: [
        { field: "organizationId", value: test.organizationId },
        { field: "userId", value: auth.userId },
      ],
    });
    if (!member) {
      await adapter.create({
        model: "member",
        data: {
          organizationId: test.organizationId,
          userId: auth.userId,
          role: auth.role,
          createdAt: new Date(),
        },
      });
    } else if (member.role !== auth.role) {
      await adapter.update({
        model: "member",
        where: [{ field: "id", value: member.id }],
        update: { role: auth.role },
      });
    }
    return test.organizationId;
  },
});
