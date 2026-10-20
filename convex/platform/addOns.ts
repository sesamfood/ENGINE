import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { mutation, query, type MutationCtx } from "../_generated/server";
import {
  recordPlatformAudit,
  requirePlatformMember,
} from "../lib/platformAuth";
import { accessFields, uniqueName } from "./plans";

async function addOnName(
  ctx: MutationCtx,
  value: string,
  addOnId?: Id<"addOns">,
) {
  return uniqueName(
    value,
    await ctx.db.query("addOns").take(200),
    addOnId,
    "Der findes allerede et tilkøb med det navn",
  );
}

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id("addOns"),
      ...accessFields,
      deprecated: v.boolean(),
      planCount: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requirePlatformMember(ctx);
    const [addOns, plans] = await Promise.all([
      ctx.db.query("addOns").take(200),
      ctx.db.query("plans").take(200),
    ]);
    return addOns
      .map((addOn) => ({
        id: addOn._id,
        name: addOn.name,
        features: addOn.features,
        integrations: addOn.integrations,
        deprecated: addOn.deprecated,
        planCount: plans.filter((plan) => plan.addOnIds?.includes(addOn._id))
          .length,
      }))
      .sort(
        (a, b) =>
          Number(a.deprecated) - Number(b.deprecated) ||
          a.name.localeCompare(b.name, "da"),
      );
  },
});

export const create = mutation({
  args: accessFields,
  returns: v.id("addOns"),
  handler: async (ctx, args) => {
    const actor = await requirePlatformMember(ctx, "owner");
    const name = await addOnName(ctx, args.name);
    const addOnId = await ctx.db.insert("addOns", {
      name,
      features: [...new Set(args.features)],
      integrations: [...new Set(args.integrations)],
      deprecated: false,
      createdAt: Date.now(),
    });
    await recordPlatformAudit(ctx, actor, {
      action: "addOns.created",
      summary: `Tilkøb oprettet: ${name}`,
    });
    return addOnId;
  },
});

export const update = mutation({
  args: { addOnId: v.id("addOns"), ...accessFields, deprecated: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requirePlatformMember(ctx, "owner");
    const current = await ctx.db.get("addOns", args.addOnId);
    if (!current) throw new ConvexError("Tilkøbet blev ikke fundet");
    const name = await addOnName(ctx, args.name, args.addOnId);
    await ctx.db.patch("addOns", args.addOnId, {
      name,
      features: [...new Set(args.features)],
      integrations: [...new Set(args.integrations)],
      deprecated: args.deprecated,
    });
    await recordPlatformAudit(ctx, actor, {
      action: "addOns.changed",
      summary: `Tilkøb ændret: ${name}${
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

// Organizations only get add-ons their plan offers, so an add-on on no plan is unused.
export const remove = mutation({
  args: { addOnId: v.id("addOns") },
  returns: v.null(),
  handler: async (ctx, { addOnId }) => {
    const actor = await requirePlatformMember(ctx, "owner");
    const addOn = await ctx.db.get("addOns", addOnId);
    if (!addOn) throw new ConvexError("Tilkøbet blev ikke fundet");
    const plans = await ctx.db.query("plans").take(200);
    if (plans.some((plan) => plan.addOnIds?.includes(addOnId))) {
      throw new ConvexError(
        "Tilkøbet er på en plan. Fjern det fra planerne eller udfas det i stedet.",
      );
    }
    await ctx.db.delete("addOns", addOnId);
    await recordPlatformAudit(ctx, actor, {
      action: "addOns.deleted",
      summary: `Tilkøb slettet: ${addOn.name}`,
    });
    return null;
  },
});
