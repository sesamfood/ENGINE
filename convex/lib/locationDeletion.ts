import { MAX_SPECIAL_OPENING_DATES } from "../../lib/count-window";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import { getDatabaseAdapter } from "../auth";
import { requireLocationAccess, type OrganizationAuth } from "./auth";
import { recordAudit } from "./audit";

const MAX_MEMBER_LOCATION_ROWS = 1_000;
const MAX_KIOSK_MEMBERS = 100;
const MAX_ACTIVE_OWN_CHECK_TEMPLATES = 200;
const MAX_ACTIVE_API_KEY_POLICIES = 50;
const MAX_WORKFEED_EMPLOYEE_MAPPINGS = 5_000;

type KioskMember = {
  kioskLocationId?: string | null;
};

export type LocationDeletionBlocker =
  | "kiosk"
  | "ownCheckHistory"
  | "ownCheckConfiguration"
  | "apiKeyPolicy"
  | "workfeed"
  | "openingHours"
  | "inUse";

export type LocationDeletionResult =
  | { kind: "deleted"; locationId: Id<"locations"> }
  | { kind: "notFound" }
  | { kind: "blocked"; reason: LocationDeletionBlocker };

type LocationDeletionCtx = MutationCtx;

async function hasPendingWorkfeedLocation(
  ctx: LocationDeletionCtx,
  organizationId: string,
  locationId: Id<"locations">,
) {
  const mappings = await ctx.db
    .query("workfeedEmployeeMappings")
    .withIndex("by_organizationId", (q) =>
      q.eq("organizationId", organizationId),
    )
    .take(MAX_WORKFEED_EMPLOYEE_MAPPINGS + 1);
  return (
    mappings.length > MAX_WORKFEED_EMPLOYEE_MAPPINGS ||
    mappings.some((mapping) =>
      mapping.pendingLocationIds?.includes(locationId),
    )
  );
}

async function hasActiveOwnCheckLocation(
  ctx: LocationDeletionCtx,
  organizationId: string,
  locationId: Id<"locations">,
) {
  const templates = await ctx.db
    .query("ownCheckTemplates")
    .withIndex("by_organizationId_and_status_and_normalizedName", (q) =>
      q.eq("organizationId", organizationId).eq("status", "active"),
    )
    .take(MAX_ACTIVE_OWN_CHECK_TEMPLATES + 1);
  if (templates.length > MAX_ACTIVE_OWN_CHECK_TEMPLATES) return true;

  const currentVersions = await Promise.all(
    templates.map((template) =>
      ctx.db
        .query("ownCheckTemplateVersions")
        .withIndex("by_organizationId_and_templateId_and_version", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("templateId", template._id)
            .eq("version", template.currentVersion),
        )
        .unique(),
    ),
  );
  return currentVersions.some(
    (version) =>
      version?.allLocations === false &&
      version.locationIds.includes(locationId),
  );
}

async function hasActiveApiKeyPolicyLocation(
  ctx: LocationDeletionCtx,
  organizationId: string,
  locationId: Id<"locations">,
) {
  const policies = await ctx.db
    .query("apiKeyPolicies")
    .withIndex("by_organizationId_and_status_and_expiresAt", (q) =>
      q
        .eq("organizationId", organizationId)
        .eq("status", "active")
        .gt("expiresAt", Date.now()),
    )
    .take(MAX_ACTIVE_API_KEY_POLICIES + 1);
  if (policies.length > MAX_ACTIVE_API_KEY_POLICIES) return true;
  return policies.some(
    (policy) =>
      policy.locationPolicy.kind === "selected" &&
      policy.locationPolicy.locationIds.includes(locationId),
  );
}

