import {
  type FilterBuilder,
  type PaginationResult,
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { DataModel, Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import {
  requireAllLocationAccess,
  requireHumanPrincipal,
  requireIntegrationManager,
  requireLocationAccess,
  requireSalesDetailViewer,
  resolveLocationFilter,
} from "./lib/auth";
import { recordAudit } from "./lib/audit";
import {
  hashWoltState,
  randomWoltSecret,
  woltClientCredentials,
  woltEndpoints,
  woltOAuthRedirectUri,
} from "./lib/woltCrypto";
import { normalizeWoltText, publicConnectionHealth } from "./lib/woltApi";
import {
  normalizeWoltMatchValue,
  resolveWoltMapping,
} from "./lib/woltMappings";
import {
  woltOrderStatusValidator,
  woltOrderTypeValidator,
  woltProductMatchTypeValidator,
} from "./lib/woltValidators";

const MAX_LOCATIONS = 200;
const MAX_EVENTS = 1_000;
const MAX_MAPPINGS = 2_000;
const MAX_OBSERVED_ITEMS = 500;
const MAX_ITEMS = 500;
const MAX_ORDERS_PAGE = 100;
const MAX_ORDER_RANGE_MS = 90 * 24 * 60 * 60 * 1_000;
const ORDER_HEALTH_STALE_MS = 26 * 60 * 60 * 1_000;

const orderSummaryValidator = v.object({
  id: v.id("woltOrders"),
  displayNumber: v.string(),
  occurredAt: v.number(),
  locationId: v.id("locations"),
  locationName: v.string(),
  status: woltOrderStatusValidator,
  providerStatus: v.string(),
  orderType: woltOrderTypeValidator,
  netRevenue: v.number(),
  currency: v.string(),
  itemCount: v.number(),
});

function requireLocation(
  location: Doc<"locations"> | null,
  organizationId: string,
) {
  if (!location || location.organizationId !== organizationId) {
    throw new ConvexError("Lokationen blev ikke fundet");
  }
  return location;
}

function boundedText(value: string, label: string, max = 500) {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new ConvexError(`${label} er ugyldig`);
  }
  return normalized;
}

function requireOrderRange(from: number, to: number) {
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from >= to ||
    to - from > MAX_ORDER_RANGE_MS
  ) {
    throw new ConvexError("Vælg en periode på højst 90 dage");
  }
}

function requirePageSize(numItems: number) {
  if (!Number.isSafeInteger(numItems) || numItems < 1 || numItems > MAX_ORDERS_PAGE) {
    throw new ConvexError("Siden er for stor");
  }
}

function visibleLocation(auth: Awaited<ReturnType<typeof requireSalesDetailViewer>>, locationId: Id<"locations">) {
  return auth.locationScope.all || auth.locationScope.ids.has(locationId);
}

function visibleOrderFilter(
  auth: Awaited<ReturnType<typeof requireSalesDetailViewer>>,
  from: number,
  to: number,
  orderType: Doc<"woltOrders">["orderType"] | null,
) {
  return (q: FilterBuilder<DataModel["woltOrders"]>) => {
    const typeFilter = orderType
      ? q.eq(q.field("orderType"), orderType)
      : q.eq(q.field("organizationId"), auth.organizationId);
    const locationIds = [...auth.locationScope.ids];
    const locationFilter = auth.locationScope.all
      ? q.eq(q.field("organizationId"), auth.organizationId)
      : locationIds.length
        ? q.or(
            ...locationIds.map((locationId) =>
              q.eq(q.field("locationId"), locationId),
            ),
          )
        : q.eq(q.field("organizationId"), "__no_visible_organization__");
    return q.and(
      q.gte(q.field("occurredAt"), from),
      q.lt(q.field("occurredAt"), to),
      typeFilter,
      locationFilter,
    );
  };
}

