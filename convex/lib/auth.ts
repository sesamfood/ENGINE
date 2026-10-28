import { ConvexError } from "convex/values";
import type { UserIdentity } from "convex/server";
import {
  hasPermission,
  isPermissionId,
  permissionsForRole,
  systemRoleKeys,
  type DataGranularity,
  type OrganizationRole,
  type PermissionId,
} from "../../lib/auth-permissions";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { getDatabaseAdapter } from "../auth";
import type { KioskDestinationId } from "../../lib/kiosk";
import { otherFeaturesLocked } from "./countLock";
import { startOfDayAllowedPages } from "./kioskDay";
import { getTestOrganization, resolveTestOrganizationMember } from "./testOrganizations";
import {
  getEntitlements,
  getOrganizationDisabledFeatures,
  nonEntitledFeatures,
  permissionFeatures,
  type FeatureId,
} from "./features";

type AuthContext = QueryCtx | MutationCtx | ActionCtx;

function apiAuthError(code: string, message: string) {
  return new ConvexError({ code, message });
}

type AuthMember = {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  kioskLocationId?: string | null;
};

type AuthSession = {
  userId: string;
  expiresAt: number;
  activeOrganizationId?: string | null;
  isKioskAccount?: boolean | null;
  kioskModeEnabled?: boolean | null;
};

type StoredLocationAccess = {
  scope: "all" | "selected" | "operator";
  locationIds: Id<"locations">[];
  operatorId?: Id<"operators">;
} | null;

export async function resolveStoredLocationScope(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  access: StoredLocationAccess,
  kioskLocationId: Id<"locations"> | null,
) {
  if (kioskLocationId) {
    return { all: false, ids: new Set<Id<"locations">>([kioskLocationId]) };
  }
  if (access?.scope === "selected") {
    return { all: false, ids: new Set(access.locationIds) };
  }
  if (access?.scope === "operator") {
    if (!access.operatorId) {
      return { all: false, ids: new Set<Id<"locations">>() };
    }
    const locations = await ctx.db
      .query("locations")
      .withIndex("by_organizationId_and_operatorId", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("operatorId", access.operatorId),
      )
      .take(200);
    return {
      all: false,
      ids: new Set(locations.map((location) => location._id)),
    };
  }
  return { all: true, ids: new Set<Id<"locations">>() };
}

export function isApiKeyIdentity(identity: { issuer: string }) {
  return Boolean(
    process.env.SITE_URL &&
      identity.issuer === `${process.env.SITE_URL.replace(/\/$/, "")}/api/v1`,
  );
}

export async function getUserSession(
  ctx: QueryCtx | MutationCtx,
  identity: UserIdentity,
) {
  if (typeof identity.sessionId !== "string") return null;
  const session = await getDatabaseAdapter(ctx).findOne<AuthSession>({
    model: "session",
    where: [{ field: "id", value: identity.sessionId }],
  });
  return session && session.expiresAt >= Date.now() ? session : null;
}

async function getOrganizationAccess(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
) {
  const [entitlements, disabled] = await Promise.all([
    getEntitlements(ctx, organizationId),
    getOrganizationDisabledFeatures(ctx, organizationId),
  ]);
  return {
    suspended: entitlements?.status === "suspended",
    disabledFeatures: new Set<FeatureId>([
      ...disabled,
      ...nonEntitledFeatures(entitlements),
    ]),
  };
}

