import { ConvexError, v } from "convex/values";
import { MAX_CLEANING_VIDEO_BYTES } from "../lib/food-safety-cleaning";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import {
  requireFoodSafetyManager,
  requireFoodSafetyReader,
  requireHumanPrincipal,
} from "./lib/auth";
import { recordAudit } from "./lib/audit";
import { claimStorageForOrganization } from "./lib/storageOwnership";

const MAX_TASKS = 200;
const MAX_TOOLS = 30;

const taskInput = {
  name: v.string(),
  description: v.string(),
  toolProductIds: v.array(v.id("products")),
  videoStorageId: v.union(v.id("_storage"), v.null()),
};

const taskValidator = v.object({
  id: v.id("foodSafetyCleaningTasks"),
  name: v.string(),
  description: v.string(),
  tools: v.array(v.object({
    id: v.id("products"),
    name: v.string(),
    imageUrl: v.union(v.string(), v.null()),
  })),
  videoStorageId: v.union(v.id("_storage"), v.null()),
  videoUrl: v.union(v.string(), v.null()),
});

async function validateTask(
  ctx: MutationCtx,
  organizationId: string,
  input: { name: string; description: string; toolProductIds: Id<"products">[]; videoStorageId: Id<"_storage"> | null },
  exceptId?: Id<"foodSafetyCleaningTasks">,
) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw new ConvexError("Navnet skal udfyldes");
  if (name.length > 100) throw new ConvexError("Navnet må højst være 100 tegn");
  const normalizedName = name.toLocaleLowerCase("da");
  const existing = await ctx.db
    .query("foodSafetyCleaningTasks")
    .withIndex("by_organizationId_and_normalizedName", (q) => q.eq("organizationId", organizationId).eq("normalizedName", normalizedName))
    .first();
  if (existing && existing._id !== exceptId) throw new ConvexError("Navnet bruges allerede");
  const description = input.description.trim();
  if (description.length > 4_000) throw new ConvexError("Beskrivelsen må højst være 4.000 tegn");
  const toolProductIds = [...new Set(input.toolProductIds)];
  if (toolProductIds.length > MAX_TOOLS) throw new ConvexError(`Vælg højst ${MAX_TOOLS} produkter`);
  const products = await Promise.all(toolProductIds.map((id) => ctx.db.get("products", id)));
  if (products.some((product) => !product || product.organizationId !== organizationId)) {
    throw new ConvexError("Et produkt tilhører ikke organisationen");
  }
  if (input.videoStorageId) {
    const file = await ctx.db.system.get("_storage", input.videoStorageId);
    if (!file?.contentType?.startsWith("video/") || file.size > MAX_CLEANING_VIDEO_BYTES) {
      throw new ConvexError("Brug en video på højst 200 MB");
    }
    await claimStorageForOrganization(ctx, organizationId, input.videoStorageId);
  }
  return {
    name,
    normalizedName,
    description,
    toolProductIds,
    videoStorageId: input.videoStorageId ?? undefined,
  };
}

export const list = query({
  args: {},
  returns: v.array(taskValidator),
  handler: async (ctx) => {
    const auth = await requireFoodSafetyReader(ctx, "foodSafety.cleaning");
    const tasks = await ctx.db
      .query("foodSafetyCleaningTasks")
      .withIndex("by_organizationId_and_normalizedName", (q) => q.eq("organizationId", auth.organizationId))
      .take(MAX_TASKS);
    return await Promise.all(tasks.map(async (task) => {
      const products = await Promise.all(task.toolProductIds.map((id) => ctx.db.get("products", id)));
      return {
        id: task._id,
        name: task.name,
        description: task.description,
        tools: await Promise.all(products.filter((product) => product !== null).map(async (product) => ({
          id: product._id,
          name: product.name,
          imageUrl: product.imageStorageId ? await ctx.storage.getUrl(product.imageStorageId) : null,
        }))),
        videoStorageId: task.videoStorageId ?? null,
        videoUrl: task.videoStorageId ? await ctx.storage.getUrl(task.videoStorageId) : null,
      };
    }));
  },
});

export const generateVideoUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireFoodSafetyManager(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: taskInput,
  returns: v.id("foodSafetyCleaningTasks"),
  handler: async (ctx, args) => {
    const auth = await requireFoodSafetyManager(ctx);
    const human = requireHumanPrincipal(auth);
    const count = await ctx.db
      .query("foodSafetyCleaningTasks")
      .withIndex("by_organizationId_and_normalizedName", (q) => q.eq("organizationId", auth.organizationId))
      .take(MAX_TASKS);
    if (count.length >= MAX_TASKS) throw new ConvexError(`Organisationen må højst have ${MAX_TASKS} rengøringsopgaver`);
    const task = await validateTask(ctx, auth.organizationId, args);
    const taskId = await ctx.db.insert("foodSafetyCleaningTasks", {
      organizationId: auth.organizationId,
      ...task,
      createdBy: human.userId,
      updatedAt: Date.now(),
    });
    await recordAudit(ctx, auth, {
      action: "foodSafety.cleaningTaskCreated",
      entityTable: "foodSafetyCleaningTasks",
      entityId: taskId,
      summary: `Rengøringsopgaven ${task.name} blev oprettet`,
    });
    return taskId;
  },
});

export const update = mutation({
  args: { taskId: v.id("foodSafetyCleaningTasks"), ...taskInput },
  returns: v.null(),
  handler: async (ctx, { taskId, ...args }) => {
    const auth = await requireFoodSafetyManager(ctx);
    const current = await ctx.db.get("foodSafetyCleaningTasks", taskId);
    if (!current || current.organizationId !== auth.organizationId) throw new ConvexError("Rengøringsopgaven blev ikke fundet");
    const task = await validateTask(ctx, auth.organizationId, args, taskId);
    // A replaced video is left without references and removed by storageCleanup.
    await ctx.db.replace("foodSafetyCleaningTasks", taskId, {
      organizationId: current.organizationId,
      ...task,
      createdBy: current.createdBy,
      updatedAt: Date.now(),
    });
    await recordAudit(ctx, auth, {
      action: "foodSafety.cleaningTaskUpdated",
      entityTable: "foodSafetyCleaningTasks",
      entityId: taskId,
      summary: `Rengøringsopgaven ${task.name} blev opdateret`,
    });
    return null;
  },
});

export const remove = mutation({
  args: { taskId: v.id("foodSafetyCleaningTasks") },
  returns: v.null(),
  handler: async (ctx, { taskId }) => {
    const auth = await requireFoodSafetyManager(ctx);
    const task = await ctx.db.get("foodSafetyCleaningTasks", taskId);
    if (!task || task.organizationId !== auth.organizationId) throw new ConvexError("Rengøringsopgaven blev ikke fundet");
    await ctx.db.delete("foodSafetyCleaningTasks", taskId);
    await recordAudit(ctx, auth, {
      action: "foodSafety.cleaningTaskDeleted",
      entityTable: "foodSafetyCleaningTasks",
      entityId: taskId,
      summary: `Rengøringsopgaven ${task.name} blev slettet`,
    });
    return null;
  },
});
