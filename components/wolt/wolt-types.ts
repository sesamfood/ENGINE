import type { Id } from "@/convex/_generated/dataModel";

export type WoltOrderStatus =
  | "created"
  | "production"
  | "ready"
  | "delivered"
  | "canceled"
  | "other";

export type WoltOrderType = "instant" | "preorder" | "other";

export type WoltOrderSummary = {
  id: Id<"woltOrders">;
  displayNumber: string;
  occurredAt: number;
  locationId: Id<"locations">;
  locationName: string;
  status: WoltOrderStatus;
  providerStatus: string;
  orderType: WoltOrderType;
  netRevenue: number;
  currency: string;
  itemCount: number;
};

export type WoltOrderDetail = {
  id: Id<"woltOrders">;
  displayNumber: string;
  occurredAt: number;
  providerCreatedAt: number;
  scheduledAt: number | null;
  modifiedAt: number;
  locationId: Id<"locations">;
  locationName: string;
  status: WoltOrderStatus;
  providerStatus: string;
  orderType: WoltOrderType;
  basketPrice: number;
  netRevenue: number;
  currency: string;
  itemCount: number;
  mappingTruncated: boolean;
  items: Array<{
    id: Id<"woltOrderItems">;
    name: string;
    quantity: number;
    posId: string | null;
    sku: string | null;
    gtin: string | null;
    unitPrice: number;
    lineTotal: number;
    mapping: {
      productId: Id<"products">;
      productName: string;
      locationOverride: boolean;
    } | null;
    mappingConflict: boolean;
  }>;
  history: Array<{
    eventId: string;
    providerStatus: string;
    eventCreatedAt: number;
    receivedAt: number;
  }>;
};

export type WoltIntegrationOverview = {
  canUseWio: boolean;
  limitReached: boolean;
  locations: Array<{
    id: Id<"locations">;
    name: string;
    partnerVenueId: string | null;
    connection: {
      venueId: string;
      onboardingMode: "ssio" | "wio";
      state: "ready" | "disabled" | "reauthorizationRequired" | "error";
      activatedAt: number;
      accessTokenExpiresAt: number;
      lastWebhookAt: number | null;
      lastSuccessAt: number | null;
      lastError: string | null;
      backlogCount: number;
      deadLetterCount: number;
    } | null;
  }>;
};

export type WoltObservedItem = {
  key: string;
  locationId: Id<"locations">;
  locationName: string;
  name: string;
  gtin: string | null;
  posId: string | null;
  sku: string | null;
  lastObservedAt: number;
  mapping: {
    id: Id<"woltProductMappings">;
    productId: Id<"products">;
    productName: string;
    locationOverride: boolean;
  } | null;
  conflict: boolean;
  suggestions: Array<{ id: Id<"products">; name: string }>;
};

export type WoltObservedItemsResult = {
  rows: WoltObservedItem[];
  truncated: boolean;
};
