import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { hasPermission } from "../lib/auth-permissions";
import { layoutDashboardWidgets } from "../lib/dashboard/layout";
import { isTargetWidget, targetWidgetIdentity } from "../lib/dashboard/target-dashboard";
import { getIntegrationState } from "./integrations/state";
import { requireDashboardViewer, requireHumanPrincipal, requireLocationAccess } from "./lib/auth";
import { widgetValidator } from "./lib/dashboardValidators";
import { requireOrganizationLocation } from "./lib/locations";
import { availableWidgets, MAX_WIDGETS, validateWidgets } from "./dashboard";

type ViewerAuth = Awaited<ReturnType<typeof requireDashboardViewer>>;

function canEditTargetDashboards(auth: ViewerAuth) {
  return auth.principalKind !== "apiKey" && !auth.kioskModeEnabled
    && (hasPermission(auth.role, auth.permissions, "dashboard.manage")
      || hasPermission(auth.role, auth.permissions, "dashboard.manageTargets"));
}

function canAccessLocation(auth: ViewerAuth, locationId: Id<"locations">) {
  if (auth.isKioskAccount) return auth.kioskLocationId === locationId;
  return auth.locationScope.all || auth.locationScope.ids.has(locationId);
}

async function targetDashboard(ctx: QueryCtx, organizationId: string, locationId: Id<"locations">) {
  return await ctx.db.query("locationTargetDashboards")
    .withIndex("by_organizationId_and_locationId", (q) =>
      q.eq("organizationId", organizationId).eq("locationId", locationId))
    .unique();
}

/** Locations whose target dashboard the viewer can open. */
export const list = query({
  args: {},
  returns: v.object({
    canEdit: v.boolean(),
    locations: v.array(v.object({ id: v.id("locations"), name: v.string() })),
  }),
  handler: async (ctx) => {
    const auth = await requireDashboardViewer(ctx);
    const integrations = await getIntegrationState(ctx, auth.organizationId);
    const rows = await ctx.db.query("locationTargetDashboards")
      .withIndex("by_organizationId_and_locationId", (q) => q.eq("organizationId", auth.organizationId))
      .take(200);
    const locations = await Promise.all(rows
      .filter((row) => canAccessLocation(auth, row.locationId))
      .map(async (row) => {
        const [location, { widgets }] = await Promise.all([
          ctx.db.get("locations", row.locationId),
          availableWidgets(ctx, auth, row.widgets, integrations),
        ]);
        return location && widgets.length ? [{ id: location._id, name: location.name }] : [];
      }));
    return {
      canEdit: canEditTargetDashboards(auth),
      locations: locations.flat().sort((left, right) => left.name.localeCompare(right.name, "da")),
    };
  },
});

export const get = query({
  args: { locationId: v.id("locations") },
  returns: v.union(v.null(), v.object({ widgets: v.array(widgetValidator), updatedAt: v.number() })),
  handler: async (ctx, args) => {
    const auth = await requireDashboardViewer(ctx);
    requireLocationAccess(auth, args.locationId);
    await requireOrganizationLocation(ctx, auth.organizationId, args.locationId);
    const row = await targetDashboard(ctx, auth.organizationId, args.locationId);
    if (!row) return null;
    const integrations = await getIntegrationState(ctx, auth.organizationId);
    const { widgets } = await availableWidgets(ctx, auth, row.widgets, integrations);
    return { widgets, updatedAt: row.updatedAt };
  },
});

export const saveLayout = mutation({
  args: {
    locationId: v.id("locations"),
    widgets: v.array(widgetValidator),
    expectedUpdatedAt: v.number(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const auth = await requireDashboardViewer(ctx);
    if (!canEditTargetDashboards(auth)) throw new ConvexError("Du har ikke adgang til at redigere måldashboardet");
    const human = requireHumanPrincipal(auth);
    requireLocationAccess(auth, args.locationId);
    await requireOrganizationLocation(ctx, auth.organizationId, args.locationId);
    const row = await targetDashboard(ctx, auth.organizationId, args.locationId);
    if (!row) throw new ConvexError("Måldashboardet blev ikke fundet");
    if (row.updatedAt !== args.expectedUpdatedAt) {
      throw new ConvexError("Dashboardet blev ændret i en anden fane. Dine seneste ændringer blev ikke gemt");
    }
    const integrations = await getIntegrationState(ctx, auth.organizationId);
    await validateWidgets(ctx, auth.organizationId, args.widgets, auth, integrations);

    // Widgets the viewer cannot see are kept as they are.
    const visible = (await availableWidgets(ctx, auth, row.widgets, integrations)).widgets;
    const visibleKeys = new Set(visible.map((widget) => widget.key));
    const preserved = row.widgets.filter((widget) => !visibleKeys.has(widget.key));
    const submitted = new Map(args.widgets.map((widget) => [widget.key, widget]));
    if (preserved.some((widget) => submitted.has(widget.key))) {
      throw new ConvexError("Widgetnøglen bruges allerede. Genindlæs dashboardet, og prøv igen");
    }
    const targetWidgetsChanged = visible.filter(isTargetWidget).some((widget) => {
      const next = submitted.get(widget.key);
      return !next || targetWidgetIdentity(next) !== targetWidgetIdentity(widget);
    }) || args.widgets.some((widget) => isTargetWidget(widget) && !visibleKeys.has(widget.key));
    if (targetWidgetsChanged) {
      throw new ConvexError("Widgets for lokationsmål kan kun flyttes, ændre størrelse og skifte diagramtype");
    }
    if (args.widgets.length + preserved.length > MAX_WIDGETS) {
      throw new ConvexError(`Dashboardet kan højst have ${MAX_WIDGETS} widgets`);
    }
    const widgets = preserved.length ? layoutDashboardWidgets([...args.widgets, ...preserved]) : args.widgets;
    const updatedAt = Math.max(Date.now(), row.updatedAt + 1);
    await ctx.db.patch("locationTargetDashboards", row._id, { widgets, updatedAt, updatedBy: human.userId });
    return updatedAt;
  },
});