async function getOrganizationFromDatabase(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Du er ikke logget ind");

  if (isApiKeyIdentity(identity)) {
    return await getApiKeyOrganization(ctx, identity);
  }

  const adapter = getDatabaseAdapter(ctx);
  const session = await getUserSession(ctx, identity);
  if (!session) throw new ConvexError("Ingen aktiv organisation");
  // An active support grant takes precedence over the user's own membership.
  const grant = await getActiveSupportGrant(ctx, session.userId);
  if (grant) return await getSupportOrganization(ctx, identity, grant);
  if (!session.activeOrganizationId) {
    throw new ConvexError("Ingen aktiv organisation");
  }
  const member = await adapter.findOne<AuthMember>({
    model: "member",
    where: [
      { field: "organizationId", value: session.activeOrganizationId },
      { field: "userId", value: session.userId },
    ],
  });
  if (!member) throw new ConvexError("Ingen aktiv organisation");
  const organizationAccess = await getOrganizationAccess(ctx, member.organizationId);
  if (organizationAccess.suspended) {
    throw new ConvexError("Organisationen er suspenderet");
  }
  const testOrganization = await getTestOrganization(ctx, member.organizationId);
  if (testOrganization && session.isKioskAccount) {
    throw new ConvexError("Ingen aktiv organisation");
  }
  const testMember = testOrganization
    ? await resolveTestOrganizationMember(ctx, testOrganization, member.userId)
    : null;
  const role = testMember?.role ?? member.role;
  const [configured, roleConfig] = await Promise.all([
    ctx.db
      .query("rolePermissions")
      .withIndex("by_organizationId_and_role", (q) =>
        q.eq("organizationId", member.organizationId).eq("role", role),
      )
      .unique(),
    ctx.db
      .query("roles")
      .withIndex("by_organizationId_and_key", (q) =>
        q.eq("organizationId", member.organizationId).eq("key", role),
      )
      .unique(),
  ]);
  const permissions = permissionsForRole(role, configured?.permissions);
  const locationAccess = testMember
    ? testMember.locationAccess
    : await ctx.db
        .query("memberLocationAccess")
        .withIndex("by_organizationId_and_userId", (q) =>
          q.eq("organizationId", member.organizationId).eq("userId", member.userId),
        )
        .unique();
  const kioskSession =
    !member.kioskLocationId && !testMember && session.kioskModeEnabled
      ? await ctx.db
          .query("kioskSessions")
          .withIndex("by_sessionId", (q) =>
            q.eq("sessionId", identity.sessionId as string),
          )
          .unique()
      : null;
  const sessionKioskLocationId =
    kioskSession?.organizationId === member.organizationId
      ? kioskSession.locationId
      : null;
  const kioskLocationId = member.kioskLocationId && !testMember
    ? (member.kioskLocationId as Id<"locations">)
    : sessionKioskLocationId;
  const isKioskAccount =
    session.isKioskAccount === true || sessionKioskLocationId !== null;
  const locationScope = await resolveStoredLocationScope(
    ctx,
    member.organizationId,
    locationAccess,
    kioskLocationId,
  );

  return {
    organizationId: member.organizationId,
    role,
    granularity: roleConfig?.granularity ?? "detail",
    permissions: new Set<string>(permissions),
    locationScope,
    disabledFeatures: organizationAccess.disabledFeatures,
    principalKind: "user" as const,
    supportGrantId: null,
    readOnly: false,
    apiKeyId: null,
    userId: member.userId,
    sessionId: identity.sessionId as string,
    isKioskAccount,
    kioskModeEnabled: isKioskAccount && session.kioskModeEnabled === true,
    kioskLocationId,
    userIdentifier: identity.tokenIdentifier,
    userName: identity.name?.trim() || identity.email || "Ukendt bruger",
    requestId: null,
  };
}

export async function getActiveSupportGrant(
  ctx: QueryCtx | MutationCtx,
  platformUserId: string,
) {
  const grant = await ctx.db
    .query("supportGrants")
    .withIndex("by_platformUserId_and_expiresAt", (q) =>
      q.eq("platformUserId", platformUserId).gt("expiresAt", Date.now()),
    )
    .first();
  if (!grant || grant.endedAt !== undefined) return null;
  // Revoking platform access cuts off any grant still running.
  const member = await ctx.db
    .query("platformMembers")
    .withIndex("by_userId", (q) => q.eq("userId", platformUserId))
    .unique();
  return member ? grant : null;
}

