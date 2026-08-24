import { ConvexError, v } from "convex/values";
import {
  isPermissionId,
  permissionCatalog,
  permissionsForRole,
  systemRoleKeys,
  systemRoleNames,
} from "../lib/auth-permissions";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { authComponent, createAuth, getDatabaseAdapter } from "./auth";
import {
  requireHumanPrincipal,
  requirePermission,
  type OrganizationAuth,
} from "./lib/auth";
import { recordAudit } from "./lib/audit";

const API_KEY_CONFIG_ID = "rest-api-v1";
const MAX_API_KEYS = 50;
const MAX_NAME_LENGTH = 100;
const MAX_EXPIRY_MS = 365 * 24 * 60 * 60 * 1_000;
const MIN_EXPIRY_MS = 24 * 60 * 60 * 1_000;
const humanOnlyPermissions = new Set([
  "apiKeys.manage",
  "members.manage",
  "roles.manage",
]);

const locationPolicyValidator = v.union(
  v.object({ kind: v.literal("all") }),
  v.object({
    kind: v.literal("selected"),
    locationIds: v.array(v.id("locations")),
  }),
  v.object({
    kind: v.literal("operator"),
    operatorId: v.id("operators"),
  }),
);

const policyInputValidator = v.object({
  role: v.string(),
  permissions: v.array(v.string()),
  locationPolicy: locationPolicyValidator,
});

const apiKeyMetadataValidator = v.object({
  id: v.string(),
  name: v.string(),
  prefix: v.string(),
  start: v.string(),
  role: v.string(),
  permissions: v.array(v.string()),
  locationPolicy: locationPolicyValidator,
  status: v.union(v.literal("active"), v.literal("revoked"), v.literal("expired")),
  createdByName: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  expiresAt: v.number(),
  lastUsedAt: v.union(v.number(), v.null()),
  revokedAt: v.union(v.number(), v.null()),
  revision: v.number(),
});

const createdKeyValidator = v.object({
  secret: v.string(),
  key: apiKeyMetadataValidator,
});

type LocationPolicy =
  | { kind: "all" }
  | { kind: "selected"; locationIds: Id<"locations">[] }
  | { kind: "operator"; operatorId: Id<"operators"> };

type PolicyInput = {
  role: string;
  permissions: string[];
  locationPolicy: LocationPolicy;
};

type ApiKeyMetadata = {
  id: string;
  name: string;
  prefix: string;
  start: string;
  role: string;
  permissions: string[];
  locationPolicy: LocationPolicy;
  status: "active" | "revoked" | "expired";
  createdByName: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
  revision: number;
};

type CreatedKey = { secret: string; key: ApiKeyMetadata };

type VerifiedKeyResult =
  | { valid: false; rateLimited: boolean; retryAfterMs: number | null }
  | {
      valid: true;
      keyId: string;
      organizationId: string;
      name: string;
      expiresAt: number | null;
      rateLimitMax: number | null;
      rateLimitResetAt: number | null;
      requestCount: number;
    };

type RotationPolicy = PolicyInput & { name: string };

type ListedPolicy = Omit<
  ApiKeyMetadata,
  "id" | "status" | "lastUsedAt"
> & {
  apiKeyId: string;
  status: "active" | "revoked";
};

type AuthOrganizationRole = {
  id: string;
  organizationId: string;
  role: string;
  permission: string;
};

function keyName(value: string) {
  const name = value.trim().replace(/\s+/g, " ");
  if (!name) throw new ConvexError("API-nøglen skal have et navn");
  if (name.length > MAX_NAME_LENGTH) {
    throw new ConvexError(`Navnet må højst være ${MAX_NAME_LENGTH} tegn`);
  }
  return name;
}

function expiryMilliseconds(value: number, minimum = MIN_EXPIRY_MS) {
  const duration = value - Date.now();
  if (!Number.isFinite(value) || duration < minimum) {
    throw new ConvexError("Udløbsdatoen skal være mindst ét døgn fremme");
  }
  if (duration > MAX_EXPIRY_MS) {
    throw new ConvexError("Udløbsdatoen må højst være ét år fremme");
  }
  return value;
}

