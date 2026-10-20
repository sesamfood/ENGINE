import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx } from "../_generated/server";
import { integrationIdValidator } from "../integrations/state";
import { featureIdValidator } from "../lib/features";
import { recordPlatformAudit, requirePlatformMember } from "../lib/platformAuth";

const planFields = {
  name: v.string(),
  features: v.array(featureIdValidator),
  integrations: v.array(integrationIdValidator),
};

async function normalize(
  ctx: MutationCtx,
  args: { name: string; features: string[]; integrations: string[] },
  planId?: Id<"plans">,
) {
  const name = args.name.trim();
  if (!name) throw new ConvexError("Planen skal have et navn");
  if (name.length > 100) throw new ConvexError("Navnet må højst være 100 tegn");
  const plans = await ctx.db.query("plans").take(200);
  const lower = name.toLocaleLowerCase("da");
  if (plans.some((plan) => plan._id !== planId && plan.name.toLocaleLowerCase("da") === lower)) {
    throw new ConvexError("Der findes allerede en plan med det navn");
  }
  return name;
}

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id("plans"),
      ...planFields,
      deprecated: v.boolean(),
      organizationCount: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requirePlatformMember(ctx);
    const plans = await ctx.db.query("plans").take(200);
    const rows = await Promise.all(
      plans.map(async (plan) => {
        const organizations = await ctx.db
          .query("organizationEntitlements")
          .withIndex("by_planId", (q) => q.eq("planId", plan._id))
          .take(1000);
        return {
          id: plan._id,
          name: plan.name,
          features: plan.features,
          integrations: plan.integrations,
          deprecated: plan.deprecated,
          organizationCount: organizations.length,
        };
      }),
    );
    return rows.sort(
      (a, b) =>
        Number(a.deprecated) - Number(b.deprecated) ||
        a.name.localeCompare(b.name, "da"),
    );
  },
});

export const create = mutation({
  args: planFields,
  returns: v.id("plans"),
  handler: async (ctx, args) => {
    const actor = await requirePlatformMember(ctx, "owner");
    const name = await normalize(ctx, args);
    const planId = await ctx.db.insert("plans", {
      name,
      features: [...new Set(args.features)],
      integrations: [...new Set(args.integrations)],
      deprecated: false,
      createdAt: Date.now(),
    });
    await recordPlatformAudit(ctx, actor, {
      action: "plans.created",
      summary: `Plan oprettet: ${name}`,
    });
    return planId;
  },
});

export const update = mutation({
  args: { planId: v.id("plans"), ...planFields, deprecated: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requirePlatformMember(ctx, "owner");
    const current = await ctx.db.get("plans", args.planId);
    if (!current) throw new ConvexError("Planen blev ikke fundet");
    const name = await normalize(ctx, args, args.planId);
    await ctx.db.patch("plans", args.planId, {
      name,
      features: [...new Set(args.features)],
      integrations: [...new Set(args.integrations)],
      deprecated: args.deprecated,
    });
    await recordPlatformAudit(ctx, actor, {
      action: "plans.changed",
      summary: `Plan ændret: ${name}${
        args.deprecated !== current.deprecated
          ? args.deprecated
            ? " (udfaset)"
            : " (genaktiveret)"
          : ""
      }`,
    });
    return null;
  },
});

export const remove = mutation({
  args: { planId: v.id("plans") },
  returns: v.null(),
  handler: async (ctx, { planId }) => {
    const actor = await requirePlatformMember(ctx, "owner");
    const plan = await ctx.db.get("plans", planId);
    if (!plan) throw new ConvexError("Planen blev ikke fundet");
    const inUse = await ctx.db
      .query("organizationEntitlements")
      .withIndex("by_planId", (q) => q.eq("planId", planId))
      .first();
    if (inUse) {
      throw new ConvexError(
        "Planen bruges af en organisation. Flyt organisationerne eller udfas planen i stedet.",
      );
    }
    await ctx.db.delete("plans", planId);
    await recordPlatformAudit(ctx, actor, {
      action: "plans.deleted",
      summary: `Plan slettet: ${plan.name}`,
    });
    return null;
  },
});