// The organization comes only from the grant row, never from the session or a client argument.
async function getSupportOrganization(
  ctx: QueryCtx | MutationCtx,
  identity: UserIdentity,
  grant: Doc<"supportGrants">,
) {
  const organizationAccess = await getOrganizationAccess(ctx, grant.organizationId);
  const readOnly = grant.mode === "view";
  if (organizationAccess.suspended && !readOnly) {
    throw new ConvexError("Organisationen er suspenderet");
  }
  if (readOnly && "insert" in ctx.db) {
    throw new ConvexError("Supportadgangen er kun til visning");
  }
  return {
    organizationId: grant.organizationId,
    role: "support",
    granularity: "detail" as const,
    permissions: new Set<string>(grant.permissions.filter(isPermissionId)),
    locationScope: { all: true, ids: new Set<Id<"locations">>() },
    disabledFeatures: organizationAccess.disabledFeatures,
    principalKind: "support" as const,
    supportGrantId: grant._id,
    readOnly,
    apiKeyId: null,
    userId: grant.platformUserId,
    sessionId: identity.sessionId as string,
    isKioskAccount: false,
    kioskModeEnabled: false,
    kioskLocationId: null,
    userIdentifier: identity.tokenIdentifier,
    userName: `Support: ${grant.platformUserName}`,
    requestId: null,
  };
}

type ServiceIdentity = {
  issuer: string;
  tokenIdentifier: string;
  principalKind?: unknown;
  apiKeyId?: unknown;
  organizationId?: unknown;
  requestId?: unknown;
};

async function getApiKeyOrganization(
  ctx: QueryCtx | MutationCtx,
  identity: ServiceIdentity,
) {
  if (
    identity.principalKind !== "apiKey" ||
    typeof identity.apiKeyId !== "string" ||
    typeof identity.organizationId !== "string" ||
    identity.apiKeyId.length > 200 ||
    identity.organizationId.length > 200
  ) {
    throw apiAuthError("invalid_api_identity", "The API identity is invalid.");
  }
  const apiKeyId = identity.apiKeyId;
  const claimedOrganizationId = identity.organizationId;
  const policy = await ctx.db
    .query("apiKeyPolicies")
    .withIndex("by_apiKeyId", (q) => q.eq("apiKeyId", apiKeyId))
    .unique();
  if (
    !policy ||
    policy.status !== "active" ||
    policy.organizationId !== claimedOrganizationId ||
    policy.expiresAt <= Date.now()
  ) {
    throw apiAuthError("invalid_api_key_policy", "The API key is not authorized.");
  }
  const organizationAccess = await getOrganizationAccess(ctx, policy.organizationId);
  if (organizationAccess.suspended) {
    throw apiAuthError("organization_suspended", "The organization is suspended.");
  }
  if (
    policy.permissions.some(
      (permission) =>
        !isPermissionId(permission) || permission === "apiKeys.manage",
    )
  ) {
    throw apiAuthError(
      "invalid_api_key_policy",
      "The API key permissions are invalid.",
    );
  }
  const [configured, roleConfig] = await Promise.all([
    ctx.db
      .query("rolePermissions")
      .withIndex("by_organizationId_and_role", (q) =>
        q
          .eq("organizationId", policy.organizationId)
          .eq("role", policy.role),
      )
      .unique(),
    ctx.db
      .query("roles")
      .withIndex("by_organizationId_and_key", (q) =>
        q.eq("organizationId", policy.organizationId).eq("key", policy.role),
      )
      .unique(),
  ]);
  if (!roleConfig && !systemRoleKeys.includes(policy.role as never)) {
    throw apiAuthError(
      "invalid_api_key_policy",
      "The API key role no longer exists.",
    );
  }
  const rolePermissions = new Set(
    permissionsForRole(policy.role, configured?.permissions),
  );
  const permissions = new Set(
    policy.permissions.filter((permission) => rolePermissions.has(permission)),
  );
  const locationScope = await resolveApiKeyLocationScope(
    ctx,
    policy.organizationId,
    policy.locationPolicy,
  );

  return {
    organizationId: policy.organizationId,
    role: policy.role,
    granularity: roleConfig?.granularity ?? "detail",
    permissions,
    locationScope,
    disabledFeatures: organizationAccess.disabledFeatures,
    principalKind: "apiKey" as const,
    supportGrantId: null,
    readOnly: false,
    apiKeyId: policy.apiKeyId,
    userId: null,
    sessionId: null,
    isKioskAccount: false,
    kioskModeEnabled: false,
    kioskLocationId: null,
    userIdentifier: identity.tokenIdentifier,
    userName: policy.name,
    requestId:
      typeof identity.requestId === "string" && identity.requestId.length <= 100
        ? identity.requestId
        : null,
  };
}

