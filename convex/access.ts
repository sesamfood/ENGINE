import { ConvexError, v } from "convex/values";
import { defaultRolePermissions, isPermissionId, type OrganizationRole } from "../lib/auth-permissions";
import { internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { authComponent, createAuth, getDatabaseAdapter } from "./auth";
import { requireOrganization, requirePermission } from "./lib/auth";

const roleValidator = v.union(
  v.literal("admin"),
  v.literal("manager"),
  v.literal("member"),
);

const locationScopeValidator = v.object({
  all: v.boolean(),
  ids: v.array(v.id("locations")),
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

const roleContextValidator = v.object({
  organizationId: v.string(),
  role: roleValidator,
  permissions: v.array(v.string()),
  locationScope: locationScopeValidator,
  userId: v.string(),
  sessionId: v.string(),
  isKioskAccount: v.boolean(),
  kioskModeEnabled: v.boolean(),
  kioskLocationId: v.union(v.id("locations"), v.null()),
  userIdentifier: v.string(),
  userName: v.string(),
});

const memberLocationAccessValidator = v.object({
  userId: v.string(),
  scope: v.union(v.literal("all"), v.literal("selected")),
  locationIds: v.array(v.id("locations")),
});

const memberPermissionContextValidator = v.object({
  role: roleValidator,
  permissions: v.array(v.string()),
});

type AuthMember = {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  kioskLocationId?: string | null;
};

type AuthSession = {
  id: string;
  isKioskAccount?: boolean | null;
  kioskModeEnabled?: boolean | null;
};

async function getRoleContextForQuery(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Du er ikke logget ind");

  const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
  const member = (await auth.api.getActiveMember({ headers }).catch(() => null)) as
    | AuthMember
    | null;
  if (!member) throw new ConvexError("Ingen aktiv organisation");

  const session = await getDatabaseAdapter(ctx).findOne<AuthSession>({
    model: "session",
    where: [{ field: "id", value: identity.sessionId as string }],
  });
  const role = member.role;
  const rolePermissions = await ctx.db
    .query("rolePermissions")
    .withIndex("by_organizationId_and_role", (q) =>
      q.eq("organizationId", member.organizationId).eq("role", role),
    )
    .unique();
  const permissions = rolePermissions?.permissions ?? defaultRolePermissions[role];
  const access = await ctx.db
    .query("memberLocationAccess")
    .withIndex("by_organizationId_and_userId", (q) =>
      q.eq("organizationId", member.organizationId).eq("userId", member.userId),
    )
    .unique();

  const kioskLocationId = member.kioskLocationId
    ? (member.kioskLocationId as Id<"locations">)
    : null;
  const isKioskAccount = session?.isKioskAccount === true;
  const locationScope = kioskLocationId
    ? { all: false, ids: [kioskLocationId] }
    : access?.scope === "selected"
      ? { all: false, ids: access.locationIds }
      : { all: true, ids: [] };

  return {
    organizationId: member.organizationId,
    role,
    permissions: role === "admin" ? [...defaultRolePermissions.admin] : [...permissions],
    locationScope,
    userId: member.userId,
    sessionId: identity.sessionId as string,
    isKioskAccount,
    kioskModeEnabled: session?.kioskModeEnabled === true,
    kioskLocationId,
    userIdentifier: identity.tokenIdentifier,
    userName: identity.name?.trim() || identity.email || "Ukendt bruger",
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
      permissions:
        member.role === "admin"
          ? [...defaultRolePermissions.admin]
          : [...(configured?.permissions ?? defaultRolePermissions[member.role])],
    };
  },
});

export const getContext = query({
  args: {},
  returns: v.object({
    role: roleValidator,
    permissions: v.array(v.string()),
    locationScope: locationScopeValidator,
    kiosk: kioskContextValidator,
  }),
  handler: async (ctx) => {
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
      role: auth.role as OrganizationRole,
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
    };
  },
});

export const listRolePermissions = query({
  args: {},
  returns: v.array(
    v.object({
      role: roleValidator,
      permissions: v.array(v.string()),
    }),
  ),
  handler: async (ctx) => {
    const auth = await requirePermission(ctx, "roles.manage");
    const rows = await ctx.db
      .query("rolePermissions")
      .withIndex("by_organizationId_and_role", (q) =>
        q.eq("organizationId", auth.organizationId),
      )
      .take(3);
    const byRole = new Map(rows.map((row) => [row.role, row.permissions]));
    return (["admin", "manager", "member"] as const).map((role) => ({
      role,
      permissions:
        role === "admin"
          ? [...defaultRolePermissions.admin]
          : [...(byRole.get(role) ?? defaultRolePermissions[role])],
    }));
  },
});

export const saveRolePermissions = mutation({
  args: {
    role: roleValidator,
    permissions: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requirePermission(ctx, "roles.manage");
    if (args.role === "admin") {
      throw new ConvexError("Administratorrollen kan ikke ændres");
    }
    if (args.permissions.some((permission) => !isPermissionId(permission))) {
      throw new ConvexError("En eller flere tilladelser findes ikke");
    }
    const permissions = [...new Set(args.permissions)];
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
    return null;
  },
});

export const listMemberLocationAccess = query({
  args: {},
  returns: v.object({
    access: v.array(memberLocationAccessValidator),
    locations: v.array(
      v.object({ id: v.id("locations"), name: v.string() }),
    ),
  }),
  handler: async (ctx) => {
    const auth = await requirePermission(ctx, "members.manage");
    const [rows, locations] = await Promise.all([
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
    ]);
    return {
      access: rows.map(({ userId, scope, locationIds }) => ({
        userId,
        scope,
        locationIds,
      })),
      locations: locations.map(({ _id, name }) => ({ id: _id, name })),
    };
  },
});

export const setMemberLocationAccess = mutation({
  args: {
    userId: v.string(),
    scope: v.union(v.literal("all"), v.literal("selected")),
    locationIds: v.array(v.id("locations")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requirePermission(ctx, "members.manage");
    const member = await getDatabaseAdapter(ctx).findOne<AuthMember>({
      model: "member",
      where: [
        { field: "organizationId", value: auth.organizationId },
        { field: "userId", value: args.userId },
      ],
    });
    if (!member) throw new ConvexError("Brugeren er ikke medlem af organisationen");
    const locationIds = [...new Set(args.locationIds)];
    if (args.scope === "selected" && locationIds.length === 0) {
      throw new ConvexError("Vælg mindst én lokation");
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
      locationIds: args.scope === "all" ? [] : locationIds,
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
    return null;
  },
});
