export const kioskDestinations = [
  { id: "dashboard.view", route: "/dashboard", label: "Dashboard", group: "Dashboard" },
  { id: "dashboard.monthly", route: "/dashboard/monthly", label: "Månedsrapport", group: "Dashboard" },
  { id: "dateLabels.print", route: "/date-labels", label: "Datomærkning", group: "Datomærkning" },
  { id: "woltOrders.view", route: "/wolt-orders", label: "Wolt-ordrer", group: "Wolt-ordrer" },
  { id: "ordering.new", route: "/ordering", label: "Ny bestilling", group: "Bestilling" },
  { id: "ordering.history", route: "/ordering/history", label: "Bestillingshistorik", group: "Bestilling" },
  { id: "transfers.new", route: "/transfers", label: "Ny transfer", group: "Transfer" },
  { id: "transfers.history", route: "/transfers/history", label: "Transferhistorik", group: "Transfer" },
  { id: "invoices.new", route: "/invoices", label: "Registrér salg", group: "Salg" },
  { id: "invoices.history", route: "/invoices/history", label: "Salgshistorik", group: "Salg" },
  { id: "expenses.new", route: "/expenses", label: "Opret udgift", group: "Udgift" },
  { id: "expenses.history", route: "/expenses/history", label: "Udgifter", group: "Udgift" },
  { id: "goodsReceipts.register", route: "/goods-receipts", label: "Varemodtagelse", group: "Varemodtagelse" },
  { id: "waste.register", route: "/waste", label: "Registrér Waste", group: "Waste" },
  { id: "waste.badDelivery", route: "/waste/bad-delivery", label: "Dårlig levering", group: "Waste" },
  { id: "waste.report", route: "/waste/report", label: "Waste-rapport", group: "Waste" },
  { id: "ownChecks.today", route: "/own-checks", label: "Dagens egenkontrol", group: "Egenkontrol" },
  { id: "ownChecks.overview", route: "/own-checks/overview", label: "Egenkontroloversigt", group: "Egenkontrol" },
  { id: "ownChecks.documentation", route: "/own-checks/documentation", label: "Kontroldokumentation", group: "Egenkontrol" },
  { id: "ownChecks.guidance", route: "/own-checks/guidance", label: "Vejledning", group: "Egenkontrol" },
  { id: "staffFood.register", route: "/staff-food", label: "Staff food", group: "Staff food" },
  { id: "staffFood.report", route: "/staff-food/report", label: "Staff food-rapport", group: "Staff food" },
  { id: "count.register", route: "/count", label: "Count", group: "Count" },
  { id: "count.stock", route: "/count/stock", label: "Lager", group: "Count" },
  { id: "employees.schedule", route: "/employees", label: "Vagtplan", group: "Medarbejdere" },
  { id: "employees.directory", route: "/employees/directory", label: "Medarbejdere", group: "Medarbejdere" },
] as const;

export type KioskDestinationId = (typeof kioskDestinations)[number]["id"];

export const kioskDestinationWarnings: Partial<
  Record<KioskDestinationId, string>
> = {
  "ownChecks.overview":
    "På denne side kan tabletten registrere korrigerende handlinger, uanset kontoens rolle.",
  "ownChecks.documentation":
    "På denne side kan tabletten eksportere kontroldokumentation, uanset kontoens rolle.",
};

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
