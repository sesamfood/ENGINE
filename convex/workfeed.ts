import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import {
  requireAllLocationAccess,
  requireIntegrationManager,
  requireLocationAccess,
  requireOrganization,
} from "./lib/auth";
import {
  requestDepartments,
  type WorkfeedDepartment,
  type WorkfeedSettings,
} from "./lib/workfeedApi";
import { recordAudit } from "./lib/audit";

const MAX_LOCATIONS = 200;

const privateSettingsValidator = v.union(
  v.object({
    apiKey: v.string(),
    companyId: v.string(),
    enabled: v.boolean(),
  }),
  v.null(),
);

const departmentValidator = v.object({
  id: v.string(),
  name: v.string(),
});

function requireCredential(value: string, label: string, maxLength: number) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw new ConvexError(`Indtast et gyldigt ${label}`);
  }
  return trimmed;
}

async function requireConnectedSettings(
  ctx: ActionCtx,
) {
  const auth = await requireIntegrationManager(ctx);
  const { organizationId } = auth;
  const settings: WorkfeedSettings | null = await ctx.runQuery(
    internal.workfeed.getPrivateSettings,
    { organizationId },
  );
  if (!settings) throw new ConvexError("Workfeed er ikke forbundet");
  return { auth, organizationId, settings };
}

export const getSettings = query({
  args: {},
  returns: v.object({
    connected: v.boolean(),
    enabled: v.boolean(),
    companyId: v.union(v.string(), v.null()),
    connectedAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx) => {
    const auth = await requireIntegrationManager(ctx);
    const { organizationId } = auth;
    const settings = await ctx.db
      .query("workfeedIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .unique();
    return {
      connected: Boolean(settings),
      enabled: settings?.enabled ?? false,
      companyId: settings?.companyId ?? null,
      connectedAt: settings?.connectedAt ?? null,
    };
  },
});

export const isEnabled = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const { organizationId } = await requireOrganization(ctx);
    const settings = await ctx.db
      .query("workfeedIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .unique();
    return settings?.enabled ?? false;
  },
});

export const listLocationMappings = query({
  args: {},
  returns: v.object({
    locations: v.array(
      v.object({
        id: v.id("locations"),
        name: v.string(),
        departmentId: v.union(v.string(), v.null()),
        departmentName: v.union(v.string(), v.null()),
      }),
    ),
    limitReached: v.boolean(),
  }),
  handler: async (ctx) => {
    const auth = await requireIntegrationManager(ctx);
    const { organizationId } = auth;
    const [locations, mappings] = await Promise.all([
      ctx.db
        .query("locations")
        .withIndex("by_organizationId_and_normalizedName", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_LOCATIONS + 1),
      ctx.db
        .query("workfeedLocationMappings")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_LOCATIONS + 1),
    ]);
    if (mappings.length > MAX_LOCATIONS) {
      throw new ConvexError("Der er for mange Workfeed-koblinger");
    }
    const byLocationId = new Map(
      mappings.map((mapping) => [mapping.locationId, mapping]),
    );
    const visibleLocations = locations.filter(
      (location) =>
        auth.locationScope.all || auth.locationScope.ids.has(location._id),
    );

    return {
      locations: visibleLocations.slice(0, MAX_LOCATIONS).map((location) => {
        const mapping = byLocationId.get(location._id);
        return {
          id: location._id,
          name: location.name,
          departmentId: mapping?.departmentId ?? null,
          departmentName: mapping?.departmentName ?? null,
        };
      }),
      limitReached: visibleLocations.length > MAX_LOCATIONS,
    };
  },
});

export const getPrivateSettings = internalQuery({
  args: { organizationId: v.string() },
  returns: privateSettingsValidator,
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("workfeedIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    return settings
      ? {
          apiKey: settings.apiKey,
          companyId: settings.companyId,
          enabled: settings.enabled,
        }
      : null;
  },
});

export const saveConnection = internalMutation({
  args: {
    organizationId: v.string(),
    apiKey: v.string(),
    companyId: v.string(),
    actorUserId: v.string(),
    actorName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await ctx.db
      .query("workfeedIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    const now = Date.now();
    if (current && current.companyId !== args.companyId) {
      const mappings = await ctx.db
        .query("workfeedLocationMappings")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", args.organizationId),
        )
        .take(MAX_LOCATIONS + 1);
      if (mappings.length > MAX_LOCATIONS) {
        throw new ConvexError("Der er for mange Workfeed-koblinger");
      }
      for (const mapping of mappings) await ctx.db.delete(mapping._id);
    }
    const integrationId = current
      ? current._id
      : await ctx.db.insert("workfeedIntegrations", {
          organizationId: args.organizationId,
          apiKey: args.apiKey,
          companyId: args.companyId,
          enabled: true,
          connectedAt: now,
          updatedAt: now,
        });
    if (current) {
      await ctx.db.patch(current._id, {
        apiKey: args.apiKey,
        companyId: args.companyId,
        enabled: true,
        connectedAt: now,
        updatedAt: now,
      });
    }
    await recordAudit(
      ctx,
      {
        organizationId: args.organizationId,
        userId: args.actorUserId,
        userName: args.actorName,
      },
      {
        action: "integration.connected",
        entityTable: "workfeedIntegrations",
        entityId: integrationId,
        summary: "Workfeed-integrationen blev forbundet",
      },
    );
    await ctx.scheduler.runAfter(
      0,
      internal.workfeedSync.enqueueOrganizationSync,
      {
        organizationId: args.organizationId,
        kind: "employees",
        force: true,
      },
    );
    return null;
  },
});