async function resolveApiKeyLocationScope(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  policy:
    | { kind: "all" }
    | { kind: "selected"; locationIds: Id<"locations">[] }
    | { kind: "operator"; operatorId: Id<"operators"> },
) {
  if (policy.kind === "all") {
    return { all: true, ids: new Set<Id<"locations">>() };
  }
  if (policy.kind === "selected") {
    if (
      policy.locationIds.length < 1 ||
      policy.locationIds.length > 200 ||
      new Set(policy.locationIds).size !== policy.locationIds.length
    ) {
      throw apiAuthError(
        "invalid_api_key_policy",
        "The API key location policy is invalid.",
      );
    }
    const locations = await Promise.all(
      policy.locationIds.map((locationId) => ctx.db.get("locations", locationId)),
    );
    if (
      locations.some(
        (location) => !location || location.organizationId !== organizationId,
      )
    ) {
      throw apiAuthError(
        "invalid_api_key_policy",
        "The API key location policy is invalid.",
      );
    }
    return { all: false, ids: new Set(policy.locationIds) };
  }
  const operator = await ctx.db.get("operators", policy.operatorId);
  if (!operator || operator.organizationId !== organizationId) {
    throw apiAuthError(
      "invalid_api_key_policy",
      "The API key operator policy is invalid.",
    );
  }
  const locations = await ctx.db
    .query("locations")
    .withIndex("by_organizationId_and_operatorId", (q) =>
      q.eq("organizationId", organizationId).eq("operatorId", operator._id),
    )
    .take(201);
  if (locations.length > 200) {
    throw apiAuthError(
      "invalid_api_key_policy",
      "The API key operator policy is too broad.",
    );
  }
  return {
    all: false,
    ids: new Set(locations.map((location) => location._id)),
  };
}

export type OrganizationAuth = {
  organizationId: string;
  role: OrganizationRole;
  granularity: DataGranularity;
  permissions: ReadonlySet<string>;
  locationScope: { all: boolean; ids: ReadonlySet<Id<"locations">> };
  disabledFeatures: ReadonlySet<FeatureId>;
  principalKind: "user" | "apiKey" | "support";
  supportGrantId: Id<"supportGrants"> | null;
  /** View-only support access; mutations and actions are rejected. */
  readOnly: boolean;
  apiKeyId: string | null;
  userId: string | null;
  sessionId: string | null;
  isKioskAccount: boolean;
  kioskModeEnabled: boolean;
  kioskLocationId: Id<"locations"> | null;
  userIdentifier: string;
  userName: string;
  requestId: string | null;
};

// Support staff count as human principals. Own-profile, leave-organization, and kiosk
// actions do not go through here and stay unavailable to them.
export function requireHumanPrincipal(auth: OrganizationAuth) {
  if (
    auth.principalKind === "apiKey" ||
    !auth.userId ||
    !auth.sessionId
  ) {
    throw new ConvexError("Handlingen kræver en bruger");
  }
  return {
    ...auth,
    principalKind: auth.principalKind,
    apiKeyId: null,
    userId: auth.userId,
    sessionId: auth.sessionId,
  };
}

export async function requireOrganization(
  ctx: AuthContext,
): Promise<OrganizationAuth> {
  if (!("db" in ctx)) {
    const context = await ctx.runQuery(internal.access.getRoleContext, {});
    if (context.readOnly) {
      throw new ConvexError("Supportadgangen er kun til visning");
    }
    return {
      ...context,
      permissions: new Set(context.permissions),
      locationScope: {
        all: context.locationScope.all,
        ids: new Set(context.locationScope.ids),
      },
      disabledFeatures: new Set(context.disabledFeatures),
    };
  }
  return await getOrganizationFromDatabase(ctx);
}

