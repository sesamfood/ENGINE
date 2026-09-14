import { ConvexError } from "convex/values";
import type { Doc, Id } from "../../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../../_generated/server";

type ReadCtx = QueryCtx | MutationCtx;
export const MAX_MASTER_CONNECTIONS = 20;

// Organization-wide switches remain on the oldest connection.
export async function getOnlinePosOrganizationSettings(
  ctx: ReadCtx,
  organizationId: string,
) {
  return ctx.db
    .query("onlinePosIntegrations")
    .withIndex("by_organizationId", (q) =>
      q.eq("organizationId", organizationId),
    )
    .first();
}

export async function getOnlinePosMaster(
  ctx: ReadCtx,
  organizationId: string,
  integrationId?: Id<"onlinePosIntegrations">,
) {
  if (integrationId === undefined)
    return getOnlinePosOrganizationSettings(ctx, organizationId);
  const master = await ctx.db.get("onlinePosIntegrations", integrationId);
  if (!master || master.organizationId !== organizationId) {
    throw new ConvexError("Masterforbindelsen blev ikke fundet");
  }
  return master;
}

export async function getOnlinePosLocationMaster(
  ctx: ReadCtx,
  organizationId: string,
  locationId: Id<"locations">,
) {
  const connection = await ctx.db
    .query("onlinePosLocationIntegrations")
    .withIndex("by_organizationId_and_locationId", (q) =>
      q.eq("organizationId", organizationId).eq("locationId", locationId),
    )
    .unique();
  if (!connection) return null;
  return getOnlinePosMaster(
    ctx,
    organizationId,
    connection.masterIntegrationId,
  );
}

export function onlinePosCatalogId(
  master: Doc<"onlinePosIntegrations"> | null,
) {
  return master?.catalogScoped ? master._id : undefined;
}

// Pin legacy records before another master can be created or a location reassigned.
export async function scopeLegacyOnlinePosCatalog(
  ctx: MutationCtx,
  organizationId: string,
) {
  const master = await getOnlinePosOrganizationSettings(ctx, organizationId);
  if (!master || master.catalogScoped) return;
  const [mappings, menus, connections] = await Promise.all([
    ctx.db
      .query("onlinePosProductMappings")
      .withIndex("by_organizationId_and_integrationId", (q) =>
        q.eq("organizationId", organizationId).eq("integrationId", undefined),
      )
      .take(501),
    ctx.db
      .query("onlinePosMenus")
      .withIndex("by_organizationId_and_integrationId", (q) =>
        q.eq("organizationId", organizationId).eq("integrationId", undefined),
      )
      .take(101),
    ctx.db
      .query("onlinePosLocationIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(201),
  ]);
  if (mappings.length > 500 || menus.length > 100 || connections.length > 200) {
    throw new ConvexError("Der er for mange OnlinePOS-koblinger");
  }
  for (const row of [...mappings, ...menus])
    await ctx.db.patch(row._id, { integrationId: master._id });
  for (const row of connections) {
    if (row.masterIntegrationId === undefined)
      await ctx.db.patch(row._id, { masterIntegrationId: master._id });
  }
  await ctx.db.patch(master._id, {
    catalogScoped: true,
    stockMappingRevision: (master.stockMappingRevision ?? 0) + 1,
  });
}
