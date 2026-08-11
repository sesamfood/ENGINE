import { ConvexError } from "convex/values";
import {
  hasPermission,
  permissionsForRole,
  type DataGranularity,
  type OrganizationRole,
  type PermissionId,
} from "../../lib/auth-permissions";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { authComponent, createAuth, getDatabaseAdapter } from "../auth";
import type { KioskDestinationId } from "../../lib/kiosk";
import { otherFeaturesLocked } from "./countLock";

type AuthContext = QueryCtx | MutationCtx | ActionCtx;

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

async function getOrganizationFromDatabase(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Du er ikke logget ind");

  const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
  const member = (await auth.api
    .getActiveMember({ headers })
    .catch(() => null)) as AuthMember | null;
  if (!member) throw new ConvexError("Ingen aktiv organisation");

  const session = await getDatabaseAdapter(ctx).findOne<AuthSession>({
    model: "session",
    where: [{ field: "id", value: identity.sessionId as string }],
  });
  const role = member.role;
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
  const locationAccess = await ctx.db
    .query("memberLocationAccess")
    .withIndex("by_organizationId_and_userId", (q) =>
      q.eq("organizationId", member.organizationId).eq("userId", member.userId),
    )
    .unique();
  const kioskLocationId = member.kioskLocationId
    ? (member.kioskLocationId as Id<"locations">)
    : null;
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
    userId: member.userId,
    sessionId: identity.sessionId as string,
    isKioskAccount: session?.isKioskAccount === true,
    kioskModeEnabled: session?.kioskModeEnabled === true,
    kioskLocationId,
    userIdentifier: identity.tokenIdentifier,
    userName: identity.name?.trim() || identity.email || "Ukendt bruger",
  };
}

type OrganizationAuth = {
  organizationId: string;
  role: OrganizationRole;
  granularity: DataGranularity;
  permissions: ReadonlySet<string>;
  locationScope: { all: boolean; ids: ReadonlySet<Id<"locations">> };
  userId: string;
  sessionId: string;
  isKioskAccount: boolean;
  kioskModeEnabled: boolean;
  kioskLocationId: Id<"locations"> | null;
  userIdentifier: string;
  userName: string;
};

export async function requireOrganization(
  ctx: AuthContext,
): Promise<OrganizationAuth> {
  if (!("db" in ctx)) {
    const context = await ctx.runQuery(internal.access.getRoleContext, {});
    return {
      ...context,
      permissions: new Set(context.permissions),
      locationScope: {
        all: context.locationScope.all,
        ids: new Set(context.locationScope.ids),
      },
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
    throw new ConvexError("Du har ikke adgang til denne lokation");
  }
}

export function requireAllLocationAccess(auth: OrganizationAuth) {
  if (!auth.locationScope.all) {
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

export async function requirePermission(
  ctx: AuthContext,
  permission: PermissionId,
  page?: KioskDestinationId | readonly KioskDestinationId[],
) {
  const auth = await requireOrganization(ctx);
  if (page && (await requireKioskDestination(ctx, auth, page))) return auth;
  if (!hasPermission(auth.role, auth.permissions, permission)) {
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

export function requireKioskTransfer(
  auth: OrganizationAuth,
  fromLocationId: Id<"locations">,
  toLocationId: Id<"locations">,
) {
  if (
    auth.isKioskAccount &&
    auth.kioskLocationId !== fromLocationId &&
    auth.kioskLocationId !== toLocationId
  ) {
    throw new ConvexError("Kioskkontoen har ikke adgang til transferen");
  }
  if (
    !auth.locationScope.all &&
    !auth.locationScope.ids.has(fromLocationId) &&
    !auth.locationScope.ids.has(toLocationId)
  ) {
    throw new ConvexError("Du har ikke adgang til transferen");
  }
}

export function requireTransferMutationAccess(
  auth: OrganizationAuth,
  fromLocationId: Id<"locations">,
  toLocationId: Id<"locations">,
) {
  if (auth.isKioskAccount) {
    if (
      auth.kioskLocationId !== fromLocationId &&
      auth.kioskLocationId !== toLocationId
    ) {
      throw new ConvexError("Kioskkontoen har ikke adgang til transferen");
    }
    return;
  }
  if (
    !auth.locationScope.all &&
    (!auth.locationScope.ids.has(fromLocationId) ||
      !auth.locationScope.ids.has(toLocationId))
  ) {
    throw new ConvexError("Du har ikke adgang til transferen");
  }
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
  if (
    auth.kioskModeEnabled ||
    !hasPermission(auth.role, auth.permissions, "dashboard.view")
  ) {
    throw new ConvexError("Du har ikke adgang til dashboardet");
  }
  return auth;
}

export async function requireDashboardSharer(ctx: AuthContext) {
  const auth = await requireOrganization(ctx);
  if (
    auth.kioskModeEnabled ||
    !hasPermission(auth.role, auth.permissions, "dashboard.share")
  ) {
    throw new ConvexError("Kun administratorer kan dele dashboardet");
  }
  return auth;
}

export async function requireStaffFoodManager(ctx: AuthContext) {
  const auth = await requirePermission(ctx, "staffFood.manage");
  if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
  return auth;
}