function dateMilliseconds(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function granularityRank(value: string) {
  if (value === "detail") return 2;
  if (value === "aggregate") return 1;
  return 0;
}

async function registeredRole(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  role: string,
) {
  const row = await ctx.db
    .query("roles")
    .withIndex("by_organizationId_and_key", (q) =>
      q.eq("organizationId", organizationId).eq("key", role),
    )
    .unique();
  if (!row && !systemRoleKeys.includes(role as never)) {
    throw new ConvexError("Rollen blev ikke fundet");
  }
  return row;
}

async function validateLocationPolicy(
  ctx: QueryCtx | MutationCtx,
  auth: OrganizationAuth,
  policy: LocationPolicy,
) {
  if (policy.kind === "all") {
    if (!auth.locationScope.all) {
      throw new ConvexError("Du kan ikke give adgang til alle lokationer");
    }
    return policy;
  }
  if (policy.kind === "selected") {
    if (
      policy.locationIds.length < 1 ||
      policy.locationIds.length > 200 ||
      new Set(policy.locationIds).size !== policy.locationIds.length
    ) {
      throw new ConvexError("Vælg mellem 1 og 200 unikke lokationer");
    }
    const locations = await Promise.all(
      policy.locationIds.map((locationId) => ctx.db.get("locations", locationId)),
    );
    if (
      locations.some(
        (location, index) =>
          !location ||
          location.organizationId !== auth.organizationId ||
          (!auth.locationScope.all &&
            !auth.locationScope.ids.has(policy.locationIds[index])),
      )
    ) {
      throw new ConvexError("Du har ikke adgang til en eller flere lokationer");
    }
    return policy;
  }
  const operator = await ctx.db.get("operators", policy.operatorId);
  if (!operator || operator.organizationId !== auth.organizationId) {
    throw new ConvexError("Operatøren blev ikke fundet");
  }
  const locations = await ctx.db
    .query("locations")
    .withIndex("by_organizationId_and_operatorId", (q) =>
      q
        .eq("organizationId", auth.organizationId)
        .eq("operatorId", operator._id),
    )
    .take(201);
  if (
    locations.length > 200 ||
    (!auth.locationScope.all &&
      locations.some((location) => !auth.locationScope.ids.has(location._id)))
  ) {
    throw new ConvexError("Du kan ikke give adgang til operatørens lokationer");
  }
  return policy;
}

async function validatePolicy(
  ctx: QueryCtx | MutationCtx,
  auth: OrganizationAuth,
  input: PolicyInput,
) {
  const role = await registeredRole(ctx, auth.organizationId, input.role);
  if (granularityRank(role?.granularity ?? "detail") > granularityRank(auth.granularity)) {
    throw new ConvexError("Du kan ikke give en mere detaljeret datavisning");
  }
  const configured = await ctx.db
    .query("rolePermissions")
    .withIndex("by_organizationId_and_role", (q) =>
      q.eq("organizationId", auth.organizationId).eq("role", input.role),
    )
    .unique();
  const rolePermissions = new Set(
    permissionsForRole(input.role, configured?.permissions),
  );
  const permissions = [...new Set(input.permissions)];
  if (
    permissions.length < 1 ||
    permissions.some(
      (permission) =>
        !isPermissionId(permission) ||
        humanOnlyPermissions.has(permission) ||
        !auth.permissions.has(permission) ||
        !rolePermissions.has(permission),
    )
  ) {
    throw new ConvexError("En eller flere tilladelser kan ikke tildeles");
  }
  return {
    role: input.role,
    permissions,
    locationPolicy: await validateLocationPolicy(ctx, auth, input.locationPolicy),
  };
}

function requireGatewayIdentity(identity: Awaited<ReturnType<ActionCtx["auth"]["getUserIdentity"]>>) {
  if (
    !identity ||
    !process.env.SITE_URL ||
    identity.issuer !==
      `${process.env.SITE_URL.replace(/\/$/, "")}/api/v1` ||
    identity.subject !== "rest-gateway" ||
    identity.principalKind !== "restGateway"
  ) {
    throw new ConvexError("Ugyldig REST-gateway");
  }
}

export const verifyForRestGateway = action({
  args: { key: v.string() },
  returns: v.union(
    v.object({
      valid: v.literal(false),
      rateLimited: v.boolean(),
      retryAfterMs: v.union(v.number(), v.null()),
    }),
    v.object({
      valid: v.literal(true),
      keyId: v.string(),
      organizationId: v.string(),
      name: v.string(),
      expiresAt: v.union(v.number(), v.null()),
      rateLimitMax: v.union(v.number(), v.null()),
      rateLimitResetAt: v.union(v.number(), v.null()),
      requestCount: v.number(),
    }),
  ),
  handler: async (ctx, args): Promise<VerifiedKeyResult> => {
    requireGatewayIdentity(await ctx.auth.getUserIdentity());
    if (args.key.length < 32 || args.key.length > 256 || /\s/.test(args.key)) {
      return {
        valid: false as const,
        rateLimited: false,
        retryAfterMs: null,
      };
    }
    try {
      const result = await createAuth(ctx).api.verifyApiKey({
        body: { configId: API_KEY_CONFIG_ID, key: args.key },
      });
      if (!result.valid || !result.key) {
        const errorCode = result.error?.code;
        const rateLimited =
          errorCode === "RATE_LIMITED" ||
          errorCode === "RATE_LIMIT_EXCEEDED" ||
          errorCode === "USAGE_EXCEEDED";
        const details =
          result.error && "details" in result.error
            ? result.error.details
            : null;
        const retryAfterMs =
          details &&
          typeof details === "object" &&
          "tryAgainIn" in details &&
          typeof details.tryAgainIn === "number" &&
          Number.isFinite(details.tryAgainIn) &&
          details.tryAgainIn > 0
            ? details.tryAgainIn
            : null;
        return {
          valid: false as const,
          rateLimited,
          retryAfterMs,
        };
      }
      const lastRequest = dateMilliseconds(result.key.lastRequest);
      const rateLimitTimeWindow = result.key.rateLimitTimeWindow;
      return {
        valid: true as const,
        keyId: result.key.id,
        organizationId: result.key.referenceId,
        name: result.key.name?.trim() || "API key",
        expiresAt: dateMilliseconds(result.key.expiresAt),
        rateLimitMax: result.key.rateLimitMax ?? null,
        rateLimitResetAt:
          lastRequest !== null &&
          typeof rateLimitTimeWindow === "number" &&
          Number.isFinite(rateLimitTimeWindow) &&
          rateLimitTimeWindow > 0
            ? lastRequest + rateLimitTimeWindow
            : null,
        requestCount: result.key.requestCount,
      };
    } catch {
      return {
        valid: false as const,
        rateLimited: false,
        retryAfterMs: null,
      };
    }
  },
});

export const getAdminOptions = query({
  args: {},
  returns: v.object({
    roles: v.array(
      v.object({
        key: v.string(),
        name: v.string(),
        granularity: v.union(
          v.literal("detail"),
          v.literal("aggregate"),
          v.literal("anonymous"),
        ),
        permissions: v.array(v.string()),
      }),
    ),
    permissionGroups: v.array(
      v.object({
        group: v.string(),
        permissions: v.array(v.object({ id: v.string(), label: v.string() })),
      }),
    ),
    locations: v.array(v.object({ id: v.id("locations"), name: v.string() })),
    operators: v.array(v.object({ id: v.id("operators"), name: v.string() })),
    defaultRole: v.string(),
    canGrantAllLocations: v.boolean(),
  }),
  handler: async (ctx) => {
    const auth = requireHumanPrincipal(
      await requirePermission(ctx, "apiKeys.manage"),
    );
    const [roles, configuredRows, locations, operators] = await Promise.all([
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
    const configured = new Map(
      configuredRows.map((row) => [row.role, row.permissions] as const),
    );
    const byKey = new Map(roles.map((role) => [role.key, role] as const));
    const roleKeys = [
      ...systemRoleKeys,
      ...roles
        .filter((role) => !systemRoleKeys.includes(role.key as never))
        .map((role) => role.key),
    ];
    const grantablePermissions = new Set(
      [...auth.permissions].filter(
        (permission) =>
          isPermissionId(permission) && !humanOnlyPermissions.has(permission),
      ),
    );
    const scopedLocations = locations.filter(
      (location) =>
        auth.locationScope.all || auth.locationScope.ids.has(location._id),
    );
    const scopedLocationIds = new Set(scopedLocations.map((row) => row._id));
    const scopedOperators: Array<{ id: Id<"operators">; name: string }> = [];
    for (const operator of operators) {
      const operatorLocations = locations.filter(
        (location) => location.operatorId === operator._id,
      );
      if (
        auth.locationScope.all ||
        operatorLocations.every((location) => scopedLocationIds.has(location._id))
      ) {
        scopedOperators.push({ id: operator._id, name: operator.name });
      }
    }
    return {
      roles: roleKeys
        .map((key) => {
          const role = byKey.get(key);
          const granularity = role?.granularity ?? "detail";
          return {
            key,
            name:
              role?.name ??
              systemRoleNames[key as keyof typeof systemRoleNames] ??
              key,
            granularity,
            permissions: permissionsForRole(key, configured.get(key)).filter(
              (permission) => grantablePermissions.has(permission),
            ),
          };
        })
        .filter(
          (role) =>
            role.permissions.length > 0 &&
            granularityRank(role.granularity) <= granularityRank(auth.granularity),
        ),
      permissionGroups: permissionCatalog
        .map((group) => ({
          group: group.group,
          permissions: group.permissions.filter((permission) =>
            grantablePermissions.has(permission.id),
          ),
        }))
        .filter((group) => group.permissions.length > 0),
      locations: scopedLocations.map((location) => ({
        id: location._id,
        name: location.name,
      })),
      operators: scopedOperators,
      defaultRole: auth.role,
      canGrantAllLocations: auth.locationScope.all,
    };
  },
});

export const validatePolicyForCreate = internalQuery({
  args: { input: policyInputValidator },
  returns: policyInputValidator,
  handler: async (ctx, args): Promise<PolicyInput> => {
    const auth = requireHumanPrincipal(
      await requirePermission(ctx, "apiKeys.manage"),
    );
    return await validatePolicy(ctx, auth, args.input);
  },
});

export const ensureRoleBridge = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const auth = requireHumanPrincipal(
      await requirePermission(ctx, "apiKeys.manage"),
    );
    if (systemRoleKeys.includes(auth.role as never)) return null;
    const adapter = getDatabaseAdapter(ctx);
    const role = await adapter.findOne<AuthOrganizationRole>({
      model: "organizationRole",
      where: [
        { field: "organizationId", value: auth.organizationId },
        { field: "role", value: auth.role },
      ],
    });
    if (!role) throw new ConvexError("Rollen blev ikke fundet");
    let statements: Record<string, string[]>;
    try {
      statements = JSON.parse(role.permission) as Record<string, string[]>;
    } catch {
      throw new ConvexError("Rollens Better Auth-adgang er ugyldig");
    }
    await adapter.update({
      model: "organizationRole",
      where: [{ field: "id", value: role.id }],
      update: {
        permission: JSON.stringify({
          ...statements,
          apiKey: ["create", "read", "update", "delete"],
        }),
        updatedAt: new Date(),
      },
    });
    return null;
  },
});

