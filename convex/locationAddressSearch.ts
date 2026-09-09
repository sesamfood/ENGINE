import { ConvexError, v, type Infer } from "convex/values";
import { z } from "zod";
import { internal } from "./_generated/api";
import { action, env, internalMutation, internalQuery } from "./_generated/server";
import { requireLocationAccess, requireLocationManager } from "./lib/auth";
import { forecastProfileValidator } from "./lib/forecastValidators";
import { rateLimiter } from "./lib/rateLimits";

const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
const MAX_CACHED_SEARCHES = 50;
const resultValidator = forecastProfileValidator.extend({ addressLabel: v.string() });
type AddressResult = Infer<typeof resultValidator>;

const addressSchema = z.object({
  lat: z.string().trim().min(1).transform(Number).pipe(z.number().min(-90).max(90)),
  lon: z.string().trim().min(1).transform(Number).pipe(z.number().min(-180).max(180)),
  display_name: z.string().trim().min(1).max(500),
  address: z.record(z.string(), z.string()),
});

export const cachedSearch = internalQuery({
  args: { locationId: v.id("locations"), query: v.string(), asOf: v.number() },
  returns: v.object({
    organizationId: v.string(),
    results: v.union(v.array(resultValidator), v.null()),
  }),
  handler: async (ctx, args) => {
    const auth = await requireLocationManager(ctx);
    requireLocationAccess(auth, args.locationId);
    const location = await ctx.db.get("locations", args.locationId);
    if (!location || location.organizationId !== auth.organizationId) {
      throw new ConvexError("Lokationen blev ikke fundet");
    }
    const cached = await ctx.db.query("addressSearchCache")
      .withIndex("by_organizationId_and_query", (q) =>
        q.eq("organizationId", auth.organizationId).eq("query", args.query))
      .unique();
    return {
      organizationId: auth.organizationId,
      results: cached && args.asOf - cached.updatedAt < CACHE_TTL
        ? cached.results.flatMap((result) => result.addressLabel ? [{ ...result, addressLabel: result.addressLabel }] : [])
        : null,
    };
  },
});

export const cacheSearch = internalMutation({
  args: { organizationId: v.string(), query: v.string(), results: v.array(resultValidator) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.results.length > 5) throw new Error("Too many address results");
    const cached = await ctx.db.query("addressSearchCache")
      .withIndex("by_organizationId_and_query", (q) =>
        q.eq("organizationId", args.organizationId).eq("query", args.query))
      .unique();
    const value = { ...args, updatedAt: Date.now() };
    if (cached) {
      await ctx.db.replace("addressSearchCache", cached._id, value);
    } else {
      const oldest = await ctx.db.query("addressSearchCache")
        .withIndex("by_organizationId_and_updatedAt", (q) => q.eq("organizationId", args.organizationId))
        .take(MAX_CACHED_SEARCHES);
      if (oldest.length >= MAX_CACHED_SEARCHES) {
        await ctx.db.delete("addressSearchCache", oldest[0]._id);
      }
      await ctx.db.insert("addressSearchCache", value);
    }
    return null;
  },
});

export const search = action({
  args: { locationId: v.id("locations"), query: v.string() },
  returns: v.array(resultValidator),
  handler: async (ctx, args): Promise<AddressResult[]> => {
    const query = args.query.trim().replace(/\s+/g, " ");
    if (query.length < 3 || query.length > 200) {
      throw new ConvexError("Skriv en adresse på mellem 3 og 200 tegn");
    }
    const url = new URL(env.NOMINATIM_SEARCH_URL || "https://nominatim.openstreetmap.org/search");
    if (url.protocol !== "https:" || url.username || url.password) {
      throw new ConvexError("Adressesøgning er ikke konfigureret korrekt");
    }
    const cacheKey = `${url.href}\n${query.toLocaleLowerCase("da-DK")}`;
    const cached = await ctx.runQuery(internal.locationAddressSearch.cachedSearch, {
      locationId: args.locationId, query: cacheKey, asOf: Date.now(),
    });
    if (cached.results !== null) return cached.results;
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", "5");
    url.searchParams.set("accept-language", "da,en");
    const limit = await rateLimiter.limit(ctx, "locationAddressSearch");
    if (!limit.ok) {
      throw new ConvexError("Adressesøgning er optaget. Vent et øjeblik, og søg igen.");
    }
    let results: AddressResult[];
    try {
      const origin = new URL(env.SITE_URL || env.CONVEX_SITE_URL).origin;
      const response = await fetch(url, {
        headers: { "User-Agent": `LocationAddressSearch/1.0 (+${origin})`, "Referer": origin },
        signal: AbortSignal.timeout(15_000),
        redirect: "error",
      });
      if (!response.ok) throw new Error("Address provider unavailable");
      const body: unknown = await response.json();
      const rows = z.array(z.unknown()).max(5).parse(body);
      results = rows.flatMap((row) => {
        const parsed = addressSchema.safeParse(row);
        if (!parsed.success) return [];
        const { address, lat, lon, display_name } = parsed.data;
        const countryCode = address.country_code?.toUpperCase();
        if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) return [];
        const subdivisionCode = Object.entries(address)
          .filter(([key, value]) => /^ISO3166-2-lvl\d+$/.test(key)
            && /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(value)
            && value.startsWith(`${countryCode}-`))
          .sort(([a], [b]) => Number(a.replace("ISO3166-2-lvl", "")) - Number(b.replace("ISO3166-2-lvl", "")))[0]?.[1];
        return [{ latitude: lat, longitude: lon, countryCode, addressLabel: display_name,
          ...(subdivisionCode ? { subdivisionCode } : {}) }];
      });
    } catch {
      throw new ConvexError("Adresserne kunne ikke hentes. Prøv igen om lidt.");
    }
    await ctx.runMutation(internal.locationAddressSearch.cacheSearch, {
      organizationId: cached.organizationId, query: cacheKey, results,
    });
    return results;
  },
});
