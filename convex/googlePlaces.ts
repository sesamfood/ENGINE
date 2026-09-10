import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import { action, env, internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { requireHumanPrincipal, requireLocationAccess, requireLocationManager, requireDashboardViewer } from "./lib/auth";
import { setForecastProfile } from "./lib/forecastSettings";
import { updateLocationWithAuth, throwHumanLocationMutationError } from "./lib/locationMutations";
import { GooglePlacesError, googlePlaceIdSchema, googleSessionTokenSchema, readGoogleDetails, readGooglePoint, searchGooglePlaces, verifyGooglePlace } from "./lib/googlePlaces";
import { readOpenStreetMapRegion } from "./lib/openStreetMap";
import { forecastRegionValidator } from "./lib/forecastValidators";
import { rateLimiter } from "./lib/rateLimits";
import { locationUpdateValidator } from "./locations";

const contextValidator = v.object({
  organizationId: v.string(),
  userIdentifier: v.string(),
  googlePlaceId: v.union(v.string(), v.null()),
  googlePlaceVerifiedAt: v.union(v.number(), v.null()),
  forecastEnabled: v.boolean(),
  region: v.union(forecastRegionValidator, v.null()),
});

export const locationContext = internalQuery({
  args: { locationId: v.id("locations") },
  returns: contextValidator,
  handler: async (ctx, { locationId }) => {
    const auth = requireHumanPrincipal(await requireLocationManager(ctx));
    requireLocationAccess(auth, locationId);
    const location = await ctx.db.get("locations", locationId);
    if (!location || location.organizationId !== auth.organizationId) throw new ConvexError("Lokationen blev ikke fundet");
    const forecast = await ctx.db.query("locationForecasts")
      .withIndex("by_organizationId_and_locationId", (q) => q.eq("organizationId", auth.organizationId).eq("locationId", locationId))
      .unique();
    return {
      organizationId: auth.organizationId,
      userIdentifier: auth.userIdentifier,
      googlePlaceId: location.googlePlaceId ?? null,
      googlePlaceVerifiedAt: location.googlePlaceVerifiedAt ?? null,
      forecastEnabled: forecast !== null,
      region: forecast?.region ?? null,
    };
  },
});

async function limitRequests(ctx: ActionCtx, context: Infer<typeof contextValidator>, search: boolean) {
  if (!env.GOOGLE_PLACES_API_KEY?.trim()) throw new ConvexError(new GooglePlacesError("notConfigured").message);
  const user = await rateLimiter.limit(ctx, search ? "googlePlacesSearchUser" : "googlePlacesReadUser", { key: context.userIdentifier });
  if (!user.ok) throw new ConvexError(new GooglePlacesError("rateLimited").message);
  const organization = await rateLimiter.limit(ctx, search ? "googlePlacesSearchOrganization" : "googlePlacesReadOrganization", { key: context.organizationId });
  if (!organization.ok) throw new ConvexError(new GooglePlacesError("rateLimited").message);
  const daily = await rateLimiter.limit(ctx, "googlePlacesDaily", { key: "deployment" });
  if (!daily.ok) throw new ConvexError(new GooglePlacesError("rateLimited").message);
}

function throwGoogleError(error: unknown): never {
  throw new ConvexError(error instanceof GooglePlacesError ? error.message : "Oplysningerne kunne ikke hentes fra Google. Prøv igen senere.");
}

export const search = action({
  args: { locationId: v.id("locations"), query: v.string(), sessionToken: v.string(), countryCode: v.optional(v.string()) },
  returns: v.array(v.object({ placeId: v.string(), mainText: v.string(), secondaryText: v.string() })),
  handler: async (ctx, args) => {
    const query = args.query.trim().replace(/\s+/g, " ");
    if (query.length < 3 || query.length > 200) throw new ConvexError("Skriv mellem 3 og 200 tegn");
    if (!googleSessionTokenSchema.safeParse(args.sessionToken).success) throw new ConvexError("Start søgningen igen");
    const countryCode = args.countryCode?.trim().toUpperCase();
    if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) throw new ConvexError("Angiv en landekode på to bogstaver");
    const context = await ctx.runQuery(internal.googlePlaces.locationContext, { locationId: args.locationId });
    await limitRequests(ctx, context, true);
    try {
      const results = await searchGooglePlaces({ query, sessionToken: args.sessionToken, countryCode });
      const current = await ctx.runQuery(internal.googlePlaces.locationContext, { locationId: args.locationId });
      if (current.organizationId !== context.organizationId) throw new ConvexError("Organisationen er ændret. Start søgningen igen.");
      return results;
    } catch (error) { throwGoogleError(error); }
  },
});