export const getIntegrationOverview = query({
  args: {},
  returns: v.object({
    canUseWio: v.boolean(),
    limitReached: v.boolean(),
    locations: v.array(
      v.object({
        id: v.id("locations"),
        name: v.string(),
        partnerVenueId: v.union(v.string(), v.null()),
        connection: v.union(
          v.object({
            venueId: v.string(),
            onboardingMode: v.union(v.literal("ssio"), v.literal("wio")),
            state: v.union(
              v.literal("ready"),
              v.literal("disabled"),
              v.literal("reauthorizationRequired"),
              v.literal("error"),
            ),
            activatedAt: v.number(),
            accessTokenExpiresAt: v.number(),
            lastWebhookAt: v.union(v.number(), v.null()),
            lastSuccessAt: v.union(v.number(), v.null()),
            lastError: v.union(v.string(), v.null()),
            backlogCount: v.number(),
            deadLetterCount: v.number(),
          }),
          v.null(),
        ),
      }),
    ),
  }),
  handler: async (ctx) => {
    const auth = await requireIntegrationManager(ctx);
    const { organizationId } = auth;
    const [locations, connections, partnerMappings, pending, processing, deadLetters] = await Promise.all([
      ctx.db
        .query("locations")
        .withIndex("by_organizationId_and_normalizedName", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_LOCATIONS + 1),
      ctx.db
        .query("woltVenueConnections")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
        .take(MAX_LOCATIONS + 1),
      ctx.db
        .query("woltPartnerVenueMappings")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
        .take(MAX_LOCATIONS + 1),
      ctx.db
        .query("woltWebhookEvents")
        .withIndex("by_organizationId_and_state", (q) =>
          q.eq("organizationId", organizationId).eq("state", "pending"),
        )
        .take(MAX_EVENTS + 1),
      ctx.db
        .query("woltWebhookEvents")
        .withIndex("by_organizationId_and_state", (q) =>
          q.eq("organizationId", organizationId).eq("state", "processing"),
        )
        .take(MAX_EVENTS + 1),
      ctx.db
        .query("woltWebhookEvents")
        .withIndex("by_organizationId_and_state", (q) =>
          q.eq("organizationId", organizationId).eq("state", "deadLetter"),
        )
        .take(MAX_EVENTS + 1),
    ]);
    const connectionByLocation = new Map(
      connections.slice(0, MAX_LOCATIONS).map((connection) => [connection.locationId, connection]),
    );
    const partnerByLocation = new Map(
      partnerMappings.slice(0, MAX_LOCATIONS).map((mapping) => [mapping.locationId, mapping]),
    );
    const counts = (events: typeof pending) => {
      const result = new Map<Id<"locations">, number>();
      for (const event of events.slice(0, MAX_EVENTS)) {
        result.set(event.locationId, (result.get(event.locationId) ?? 0) + 1);
      }
      return result;
    };
    const backlogByLocation = counts([...pending, ...processing]);
    const deadByLocation = counts(deadLetters);
    const visible = locations.filter(
      (location) => auth.locationScope.all || auth.locationScope.ids.has(location._id),
    );
    return {
      canUseWio: auth.locationScope.all,
      limitReached:
        locations.length > MAX_LOCATIONS ||
        connections.length > MAX_LOCATIONS ||
        partnerMappings.length > MAX_LOCATIONS ||
        pending.length > MAX_EVENTS ||
        processing.length > MAX_EVENTS ||
        deadLetters.length > MAX_EVENTS,
      locations: visible.slice(0, MAX_LOCATIONS).map((location) => {
        const connection = connectionByLocation.get(location._id);
        const health = connection ? publicConnectionHealth(connection) : null;
        return {
          id: location._id,
          name: location.name,
          partnerVenueId: partnerByLocation.get(location._id)?.partnerVenueId ?? null,
          connection: connection && health
            ? {
                venueId: connection.venueId,
                onboardingMode: connection.onboardingMode,
                ...health,
                backlogCount: backlogByLocation.get(location._id) ?? 0,
                deadLetterCount: deadByLocation.get(location._id) ?? 0,
              }
            : null,
        };
      }),
    };
  },
});

export const getLocationForOnboarding = internalQuery({
  args: { organizationId: v.string(), locationId: v.id("locations") },
  returns: v.union(v.object({ name: v.string() }), v.null()),
  handler: async (ctx, args) => {
    const location = await ctx.db.get("locations", args.locationId);
    return location?.organizationId === args.organizationId ? { name: location.name } : null;
  },
});

export const storeOAuthState = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    userId: v.string(),
    userName: v.string(),
    stateHash: v.string(),
    redirectUri: v.string(),
    returnPath: v.string(),
    now: v.number(),
  },
  returns: v.id("woltOAuthStates"),
  handler: async (ctx, args) => {
    requireLocation(await ctx.db.get("locations", args.locationId), args.organizationId);
    const stateId = await ctx.db.insert("woltOAuthStates", {
      stateHash: args.stateHash,
      organizationId: args.organizationId,
      locationId: args.locationId,
      userId: args.userId,
      redirectUri: args.redirectUri,
      returnPath: args.returnPath,
      expiresAt: args.now + 15 * 60 * 1_000,
      createdAt: args.now,
    });
    await recordAudit(
      ctx,
      {
        organizationId: args.organizationId,
        principalKind: "user",
        userId: args.userId,
        userName: args.userName,
      },
      {
        action: "wolt.onboarding.started",
        entityTable: "locations",
        entityId: args.locationId,
        locationId: args.locationId,
        summary: "Startede Wolt-godkendelse for lokationen",
      },
    );
    return stateId;
  },
});