export const insertPolicy = internalMutation({
  args: {
    apiKeyId: v.string(),
    name: v.string(),
    prefix: v.string(),
    start: v.string(),
    expiresAt: v.number(),
    rotationOfApiKeyId: v.optional(v.string()),
    input: policyInputValidator,
  },
  returns: apiKeyMetadataValidator,
  handler: async (ctx, args): Promise<ApiKeyMetadata> => {
    const auth = requireHumanPrincipal(
      await requirePermission(ctx, "apiKeys.manage"),
    );
    const input = await validatePolicy(ctx, auth, args.input);
    if (
      await ctx.db
        .query("apiKeyPolicies")
        .withIndex("by_apiKeyId", (q) => q.eq("apiKeyId", args.apiKeyId))
        .unique()
    ) {
      throw new ConvexError("API-nøglen findes allerede");
    }
    const existing = await ctx.db
      .query("apiKeyPolicies")
      .withIndex("by_organizationId_and_status_and_expiresAt", (q) =>
        q
          .eq("organizationId", auth.organizationId)
          .eq("status", "active")
          .gt("expiresAt", Date.now()),
      )
      .take(MAX_API_KEYS);
    if (existing.length >= MAX_API_KEYS) {
      throw new ConvexError(`Organisationen kan højst have ${MAX_API_KEYS} aktive API-nøgler`);
    }
    const now = Date.now();
    const policyId = await ctx.db.insert("apiKeyPolicies", {
      apiKeyId: args.apiKeyId,
      organizationId: auth.organizationId,
      name: keyName(args.name),
      prefix: args.prefix,
      start: args.start,
      ...input,
      status: "active" as const,
      createdByUserId: auth.userId,
      createdByName: auth.userName,
      createdAt: now,
      updatedAt: now,
      expiresAt: expiryMilliseconds(args.expiresAt, 1_000),
      revision: 1,
    });
    await recordAudit(ctx, auth, {
      action: "apiKeys.created",
      entityTable: "apiKeyPolicies",
      entityId: policyId,
      summary: `API-nøglen ${args.name} blev oprettet`,
    });
    const previousApiKeyId = args.rotationOfApiKeyId;
    if (previousApiKeyId) {
      const previousPolicy = await ctx.db
        .query("apiKeyPolicies")
        .withIndex("by_apiKeyId", (q) => q.eq("apiKeyId", previousApiKeyId))
        .unique();
      if (
        !previousPolicy ||
        previousPolicy.organizationId !== auth.organizationId
      ) {
        throw new ConvexError("API-nøglen til rotation blev ikke fundet");
      }
      await recordAudit(ctx, auth, {
        action: "apiKeys.rotated",
        entityTable: "apiKeyPolicies",
        entityId: `${previousApiKeyId}:${args.apiKeyId}`,
        summary: `API-nøglen ${args.name} blev roteret`,
      });
    }
    return {
      id: args.apiKeyId,
      name: keyName(args.name),
      prefix: args.prefix,
      start: args.start,
      ...input,
      status: "active" as const,
      createdByName: auth.userName,
      createdAt: now,
      updatedAt: now,
      expiresAt: args.expiresAt,
      lastUsedAt: null,
      revokedAt: null,
      revision: 1,
    };
  },
});