const detailsValidator = v.object({
  placeId: v.string(), displayName: v.string(), address: v.string(),
  businessStatus: v.optional(v.string()), types: v.array(v.string()),
  attributions: v.array(v.object({ provider: v.string(), providerUri: v.optional(v.string()) })),
});

export const details = action({
  args: { locationId: v.id("locations"), placeId: v.string(), sessionToken: v.optional(v.string()) },
  returns: detailsValidator,
  handler: async (ctx, args) => {
    if (!googlePlaceIdSchema.safeParse(args.placeId).success) throw new ConvexError("Vælg en gyldig Google-lokation");
    if (args.sessionToken && !googleSessionTokenSchema.safeParse(args.sessionToken).success) throw new ConvexError("Start søgningen igen");
    const context = await ctx.runQuery(internal.googlePlaces.locationContext, { locationId: args.locationId });
    await limitRequests(ctx, context, false);
    try {
      const result = await readGoogleDetails(args.placeId, args.sessionToken);
      const current = await ctx.runQuery(internal.googlePlaces.locationContext, { locationId: args.locationId });
      if (current.organizationId !== context.organizationId) throw new ConvexError("Organisationen er ændret. Start søgningen igen.");
      return result;
    } catch (error) { throwGoogleError(error); }
  },
});

const saveValidator = locationUpdateValidator.extend({
  googlePlaceId: v.union(v.string(), v.null()),
  expectedGooglePlaceId: v.union(v.string(), v.null()),
});

const regionLookupWarning = "Lokationen er gemt, men regionskoden kunne ikke opdateres. Gem lokationsoplysningerne igen for at prøve igen.";

export const markVerified = internalMutation({
  args: { organizationId: v.string(), locations: v.array(v.object({ locationId: v.id("locations"), placeId: v.string() })) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = requireHumanPrincipal(await requireDashboardViewer(ctx));
    if (auth.organizationId !== args.organizationId || args.locations.length > 20) throw new ConvexError("Du har ikke adgang");
    for (const item of args.locations) {
      requireLocationAccess(auth, item.locationId);
      const location = await ctx.db.get("locations", item.locationId);
      if (!location || location.organizationId !== auth.organizationId || location.googlePlaceId !== item.placeId) continue;
      if (!location.googlePlaceVerifiedAt || Date.now() - location.googlePlaceVerifiedAt > 365 * 24 * 3_600_000) {
        await ctx.db.patch("locations", location._id, { googlePlaceVerifiedAt: Date.now() });
      }
    }
    return null;
  },
});

