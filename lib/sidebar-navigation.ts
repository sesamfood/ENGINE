export const sidebarItems = [
  { id: "transfers", label: "Transfers" },
  { id: "waste", label: "Waste" },
  { id: "staffFood", label: "Staff food" },
  { id: "count", label: "Count" },
  { id: "employees", label: "Medarbejdere" },
  { id: "organization", label: "Organisation" },
] as const;

export type SidebarItemId = (typeof sidebarItems)[number]["id"];

export const defaultSidebarOrder = sidebarItems.map((item) => item.id);

const sidebarItemIds = new Set<string>(defaultSidebarOrder);

export function normalizeSidebarOrder(order?: readonly string[]) {
  const configured = order?.filter(
    (id): id is SidebarItemId => sidebarItemIds.has(id),
  ) ?? [];
  return [
    ...new Set(configured),
    ...defaultSidebarOrder.filter((id) => !configured.includes(id)),
  ];
}
