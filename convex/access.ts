import { ConvexError, v } from "convex/values";
import {
  dataGranularities,
  isPermissionId,
  permissionsForRole,
  systemRoleKeys,
  systemRoleNames,
} from "../lib/auth-permissions";
import {
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { getDatabaseAdapter } from "./auth";
import { listScopedLocationOptions } from "./locations";
import {
  requireOrganization,
  requirePermission,
} from "./lib/auth";
import { recordAudit, requireAuditReason } from "./lib/audit";

const roleValidator = v.string();
const granularityValidator = v.union(
  v.literal("detail"),
  v.literal("aggregate"),
  v.literal("anonymous"),
);

const locationScopeValidator = v.object({
  all: v.boolean(),
  ids: v.array(v.id("locations")),
});

const locationOptionValidator = v.object({
  id: v.id("locations"),
  name: v.string(),
});

const kioskSettingsValidator = v.object({
  enabledPages: v.array(v.string()),
  homePage: v.string(),
  inactivitySeconds: v.union(v.number(), v.null()),
  updatedAt: v.number(),
});

const kioskContextValidator = v.object({
  isKioskAccount: v.boolean(),
  kioskModeEnabled: v.boolean(),
  locationId: v.union(v.id("locations"), v.null()),
  locationName: v.union(v.string(), v.null()),
  role: v.string(),
  settings: v.union(kioskSettingsValidator, v.null()),
});

const accessContextValidator = v.object({
  role: roleValidator,
  granularity: granularityValidator,
  permissions: v.array(v.string()),
  locationScope: locationScopeValidator,
  kiosk: kioskContextValidator,
});

const runtimeContextValidator = accessContextValidator.extend({
  locations: v.array(locationOptionValidator),
});

const roleContextValidator = v.object({
  organizationId: v.string(),
  role: roleValidator,
  granularity: granularityValidator,
  permissions: v.array(v.string()),
  locationScope: locationScopeValidator,
  principalKind: v.union(v.literal("user"), v.literal("apiKey")),
  apiKeyId: v.union(v.string(), v.null()),
  userId: v.union(v.string(), v.null()),
  sessionId: v.union(v.string(), v.null()),
  isKioskAccount: v.boolean(),
  kioskModeEnabled: v.boolean(),
  kioskLocationId: v.union(v.id("locations"), v.null()),
  userIdentifier: v.string(),
  userName: v.string(),
  requestId: v.union(v.string(), v.null()),
});

const memberLocationAccessValidator = v.object({
  userId: v.string(),
  scope: v.union(
    v.literal("all"),
    v.literal("selected"),
    v.literal("operator"),
  ),
  locationIds: v.array(v.id("locations")),
  operatorId: v.union(v.id("operators"), v.null()),
});

const memberPermissionContextValidator = v.object({
  role: roleValidator,
  permissions: v.array(v.string()),
});

type AuthMember = {
  id: string;
  organizationId: string;
  userId: string;
  role: string;
  kioskLocationId?: string | null;
};

type AuthOrganizationRole = {
  id: string;
  organizationId: string;
  role: string;
  permission: string;
  createdAt: Date;
  updatedAt?: Date | null;
};

const BETTER_AUTH_ROLE_PERMISSIONS = JSON.stringify({
  organization: [],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: [],
  ac: ["read"],
  apiKey: ["create", "read", "update", "delete"],
});

async function ensureSystemRoles(ctx: MutationCtx, organizationId: string) {
  const existing = await Promise.all(
    systemRoleKeys.map((key) =>
      ctx.db
        .query("roles")
        .withIndex("by_organizationId_and_key", (q) =>
          q.eq("organizationId", organizationId).eq("key", key),
        )
        .unique(),
    ),
  );
  const updatedAt = Date.now();
  for (const [index, key] of systemRoleKeys.entries()) {
    if (existing[index]) continue;
    await ctx.db.insert("roles", {
      organizationId,
      key,
      name: systemRoleNames[key],
      isSystem: true,
      granularity: "detail",
      updatedAt,
    });
  }
}

function customRoleKey(name: string) {
  const key = name
    .trim()
    .toLocaleLowerCase("da")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!key)
    throw new ConvexError("Rollen skal have et navn med bogstaver eller tal");
  return key;
}

function roleDisplayName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new ConvexError("Rollens navn skal udfyldes");
  if (name.length > 100) {
    throw new ConvexError("Rollens navn må højst være 100 tegn");
  }
  return name;
}

