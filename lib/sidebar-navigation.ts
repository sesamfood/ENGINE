export const sidebarItems = [
  { id: "dashboard", label: "Dashboard" },
  { id: "manager", label: "Manager" },
  { id: "dateLabels", label: "Datomærkning" },
  { id: "woltOrders", label: "Wolt-ordrer" },
  { id: "ordering", label: "Bestilling" },
  { id: "prepplan", label: "Prepplan" },
  { id: "transfers", label: "Transfer" },
  { id: "invoices", label: "Salg" },
  { id: "expenses", label: "Udgift" },
  { id: "goodsReceipts", label: "Varemodtagelse" },
  { id: "waste", label: "Waste" },
  { id: "foodSafety", label: "Food safety" },
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
  const addManagerAfterDashboard =
    missing.includes("manager") && configured.includes("dashboard");
  const addPrepplanAfterOrdering =
    missing.includes("prepplan") && configured.includes("ordering");
  const addInvoicesAfterTransfers =
    missing.includes("invoices") && configured.includes("transfers");
  const addGoodsReceiptsAfterTransfers =
    missing.includes("goodsReceipts") && configured.includes("transfers");
  return [
    ...newlyAddedDashboard,
    ...uniqueConfigured.flatMap((id) => [
      id,
      ...(id === "dashboard" && addManagerAfterDashboard
        ? ["manager" as const]
        : []),
      ...(id === "ordering" && addPrepplanAfterOrdering
        ? ["prepplan" as const]
        : []),
      ...(id === "transfers" && addInvoicesAfterTransfers
        ? ["invoices" as const]
        : []),
      ...(id === "transfers" && addGoodsReceiptsAfterTransfers
        ? ["goodsReceipts" as const]
        : []),
    ]),
    ...missing.filter(
      (id) =>
        id !== "dashboard" &&
        !(id === "manager" && addManagerAfterDashboard) &&
        !(id === "prepplan" && addPrepplanAfterOrdering) &&
        !(id === "invoices" && addInvoicesAfterTransfers) &&
        !(id === "goodsReceipts" && addGoodsReceiptsAfterTransfers),
    ),
  ];
}
