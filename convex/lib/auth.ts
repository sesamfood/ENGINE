import { ConvexError } from "convex/values";
import {
  canCountStock,
  canManageCatalog,
  canManageOrganization,
  canManageStaffFood,
  canManageTransfers,
  canRegisterStaffFood,
  canRegisterWaste,
  canViewWasteReports,
} from "../../lib/auth-permissions";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { authComponent, createAuth, getDatabaseAdapter } from "../auth";
import type { KioskDestinationId } from "../../lib/kiosk";
import { otherFeaturesLocked } from "./countLock";

type AuthContext = QueryCtx | MutationCtx | ActionCtx;

export async function requireOrganization(ctx: AuthContext) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Du er ikke logget ind");

  const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
  const member = await auth.api.getActiveMember({ headers }).catch(() => null);
  if (!member) throw new ConvexError("Ingen aktiv organisation");
  const session = await getDatabaseAdapter(ctx).findOne<{
    id: string;
    isKioskAccount?: boolean | null;
    kioskModeEnabled?: boolean | null;
  }>({
    model: "session",
    where: [{ field: "id", value: identity.sessionId as string }],
  });
  const kioskLocationId = (member as typeof member & {
    kioskLocationId?: string | null;
  }).kioskLocationId;

  return {
    organizationId: member.organizationId,
    role: member.role,
    sessionId: identity.sessionId as string,
    isKioskAccount: session?.isKioskAccount === true,
    kioskModeEnabled: session?.kioskModeEnabled === true,
    kioskLocationId: kioskLocationId
      ? (kioskLocationId as Id<"locations">)
      : null,
    userIdentifier: identity.tokenIdentifier,
    userName: identity.name?.trim() || identity.email || "Ukendt bruger",
  };
}

type OrganizationAuth = Awaited<ReturnType<typeof requireOrganization>>;

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
      (page) => page === "count.register" || page === "waste.register",
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
  if (!settings || !pages.some((item) => settings.enabledPages.includes(item))) {
    throw new ConvexError("Siden er ikke aktiveret i kiosktilstand");
  }
  return true;
}

export function requireKioskLocation(
  auth: OrganizationAuth,
  locationId: Id<"locations">,
) {
  if (auth.isKioskAccount && auth.kioskLocationId !== locationId) {
    throw new ConvexError("Kioskkontoen har ikke adgang til denne location");
  }
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
}

export async function requireCatalogManager(ctx: AuthContext) {
  const auth = await requireOrganization(ctx);
  if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
  if (!canManageCatalog(auth.role)) {
    throw new ConvexError("Du har ikke adgang");
  }
  return auth;
}

export async function requireTransferManager(
  ctx: AuthContext,
  page: KioskDestinationId | readonly KioskDestinationId[] = "transfers.new",
) {
  const auth = await requireOrganization(ctx);
  if (await requireKioskDestination(ctx, auth, page)) return auth;
  if (!canManageTransfers(auth.role)) {
    throw new ConvexError("Du har ikke adgang");
  }
  return auth;
}

export async function requireCounter(
  ctx: AuthContext,
  page: KioskDestinationId | readonly KioskDestinationId[] = "count.register",
) {
  const auth = await requireOrganization(ctx);
  if (await requireKioskDestination(ctx, auth, page)) return auth;
  if (!canCountStock(auth.role)) {
    throw new ConvexError("Du har ikke adgang");
  }
  return auth;
}

export async function requireWasteRegistrar(
  ctx: AuthContext,
  page: KioskDestinationId | readonly KioskDestinationId[] = "waste.register",
) {
  const auth = await requireOrganization(ctx);
  if (await requireKioskDestination(ctx, auth, page)) return auth;
  if (!canRegisterWaste(auth.role)) {
    throw new ConvexError("Du har ikke adgang");
  }
  return auth;
}

export async function requireEmployeeViewer(
  ctx: AuthContext,
  page: "employees.schedule" | "employees.directory" | readonly (
    | "employees.schedule"
    | "employees.directory"
  )[],
) {
  const auth = await requireOrganization(ctx);
  await requireKioskDestination(ctx, auth, page);
  return auth;
}

export async function requireNormalOrganization(ctx: AuthContext) {
  const auth = await requireOrganization(ctx);
  if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
  return auth;
}

export async function requireStaffFoodRegistrar(ctx: AuthContext) {
  const auth = await requireOrganization(ctx);
  if (await requireKioskDestination(ctx, auth, "staffFood.register")) return auth;
  if (!canRegisterStaffFood(auth.role)) {
    throw new ConvexError("Du har ikke adgang");
  }
  return auth;
}

export async function requireWasteReporter(ctx: AuthContext) {
  const auth = await requireOrganization(ctx);
  if (await requireKioskDestination(ctx, auth, "waste.report")) return auth;
  if (!canViewWasteReports(auth.role)) {
    throw new ConvexError("Du har ikke adgang");
  }
  return auth;
}

export async function requireOrganizationAdmin(ctx: AuthContext) {
  const auth = await requireOrganization(ctx);
  if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
  if (!canManageOrganization(auth.role)) {
    throw new ConvexError("Kun administratorer kan ændre organisationen");
  }
  return auth;
}

export async function requireStaffFoodManager(ctx: AuthContext) {
  const auth = await requireOrganization(ctx);
  if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
  if (!canManageStaffFood(auth.role)) {
    throw new ConvexError("Kun administratorer kan ændre Staff food");
  }
  return auth;
}