export const getPolicyForRotation = internalQuery({
  args: { apiKeyId: v.string() },
  returns: v.object({
    name: v.string(),
    role: v.string(),
    permissions: v.array(v.string()),
    locationPolicy: locationPolicyValidator,
  }),
  handler: async (ctx, args) => {
    const auth = requireHumanPrincipal(
      await requirePermission(ctx, "apiKeys.manage"),
    );
    const policy = await ctx.db
      .query("apiKeyPolicies")
      .withIndex("by_apiKeyId", (q) => q.eq("apiKeyId", args.apiKeyId))
      .unique();
    if (
      !policy ||
      policy.organizationId !== auth.organizationId ||
      policy.status !== "active" ||
      policy.expiresAt <= Date.now()
    ) {
      throw new ConvexError("API-nøglen blev ikke fundet");
    }
    return {
      name: policy.name,
      role: policy.role,
      permissions: policy.permissions,
      locationPolicy: policy.locationPolicy,
    };
  },
});

async function createManagedKey(
  ctx: ActionCtx,
  args: {
    name: string;
    expiresAt: number;
    input: PolicyInput;
    rotationOfApiKeyId?: string;
  },
): Promise<CreatedKey> {
  const auth = requireHumanPrincipal(
    await requirePermission(ctx, "apiKeys.manage"),
  );
  const name = keyName(args.name);
  const expiresAt = expiryMilliseconds(args.expiresAt);
  const input: PolicyInput = await ctx.runQuery(
    internal.apiKeys.validatePolicyForCreate,
    { input: args.input },
  );
  await ctx.runMutation(internal.apiKeys.ensureRoleBridge, {});
  const created = await createAuth(ctx).api.createApiKey({
    body: {
      configId: API_KEY_CONFIG_ID,
      name,
      expiresIn: Math.max(1, Math.ceil((expiresAt - Date.now()) / 1_000)),
      userId: auth.userId,
      organizationId: auth.organizationId,
      rateLimitEnabled: true,
      rateLimitTimeWindow: 60_000,
      rateLimitMax: 120,
    },
  });
  const createdExpiresAt = dateMilliseconds(created.expiresAt);
  if (!created.key || !createdExpiresAt) {
    throw new ConvexError("API-nøglen kunne ikke oprettes");
  }
  try {
    const key: ApiKeyMetadata = await ctx.runMutation(
      internal.apiKeys.insertPolicy,
      {
        apiKeyId: created.id,
        name,
        prefix: created.prefix ?? "eng_",
        start: created.start ?? "eng_",
        expiresAt: createdExpiresAt,
        rotationOfApiKeyId: args.rotationOfApiKeyId,
        input,
      },
    );
    return { secret: created.key, key };
  } catch (error) {
    await createAuth(ctx).api
      .updateApiKey({
        body: {
          configId: API_KEY_CONFIG_ID,
          keyId: created.id,
          userId: auth.userId,
          enabled: false,
        },
      })
      .catch(() => undefined);
    throw error;
  }
}