export const beginSsio = action({
  args: { locationId: v.id("locations") },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args) => {
    const auth = requireHumanPrincipal(await requireIntegrationManager(ctx));
    requireLocationAccess(auth, args.locationId);
    const location = await ctx.runQuery(internal.wolt.getLocationForOnboarding, {
      organizationId: auth.organizationId,
      locationId: args.locationId,
    });
    if (!location) throw new ConvexError("Lokationen blev ikke fundet");
    const state = randomWoltSecret(32);
    const redirectUri = woltOAuthRedirectUri();
    await ctx.runMutation(internal.wolt.storeOAuthState, {
      organizationId: auth.organizationId,
      locationId: args.locationId,
      userId: auth.userId,
      userName: auth.userName,
      stateHash: await hashWoltState(state),
      redirectUri,
      returnPath: "/organization/integrations",
      now: Date.now(),
    });
    const url = new URL(woltEndpoints().ssio);
    url.searchParams.set("client_id", woltClientCredentials().clientId);
    url.searchParams.set("redirect_url", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("venue_name", location.name);
    return { url: url.toString() };
  },
});

export const setPartnerVenueMapping = mutation({
  args: { locationId: v.id("locations"), partnerVenueId: v.string() },
  returns: v.object({ adoptedOnboardingEvents: v.number() }),
  handler: async (ctx, args) => {
    const auth = requireHumanPrincipal(await requireIntegrationManager(ctx));
    requireAllLocationAccess(auth);
    requireLocation(await ctx.db.get("locations", args.locationId), auth.organizationId);
    const partnerVenueId = boundedText(args.partnerVenueId, "Partner-venue-id", 200);
    const conflicts = await ctx.db
      .query("woltPartnerVenueMappings")
      .withIndex("by_partnerVenueId", (q) => q.eq("partnerVenueId", partnerVenueId))
      .take(2);
    if (conflicts.some((mapping) => mapping.locationId !== args.locationId)) {
      throw new ConvexError("Partner-venue-id'et kan ikke bruges");
    }
    const existing = await ctx.db
      .query("woltPartnerVenueMappings")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", auth.organizationId).eq("locationId", args.locationId),
      )
      .unique();
    const now = Date.now();
    if (existing) await ctx.db.patch(existing._id, { partnerVenueId, updatedAt: now });
    else {
      await ctx.db.insert("woltPartnerVenueMappings", {
        organizationId: auth.organizationId,
        locationId: args.locationId,
        partnerVenueId,
        createdAt: now,
        updatedAt: now,
      });
    }
    const quarantined = await ctx.db
      .query("woltOnboardingQuarantine")
      .withIndex("by_partnerVenueId", (q) => q.eq("partnerVenueId", partnerVenueId))
      .take(100);
    let adoptedOnboardingEvents = 0;
    for (const item of quarantined) {
      if (item.expiresAt <= now) {
        await ctx.db.delete(item._id);
        continue;
      }
      const onboardingEventId = await ctx.db.insert("woltOnboardingEvents", {
        organizationId: auth.organizationId,
        locationId: args.locationId,
        partnerVenueId,
        mode: "wio",
        authorizationCodeHash: item.authorizationCodeHash,
        authorizationCodeCiphertext: item.authorizationCodeCiphertext,
        redirectUri: item.redirectUri,
        redirectUriAllowed: true,
        state: "pending",
        attemptCount: 0,
        nextAttemptAt: now,
        expiresAt: item.expiresAt,
        createdAt: item.createdAt,
        updatedAt: now,
      });
      await ctx.db.delete(item._id);
      await ctx.scheduler.runAfter(0, internal.woltSync.processOnboardingEvent, {
        onboardingEventId,
      });
      adoptedOnboardingEvents += 1;
    }
    await recordAudit(ctx, auth, {
      action: "wolt.partnerVenue.updated",
      entityTable: "locations",
      entityId: args.locationId,
      locationId: args.locationId,
      summary: "Opdaterede Wolt partner-venue-id",
    });
    return { adoptedOnboardingEvents };
  },
});

export const removePartnerVenueMapping = mutation({
  args: { locationId: v.id("locations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = requireHumanPrincipal(await requireIntegrationManager(ctx));
    requireAllLocationAccess(auth);
    requireLocation(await ctx.db.get("locations", args.locationId), auth.organizationId);
    const mapping = await ctx.db
      .query("woltPartnerVenueMappings")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", auth.organizationId).eq("locationId", args.locationId),
      )
      .unique();
    if (mapping) await ctx.db.delete(mapping._id);
    await recordAudit(ctx, auth, {
      action: "wolt.partnerVenue.removed",
      entityTable: "locations",
      entityId: args.locationId,
      locationId: args.locationId,
      summary: "Fjernede Wolt partner-venue-id",
    });
    return null;
  },
});