export async function deleteLocationWithAuth(
  ctx: LocationDeletionCtx,
  auth: OrganizationAuth,
  locationId: Id<"locations">,
): Promise<LocationDeletionResult> {
  const { organizationId } = auth;
  const location = await ctx.db.get("locations", locationId);
  if (!location || location.organizationId !== organizationId) {
    return { kind: "notFound" };
  }
  requireLocationAccess(auth, location._id);

  const [
    dependencies,
    ownCheckEntry,
    activeOwnCheckLocation,
    activeApiKeyPolicyLocation,
    workfeedSyncStatus,
    pendingWorkfeedLocation,
    kioskMembers,
  ] = await Promise.all([
    Promise.all([
      ctx.db
        .query("transfers")
        .withIndex("by_organizationId_and_fromLocationId", (q) =>
          q.eq("organizationId", organizationId).eq("fromLocationId", location._id),
        )
        .first(),
      ctx.db
        .query("transfers")
        .withIndex("by_organizationId_and_toLocationId", (q) =>
          q.eq("organizationId", organizationId).eq("toLocationId", location._id),
        )
        .first(),
      ctx.db
        .query("counts")
        .withIndex("by_organizationId_and_locationId_and_periodKey", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("locationStock")
        .withIndex("by_organizationId_and_locationId_and_productId", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("employeeLocationAssignments")
        .withIndex("by_organizationId_and_locationId_and_employeeId", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("scheduledShifts")
        .withIndex("by_organizationId_and_locationId_and_startsAt", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("staffFoodSessions")
        .withIndex("by_org_location_employee_date_source", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("staffFoodRegistrations")
        .withIndex("by_organizationId_and_locationId_and_registeredAt", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("wasteRegistrations")
        .withIndex("by_org_location_time", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("badDeliveries")
        .withIndex("by_organizationId_and_locationId_and_registeredAt", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("wasteProductStats")
        .withIndex("by_org_location_product", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("wasteAmountStats")
        .withIndex("by_org_location_product_unit_qty", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("wasteProductConfigs")
        .withIndex("by_org_location_product", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("salesOrders")
        .withIndex("by_organizationId_and_locationId_and_occurredAt", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("salesLines")
        .withIndex("by_organizationId_and_locationId_and_occurredAt", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("salesDaily")
        .withIndex("by_organizationId_and_locationId_and_dayStart", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("onlinePosLocationIntegrations")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("workfeedLocationMappings")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("onlinePosSyncStatus")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("onlinePosSalesResets")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("woltVenueConnections")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("woltPartnerVenueMappings")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("woltOAuthStates")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("woltOnboardingEvents")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("woltWebhookEvents")
        .withIndex("by_organizationId_and_locationId_and_receivedAt", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("woltOrders")
        .withIndex("by_organizationId_and_locationId_and_occurredAt", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("woltOrderItems")
        .withIndex("by_organizationId_and_locationId_and_observedAt", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("woltSalesDaily")
        .withIndex("by_organizationId_and_locationId_and_dayStart", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("woltProductMappings")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
      ctx.db
        .query("countSalesSourceSettings")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", location._id),
        )
        .first(),
    ]),
    ctx.db
      .query("ownCheckEntries")
      .withIndex("by_organizationId_and_locationId_and_dueDateKey", (q) =>
        q.eq("organizationId", organizationId).eq("locationId", location._id),
      )
      .first(),
    hasActiveOwnCheckLocation(ctx, organizationId, location._id),
    hasActiveApiKeyPolicyLocation(ctx, organizationId, location._id),
    ctx.db
      .query("workfeedSyncStatus")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .unique(),
    hasPendingWorkfeedLocation(ctx, organizationId, location._id),
    getDatabaseAdapter(ctx).findMany<KioskMember>({
      model: "member",
      where: [{ field: "organizationId", value: organizationId }],
      limit: MAX_KIOSK_MEMBERS + 1,
    }),
  ]);

  if (
    kioskMembers.length > MAX_KIOSK_MEMBERS ||
    kioskMembers.some(
      (member) => member.kioskLocationId === String(location._id),
    )
  ) {
    return { kind: "blocked", reason: "kiosk" };
  }
  if (ownCheckEntry) {
    return { kind: "blocked", reason: "ownCheckHistory" };
  }
  if (activeOwnCheckLocation) {
    return { kind: "blocked", reason: "ownCheckConfiguration" };
  }
  if (activeApiKeyPolicyLocation) {
    return { kind: "blocked", reason: "apiKeyPolicy" };
  }
  if (
    pendingWorkfeedLocation ||
    workfeedSyncStatus?.state === "queued" ||
    workfeedSyncStatus?.state === "running"
  ) {
    return { kind: "blocked", reason: "workfeed" };
  }
  if (dependencies.some(Boolean)) {
    return { kind: "blocked", reason: "inUse" };
  }

  const specialOpeningHours = await ctx.db
    .query("locationSpecialOpeningHours")
    .withIndex("by_organizationId_and_locationId_and_date", (q) =>
      q.eq("organizationId", organizationId).eq("locationId", location._id),
    )
    .take(MAX_SPECIAL_OPENING_DATES + 1);
  if (specialOpeningHours.length > MAX_SPECIAL_OPENING_DATES) {
    return { kind: "blocked", reason: "openingHours" };
  }

  const memberLocationRows = await ctx.db
    .query("memberLocationAccess")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .take(MAX_MEMBER_LOCATION_ROWS + 1);
  if (memberLocationRows.length > MAX_MEMBER_LOCATION_ROWS) {
    return { kind: "blocked", reason: "inUse" };
  }
  for (const row of memberLocationRows) {
    if (row.scope !== "selected" || !row.locationIds.includes(location._id)) {
      continue;
    }
    await ctx.db.patch("memberLocationAccess", row._id, {
      scope: "selected",
      locationIds: row.locationIds.filter((id) => id !== location._id),
      updatedAt: Date.now(),
    });
  }
  for (const hours of specialOpeningHours) {
    await ctx.db.delete("locationSpecialOpeningHours", hours._id);
  }
  await ctx.scheduler.runAfter(
    0,
    internal.dashboard.cleanupDeletedLocationDashboards,
    { organizationId, locationId: location._id },
  );
  await ctx.scheduler.runAfter(
    0,
    internal.dashboard.cleanupDeletedLocationShares,
    { organizationId, locationId: location._id },
  );
  await recordAudit(ctx, auth, {
    action: "locations.deleted",
    entityTable: "locations",
    entityId: location._id,
    summary: `Lokationen ${location.name} blev slettet`,
    locationId: location._id,
  });
  await ctx.db.delete("locations", location._id);
  return { kind: "deleted", locationId: location._id };
}

export function locationDeletionMessage(reason: LocationDeletionBlocker) {
  switch (reason) {
    case "kiosk":
      return "Lokationen er knyttet til en kioskkonto. Flyt eller slet kioskkontoen først";
    case "ownCheckHistory":
      return "Lokationen har egenkontrolhistorik og kan ikke slettes";
    case "ownCheckConfiguration":
      return "Lokationen er valgt i en aktiv egenkontrol og kan ikke slettes";
    case "apiKeyPolicy":
      return "Lokationen er valgt i en aktiv API-nøgle og kan ikke slettes";
    case "workfeed":
      return "Lokationen har ventende Workfeed-data eller konfiguration og kan ikke slettes";
    case "openingHours":
      return "Lokationen har for mange særlige åbningstider";
    case "inUse":
      return "Lokationen har driftsdata, historik eller integrationer og kan ikke slettes";
  }
}

export function restLocationDeletionMessage(reason: LocationDeletionBlocker) {
  switch (reason) {
    case "kiosk":
      return "The location is linked to a kiosk account. Move or delete the kiosk account first.";
    case "openingHours":
      return "The location has too many special opening hours.";
    default:
      return "The location has operational data, history, or integrations and cannot be deleted.";
  }
}
