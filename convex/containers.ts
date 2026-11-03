import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireCatalogManager, type OrganizationAuth } from "./lib/auth";
import { recordAudit } from "./lib/audit";
import {
  claimStorageForOrganization,
  preserveStorageOwnership,
} from "./lib/storageOwnership";

export const MAX_CONTAINERS = 500;
const MAX_NAME_LENGTH = 100;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const statusValidator = v.union(v.literal("active"), v.literal("archived"));

const containerValidator = v.object({
  id: v.id("containers"),
  name: v.string(),
  imageUrl: v.union(v.string(), v.null()),
  weightGrams: v.number(),
  capacityMilliliters: v.union(v.number(), v.null()),
  status: statusValidator,
});

const containerInput = {
  name: v.string(),
  weightGrams: v.number(),
  capacityMilliliters: v.union(v.number(), v.null()),
};

function normalizeName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new ConvexError("Navnet skal udfyldes");
  if (name.length > MAX_NAME_LENGTH) {
    throw new ConvexError(`Navnet må højst være ${MAX_NAME_LENGTH} tegn`);
  }
  return { name, normalizedName: name.toLocaleLowerCase("da") };
}

function validateInput(args: {
  name: string;
  weightGrams: number;
  capacityMilliliters: number | null;
}) {
  if (!Number.isFinite(args.weightGrams) || args.weightGrams <= 0) {
    throw new ConvexError("Vægten skal være større end nul");
  }
  if (
    args.capacityMilliliters !== null &&
    (!Number.isFinite(args.capacityMilliliters) ||
      args.capacityMilliliters <= 0)
  ) {
    throw new ConvexError("Rumfanget skal være større end nul");
  }
  return normalizeName(args.name);
}

async function assertNameAvailable(
  ctx: MutationCtx,
  organizationId: string,
  normalizedName: string,
  containerId?: Id<"containers">,
) {
  const existing = await ctx.db
    .query("containers")
    .withIndex("by_organizationId_and_normalizedName", (q) =>
      q.eq("organizationId", organizationId).eq("normalizedName", normalizedName),
    )
    .first();
  if (existing && existing._id !== containerId) {
    throw new ConvexError("Der findes allerede en beholder med det navn");
  }
}

async function getOwnContainer(
  ctx: MutationCtx,
  auth: OrganizationAuth,
  containerId: Id<"containers">,
) {
  const container = await ctx.db.get("containers", containerId);
  if (!container || container.organizationId !== auth.organizationId) {
    throw new ConvexError("Beholderen blev ikke fundet");
  }
  return container;
}

// Checks product container references. Archived containers may stay on a
// product that already used them.
export async function resolveProductContainerIds(
  ctx: MutationCtx,
  organizationId: string,
  containerIds: Id<"containers">[],
  keptIds: Id<"containers">[] = [],
) {
  const unique = [...new Set(containerIds)];
  if (unique.length > 20) {
    throw new ConvexError("Et produkt kan højst have 20 beholdere");
  }
  for (const containerId of unique) {
    const container = await ctx.db.get("containers", containerId);
    if (!container || container.organizationId !== organizationId) {
      throw new ConvexError("Beholderen blev ikke fundet");
    }
    if (container.status === "archived" && !keptIds.includes(containerId)) {
      throw new ConvexError(`Beholderen ${container.name} er arkiveret`);
    }
  }
  return unique;
}

export const list = query({
  args: {},
  returns: v.array(containerValidator),
  handler: async (ctx) => {
    const { organizationId } = await requireCatalogManager(ctx);
    const containers: Doc<"containers">[] = await ctx.db
      .query("containers")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_CONTAINERS);
    return await Promise.all(
      containers.map(async (container) => ({
        id: container._id,
        name: container.name,
        imageUrl: container.imageStorageId
          ? await ctx.storage.getUrl(container.imageStorageId)
          : null,
        weightGrams: container.weightGrams,
        capacityMilliliters: container.capacityMilliliters ?? null,
        status: container.status,
      })),
    );
  },
});