export const disconnectLocation = mutation({
  args: { locationId: v.id("locations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = requireHumanPrincipal(await requireIntegrationManager(ctx));
    requireLocationAccess(auth, args.locationId);
    requireLocation(await ctx.db.get("locations", args.locationId), auth.organizationId);
    const connection = await ctx.db
      .query("woltVenueConnections")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", auth.organizationId).eq("locationId", args.locationId),
      )
      .unique();
    if (connection) {
      await ctx.db.patch(connection._id, {
        state: "disabled",
        accessTokenCiphertext: "",
        refreshTokenCiphertext: "",
        accessTokenExpiresAt: 0,
        refreshTokenExpiresAt: 0,
        refreshLeaseId: undefined,
        refreshLeaseExpiresAt: undefined,
        disabledAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    await recordAudit(ctx, auth, {
      action: "wolt.connection.disconnected",
      entityTable: "locations",
      entityId: args.locationId,
      locationId: args.locationId,
      summary: "Afbrød Wolt-forbindelsen uden at slette historik",
    });
    return null;
  },
});

export const retryDeadLetters = mutation({
  args: { locationId: v.id("locations") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const auth = requireHumanPrincipal(await requireIntegrationManager(ctx));
    requireLocationAccess(auth, args.locationId);
    requireLocation(await ctx.db.get("locations", args.locationId), auth.organizationId);
    const connection = await ctx.db
      .query("woltVenueConnections")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", auth.organizationId).eq("locationId", args.locationId),
      )
      .unique();
    if (!connection || connection.state !== "ready") {
      throw new ConvexError("Wolt-forbindelsen skal godkendes igen først");
    }
    const events = await ctx.db
      .query("woltWebhookEvents")
      .withIndex("by_organizationId_and_locationId_and_state", (q) =>
        q
          .eq("organizationId", auth.organizationId)
          .eq("locationId", args.locationId)
          .eq("state", "deadLetter"),
      )
      .take(101);
    const selected = events.slice(0, 100);
    const now = Date.now();
    for (const event of selected) {
      await ctx.db.patch(event._id, {
        state: "pending",
        runToken: undefined,
        attemptCount: 0,
        nextAttemptAt: now,
        lastError: undefined,
      });
      await ctx.scheduler.runAfter(0, internal.woltSync.processWebhookEvent, { eventId: event._id });
    }
    await recordAudit(ctx, auth, {
      action: "wolt.deadLetters.retried",
      entityTable: "locations",
      entityId: args.locationId,
      locationId: args.locationId,
      summary: `Forsøgte ${selected.length} Wolt-events igen`,
    });
    return selected.length;
  },
});

export const saveProductMapping = mutation({
  args: {
    locationId: v.union(v.id("locations"), v.null()),
    matchType: woltProductMatchTypeValidator,
    matchValue: v.string(),
    productId: v.id("products"),
  },
  returns: v.id("woltProductMappings"),
  handler: async (ctx, args) => {
    const auth = requireHumanPrincipal(await requireIntegrationManager(ctx));
    if (args.locationId === null) requireAllLocationAccess(auth);
    else {
      requireLocationAccess(auth, args.locationId);
      requireLocation(await ctx.db.get("locations", args.locationId), auth.organizationId);
    }
    const product = await ctx.db.get("products", args.productId);
    if (!product || product.organizationId !== auth.organizationId || product.status !== "active") {
      throw new ConvexError("Produktet blev ikke fundet");
    }
    const matchValue = normalizeWoltMatchValue(
      args.matchType,
      boundedText(args.matchValue, "Koblingsværdien"),
    );
    const existing = await ctx.db
      .query("woltProductMappings")
      .withIndex("by_organizationId_and_matchType_and_matchValue_and_locationId", (q) =>
        q
          .eq("organizationId", auth.organizationId)
          .eq("matchType", args.matchType)
          .eq("matchValue", matchValue)
          .eq("locationId", args.locationId),
      )
      .unique();
    const now = Date.now();
    const mappingId = existing?._id ??
      (await ctx.db.insert("woltProductMappings", {
        organizationId: auth.organizationId,
        locationId: args.locationId,
        matchType: args.matchType,
        matchValue,
        productId: args.productId,
        updatedBy: auth.userId,
        updatedAt: now,
      }));
    if (existing) {
      await ctx.db.patch(existing._id, {
        productId: args.productId,
        updatedBy: auth.userId,
        updatedAt: now,
      });
    }
    await recordAudit(ctx, auth, {
      action: "wolt.productMapping.saved",
      entityTable: "woltProductMappings",
      entityId: mappingId,
      ...(args.locationId ? { locationId: args.locationId } : {}),
      summary: `Koblede Wolt-${args.matchType} til ${product.name}`,
    });
    return mappingId;
  },
});

export const deleteProductMapping = mutation({
  args: { mappingId: v.id("woltProductMappings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = requireHumanPrincipal(await requireIntegrationManager(ctx));
    const mapping = await ctx.db.get("woltProductMappings", args.mappingId);
    if (!mapping || mapping.organizationId !== auth.organizationId) {
      throw new ConvexError("Koblingen blev ikke fundet");
    }
    if (mapping.locationId === null) requireAllLocationAccess(auth);
    else requireLocationAccess(auth, mapping.locationId);
    await ctx.db.delete(mapping._id);
    await recordAudit(ctx, auth, {
      action: "wolt.productMapping.deleted",
      entityTable: "woltProductMappings",
      entityId: mapping._id,
      ...(mapping.locationId ? { locationId: mapping.locationId } : {}),
      summary: "Fjernede Wolt-produktkobling",
    });
    return null;
  },
});

export const listObservedItems = query({
  args: { locationId: v.union(v.id("locations"), v.null()) },
  returns: v.object({
    rows: v.array(
      v.object({
        key: v.string(),
        locationId: v.id("locations"),
        locationName: v.string(),
        name: v.string(),
        gtin: v.union(v.string(), v.null()),
        posId: v.union(v.string(), v.null()),
        sku: v.union(v.string(), v.null()),
        lastObservedAt: v.number(),
        mapping: v.union(
          v.object({
            id: v.id("woltProductMappings"),
            productId: v.id("products"),
            productName: v.string(),
            locationOverride: v.boolean(),
          }),
          v.null(),
        ),
        conflict: v.boolean(),
        suggestions: v.array(v.object({ id: v.id("products"), name: v.string() })),
      }),
    ),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const auth = await requireIntegrationManager(ctx);
    if (args.locationId !== null) {
      requireLocationAccess(auth, args.locationId);
      requireLocation(await ctx.db.get("locations", args.locationId), auth.organizationId);
    }
    const observed = args.locationId
      ? await ctx.db
          .query("woltOrderItems")
          .withIndex("by_organizationId_and_locationId_and_observedAt", (q) =>
            q.eq("organizationId", auth.organizationId).eq("locationId", args.locationId!),
          )
          .order("desc")
          .take(MAX_OBSERVED_ITEMS + 1)
      : await ctx.db
          .query("woltOrderItems")
          .withIndex("by_organizationId_and_observedAt", (q) =>
            q.eq("organizationId", auth.organizationId),
          )
          .order("desc")
          .take(MAX_OBSERVED_ITEMS + 1);
    const visibleObserved = observed.filter(
      (item) => auth.locationScope.all || auth.locationScope.ids.has(item.locationId),
    );
    const [mappings, products, locations] = await Promise.all([
      ctx.db
        .query("woltProductMappings")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", auth.organizationId))
        .take(MAX_MAPPINGS + 1),
      ctx.db
        .query("products")
        .withIndex("by_organizationId_and_status_and_normalizedName", (q) =>
          q.eq("organizationId", auth.organizationId).eq("status", "active"),
        )
        .take(MAX_MAPPINGS + 1),
      ctx.db
        .query("locations")
        .withIndex("by_organizationId_and_normalizedName", (q) =>
          q.eq("organizationId", auth.organizationId),
        )
        .take(MAX_LOCATIONS + 1),
    ]);
    const productById = new Map(products.map((product) => [product._id, product]));
    const locationById = new Map(locations.map((location) => [location._id, location]));
    const unique = new Map<string, (typeof visibleObserved)[number]>();
    for (const item of visibleObserved.slice(0, MAX_OBSERVED_ITEMS)) {
      const key = `${item.locationId}:${item.gtin ?? ""}:${item.posId ?? ""}:${item.sku ?? ""}:${item.normalizedName}`;
      if (!unique.has(key)) unique.set(key, item);
    }
    const rows = [...unique.entries()].map(([key, item]) => {
      const resolution = resolveWoltMapping(mappings.slice(0, MAX_MAPPINGS), item.locationId, item);
      const mappedProduct = resolution.kind === "mapped"
        ? productById.get(resolution.mapping.productId)
        : null;
      const candidates = products
        .filter((product) => {
          const normalized = normalizeWoltText(product.name);
          return normalized === item.normalizedName || normalized.includes(item.normalizedName) || item.normalizedName.includes(normalized);
        })
        .slice(0, 3);
      return {
        key,
        locationId: item.locationId,
        locationName: locationById.get(item.locationId)?.name ?? "Ukendt lokation",
        name: item.name,
        gtin: item.gtin ?? null,
        posId: item.posId ?? null,
        sku: item.sku ?? null,
        lastObservedAt: item.observedAt,
        mapping:
          resolution.kind === "mapped" && mappedProduct
            ? {
                id: resolution.mapping._id,
                productId: mappedProduct._id,
                productName: mappedProduct.name,
                locationOverride: resolution.mapping.locationId !== null,
              }
            : null,
        conflict: resolution.kind === "conflict",
        suggestions: candidates.map((product) => ({ id: product._id, name: product.name })),
      };
    });
    return {
      rows,
      truncated:
        observed.length > MAX_OBSERVED_ITEMS ||
        mappings.length > MAX_MAPPINGS ||
        products.length > MAX_MAPPINGS ||
        locations.length > MAX_LOCATIONS,
    };
  },
});

async function mapOrderPage(
  ctx: QueryCtx,
  organizationId: string,
  auth: Awaited<ReturnType<typeof requireSalesDetailViewer>>,
  page: PaginationResult<Doc<"woltOrders">>,
  from: number,
  to: number,
  orderType: Doc<"woltOrders">["orderType"] | null,
) {
  const visible = page.page.filter(
    (order: Doc<"woltOrders">) =>
      order.organizationId === organizationId &&
      visibleLocation(auth, order.locationId) &&
      order.occurredAt >= from &&
      order.occurredAt < to &&
      (orderType === null || order.orderType === orderType),
  );
  const locationIds = [...new Set(visible.map((order: Doc<"woltOrders">) => order.locationId))];
  const locations = await Promise.all(locationIds.map((locationId) => ctx.db.get("locations", locationId)));
  const locationById = new Map(
    locations.flatMap((location) =>
      location?.organizationId === organizationId ? [[location._id, location] as const] : [],
    ),
  );
  return {
    ...page,
    page: visible.flatMap((order: Doc<"woltOrders">) => {
      const location = locationById.get(order.locationId);
      return location
        ? [{
            id: order._id,
            displayNumber: order.displayNumber,
            occurredAt: order.occurredAt,
            locationId: order.locationId,
            locationName: location.name,
            status: order.status,
            providerStatus: order.providerStatus,
            orderType: order.orderType,
            netRevenue: order.netRevenue,
            currency: order.currency,
            itemCount: order.itemCount,
          }]
        : [];
    }),
  };
}

export const listOrders = query({
  args: {
    locationId: v.union(v.id("locations"), v.null()),
    from: v.number(),
    to: v.number(),
    status: v.union(woltOrderStatusValidator, v.null()),
    orderType: v.union(woltOrderTypeValidator, v.null()),
    displayNumber: v.union(v.string(), v.null()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(orderSummaryValidator),
  handler: async (ctx, args) => {
    const auth = await requireSalesDetailViewer(ctx);
    requireOrderRange(args.from, args.to);
    requirePageSize(args.paginationOpts.numItems);
    if (args.locationId !== null) {
      requireLocationAccess(auth, args.locationId);
      requireLocation(await ctx.db.get("locations", args.locationId), auth.organizationId);
    }
    const normalizedDisplayNumber = args.displayNumber?.trim().toLocaleLowerCase("da-DK") || null;
    const page = normalizedDisplayNumber
      ? await ctx.db
          .query("woltOrders")
          .withIndex("by_organizationId_and_normalizedDisplayNumber", (q) =>
            q
              .eq("organizationId", auth.organizationId)
              .eq("normalizedDisplayNumber", normalizedDisplayNumber),
          )
          .filter(visibleOrderFilter(auth, args.from, args.to, args.orderType))
          .order("desc")
          .paginate(args.paginationOpts)
      : args.locationId && args.status
        ? await ctx.db
            .query("woltOrders")
            .withIndex("by_organizationId_and_locationId_and_status_and_occurredAt", (q) =>
              q
                .eq("organizationId", auth.organizationId)
                .eq("locationId", args.locationId!)
                .eq("status", args.status!)
                .gte("occurredAt", args.from)
                .lt("occurredAt", args.to),
            )
            .filter(visibleOrderFilter(auth, args.from, args.to, args.orderType))
            .order("desc")
            .paginate(args.paginationOpts)
        : args.locationId
          ? await ctx.db
              .query("woltOrders")
              .withIndex("by_organizationId_and_locationId_and_occurredAt", (q) =>
                q
                  .eq("organizationId", auth.organizationId)
                  .eq("locationId", args.locationId!)
                  .gte("occurredAt", args.from)
                  .lt("occurredAt", args.to),
              )
              .filter(visibleOrderFilter(auth, args.from, args.to, args.orderType))
              .order("desc")
              .paginate(args.paginationOpts)
          : args.status
            ? await ctx.db
                .query("woltOrders")
                .withIndex("by_organizationId_and_status_and_occurredAt", (q) =>
                  q
                    .eq("organizationId", auth.organizationId)
                    .eq("status", args.status!)
                    .gte("occurredAt", args.from)
                    .lt("occurredAt", args.to),
                )
                .filter(visibleOrderFilter(auth, args.from, args.to, args.orderType))
                .order("desc")
                .paginate(args.paginationOpts)
            : await ctx.db
                .query("woltOrders")
                .withIndex("by_organizationId_and_occurredAt", (q) =>
                  q
                    .eq("organizationId", auth.organizationId)
                    .gte("occurredAt", args.from)
                    .lt("occurredAt", args.to),
                )
                .filter(visibleOrderFilter(auth, args.from, args.to, args.orderType))
                .order("desc")
                .paginate(args.paginationOpts);
    return await mapOrderPage(
      ctx,
      auth.organizationId,
      auth,
      page,
      args.from,
      args.to,
      args.orderType,
    );
  },
});

export const getOrder = query({
  args: { orderId: v.id("woltOrders") },
  returns: v.union(
    v.object({
      id: v.id("woltOrders"),
      displayNumber: v.string(),
      occurredAt: v.number(),
      providerCreatedAt: v.number(),
      scheduledAt: v.union(v.number(), v.null()),
      modifiedAt: v.number(),
      locationId: v.id("locations"),
      locationName: v.string(),
      status: woltOrderStatusValidator,
      providerStatus: v.string(),
      orderType: woltOrderTypeValidator,
      basketPrice: v.number(),
      netRevenue: v.number(),
      currency: v.string(),
      itemCount: v.number(),
      mappingTruncated: v.boolean(),
      items: v.array(
        v.object({
          id: v.id("woltOrderItems"),
          name: v.string(),
          quantity: v.number(),
          posId: v.union(v.string(), v.null()),
          sku: v.union(v.string(), v.null()),
          gtin: v.union(v.string(), v.null()),
          unitPrice: v.number(),
          lineTotal: v.number(),
          mapping: v.union(
            v.object({ productId: v.id("products"), productName: v.string(), locationOverride: v.boolean() }),
            v.null(),
          ),
          mappingConflict: v.boolean(),
        }),
      ),
      history: v.array(
        v.object({
          eventId: v.string(),
          providerStatus: v.string(),
          eventCreatedAt: v.number(),
          receivedAt: v.number(),
        }),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const auth = await requireSalesDetailViewer(ctx);
    const order = await ctx.db.get("woltOrders", args.orderId);
    if (!order || order.organizationId !== auth.organizationId) return null;
    requireLocationAccess(auth, order.locationId);
    const location = requireLocation(await ctx.db.get("locations", order.locationId), auth.organizationId);
    const [items, history, mappings] = await Promise.all([
      ctx.db
        .query("woltOrderItems")
        .withIndex("by_organizationId_and_orderId", (q) =>
          q.eq("organizationId", auth.organizationId).eq("orderId", order._id),
        )
        .take(MAX_ITEMS + 1),
      ctx.db
        .query("woltWebhookEvents")
        .withIndex("by_organizationId_and_orderId_and_receivedAt", (q) =>
          q.eq("organizationId", auth.organizationId).eq("orderId", order.woltOrderId),
        )
        .order("asc")
        .take(200),
      ctx.db
        .query("woltProductMappings")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", auth.organizationId))
        .take(MAX_MAPPINGS + 1),
    ]);
    if (items.length > MAX_ITEMS) throw new ConvexError("Ordren har for mange linjer");
    const resolutions = items.map((item) => resolveWoltMapping(mappings.slice(0, MAX_MAPPINGS), order.locationId, item));
    const productIds = [
      ...new Set(
        resolutions.flatMap((resolution) =>
          resolution.kind === "mapped" ? [resolution.mapping.productId] : [],
        ),
      ),
    ];
    const products = await Promise.all(productIds.map((productId) => ctx.db.get("products", productId)));
    const productById = new Map(
      products.flatMap((product) =>
        product?.organizationId === auth.organizationId ? [[product._id, product] as const] : [],
      ),
    );
    return {
      id: order._id,
      displayNumber: order.displayNumber,
      occurredAt: order.occurredAt,
      providerCreatedAt: order.providerCreatedAt,
      scheduledAt: order.scheduledAt ?? null,
      modifiedAt: order.modifiedAt,
      locationId: order.locationId,
      locationName: location.name,
      status: order.status,
      providerStatus: order.providerStatus,
      orderType: order.orderType,
      basketPrice: order.basketPrice,
      netRevenue: order.netRevenue,
      currency: order.currency,
      itemCount: order.itemCount,
      mappingTruncated: mappings.length > MAX_MAPPINGS,
      items: items.map((item, index) => {
        const resolution = resolutions[index];
        const product = resolution.kind === "mapped" ? productById.get(resolution.mapping.productId) : null;
        return {
          id: item._id,
          name: item.name,
          quantity: item.quantity,
          posId: item.posId ?? null,
          sku: item.sku ?? null,
          gtin: item.gtin ?? null,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          mapping:
            resolution.kind === "mapped" && product
              ? {
                  productId: product._id,
                  productName: product.name,
                  locationOverride: resolution.mapping.locationId !== null,
                }
              : null,
          mappingConflict: resolution.kind === "conflict",
        };
      }),
      history: history.map((event) => ({
        eventId: event.eventId,
        providerStatus: event.providerStatus,
        eventCreatedAt: event.eventCreatedAt,
        receivedAt: event.receivedAt,
      })),
    };
  },
});

export const getOrderLocations = query({
  args: {},
  returns: v.array(v.object({ id: v.id("locations"), name: v.string() })),
  handler: async (ctx) => {
    const auth = await requireSalesDetailViewer(ctx);
    const filter = resolveLocationFilter(auth);
    const locations = await ctx.db
      .query("locations")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", auth.organizationId),
      )
      .take(MAX_LOCATIONS + 1);
    return locations
      .filter((location) => {
        if (filter === "all") return true;
        if ("locationId" in filter) return location._id === filter.locationId;
        return filter.locationIds.includes(location._id);
      })
      .slice(0, MAX_LOCATIONS)
      .map((location) => ({ id: location._id, name: location.name }));
  },
});

export const getOrderSourceHealth = query({
  args: {},
  returns: v.object({
    readyLocationCount: v.number(),
    disconnectedLocationNames: v.array(v.string()),
    staleLocationNames: v.array(v.string()),
    errorLocationNames: v.array(v.string()),
    backlogLocationNames: v.array(v.string()),
    limited: v.boolean(),
  }),
  handler: async (ctx) => {
    const auth = await requireSalesDetailViewer(ctx);
    const [locationRows, connectionRows] = await Promise.all([
      ctx.db
        .query("locations")
        .withIndex("by_organizationId_and_normalizedName", (q) =>
          q.eq("organizationId", auth.organizationId),
        )
        .take(MAX_LOCATIONS + 1),
      ctx.db
        .query("woltVenueConnections")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", auth.organizationId),
        )
        .take(MAX_LOCATIONS + 1),
    ]);
    const locations = locationRows
      .filter((location) => visibleLocation(auth, location._id))
      .slice(0, MAX_LOCATIONS);
    const connections = new Map(
      connectionRows
        .slice(0, MAX_LOCATIONS)
        .map((connection) => [connection.locationId, connection]),
    );
    const jobStates = await Promise.all(
      locations.map(async (location) => {
        const [pending, processing, deadLetter] = await Promise.all(
          (["pending", "processing", "deadLetter"] as const).map((state) =>
            ctx.db
              .query("woltWebhookEvents")
              .withIndex("by_organizationId_and_locationId_and_state", (q) =>
                q
                  .eq("organizationId", auth.organizationId)
                  .eq("locationId", location._id)
                  .eq("state", state),
              )
              .first(),
          ),
        );
        return { locationId: location._id, pending, processing, deadLetter };
      }),
    );
    const jobsByLocation = new Map(
      jobStates.map((state) => [state.locationId, state]),
    );
    const staleBefore = Date.now() - ORDER_HEALTH_STALE_MS;
    let readyLocationCount = 0;
    const disconnectedLocationNames: string[] = [];
    const staleLocationNames: string[] = [];
    const errorLocationNames: string[] = [];
    const backlogLocationNames: string[] = [];
    for (const location of locations) {
      const connection = connections.get(location._id);
      const jobs = jobsByLocation.get(location._id);
      if (!connection || connection.state === "disabled") {
        disconnectedLocationNames.push(location.name);
        continue;
      }
      if (connection.state === "ready") {
        readyLocationCount += 1;
        const freshnessAt =
          connection.lastSuccessAt ??
          connection.lastWebhookAt ??
          connection.activatedAt;
        if (freshnessAt < staleBefore) staleLocationNames.push(location.name);
      }
      if (
        connection.state === "error" ||
        connection.state === "reauthorizationRequired" ||
        connection.lastError
      ) {
        errorLocationNames.push(location.name);
      }
      if (jobs?.pending || jobs?.processing || jobs?.deadLetter) {
        backlogLocationNames.push(location.name);
      }
    }
    return {
      readyLocationCount,
      disconnectedLocationNames,
      staleLocationNames,
      errorLocationNames,
      backlogLocationNames,
      limited:
        locationRows.length > MAX_LOCATIONS ||
        connectionRows.length > MAX_LOCATIONS,
    };
  },
});