export const create = action({
  args: {
    name: v.string(),
    expiresAt: v.number(),
    input: policyInputValidator,
  },
  returns: createdKeyValidator,
  handler: async (ctx, args): Promise<CreatedKey> =>
    await createManagedKey(ctx, args),
});

export const rotate = action({
  args: { apiKeyId: v.string(), expiresAt: v.number() },
  returns: createdKeyValidator,
  handler: async (ctx, args): Promise<CreatedKey> => {
    const current: RotationPolicy = await ctx.runQuery(
      internal.apiKeys.getPolicyForRotation,
      { apiKeyId: args.apiKeyId },
    );
    return await createManagedKey(ctx, {
      name: current.name,
      expiresAt: args.expiresAt,
      rotationOfApiKeyId: args.apiKeyId,
      input: {
        role: current.role,
        permissions: current.permissions,
        locationPolicy: current.locationPolicy,
      },
    });
  },
});

export const revokePolicy = internalMutation({
  args: { apiKeyId: v.string() },
  returns: v.object({ alreadyRevoked: v.boolean() }),
  handler: async (ctx, args) => {
    const auth = requireHumanPrincipal(
      await requirePermission(ctx, "apiKeys.manage"),
    );
    const policy = await ctx.db
      .query("apiKeyPolicies")
      .withIndex("by_apiKeyId", (q) => q.eq("apiKeyId", args.apiKeyId))
      .unique();
    if (!policy || policy.organizationId !== auth.organizationId) {
      throw new ConvexError("API-nøglen blev ikke fundet");
    }
    if (policy.status === "revoked") return { alreadyRevoked: true };
    const now = Date.now();
    await ctx.db.patch("apiKeyPolicies", policy._id, {
      status: "revoked",
      revokedAt: now,
      updatedAt: now,
      revision: policy.revision + 1,
    });
    await recordAudit(ctx, auth, {
      action: "apiKeys.revoked",
      entityTable: "apiKeyPolicies",
      entityId: policy._id,
      summary: `API-nøglen ${policy.name} blev tilbagekaldt`,
    });
    return { alreadyRevoked: false };
  },
});