export async function requireKioskDestination(
  ctx: AuthContext,
  auth: OrganizationAuth,
  page: KioskDestinationId | readonly KioskDestinationId[],
) {
  if (!auth.isKioskAccount || !auth.kioskModeEnabled) return false;
  if (!("db" in ctx)) throw new ConvexError("Du har ikke adgang");
  const settings = await ctx.db
    .query("kioskSettings")
    .withIndex("by_organizationId", (q) =>
      q.eq("organizationId", auth.organizationId),
    )
    .unique();
  const pages = Array.isArray(page) ? page : [page];
  if (
    pages.some(
      (item) => item === "count.register" || item === "waste.register",
    ) &&
    auth.kioskLocationId &&
    (await otherFeaturesLocked(
      ctx,
      auth.organizationId,
      auth.kioskLocationId,
      Date.now(),
    ))
  ) {
    return true;
  }
  if (
    !settings ||
    !pages.some((item) => settings.enabledPages.includes(item))
  ) {
    throw new ConvexError("Siden er ikke aktiveret i kiosktilstand");
  }
  // Reads stay open so pages can render while the kiosk redirects to start of day.
  // Pages linked from a start-of-day task stay writable so the task can be done.
  if ("scheduler" in ctx && auth.kioskLocationId) {
    const allowed = await startOfDayAllowedPages(
      ctx,
      auth.organizationId,
      auth.kioskLocationId,
    );
    if (allowed && !pages.some((item) => allowed.includes(item))) {
      throw new ConvexError("Udfør åbningsopgaverne, før du fortsætter");
    }
  }
  return true;
}

export function requireLocationAccess(
  auth: OrganizationAuth,
  locationId: Id<"locations">,
) {
  if (auth.isKioskAccount && auth.kioskLocationId !== locationId) {
    throw new ConvexError("Kioskkontoen har ikke adgang til denne lokation");
  }
  if (!auth.locationScope.all && !auth.locationScope.ids.has(locationId)) {
    if (auth.principalKind === "apiKey") {
      throw apiAuthError(
        "location_forbidden",
        "The API key does not have access to this location.",
      );
    }
    throw new ConvexError("Du har ikke adgang til denne lokation");
  }
}

export function requireAllLocationAccess(auth: OrganizationAuth) {
  if (!auth.locationScope.all) {
    if (auth.principalKind === "apiKey") {
      throw apiAuthError(
        "location_forbidden",
        "The API key does not have access to all locations.",
      );
    }
    throw new ConvexError("Du har ikke adgang til hele organisationen");
  }
}

export function resolveLocationFilter(
  auth: OrganizationAuth,
  locationId?: Id<"locations">,
):
  { locationId: Id<"locations"> } | { locationIds: Id<"locations">[] } | "all" {
  if (locationId) {
    requireLocationAccess(auth, locationId);
    return { locationId };
  }
  if (auth.kioskLocationId) return { locationId: auth.kioskLocationId };
  if (auth.locationScope.all) return "all";
  return { locationIds: [...auth.locationScope.ids] };
}

export function isSingleLocationFilter(
  filter: ReturnType<typeof resolveLocationFilter>,
): filter is { locationId: Id<"locations"> } {
  return typeof filter === "object" && "locationId" in filter;
}

export function isMultiLocationFilter(
  filter: ReturnType<typeof resolveLocationFilter>,
): filter is { locationIds: Id<"locations">[] } {
  return typeof filter === "object" && "locationIds" in filter;
}

export function requireFeatureEnabled(
  auth: OrganizationAuth,
  feature: FeatureId,
) {
  if (!auth.disabledFeatures.has(feature)) return;
  if (auth.principalKind === "apiKey") {
    throw apiAuthError("feature_disabled", "The feature is disabled.");
  }
  throw new ConvexError("Funktionen er slået fra");
}

export async function requirePermission(
  ctx: AuthContext,
  permission: PermissionId,
  page?: KioskDestinationId | readonly KioskDestinationId[],
) {
  const auth = await requireOrganization(ctx);
  const feature = permissionFeatures[permission];
  if (feature) requireFeatureEnabled(auth, feature);
  if (page && (await requireKioskDestination(ctx, auth, page))) return auth;
  if (!hasPermission(auth.role, auth.permissions, permission)) {
    if (auth.principalKind === "apiKey") {
      throw apiAuthError(
        "forbidden",
        "The API key does not have permission for this operation.",
      );
    }
    throw new ConvexError("Du har ikke adgang");
  }
  return auth;
}

