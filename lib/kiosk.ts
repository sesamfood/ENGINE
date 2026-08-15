export const kioskDestinations = [
  { id: "transfers.new", route: "/transfers", label: "Ny flytning", group: "Flytninger" },
  { id: "transfers.history", route: "/transfers/history", label: "Flyttehistorik", group: "Flytninger" },
  { id: "waste.register", route: "/waste", label: "Registrér spild", group: "Spild" },
  { id: "waste.badDelivery", route: "/waste/bad-delivery", label: "Dårlig levering", group: "Spild" },
  { id: "waste.report", route: "/waste/report", label: "Spildrapport", group: "Spild" },
  { id: "ownChecks.today", route: "/own-checks", label: "Dagens egenkontrol", group: "Egenkontrol" },
  { id: "ownChecks.overview", route: "/own-checks/overview", label: "Egenkontroloversigt", group: "Egenkontrol" },
  { id: "ownChecks.documentation", route: "/own-checks/documentation", label: "Kontroldokumentation", group: "Egenkontrol" },
  { id: "staffFood.register", route: "/staff-food", label: "Personalemad", group: "Personalemad" },
  { id: "count.register", route: "/count", label: "Optælling", group: "Optælling" },
  { id: "count.stock", route: "/count/stock", label: "Lager", group: "Optælling" },
  { id: "employees.schedule", route: "/employees", label: "Vagtplan", group: "Medarbejdere" },
  { id: "employees.directory", route: "/employees/directory", label: "Medarbejdere", group: "Medarbejdere" },
] as const;

export type KioskDestinationId = (typeof kioskDestinations)[number]["id"];

export const kioskDestinationWarnings: Partial<
  Record<KioskDestinationId, string>
> = {
  "ownChecks.overview":
    "Tabletten kan registrere korrigerende handlinger fra egenkontroloversigten, uanset hvilken rolle den er logget ind med.",
  "ownChecks.documentation":
    "Tabletten kan eksportere kontroldokumentation, uanset hvilken rolle den er logget ind med.",
};

export function kioskDestination(id: KioskDestinationId) {
  return kioskDestinations.find((destination) => destination.id === id)!;
}
