import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx } from "../_generated/server";
import { integrationIdValidator } from "../integrations/state";
import { featureIdValidator } from "../lib/features";
import { recordPlatformAudit, requirePlatformMember } from "../lib/platformAuth";

export const accessFields = {
  name: v.string(),
  features: v.array(featureIdValidator),
  integrations: v.array(integrationIdValidator),
};

const planFields = { ...accessFields, addOnIds: v.array(v.id("addOns")) };

export function uniqueName(
  value: string,
  existing: { _id: string; name: string }[],
  id: string | undefined,
  taken: string,
) {
  const name = value.trim();
  if (!name) throw new ConvexError("Navnet mangler");
  if (name.length > 100) throw new ConvexError("Navnet må højst være 100 tegn");
  const lower = name.toLocaleLowerCase("da");
  if (existing.some((row) => row._id !== id && row.name.toLocaleLowerCase("da") === lower)) {
    throw new ConvexError(taken);
  }
  return name;
}

// Deprecated add-ons may stay on a plan but cannot be added to it.
async function checkAddOns(
  ctx: MutationCtx,
  addOnIds: Id<"addOns">[],
  currentIds: Id<"addOns">[] = [],
) {
  const unique = [...new Set(addOnIds)];
  for (const id of unique) {
    const addOn = await ctx.db.get("addOns", id);
    if (!addOn) throw new ConvexError("Et tilkøb blev ikke fundet");
    if (addOn.deprecated && !currentIds.includes(id)) {
      throw new ConvexError(`${addOn.name} er udfaset og kan ikke tilføjes`);
    }
  }
  return unique;
}

async function planName(ctx: MutationCtx, value: string, planId?: Id<"plans">) {
  return uniqueName(
    value,
    await ctx.db.query("plans").take(200),
    planId,
    "Der findes allerede en plan med det navn",
  );
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
          addOnIds: plan.addOnIds ?? [],
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
    const name = await planName(ctx, args.name);
    const planId = await ctx.db.insert("plans", {
      name,
      features: [...new Set(args.features)],
      integrations: [...new Set(args.integrations)],
      addOnIds: await checkAddOns(ctx, args.addOnIds),
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
    const name = await planName(ctx, args.name, args.planId);
    await ctx.db.patch("plans", args.planId, {
      name,
      features: [...new Set(args.features)],
      integrations: [...new Set(args.integrations)],
      addOnIds: await checkAddOns(ctx, args.addOnIds, current.addOnIds),
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