export const revoke = action({
  args: { apiKeyId: v.string() },
  returns: v.object({ revoked: v.boolean(), credentialDisabled: v.boolean() }),
  handler: async (ctx, args) => {
    const auth = requireHumanPrincipal(
      await requirePermission(ctx, "apiKeys.manage"),
    );
    await ctx.runMutation(internal.apiKeys.ensureRoleBridge, {});
    await ctx.runMutation(internal.apiKeys.revokePolicy, args);
    try {
      await createAuth(ctx).api.updateApiKey({
        body: {
          configId: API_KEY_CONFIG_ID,
          keyId: args.apiKeyId,
          userId: auth.userId,
          enabled: false,
        },
      });
      return { revoked: true, credentialDisabled: true };
    } catch {
      return { revoked: true, credentialDisabled: false };
    }
  },
});

export const listPoliciesForAdmin = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      apiKeyId: v.string(),
      name: v.string(),
      prefix: v.string(),
      start: v.string(),
      role: v.string(),
      permissions: v.array(v.string()),
      locationPolicy: locationPolicyValidator,
      status: v.union(v.literal("active"), v.literal("revoked")),
      createdByName: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
      expiresAt: v.number(),
      revokedAt: v.union(v.number(), v.null()),
      revision: v.number(),
    }),
  ),
  handler: async (ctx): Promise<ListedPolicy[]> => {
    const auth = requireHumanPrincipal(
      await requirePermission(ctx, "apiKeys.manage"),
    );
    const [recentPolicies, activePolicies] = await Promise.all([
      ctx.db
        .query("apiKeyPolicies")
        .withIndex("by_organizationId_and_createdAt", (q) =>
          q.eq("organizationId", auth.organizationId),
        )
        .order("desc")
        .take(100),
      ctx.db
        .query("apiKeyPolicies")
        .withIndex("by_organizationId_and_status_and_expiresAt", (q) =>
          q
            .eq("organizationId", auth.organizationId)
            .eq("status", "active")
            .gt("expiresAt", Date.now()),
        )
        .collect(),
    ]);
    const policiesById = new Map(
      recentPolicies.map((policy) => [policy.apiKeyId, policy] as const),
    );
    for (const policy of activePolicies) {
      policiesById.set(policy.apiKeyId, policy);
    }
    return [...policiesById.values()]
      .sort((left, right) => right.createdAt - left.createdAt)
      .map((policy) => ({
        apiKeyId: policy.apiKeyId,
        name: policy.name,
        prefix: policy.prefix,
        start: policy.start,
        role: policy.role,
        permissions: policy.permissions,
        locationPolicy: policy.locationPolicy,
        status: policy.status,
        createdByName: policy.createdByName,
        createdAt: policy.createdAt,
        updatedAt: policy.updatedAt,
        expiresAt: policy.expiresAt,
        revokedAt: policy.revokedAt ?? null,
        revision: policy.revision,
      }));
  },
});