export const setEnabledInternal = internalMutation({
  args: { organizationId: v.string(), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("workfeedIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    if (!settings) throw new ConvexError("Workfeed er ikke forbundet");
    await ctx.db.patch(settings._id, {
      enabled: args.enabled,
      updatedAt: Date.now(),
    });
    if (args.enabled) {
      await ctx.scheduler.runAfter(
        0,
        internal.workfeedSync.enqueueOrganizationSync,
        {
          organizationId: args.organizationId,
          kind: "employees",
          force: true,
        },
      );
    }
    return null;
  },
});

export const saveLocationMappingInternal = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    departmentId: v.string(),
    departmentName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [location, current, departmentMapping] = await Promise.all([
      ctx.db.get("locations", args.locationId),
      ctx.db
        .query("workfeedLocationMappings")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("locationId", args.locationId),
        )
        .unique(),
      ctx.db
        .query("workfeedLocationMappings")
        .withIndex("by_organizationId_and_departmentId", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("departmentId", args.departmentId),
        )
        .unique(),
    ]);
    if (!location || location.organizationId !== args.organizationId) {
      throw new ConvexError("Lokationen blev ikke fundet");
    }
    if (departmentMapping && departmentMapping.locationId !== args.locationId) {
      throw new ConvexError(
        "Workfeed-afdelingen er allerede koblet til en lokation",
      );
    }
    if (current) {
      await ctx.db.patch(current._id, {
        departmentId: args.departmentId,
        departmentName: args.departmentName,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("workfeedLocationMappings", {
        organizationId: args.organizationId,
        locationId: args.locationId,
        departmentId: args.departmentId,
        departmentName: args.departmentName,
        updatedAt: Date.now(),
      });
    }
    await ctx.scheduler.runAfter(
      0,
      internal.workfeedSync.enqueueOrganizationSync,
      {
        organizationId: args.organizationId,
        kind: "employees",
        force: true,
      },
    );
    return null;
  },
});

export const connect = action({
  args: { apiKey: v.string(), companyId: v.string() },
  returns: v.object({ departmentCount: v.number() }),
  handler: async (ctx, args) => {
    const auth = await requireIntegrationManager(ctx);
    requireAllLocationAccess(auth);
    const { organizationId, userId, userName } = auth;
    const apiKey = requireCredential(args.apiKey, "Workfeed API-nøgle", 500);
    const companyId = requireCredential(
      args.companyId,
      "Workfeed firma-id",
      200,
    );
    const departments = await requestDepartments({ apiKey, companyId });
    await ctx.runMutation(internal.workfeed.saveConnection, {
      organizationId,
      apiKey,
      companyId,
      actorUserId: userId,
      actorName: userName,
    });
    return { departmentCount: departments.length };
  },
});

export const setEnabled = action({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { auth, organizationId, settings } = await requireConnectedSettings(ctx);
    requireAllLocationAccess(auth);
    if (args.enabled) {
      await requestDepartments(settings);
    }
    await ctx.runMutation(internal.workfeed.setEnabledInternal, {
      organizationId,
      enabled: args.enabled,
    });
    return null;
  },
});

export const listDepartments = action({
  args: {},
  returns: v.array(departmentValidator),
  handler: async (ctx): Promise<WorkfeedDepartment[]> => {
    const { settings } = await requireConnectedSettings(ctx);
    return requestDepartments(settings);
  },
});

export const saveLocationMapping = action({
  args: {
    locationId: v.id("locations"),
    departmentId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { auth, organizationId, settings } =
      await requireConnectedSettings(ctx);
    requireLocationAccess(auth, args.locationId);
    const departmentId = requireCredential(
      args.departmentId,
      "Workfeed-afdeling",
      200,
    );
    const department = (await requestDepartments(settings)).find(
      (item) => item.id === departmentId,
    );
    if (!department) {
      throw new ConvexError("Workfeed-afdelingen blev ikke fundet");
    }
    await ctx.runMutation(internal.workfeed.saveLocationMappingInternal, {
      organizationId,
      locationId: args.locationId,
      departmentId: department.id,
      departmentName: department.name,
    });
    return null;
  },
});

export const removeLocationMapping = mutation({
  args: { locationId: v.id("locations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireIntegrationManager(ctx);
    const { organizationId } = auth;
    requireLocationAccess(auth, args.locationId);
    const mapping = await ctx.db
      .query("workfeedLocationMappings")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", args.locationId),
      )
      .unique();
    if (mapping) await ctx.db.delete(mapping._id);
    await ctx.scheduler.runAfter(
      0,
      internal.workfeedSync.enqueueOrganizationSync,
      { organizationId, kind: "employees", force: true },
    );
    return null;
  },
});

export const disconnect = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const auth = await requireIntegrationManager(ctx);
    requireAllLocationAccess(auth);
    const { organizationId } = auth;
    const [settings, mappings] = await Promise.all([
      ctx.db
        .query("workfeedIntegrations")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .unique(),
      ctx.db
        .query("workfeedLocationMappings")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_LOCATIONS + 1),
    ]);
    if (mappings.length > MAX_LOCATIONS) {
      throw new ConvexError("Der er for mange Workfeed-koblinger");
    }
    for (const mapping of mappings) await ctx.db.delete(mapping._id);
    if (settings) await ctx.db.delete(settings._id);
    if (settings || mappings.length > 0) {
      await recordAudit(ctx, auth, {
        action: "integration.disconnected",
        entityTable: "workfeedIntegrations",
        entityId: organizationId,
        summary: "Workfeed-integrationen blev afbrudt",
      });
    }
    return null;
  },
});