export async function requireCatalogManager(ctx: AuthContext) {
  const auth = await requirePermission(ctx, "catalog.manage");
  if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
  return auth;
}

export async function requireLocationManager(ctx: AuthContext) {
  const auth = await requirePermission(ctx, "locations.manage");
  if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
  return auth;
}

export async function requireTransferManager(
  ctx: AuthContext,
  page: KioskDestinationId | readonly KioskDestinationId[] = "transfers.new",
) {
  return await requirePermission(ctx, "transfers.manage", page);
}

export async function requireTransferViewer(
  ctx: AuthContext,
  page:
    KioskDestinationId | readonly KioskDestinationId[] = "transfers.history",
) {
  return await requirePermission(ctx, "transfers.view", page);
}

export async function requireGoodsReceiptRegistrar(ctx: AuthContext) {
  const auth = await requirePermission(ctx, "goodsReceipts.register");
  if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
  return auth;
}

export async function requireInvoiceManager(
  ctx: AuthContext,
  page: KioskDestinationId | readonly KioskDestinationId[] = "invoices.new",
) {
  return await requirePermission(ctx, "invoices.manage", page);
}

export async function requireInvoiceViewer(
  ctx: AuthContext,
  page: KioskDestinationId | readonly KioskDestinationId[] = "invoices.history",
) {
  return await requirePermission(ctx, "invoices.view", page);
}

export async function requireGoodsReceiptSettings(ctx: AuthContext) {
  const auth = await requirePermission(ctx, "goodsReceipts.settings");
  if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
  return auth;
}

export async function requireCounter(
  ctx: AuthContext,
  page: KioskDestinationId | readonly KioskDestinationId[] = "count.register",
) {
  return await requirePermission(ctx, "count.register", page);
}

export async function requireStockViewer(
  ctx: AuthContext,
  page: KioskDestinationId | readonly KioskDestinationId[] = "count.stock",
) {
  return await requirePermission(ctx, "count.viewStock", page);
}

export async function requireWasteRegistrar(
  ctx: AuthContext,
  page: KioskDestinationId | readonly KioskDestinationId[] = "waste.register",
) {
  return await requirePermission(ctx, "waste.register", page);
}

export async function requireEmployeeViewer(
  ctx: AuthContext,
  page:
    | "employees.schedule"
    | "employees.directory"
    | readonly ("employees.schedule" | "employees.directory")[],
) {
  return await requirePermission(
    ctx,
    page === "employees.schedule"
      ? "employees.schedule"
      : "employees.directory",
    page,
  );
}

export async function requireNormalOrganization(ctx: AuthContext) {
  const auth = await requireOrganization(ctx);
  if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
  return auth;
}

export async function requireStaffFoodRegistrar(ctx: AuthContext) {
  return await requirePermission(
    ctx,
    "staffFood.register",
    "staffFood.register",
  );
}

export async function requireWasteReporter(
  ctx: AuthContext,
  page: KioskDestinationId | readonly KioskDestinationId[] = "waste.report",
) {
  return await requirePermission(ctx, "waste.report", page);
}

export async function requireWasteExporter(
  ctx: AuthContext,
  page: KioskDestinationId | readonly KioskDestinationId[] = "waste.report",
) {
  return await requirePermission(ctx, "waste.export", page);
}

export async function requireOwnCheckPerformer(
  ctx: AuthContext,
  page: KioskDestinationId | readonly KioskDestinationId[] = "ownChecks.today",
) {
  return await requirePermission(ctx, "ownChecks.perform", page);
}

export async function requireOwnCheckViewer(
  ctx: AuthContext,
  page: KioskDestinationId | readonly KioskDestinationId[] = "ownChecks.overview",
) {
  return await requirePermission(ctx, "ownChecks.view", page);
}