export const list = action({
  args: {},
  returns: v.array(apiKeyMetadataValidator),
  handler: async (ctx): Promise<ApiKeyMetadata[]> => {
    const auth = requireHumanPrincipal(
      await requirePermission(ctx, "apiKeys.manage"),
    );
    await ctx.runMutation(internal.apiKeys.ensureRoleBridge, {});
    const [policies, headers]: [ListedPolicy[], Headers] = await Promise.all([
      ctx.runQuery(internal.apiKeys.listPoliciesForAdmin, {}),
      authComponent.getHeaders(ctx),
    ]);
    const result = await createAuth(ctx).api.listApiKeys({
      query: {
        configId: API_KEY_CONFIG_ID,
        organizationId: auth.organizationId,
        limit: 100,
        offset: 0,
        sortBy: "createdAt",
        sortDirection: "desc",
      },
      headers,
    });
    const credentials = new Map(result.apiKeys.map((key) => [key.id, key]));
    const now = Date.now();
    const missingActivePolicies = policies.filter(
      (policy) =>
        policy.status === "active" &&
        policy.expiresAt > now &&
        !credentials.has(policy.apiKeyId),
    );
    const individuallyLoaded = await Promise.all(
      missingActivePolicies.map(async (policy) => {
        try {
          return await createAuth(ctx).api.getApiKey({
            query: { configId: API_KEY_CONFIG_ID, id: policy.apiKeyId },
            headers,
          });
        } catch {
          return null;
        }
      }),
    );
    for (const credential of individuallyLoaded) {
      if (credential) credentials.set(credential.id, credential);
    }
    return policies.map((policy) => {
      const credential = credentials.get(policy.apiKeyId);
      const status: ApiKeyMetadata["status"] =
        policy.status === "revoked"
          ? "revoked"
          : policy.expiresAt <= now
            ? "expired"
            : !credential || credential.enabled === false
              ? "revoked"
              : "active";
      return {
        id: policy.apiKeyId,
        name: policy.name,
        prefix: policy.prefix,
        start: policy.start,
        role: policy.role,
        permissions: policy.permissions,
        locationPolicy: policy.locationPolicy,
        status,
        createdByName: policy.createdByName,
        createdAt: policy.createdAt,
        updatedAt: policy.updatedAt,
        expiresAt: policy.expiresAt,
        lastUsedAt: dateMilliseconds(credential?.lastRequest),
        revokedAt: policy.revokedAt ?? null,
        revision: policy.revision,
      };
    });
  },
});

export const updatePolicy = mutation({
  args: { apiKeyId: v.string(), input: policyInputValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = requireHumanPrincipal(
      await requirePermission(ctx, "apiKeys.manage"),
    );
    const policy = await ctx.db
      .query("apiKeyPolicies")
      .withIndex("by_apiKeyId", (q) => q.eq("apiKeyId", args.apiKeyId))
      .unique();
    if (
      !policy ||
      policy.organizationId !== auth.organizationId ||
      policy.status !== "active" ||
      policy.expiresAt <= Date.now()
    ) {
      throw new ConvexError("API-nøglen blev ikke fundet");
    }
    const input = await validatePolicy(ctx, auth, args.input);
    await ctx.db.patch("apiKeyPolicies", policy._id, {
      ...input,
      updatedAt: Date.now(),
      revision: policy.revision + 1,
    });
    await recordAudit(ctx, auth, {
      action: "apiKeys.policyChanged",
      entityTable: "apiKeyPolicies",
      entityId: policy._id,
      summary: `Adgangen for API-nøglen ${policy.name} blev ændret`,
    });
    return null;
  },
});
