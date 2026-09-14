import { sidebarItems, type SidebarItemId } from "./sidebar-navigation";

export type FeatureId = Exclude<SidebarItemId, "organization">;

export const featureLabels = {
  dashboard: "Dashboard",
  dateLabels: "Datomærkning",
  woltOrders: "Wolt-ordrer",
  ordering: "Bestilling",
  transfers: "Transfer",
  invoices: "Faktura",
  goodsReceipts: "Varemodtagelse",
  waste: "Waste",
  ownChecks: "Egenkontrol",
  staffFood: "Staff food",
  count: "Count",
  employees: "Medarbejdere",
} satisfies Record<FeatureId, string>;

const featurePaths = {
  dashboard: "/dashboard",
  dateLabels: "/date-labels",
  woltOrders: "/wolt-orders",
  ordering: "/ordering",
  transfers: "/transfers",
  invoices: "/invoices",
  goodsReceipts: "/goods-receipts",
  waste: "/waste",
  ownChecks: "/own-checks",
  staffFood: "/staff-food",
  count: "/count",
  employees: "/employees",
} satisfies Record<FeatureId, string>;

export function featureForPath(pathname: string): FeatureId | undefined {
  for (const { id } of sidebarItems) {
    if (id === "organization") continue;
    const path = featurePaths[id];
    if (pathname === path || pathname.startsWith(`${path}/`)) return id;
  }
}