export const create = mutation({
  args: containerInput,
  returns: v.id("containers"),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    const { name, normalizedName } = validateInput(args);
    await assertNameAvailable(ctx, auth.organizationId, normalizedName);
    const count = await ctx.db
      .query("containers")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", auth.organizationId),
      )
      .take(MAX_CONTAINERS);
    if (count.length >= MAX_CONTAINERS) {
      throw new ConvexError("Organisationen har for mange beholdere");
    }
    const containerId = await ctx.db.insert("containers", {
      organizationId: auth.organizationId,
      name,
      normalizedName,
      weightGrams: args.weightGrams,
      ...(args.capacityMilliliters === null
        ? {}
        : { capacityMilliliters: args.capacityMilliliters }),
      status: "active",
      createdBy: auth.userIdentifier,
      updatedAt: Date.now(),
    });
    await recordAudit(ctx, auth, {
      action: "catalog.containerCreated",
      entityTable: "containers",
      entityId: containerId,
      summary: `Beholderen ${name} blev oprettet`,
    });
    return containerId;
  },
});

export const update = mutation({
  args: { containerId: v.id("containers"), ...containerInput },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    const container = await getOwnContainer(ctx, auth, args.containerId);
    const { name, normalizedName } = validateInput(args);
    await assertNameAvailable(
      ctx,
      auth.organizationId,
      normalizedName,
      container._id,
    );
    await ctx.db.patch("containers", container._id, {
      name,
      normalizedName,
      weightGrams: args.weightGrams,
      capacityMilliliters: args.capacityMilliliters ?? undefined,
      updatedAt: Date.now(),
    });
    await recordAudit(ctx, auth, {
      action: "catalog.containerUpdated",
      entityTable: "containers",
      entityId: container._id,
      summary: `Beholderen ${name} blev ændret`,
    });
    return null;
  },
});

export const setStatus = mutation({
  args: { containerId: v.id("containers"), status: statusValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    const container = await getOwnContainer(ctx, auth, args.containerId);
    if (container.status === args.status) return null;
    await ctx.db.patch("containers", container._id, {
      status: args.status,
      updatedAt: Date.now(),
    });
    await recordAudit(ctx, auth, {
      action:
        args.status === "archived"
          ? "catalog.containerArchived"
          : "catalog.containerRestored",
      entityTable: "containers",
      entityId: container._id,
      summary: `Beholderen ${container.name} blev ${args.status === "archived" ? "arkiveret" : "gendannet"}`,
    });
    return null;
  },
});

export const setImage = mutation({
  args: { containerId: v.id("containers"), storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    const { organizationId } = auth;
    const container = await getOwnContainer(ctx, auth, args.containerId);
    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata) throw new ConvexError("Billeduploaden blev ikke fundet");
    await claimStorageForOrganization(ctx, organizationId, args.storageId);
    await preserveStorageOwnership(ctx, organizationId, container.imageStorageId);
    const attached = await ctx.db
      .query("containers")
      .withIndex("by_imageStorageId", (q) =>
        q.eq("imageStorageId", args.storageId),
      )
      .first();
    if (attached && attached._id !== container._id) {
      throw new ConvexError("Billeduploaden blev ikke fundet");
    }
    if (
      !metadata.contentType ||
      !ALLOWED_IMAGE_TYPES.has(metadata.contentType) ||
      metadata.size > MAX_IMAGE_SIZE
    ) {
      throw new ConvexError(
        "Brug et billede i JPEG-, PNG-, WebP- eller AVIF-format på højst 10 MB",
      );
    }
    await ctx.db.patch("containers", container._id, {
      imageStorageId: args.storageId,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const removeImage = mutation({
  args: { containerId: v.id("containers") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireCatalogManager(ctx);
    const container = await getOwnContainer(ctx, auth, args.containerId);
    if (!container.imageStorageId) return null;
    await preserveStorageOwnership(
      ctx,
      auth.organizationId,
      container.imageStorageId,
    );
    await ctx.db.patch("containers", container._id, {
      imageStorageId: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});