export async function requireOwnCheckCorrector(ctx: AuthContext) {
  return await requirePermission(ctx, "ownChecks.correct", "ownChecks.overview");
}

export async function requireOwnCheckApprover(ctx: AuthContext) {
  return await requirePermission(
    ctx,
    "ownChecks.approve",
    "ownChecks.overview",
  );
}

export async function requireOwnCheckEditor(ctx: AuthContext) {
  return await requirePermission(ctx, "ownChecks.edit", "ownChecks.overview");
}

export async function requireOwnCheckAttachmentUploader(ctx: AuthContext) {
  const auth = await requireOrganization(ctx);
  requireFeatureEnabled(auth, "ownChecks");
  if (auth.kioskModeEnabled) return await requireOwnCheckPerformer(ctx);
  if (
    !hasPermission(auth.role, auth.permissions, "ownChecks.perform") &&
    !hasPermission(auth.role, auth.permissions, "ownChecks.edit")
  ) {
    throw new ConvexError("Du har ikke adgang");
  }
  return auth;
}

export async function requireOwnCheckExporter(
  ctx: AuthContext,
  page: KioskDestinationId | readonly KioskDestinationId[] = "ownChecks.documentation",
) {
  return await requirePermission(ctx, "ownChecks.export", page);
}

export async function requireOwnCheckManager(ctx: AuthContext) {
  const auth = await requirePermission(ctx, "ownChecks.manage");
  if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
  return auth;
}

export async function requireWasteSettings(ctx: AuthContext) {
  const auth = await requirePermission(ctx, "waste.settings");
  if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
  return auth;
}

export async function requireOrganizationAdmin(ctx: AuthContext) {
  const auth = await requirePermission(ctx, "organization.settings");
  if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
  return auth;
}

export async function requireMemberManager(ctx: AuthContext) {
  const auth = await requirePermission(ctx, "members.manage");
  if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
  return auth;
}

export async function requireIntegrationManager(ctx: AuthContext) {
  const auth = await requirePermission(ctx, "integrations.manage");
  if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
  return auth;
}

export async function requireDashboardViewer(ctx: AuthContext) {
  const auth = await requireOrganization(ctx);
  requireFeatureEnabled(auth, "dashboard");
  if (
    auth.kioskModeEnabled ||
    !hasPermission(auth.role, auth.permissions, "dashboard.view")
  ) {
    throw new ConvexError("Du har ikke adgang til dashboardet");
  }
  return auth;
}

export async function requireSalesDetailViewer(ctx: AuthContext) {
  const auth = await requirePermission(ctx, "sales.viewDetail");
  if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
  return auth;
}

export async function requireDashboardManager(ctx: AuthContext) {
  const auth = await requirePermission(ctx, "dashboard.manage");
  if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
  return auth;
}

export async function requireFinancialReportViewer(ctx: AuthContext) {
  const auth = await requireDashboardViewer(ctx);
  if (!hasPermission(auth.role, auth.permissions, "dashboard.viewFinancials")) {
    throw new ConvexError("Du har ikke adgang til månedsrapporten");
  }
  if (auth.granularity !== "detail") {
    throw new ConvexError("Månedsrapporten kræver adgang til detaljerede data");
  }
  return auth;
}

export async function requireBudgetManager(ctx: AuthContext) {
  const auth = requireHumanPrincipal(await requireFinancialReportViewer(ctx));
  if (!hasPermission(auth.role, auth.permissions, "dashboard.manageBudgets")) {
    throw new ConvexError("Du har ikke adgang til at redigere budgetter");
  }
  return auth;
}

export async function requireDashboardSharer(ctx: AuthContext) {
  const auth = await requireOrganization(ctx);
  requireFeatureEnabled(auth, "dashboard");
  if (
    auth.kioskModeEnabled ||
    !hasPermission(auth.role, auth.permissions, "dashboard.share")
  ) {
    throw new ConvexError("Kun brugere med rollen Administrator kan dele dashboardet");
  }
  return auth;
}

export async function requireStaffFoodManager(ctx: AuthContext) {
  const auth = await requirePermission(ctx, "staffFood.manage");
  if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
  return auth;
}
