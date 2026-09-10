import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import { action, env, internalQuery, query, type QueryCtx } from "./_generated/server";
import { requireDashboardViewer, requireHumanPrincipal } from "./lib/auth";
import { dashboardMetricComputers, resolveMetricParams } from "./lib/dashboardMetrics";
import { liveMetricResultValidator, metricIdValidator, scopeValidator, visualizationValidator } from "./lib/dashboardValidators";
import { GooglePlacesError, readGoogleRating } from "./lib/googlePlaces";
import { rateLimiter } from "./lib/rateLimits";
import { metricRegistry } from "../lib/dashboard/registry";
import type { LiveMetricResult } from "../lib/dashboard/types";

const contextArgs = { metricId: metricIdValidator, scope: scopeValidator };
const contextValidator = v.object({
  organizationId: v.string(),
  userIdentifier: v.string(),
  locations: v.array(v.object({
    id: v.id("locations"),
    name: v.string(),
    placeId: v.union(v.string(), v.null()),
  })),
  truncated: v.boolean(),
});

async function resolveContext(
  ctx: QueryCtx,
  args: { metricId: Infer<typeof metricIdValidator>; scope: Infer<typeof scopeValidator> },
): Promise<Infer<typeof contextValidator>> {
  const auth = requireHumanPrincipal(await requireDashboardViewer(ctx));
  const definition = metricRegistry[args.metricId];
  if (!definition.live || auth.granularity !== "detail") {
    throw new ConvexError("Du har ikke adgang til denne måling");
  }
  if (args.scope.locationIds && args.scope.locationIds.length > 200) {
    throw new ConvexError("Vælg højst 200 lokationer");
  }
  const params = await resolveMetricParams(
    ctx, auth.organizationId, args.scope, { preset: "today" }, 0,
    auth.locationScope,
    { granularity: auth.granularity, anonymousSeed: auth.sessionId },
  );
  const limit = Math.max(...Object.values(definition.live.locationLimits));
  const selected = [...params.locations].sort((left, right) =>
    left.name.localeCompare(right.name, "da") || left.id.localeCompare(right.id),
  );
  const locations = await Promise.all(selected.slice(0, limit).map(async (location) => {
    const row = await ctx.db.get("locations", location.id);
    if (!row || row.organizationId !== auth.organizationId) {
      throw new ConvexError("Lokationen blev ikke fundet");
    }
    return {
      id: row._id,
      name: row.name,
      placeId: row.googlePlaceId ?? null,
    };
  }));
  return {
    organizationId: auth.organizationId,
    userIdentifier: auth.userIdentifier,
    locations,
    truncated: Boolean(params.scopeTruncated) || selected.length > limit,
  };
}

export const getContext = query({ args: contextArgs, returns: contextValidator, handler: resolveContext });
export const getAuthorizedContext = internalQuery({ args: contextArgs, returns: contextValidator, handler: resolveContext });

export const getMetric = action({
  args: {
    ...contextArgs,
    visualization: visualizationValidator,
    locationIds: v.array(v.id("locations")),
    expectedContext: v.string(),
  },
  returns: liveMetricResultValidator,
  handler: async (ctx, args): Promise<LiveMetricResult> => {
    const queryArgs = { metricId: args.metricId, scope: args.scope };
    const before: Infer<typeof contextValidator> = await ctx.runQuery(internal.dashboardLive.getAuthorizedContext, queryArgs);
    if (JSON.stringify(before) !== args.expectedContext) {
      throw new ConvexError("Lokationsvalget er ændret. Opdatér målingen.");
    }
    const limit = metricRegistry[args.metricId].live?.locationLimits[args.visualization];
    const visible = before.locations.slice(0, limit ?? 0);
    const requested = new Set(args.locationIds);
    if (!limit || requested.size !== args.locationIds.length || requested.size > limit ||
      args.locationIds.some((id) => !visible.some((location) => location.id === id))) {
      throw new ConvexError("Lokationsvalget eller visualiseringen er ugyldig");
    }
    const locations = visible.filter((location) => requested.has(location.id));
    const computer = dashboardMetricComputers[args.metricId];
    if (typeof computer === "function" || computer.provider !== "googleMaps") {
      throw new ConvexError("Målingen understøtter ikke aktuelle data");
    }
    const placeIds = [...new Set(locations.flatMap((location) => location.placeId ? [location.placeId] : []))];
    const configured = Boolean(env.GOOGLE_PLACES_API_KEY?.trim());
    let limited = false;
    if (placeIds.length && configured) {
      for (const [name, key] of [
        ["googlePlacesReadUser", before.userIdentifier],
        ["googlePlacesReadOrganization", before.organizationId],
        ["googlePlacesDaily", "deployment"],
      ] as const) {
        const allowance = await rateLimiter.limit(ctx, name, { key, count: placeIds.length });
        if (!allowance.ok) { limited = true; break; }
      }
    }
    type Lookup = { kind: "success"; value: Awaited<ReturnType<typeof readGoogleRating>> } |
      { kind: "error"; state: LiveMetricResult["locations"][number]["state"] };
    const lookups = new Map<string, Lookup>();
    for (let index = 0; index < placeIds.length; index += 4) {
      await Promise.all(placeIds.slice(index, index + 4).map(async (placeId) => {
        if (!configured) {
          lookups.set(placeId, { kind: "error", state: "notConfigured" });
          return;
        }
        if (limited) {
          lookups.set(placeId, { kind: "error", state: "rateLimited" });
          return;
        }
        try {
          lookups.set(placeId, { kind: "success", value: await readGoogleRating(placeId) });
        } catch (error) {
          const code = error instanceof GooglePlacesError ? error.code : "unavailable";
          const state = code === "notFound" || code === "moved" ? "reconnect" : code;
          lookups.set(placeId, { kind: "error", state });
        }
      }));
    }
    const verified = locations.flatMap((location) =>
      location.placeId && lookups.get(location.placeId)?.kind === "success"
        ? [{ locationId: location.id, placeId: location.placeId }]
        : [],
    );
    if (verified.length) {
      await ctx.runMutation(internal.googlePlaces.markVerified, { organizationId: before.organizationId, locations: verified });
    }
    const after: Infer<typeof contextValidator> = await ctx.runQuery(internal.dashboardLive.getAuthorizedContext, queryArgs);
    if (JSON.stringify(after) !== args.expectedContext) {
      throw new ConvexError("Adgangen eller lokationsvalget er ændret. Opdatér målingen.");
    }
    const result: LiveMetricResult = {
      result: { unit: metricRegistry[args.metricId].unit, scaleMax: 5, series: [], truncated: before.truncated || before.locations.length > limit },
      locations: [],
      retrievedAt: Date.now(),
      attributions: [],
    };
    const attributions = new Map<string, LiveMetricResult["attributions"][number]>();
    for (const location of locations) {
      const lookup = location.placeId ? lookups.get(location.placeId) : undefined;
      const state = !location.placeId ? "unlinked" : !lookup ? "unavailable" : lookup.kind === "error"
        ? lookup.state : lookup.value.rating === null ? "unrated" : "ready";
      result.locations.push({ key: location.id, label: location.name, state });
      if (lookup?.kind === "success") {
        for (const attribution of lookup.value.attributions) {
          attributions.set(JSON.stringify(attribution), attribution);
        }
        if (lookup.value.rating !== null) {
          result.result.series.push({ key: location.id, label: location.name, total: lookup.value.rating, points: [], previousTotal: null });
        }
      }
    }
    result.attributions = [...attributions.values()];
    return result;
  },
});
