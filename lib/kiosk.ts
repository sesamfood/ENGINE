export const kioskDestinations = [
  { id: "transfers.new", route: "/transfers", label: "Ny transfer", group: "Transfers" },
  { id: "transfers.history", route: "/transfers/history", label: "Transferhistorik", group: "Transfers" },
  { id: "waste.register", route: "/waste", label: "Registrér Waste", group: "Waste" },
  { id: "waste.badDelivery", route: "/waste/bad-delivery", label: "Dårlig levering", group: "Waste" },
  { id: "waste.report", route: "/waste/report", label: "Waste-rapport", group: "Waste" },
  { id: "staffFood.register", route: "/staff-food", label: "Staff food", group: "Staff food" },
  { id: "count.register", route: "/count", label: "Count", group: "Count" },
  { id: "count.stock", route: "/count/stock", label: "Lager", group: "Count" },
  { id: "employees.schedule", route: "/employees", label: "Vagtplan", group: "Medarbejdere" },
  { id: "employees.directory", route: "/employees/directory", label: "Medarbejdere", group: "Medarbejdere" },
] as const;

export type KioskDestinationId = (typeof kioskDestinations)[number]["id"];

export function kioskDestination(id: KioskDestinationId) {
  return kioskDestinations.find((destination) => destination.id === id)!;
}
