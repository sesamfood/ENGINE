export const sidebarItems = [
  { id: "dashboard", label: "Dashboard" },
  { id: "transfers", label: "Transfer" },
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
  const missing = defaultSidebarOrder.filter((id) => !configured.includes(id));
  const newlyAddedDashboard = missing.includes("dashboard") ? ["dashboard" as const] : [];
  return [
    ...newlyAddedDashboard,
    ...new Set(configured),
    ...missing.filter((id) => id !== "dashboard"),
  ];
}