async function assertManagementRoleRemains(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  override?:
    { role: string; permissions: readonly string[] } | { remove: string },
) {
  const [roles, permissionRows] = await Promise.all([
    ctx.db
      .query("roles")
      .withIndex("by_organizationId_and_key", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect(),
    ctx.db
      .query("rolePermissions")
      .withIndex("by_organizationId_and_role", (q) =>
        q.eq("organizationId", organizationId),
      )
      .collect(),
  ]);
  const configured = new Map(
    permissionRows.map((row) => [row.role, row.permissions] as const),
  );
  const roleKeys = new Set<string>([
    ...systemRoleKeys,
    ...roles.map((role) => role.key),
    ...permissionRows.map((row) => row.role),
  ]);
  if (override && "remove" in override) roleKeys.delete(override.remove);
  const managementRoleKeys = [...roleKeys].filter((role) => {
    const permissions =
      override && "role" in override && override.role === role
        ? override.permissions
        : permissionsForRole(role, configured.get(role));
    return (
      permissions.includes("roles.manage") &&
      permissions.includes("members.manage")
    );
  });
  const adapter = getDatabaseAdapter(ctx);
  const members = await Promise.all(
    managementRoleKeys.map((role) =>
      adapter.findMany<AuthMember>({
        model: "member",
        where: [
          { field: "organizationId", value: organizationId },
          { field: "role", value: role },
        ],
        limit: 1,
      }),
    ),
  );
  const hasManager = members.some((matches) => matches.length > 0);
  if (!hasManager) {
    throw new ConvexError(
      "Mindst én rolle skal kunne administrere både roller og brugere",
    );
  }
}

async function getRoleContextForQuery(ctx: QueryCtx) {
  const auth = await requireOrganization(ctx);
  return {
    organizationId: auth.organizationId,
    role: auth.role,
    granularity: auth.granularity,
    permissions: [...auth.permissions],
    locationScope: {
      all: auth.locationScope.all,
      ids: [...auth.locationScope.ids],
    },
    principalKind: auth.principalKind,
    apiKeyId: auth.apiKeyId,
    userId: auth.userId,
    sessionId: auth.sessionId,
    isKioskAccount: auth.isKioskAccount,
    kioskModeEnabled: auth.kioskModeEnabled,
    kioskLocationId: auth.kioskLocationId,
    userIdentifier: auth.userIdentifier,
    userName: auth.userName,
    requestId: auth.requestId,
  };
}

export const getRoleContext = internalQuery({
  args: {},
  returns: roleContextValidator,
  handler: async (ctx) => getRoleContextForQuery(ctx),
});

export const getMemberPermissionContext = internalQuery({
  args: { organizationId: v.string(), userId: v.string() },
  returns: memberPermissionContextValidator,
  handler: async (ctx, args) => {
    const member = await getDatabaseAdapter(ctx).findOne<AuthMember>({
      model: "member",
      where: [
        { field: "organizationId", value: args.organizationId },
        { field: "userId", value: args.userId },
      ],
    });
    if (!member) throw new ConvexError("Du har ikke adgang");
    const configured = await ctx.db
      .query("rolePermissions")
      .withIndex("by_organizationId_and_role", (q) =>
        q.eq("organizationId", args.organizationId).eq("role", member.role),
      )
      .unique();
    return {
      role: member.role,
      permissions: [
        ...permissionsForRole(member.role, configured?.permissions),
      ],
    };
  },
});

export const getRuntimeContext = query({
  args: {},
  returns: runtimeContextValidator,
  handler: async (ctx) => {
    const { auth, context } = await getAccessContext(ctx);
    return {
      ...context,
      locations: await listScopedLocationOptions(
        ctx,
        auth.organizationId,
        auth.locationScope,
      ),
    };
  },
});

async function getAccessContext(ctx: QueryCtx) {
  const auth = await requireOrganization(ctx);
  const settings = await ctx.db
    .query("kioskSettings")
    .withIndex("by_organizationId", (q) =>
      q.eq("organizationId", auth.organizationId),
    )
    .unique();
  const location = auth.kioskLocationId
    ? await ctx.db.get("locations", auth.kioskLocationId)
    : null;
  return {
    auth,
    context: {
      role: auth.role,
      granularity: auth.granularity,
      permissions: [...auth.permissions],
      locationScope: {
        all: auth.locationScope.all,
        ids: [...auth.locationScope.ids],
      },
      kiosk: {
        isKioskAccount: auth.isKioskAccount,
        kioskModeEnabled: auth.kioskModeEnabled,
        locationId: location?._id ?? null,
        locationName: location?.name ?? null,
        role: auth.role,
        settings: settings
          ? {
              enabledPages: settings.enabledPages,
              homePage: settings.homePage,
              inactivitySeconds: settings.inactivitySeconds,
              updatedAt: settings.updatedAt,
            }
          : null,
      },
    },
  };
}

export const listRolePermissions = query({
  args: {},
  returns: v.array(
    v.object({
      role: roleValidator,
      name: v.string(),
      isSystem: v.boolean(),
      granularity: granularityValidator,
      permissions: v.array(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const auth = await requirePermission(ctx, "roles.manage");
    const [roles, permissionRows] = await Promise.all([
      ctx.db
        .query("roles")
        .withIndex("by_organizationId_and_key", (q) =>
          q.eq("organizationId", auth.organizationId),
        )
        .collect(),
      ctx.db
        .query("rolePermissions")
        .withIndex("by_organizationId_and_role", (q) =>
          q.eq("organizationId", auth.organizationId),
        )
        .collect(),
    ]);
    const byKey = new Map(roles.map((role) => [role.key, role]));
    const byRole = new Map(
      permissionRows.map((row) => [row.role, row.permissions]),
    );
    const systemRoles = systemRoleKeys.map((role) => ({
      role,
      name: byKey.get(role)?.name ?? systemRoleNames[role],
      isSystem: true,
      granularity: byKey.get(role)?.granularity ?? "detail",
      permissions: [...permissionsForRole(role, byRole.get(role))],
    }));
    const customRoles = roles
      .filter((role) => !systemRoleKeys.includes(role.key as never))
      .map((role) => ({
        role: role.key,
        name: role.name,
        isSystem: false,
        granularity: role.granularity ?? "detail",
        permissions: [...permissionsForRole(role.key, byRole.get(role.key))],
      }));
    return [...systemRoles, ...customRoles];
  },
});

export const listRoles = query({
  args: {},
  returns: v.array(v.object({ key: v.string(), name: v.string() })),
  handler: async (ctx) => {
    const auth = await requirePermission(ctx, "members.manage");
    const roles = await ctx.db
      .query("roles")
      .withIndex("by_organizationId_and_key", (q) =>
        q.eq("organizationId", auth.organizationId),
      )
      .collect();
    const byKey = new Map(roles.map((role) => [role.key, role.name]));
    return [
      ...systemRoleKeys.map((key) => ({
        key,
        name: byKey.get(key) ?? systemRoleNames[key],
      })),
      ...roles
        .filter((role) => !systemRoleKeys.includes(role.key as never))
        .map((role) => ({ key: role.key, name: role.name })),
    ];
  },
});

export const ensureRoles = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const auth = await requirePermission(ctx, "roles.manage");
    await ensureSystemRoles(ctx, auth.organizationId);
    return null;
  },
});

export const isRoleRegistered = internalQuery({
  args: { organizationId: v.string(), role: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (systemRoleKeys.includes(args.role as never)) return true;
    return Boolean(
      await ctx.db
        .query("roles")
        .withIndex("by_organizationId_and_key", (q) =>
          q.eq("organizationId", args.organizationId).eq("key", args.role),
        )
        .unique(),
    );
  },
});

export const createRole = mutation({
  args: { name: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const auth = await requirePermission(ctx, "roles.manage");
    const name = roleDisplayName(args.name);
    const key = customRoleKey(name);
    await ensureSystemRoles(ctx, auth.organizationId);
    const existing = await ctx.db
      .query("roles")
      .withIndex("by_organizationId_and_key", (q) =>
        q.eq("organizationId", auth.organizationId).eq("key", key),
      )
      .unique();
    if (existing) throw new ConvexError("Rollen findes allerede");
    const now = new Date();
    await getDatabaseAdapter(ctx).create<AuthOrganizationRole>({
      model: "organizationRole",
      data: {
        organizationId: auth.organizationId,
        role: key,
        permission: BETTER_AUTH_ROLE_PERMISSIONS,
        createdAt: now,
        updatedAt: now,
      },
    });
    await ctx.db.insert("roles", {
      organizationId: auth.organizationId,
      key,
      name,
      isSystem: false,
      granularity: "detail",
      updatedAt: Date.now(),
    });
    await ctx.db.insert("rolePermissions", {
      organizationId: auth.organizationId,
      role: key,
      permissions: [],
      updatedAt: Date.now(),
    });
    return key;
  },
});

export const renameRole = mutation({
  args: { role: v.string(), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requirePermission(ctx, "roles.manage");
    const role = await ctx.db
      .query("roles")
      .withIndex("by_organizationId_and_key", (q) =>
        q.eq("organizationId", auth.organizationId).eq("key", args.role),
      )
      .unique();
    if (!role || role.isSystem) {
      throw new ConvexError("Rollen kan ikke omdøbes");
    }
    await ctx.db.patch("roles", role._id, {
      name: roleDisplayName(args.name),
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const deleteRole = mutation({
  args: { role: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requirePermission(ctx, "roles.manage");
    const role = await ctx.db
      .query("roles")
      .withIndex("by_organizationId_and_key", (q) =>
        q.eq("organizationId", auth.organizationId).eq("key", args.role),
      )
      .unique();
    if (!role || role.isSystem) {
      throw new ConvexError("Systemroller kan ikke slettes");
    }
    const members = await getDatabaseAdapter(ctx).findMany<AuthMember>({
      model: "member",
      where: [
        { field: "organizationId", value: auth.organizationId },
        { field: "role", value: role.key },
      ],
      limit: 1,
    });
    if (members.length) {
      throw new ConvexError("Rollen bruges af en bruger og kan ikke slettes");
    }
    const apiKeyPolicy = await ctx.db
      .query("apiKeyPolicies")
      .withIndex("by_organizationId_and_role", (q) =>
        q.eq("organizationId", auth.organizationId).eq("role", role.key),
      )
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "active"),
          q.gt(q.field("expiresAt"), Date.now()),
        ),
      )
      .first();
    if (apiKeyPolicy) {
      throw new ConvexError(
        "Rollen bruges af en aktiv API-nøgle og kan ikke slettes",
      );
    }
    await assertManagementRoleRemains(ctx, auth.organizationId, {
      remove: role.key,
    });
    const permissions = await ctx.db
      .query("rolePermissions")
      .withIndex("by_organizationId_and_role", (q) =>
        q.eq("organizationId", auth.organizationId).eq("role", role.key),
      )
      .unique();
    await getDatabaseAdapter(ctx).deleteMany({
      model: "organizationRole",
      where: [
        { field: "organizationId", value: auth.organizationId },
        { field: "role", value: role.key },
      ],
    });
    if (permissions) await ctx.db.delete("rolePermissions", permissions._id);
    await ctx.db.delete("roles", role._id);
    return null;
  },
});

export const saveRolePermissions = mutation({
  args: {
    role: roleValidator,
    permissions: v.array(v.string()),
    granularity: v.optional(granularityValidator),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requirePermission(ctx, "roles.manage");
    const reason = requireAuditReason(args.reason);
    await ensureSystemRoles(ctx, auth.organizationId);
    const role = await ctx.db
      .query("roles")
      .withIndex("by_organizationId_and_key", (q) =>
        q.eq("organizationId", auth.organizationId).eq("key", args.role),
      )
      .unique();
    if (!role) throw new ConvexError("Rollen blev ikke fundet");
    if (args.permissions.some((permission) => !isPermissionId(permission))) {
      throw new ConvexError("En eller flere tilladelser findes ikke");
    }
    const permissions = [...new Set(args.permissions)];
    if (
      args.granularity !== undefined &&
      !dataGranularities.includes(args.granularity)
    ) {
      throw new ConvexError("Datavisningen findes ikke");
    }
    await assertManagementRoleRemains(ctx, auth.organizationId, {
      role: args.role,
      permissions,
    });
    const current = await ctx.db
      .query("rolePermissions")
      .withIndex("by_organizationId_and_role", (q) =>
        q.eq("organizationId", auth.organizationId).eq("role", args.role),
      )
      .unique();
    if (current) {
      await ctx.db.patch("rolePermissions", current._id, {
        permissions,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("rolePermissions", {
        organizationId: auth.organizationId,
        role: args.role,
        permissions,
        updatedAt: Date.now(),
      });
    }
    if (args.granularity !== undefined) {
      await ctx.db.patch("roles", role._id, {
        granularity: args.granularity,
        updatedAt: Date.now(),
      });
    }
    await recordAudit(ctx, auth, {
      action: "roles.permissionsChanged",
      entityTable: "rolePermissions",
      entityId: args.role,
      summary: `Tilladelser for rollen ${role.name} ændret`,
      reason,
    });
    return null;
  },
});

export const listMemberLocationAccess = query({
  args: {},
  returns: v.object({
    access: v.array(memberLocationAccessValidator),
    locations: v.array(v.object({ id: v.id("locations"), name: v.string() })),
    operators: v.array(v.object({ id: v.id("operators"), name: v.string() })),
  }),
  handler: async (ctx) => {
    const auth = await requirePermission(ctx, "members.manage");
    const [rows, locations, operators] = await Promise.all([
      ctx.db
        .query("memberLocationAccess")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", auth.organizationId),
        )
        .take(1000),
      ctx.db
        .query("locations")
        .withIndex("by_organizationId_and_normalizedName", (q) =>
          q.eq("organizationId", auth.organizationId),
        )
        .take(200),
      ctx.db
        .query("operators")
        .withIndex("by_organizationId_and_normalizedName", (q) =>
          q.eq("organizationId", auth.organizationId),
        )
        .take(200),
    ]);
    return {
      access: rows.map(({ userId, scope, locationIds, operatorId }) => ({
        userId,
        scope,
        locationIds,
        operatorId: operatorId ?? null,
      })),
      locations: locations.map(({ _id, name }) => ({ id: _id, name })),
      operators: operators.map(({ _id, name }) => ({ id: _id, name })),
    };
  },
});

export const setMemberLocationAccess = mutation({
  args: {
    userId: v.string(),
    scope: v.union(
      v.literal("all"),
      v.literal("selected"),
      v.literal("operator"),
    ),
    locationIds: v.array(v.id("locations")),
    operatorId: v.optional(v.id("operators")),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requirePermission(ctx, "members.manage");
    const reason = requireAuditReason(args.reason);
    const member = await getDatabaseAdapter(ctx).findOne<AuthMember>({
      model: "member",
      where: [
        { field: "organizationId", value: auth.organizationId },
        { field: "userId", value: args.userId },
      ],
    });
    if (!member)
      throw new ConvexError("Brugeren er ikke tilknyttet organisationen");
    const locationIds = [...new Set(args.locationIds)];
    if (args.scope === "selected" && locationIds.length === 0) {
      throw new ConvexError("Vælg mindst én lokation");
    }
    let operatorName: string | undefined;
    if (args.scope === "operator") {
      if (!args.operatorId) throw new ConvexError("Vælg en operatør");
      const operator = await ctx.db.get("operators", args.operatorId);
      if (!operator || operator.organizationId !== auth.organizationId) {
        throw new ConvexError("Operatøren blev ikke fundet");
      }
      operatorName = operator.name;
    }
    for (const locationId of locationIds) {
      const location = await ctx.db.get("locations", locationId);
      if (!location || location.organizationId !== auth.organizationId) {
        throw new ConvexError("Lokationen blev ikke fundet");
      }
    }
    const current = await ctx.db
      .query("memberLocationAccess")
      .withIndex("by_organizationId_and_userId", (q) =>
        q.eq("organizationId", auth.organizationId).eq("userId", args.userId),
      )
      .unique();
    const data = {
      scope: args.scope,
      locationIds: args.scope === "selected" ? locationIds : [],
      operatorId: args.scope === "operator" ? args.operatorId : undefined,
      updatedAt: Date.now(),
    } as const;
    if (current) await ctx.db.patch("memberLocationAccess", current._id, data);
    else {
      await ctx.db.insert("memberLocationAccess", {
        organizationId: auth.organizationId,
        userId: args.userId,
        ...data,
      });
    }
    await recordAudit(ctx, auth, {
      action: "members.locationAccessChanged",
      entityTable: "memberLocationAccess",
      entityId: args.userId,
      summary:
        args.scope === "all"
          ? "Brugeren har fået adgang til alle lokationer"
          : args.scope === "operator"
            ? `Brugeren har fået adgang til operatøren ${operatorName}`
            : `Brugeren har fået adgang til ${locationIds.length} lokationer`,
      reason,
    });
    return null;
  },
});
