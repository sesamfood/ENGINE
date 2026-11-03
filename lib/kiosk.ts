import type { FeatureId } from "./features";

export const kioskDestinations = [
  { id: "dashboard.view", route: "/dashboard", label: "Dashboard", feature: "dashboard" },
  { id: "dashboard.monthly", route: "/dashboard/monthly", label: "Månedsrapport", feature: "dashboard" },
  { id: "dateLabels.print", route: "/date-labels", label: "Datomærkning", feature: "dateLabels" },
  { id: "woltOrders.view", route: "/wolt-orders", label: "Wolt-ordrer", feature: "woltOrders" },
  { id: "ordering.new", route: "/ordering", label: "Ny bestilling", feature: "ordering" },
  { id: "ordering.history", route: "/ordering/history", label: "Bestillingshistorik", feature: "ordering" },
  { id: "transfers.new", route: "/transfers", label: "Ny transfer", feature: "transfers" },
  { id: "transfers.history", route: "/transfers/history", label: "Transferhistorik", feature: "transfers" },
  { id: "invoices.new", route: "/invoices", label: "Registrér salg", feature: "invoices" },
  { id: "invoices.history", route: "/invoices/history", label: "Salgshistorik", feature: "invoices" },
  { id: "expenses.new", route: "/expenses", label: "Opret udgift", feature: "expenses" },
  { id: "expenses.history", route: "/expenses/history", label: "Udgifter", feature: "expenses" },
  { id: "goodsReceipts.register", route: "/goods-receipts", label: "Varemodtagelse", feature: "goodsReceipts" },
  { id: "waste.register", route: "/waste", label: "Registrér Waste", feature: "waste" },
  { id: "waste.badDelivery", route: "/waste/bad-delivery", label: "Dårlig levering", feature: "waste" },
  { id: "waste.report", route: "/waste/report", label: "Waste-rapport", feature: "waste" },
  { id: "ownChecks.today", route: "/own-checks", label: "Dagens egenkontrol", feature: "ownChecks" },
  { id: "ownChecks.overview", route: "/own-checks/overview", label: "Egenkontroloversigt", feature: "ownChecks" },
  { id: "ownChecks.documentation", route: "/own-checks/documentation", label: "Kontroldokumentation", feature: "ownChecks" },
  { id: "ownChecks.guidance", route: "/own-checks/guidance", label: "Vejledning", feature: "ownChecks" },
  { id: "staffFood.register", route: "/staff-food", label: "Staff food", feature: "staffFood" },
  { id: "staffFood.report", route: "/staff-food/report", label: "Staff food-rapport", feature: "staffFood" },
  { id: "count.register", route: "/count", label: "Count", feature: "count" },
  { id: "count.stock", route: "/count/stock", label: "Lager", feature: "count" },
  { id: "employees.schedule", route: "/employees", label: "Vagtplan", feature: "employees" },
  { id: "employees.directory", route: "/employees/directory", label: "Medarbejdere", feature: "employees" },
] as const satisfies readonly { id: string; route: string; label: string; feature: FeatureId }[];

export type KioskDestinationId = (typeof kioskDestinations)[number]["id"];

export function kioskDestinationMatches(id: string, pathname: string) {
  const destination = kioskDestinations.find((item) => item.id === id);
  return (
    destination?.route === pathname ||
    (id === "ownChecks.today" && pathname.startsWith("/own-checks/check/")) ||
    (id === "transfers.new" && pathname === "/transfers/orders") ||
    (id === "goodsReceipts.register" && pathname.startsWith("/goods-receipts/")) ||
    (id === "dashboard.view" &&
      pathname.startsWith("/dashboard/") &&
      pathname !== "/dashboard/monthly")
  );
}

export function kioskDestination(id: KioskDestinationId) {
  return kioskDestinations.find((destination) => destination.id === id)!;
}
