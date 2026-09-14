export type IntegrationId =
  | "workfeed"
  | "onlinepos"
  | "economic"
  | "wolt";

export const integrationRegistry = [
  {
    id: "workfeed",
    name: "Workfeed",
    description: "Se dagens planlagte medarbejdere og antal medarbejdere på arbejde for hver lokation.",
    requiresAllLocations: false,
  },
  {
    id: "onlinepos",
    name: "OnlinePOS",
    description: "Hent produkter fra masterforbindelser og salg fra de enkelte lokationsforbindelser.",
    requiresAllLocations: false,
  },
  {
    id: "economic",
    name: "e-conomic",
    description: "Hent bogførte omkostninger og budget til månedsrapporten.",
    requiresAllLocations: true,
  },
  {
    id: "wolt",
    name: "Wolt",
    description: "Modtag Wolt-ordrer, og overvåg forbindelser pr. lokation.",
    requiresAllLocations: false,
  },
] satisfies {
  id: IntegrationId;
  name: string;
  description: string;
  requiresAllLocations: boolean;
}[];
