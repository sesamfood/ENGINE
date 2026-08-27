import { describe, expect, test } from "vitest";
import {
  normalizeWoltStatus,
  parseWoltOrder,
  parseWoltWebhook,
} from "./woltApi";

function orderFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    venue: { id: "venue-1", name: "Venue" },
    basket_price: { total: { amount: 4_927, currency: "EUR" } },
    items: [
      {
        id: "item-1",
        count: 2,
        pos_id: "POS-1",
        sku: "SKU-1",
        gtin: "0001",
        name: "Burger",
        item_price: {
          unit_price: { amount: 2_154, currency: "EUR" },
          total: { amount: 4_308, currency: "EUR" },
        },
      },
    ],
    created_at: "2026-08-27T10:00:00.000Z",
    type: "instant",
    pre_order: null,
    order_number: "10",
    order_status: "delivered",
    modified_at: "2026-08-27T10:05:00.000Z",
    consumer_name: "Skal ikke gemmes",
    consumer_phone_number: "+4512345678",
    consumer_comment: "Skal ikke gemmes",
    company_tax_id: "Skal ikke gemmes",
    loyalty_card_number: "Skal ikke gemmes",
    delivery: {
      location: {
        street_address: "Skal ikke gemmes",
        coordinates: { lat: 1, lon: 2 },
      },
    },
    ...overrides,
  };
}

describe("parseWoltOrder", () => {
  test("bevarer kun de aftalte ikke-personlige felter", () => {
    const parsed = parseWoltOrder(orderFixture());

    expect(parsed).toMatchObject({
      woltOrderId: "order-1",
      venueId: "venue-1",
      displayNumber: "10",
      status: "delivered",
      basketPrice: 4_927,
      currency: "EUR",
      itemCount: 2,
    });
    expect(parsed.items[0]).toMatchObject({
      unitPrice: 2_154,
      lineTotal: 4_308,
      quantity: 2,
    });
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toContain("Skal ikke gemmes");
    expect(serialized).not.toContain("+4512345678");
    expect(serialized).not.toContain("street_address");
    expect(serialized).not.toContain("coordinates");
  });

  test("bruger preorder-tiden som forretningstid", () => {
    const parsed = parseWoltOrder(
      orderFixture({
        type: "preorder",
        pre_order: { preorder_time: "2026-08-28T16:00:00.000Z" },
      }),
    );
    expect(parsed.occurredAt).toBe(Date.parse("2026-08-28T16:00:00.000Z"));
  });

  test("afviser en preorder uden gyldigt planlagt tidspunkt", () => {
    expect(() =>
      parseWoltOrder(
        orderFixture({ type: "preorder", pre_order: { preorder_time: null } }),
      ),
    ).toThrow("planlagt tidspunkt");
  });

  test("tåler nye statusværdier uden at acceptere dem som leveret", () => {
    expect(normalizeWoltStatus("future_status")).toBe("other");
    expect(parseWoltOrder(orderFixture({ order_status: "future_status" })).status).toBe("other");
  });
});

test("parseWoltWebhook læser kun den smalle routing-envelope", () => {
  expect(
    parseWoltWebhook({
      id: "event-1",
      type: "order.notification",
      order: {
        id: "order-1",
        venue_id: "venue-1",
        status: "CREATED",
        resource_url: "https://example.invalid/ignored",
      },
      created_at: "2026-08-27T10:00:00.000Z",
      extra: { consumer_name: "ignored" },
    }),
  ).toEqual({
    eventId: "event-1",
    orderId: "order-1",
    venueId: "venue-1",
    providerStatus: "CREATED",
    eventCreatedAt: Date.parse("2026-08-27T10:00:00.000Z"),
  });
});
