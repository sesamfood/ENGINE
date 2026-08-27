import { v } from "convex/values";

export const woltConnectionStateValidator = v.union(
  v.literal("ready"),
  v.literal("disabled"),
  v.literal("reauthorizationRequired"),
  v.literal("error"),
);

export const woltOnboardingModeValidator = v.union(
  v.literal("ssio"),
  v.literal("wio"),
);

export const woltJobStateValidator = v.union(
  v.literal("pending"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("deadLetter"),
);

export const woltOrderStatusValidator = v.union(
  v.literal("created"),
  v.literal("production"),
  v.literal("ready"),
  v.literal("delivered"),
  v.literal("canceled"),
  v.literal("other"),
);

export const woltOrderTypeValidator = v.union(
  v.literal("instant"),
  v.literal("preorder"),
  v.literal("other"),
);

export const woltProductMatchTypeValidator = v.union(
  v.literal("gtin"),
  v.literal("posId"),
  v.literal("sku"),
  v.literal("name"),
);

export const salesSourceValidator = v.union(
  v.literal("onlinePos"),
  v.literal("wolt"),
  v.literal("combined"),
);

export const woltWebhookEnvelopeValidator = v.object({
  eventId: v.string(),
  orderId: v.string(),
  venueId: v.string(),
  providerStatus: v.string(),
  eventCreatedAt: v.number(),
});

export const woltOrderSnapshotValidator = v.object({
  woltOrderId: v.string(),
  venueId: v.string(),
  displayNumber: v.string(),
  status: woltOrderStatusValidator,
  providerStatus: v.string(),
  orderType: woltOrderTypeValidator,
  providerCreatedAt: v.number(),
  scheduledAt: v.optional(v.number()),
  occurredAt: v.number(),
  modifiedAt: v.number(),
  basketPrice: v.number(),
  currency: v.string(),
  itemCount: v.number(),
  items: v.array(
    v.object({
      itemId: v.string(),
      name: v.string(),
      normalizedName: v.string(),
      quantity: v.number(),
      posId: v.optional(v.string()),
      sku: v.optional(v.string()),
      gtin: v.optional(v.string()),
      unitPrice: v.number(),
      lineTotal: v.number(),
      currency: v.string(),
    }),
  ),
});