export const commitLocation = internalMutation({
  args: saveValidator.extend({
    organizationId: v.string(),
    verifiedAt: v.union(v.number(), v.null()),
    region: v.optional(v.union(forecastRegionValidator, v.null())),
    expectedRegionUpdatedAt: v.union(v.number(), v.null()),
  }).fields,
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = requireHumanPrincipal(await requireLocationManager(ctx));
    requireLocationAccess(auth, args.locationId);
    const location = await ctx.db.get("locations", args.locationId);
    if (!location || location.organizationId !== auth.organizationId || auth.organizationId !== args.organizationId) throw new ConvexError("Lokationen blev ikke fundet");
    if ((location.googlePlaceId ?? null) !== args.expectedGooglePlaceId) throw new ConvexError("Google-lokationen er ændret af en anden bruger. Åbn oplysningerne igen.");
    try {
      await updateLocationWithAuth(ctx, auth, args);
      const changed = (location.googlePlaceId ?? null) !== args.googlePlaceId;
      await ctx.db.patch("locations", location._id, {
        googlePlaceId: args.googlePlaceId ?? undefined,
        googlePlaceVerifiedAt: args.googlePlaceId ? args.verifiedAt ?? location.googlePlaceVerifiedAt : undefined,
      });
      const current = await ctx.db.query("locationForecasts")
        .withIndex("by_organizationId_and_locationId", (q) => q.eq("organizationId", auth.organizationId).eq("locationId", location._id))
        .unique();
      const profile = args.forecastProfile === undefined ? current?.profile ?? null : args.forecastProfile;
      const region = changed || (current?.region?.updatedAt ?? null) === args.expectedRegionUpdatedAt ? args.region : undefined;
      if (args.forecastProfile !== undefined || (changed && profile) || args.region !== undefined) {
        await setForecastProfile(ctx, auth.organizationId, location._id, args.googlePlaceId ? profile : null, changed && profile !== null, region);
      }
    } catch (error) { throwHumanLocationMutationError(error); }
    return null;
  },
});

export const saveLocation = action({
  args: saveValidator.fields,
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(internal.googlePlaces.locationContext, { locationId: args.locationId });
    if (context.googlePlaceId !== args.expectedGooglePlaceId) throw new ConvexError("Google-lokationen er ændret af en anden bruger. Åbn oplysningerne igen.");
    if (args.googlePlaceId !== null && !googlePlaceIdSchema.safeParse(args.googlePlaceId).success) throw new ConvexError("Vælg en gyldig Google-lokation");
    let verifiedAt = context.googlePlaceVerifiedAt;
    let region: Infer<typeof forecastRegionValidator> | null | undefined;
    let warning: string | null = null;
    const forecastEnabled = args.forecastProfile === undefined ? context.forecastEnabled : args.forecastProfile !== null;
    const refreshRegion = args.googlePlaceId && forecastEnabled &&
      (context.region?.googlePlaceId !== args.googlePlaceId || Date.now() - context.region.updatedAt > 30 * 24 * 3_600_000);
    if (args.googlePlaceId && refreshRegion) {
      let point: Awaited<ReturnType<typeof readGooglePoint>> | undefined;
      try {
        await limitRequests(ctx, context, false);
        point = await readGooglePoint(args.googlePlaceId);
        verifiedAt = Date.now();
      } catch (error) {
        if (args.googlePlaceId !== context.googlePlaceId) throwGoogleError(error);
        warning = regionLookupWarning;
      }
      if (point) {
        const previous = context.region;
        region = previous?.googlePlaceId === args.googlePlaceId && previous.latitude === point.latitude &&
          previous.longitude === point.longitude && previous.countryCode === point.countryCode ? previous : null;
        try {
          const limit = await rateLimiter.limit(ctx, "openStreetMapRegion", { key: "deployment" });
          if (!limit.ok) throw new Error("Region lookup busy");
          const subdivisionCode = await readOpenStreetMapRegion(point, {
            baseUrl: env.NOMINATIM_URL?.trim() || "https://nominatim.openstreetmap.org",
            userAgent: `DashboardForecasts/1.0 (+${env.CONVEX_SITE_URL})`,
          });
          region = { ...point, googlePlaceId: args.googlePlaceId, subdivisionCode, updatedAt: Date.now() };
        } catch {
          warning = regionLookupWarning;
        }
      }
    } else if (args.googlePlaceId && args.googlePlaceId !== context.googlePlaceId) {
      await limitRequests(ctx, context, false);
      try { await verifyGooglePlace(args.googlePlaceId); } catch (error) { throwGoogleError(error); }
      verifiedAt = Date.now();
    }
    await ctx.runMutation(internal.googlePlaces.commitLocation, {
      ...args,
      organizationId: context.organizationId,
      verifiedAt,
      expectedRegionUpdatedAt: context.region?.updatedAt ?? null,
      ...(region !== undefined ? { region } : {}),
    });
    return warning;
  },
});
