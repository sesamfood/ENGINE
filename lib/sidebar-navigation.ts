export const sidebarItems = [
  { id: "dashboard", label: "Dashboard" },
  { id: "woltOrders", label: "Wolt-ordrer" },
  { id: "transfers", label: "Transfer" },
  { id: "goodsReceipts", label: "Varemodtagelse" },
  { id: "waste", label: "Waste" },
  { id: "ownChecks", label: "Egenkontrol" },
  { id: "staffFood", label: "Staff food" },
  { id: "count", label: "Count" },
  { id: "employees", label: "Medarbejdere" },
  { id: "organization", label: "Administration" },
] as const;

export type SidebarItemId = (typeof sidebarItems)[number]["id"];

export const defaultSidebarOrder = sidebarItems.map((item) => item.id);

const sidebarItemIds = new Set<string>(defaultSidebarOrder);

export function normalizeSidebarOrder(order?: readonly string[]) {
  const configured = order?.filter(
    (id): id is SidebarItemId => sidebarItemIds.has(id),
  ) ?? [];
  const uniqueConfigured = [...new Set(configured)];
  const missing = defaultSidebarOrder.filter(
    (id) => !uniqueConfigured.includes(id),
  );
  const newlyAddedDashboard = missing.includes("dashboard") ? ["dashboard" as const] : [];
  const addGoodsReceiptsAfterTransfers =
    missing.includes("goodsReceipts") && configured.includes("transfers");
  return [
    ...newlyAddedDashboard,
    ...uniqueConfigured.flatMap((id) =>
      id === "transfers" && addGoodsReceiptsAfterTransfers
        ? [id, "goodsReceipts" as const]
        : [id],
    ),
    ...missing.filter(
      (id) =>
        id !== "dashboard" &&
        !(id === "goodsReceipts" && addGoodsReceiptsAfterTransfers),
    ),
  ];
}
