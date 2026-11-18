import { sidebarItems, type SidebarItemId } from "./sidebar-navigation";

// Manager is part of the Dashboard feature, not a switch of its own.
export type FeatureId = Exclude<SidebarItemId, "organization" | "manager">;

export const featureLabels = {
  dashboard: "Dashboard",
  dateLabels: "Datomærkning",
  woltOrders: "Wolt-ordrer",
  ordering: "Bestilling",
  transfers: "Transfer",
  invoices: "Salg",
  expenses: "Udgift",
  goodsReceipts: "Varemodtagelse",
  waste: "Waste",
  foodSafety: "Egenkontrol",
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
  expenses: "/expenses",
  goodsReceipts: "/goods-receipts",
  waste: "/waste",
  foodSafety: "/food-safety",
  staffFood: "/staff-food",
  count: "/count",
  employees: "/employees",
} satisfies Record<FeatureId, string>;

export function featureForPath(pathname: string): FeatureId | undefined {
  for (const { id } of sidebarItems) {
    if (id === "organization") continue;
    if (id === "manager") {
      if (pathname.startsWith("/manager/staff-food")) return "staffFood";
      if (pathname === "/manager" || pathname.startsWith("/manager/")) return "dashboard";
      continue;
    }
    const path = featurePaths[id];
    if (pathname === path || pathname.startsWith(`${path}/`)) return id;
  }
}
