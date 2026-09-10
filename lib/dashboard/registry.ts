import type {
  MetricId,
  MetricUnit,
  SalesSource,
  VisualizationId,
  WidgetInstance,
  WidgetSize,
} from "./types";

export type MetricSource = "internal" | "onlinepos" | "wolt" | "workfeed" | "googleMaps";

export const salesSourceMetricIds = [
  "salesRevenue",
  "salesOrderCount",
  "averageBasket",
] as const satisfies readonly MetricId[];

export function supportsSalesSource(metricId: MetricId) {
  return salesSourceMetricIds.includes(metricId as (typeof salesSourceMetricIds)[number]);
}

export function defaultSalesSource(metricId: MetricId): SalesSource {
  return metricId === "woltCancellationRate" ? "wolt" : "onlinePos";
}

export type MetricDefinition = {
  id: MetricId;
  label: string;
  category: string;
  description: string;
  formula: string;
  sourceTables: readonly [string, ...string[]];
  source: MetricSource;
  unit: MetricUnit;
  visualizations: readonly VisualizationId[];
  defaultVisualization: VisualizationId;
  defaultSize: WidgetSize;
  sensitive?: boolean;
  shareable?: boolean;
  live?: {
    currentLabel: string;
    sourceLabel: string;
    locationLimits: Partial<Record<VisualizationId, number>>;
  };
};

const definitions = {
  googleRating: {
    id: "googleRating",
    label: "Gæstescore",
    category: "Gæster",
    description: "Aktuel Google-bedømmelse fra 1 til 5 for hver lokation.",
    formula: "Googles aktuelle bedømmelse vises pr. lokation. Perioden påvirker ikke scoren. Der beregnes ingen samlet score eller ændring over tid.",
    sourceTables: ["Google Maps"],
    source: "googleMaps",
    unit: "quantity",
    visualizations: ["gauge", "list", "table"],
    defaultVisualization: "gauge",
    defaultSize: "2x2",
    shareable: false,
    live: {
      currentLabel: "Aktuel bedømmelse",
      sourceLabel: "Google Maps",
      locationLimits: { gauge: 4, list: 10, table: 20 },
    },
  },
  predictedSalesRevenue: {
    id: "predictedSalesRevenue",
    label: "Forventet omsætning, næste 7 dage",
    category: "Salg",
    description: "Prognose fra i morgen og syv dage frem. Bruger produktmængder, salgsmiks, åbningstider, lukkedage, vejr og helligdage. Kræver prognoseopsætning i lokationens oplysninger.",
    formula: "Hvert salgsprodukts forventede mængde pr. åben time ganges med åbningstiden og den seneste vægtede salgspris. Produktprognoserne summeres og afstemmes med omsætningen, så rabatter på ordreniveau medregnes. Produktmængder bruger op til 90 dages historik; manglende produktdata giver en prognose ud fra den samlede omsætning. Vejr fra OpenWeather og helligdage fra Nager.Holidays læres pr. produkt, når historikken rækker. Staff food og Waste indgår kun i bestillingsforbrug. Perioden er altid de næste syv dage, uanset dashboardets datovalg. Opdateres hver sjette time og efter ændringer i åbningstider.",
    sourceTables: ["salesDaily", "salesLines", "locationForecasts", "locations", "locationSpecialOpeningHours"],
    source: "internal",
    unit: "currency",
    visualizations: ["kpi", "line", "bar", "area", "table"],
    defaultVisualization: "line",
    defaultSize: "2x2",
    sensitive: true,
    shareable: true,
  },
  wasteQuantity: {
    id: "wasteQuantity",
    label: "Waste-mængde",
    category: "Waste",
    description: "Registreret Waste i produkternes standardenhed.",
    formula: "Summen af standardmængden for aktive Waste-registreringer i perioden.",
    sourceTables: ["wasteRegistrations"],
    source: "internal",
    unit: "quantity",
    visualizations: ["kpi", "line", "bar", "area", "table"],
    defaultVisualization: "area",
    defaultSize: "2x2",
  },
  wasteRegistrations: {
    id: "wasteRegistrations",
    label: "Waste-registreringer",
    category: "Waste",
    description: "Antal aktive Waste-registreringer.",
    formula: "Antal aktive Waste-registreringer i perioden.",
    sourceTables: ["wasteRegistrations"],
    source: "internal",
    unit: "count",
    visualizations: ["kpi", "line", "bar", "area", "table"],
    defaultVisualization: "kpi",
    defaultSize: "1x1",
  },
  topWastedProducts: {
    id: "topWastedProducts",
    label: "Produkter med flest Waste-registreringer",
    category: "Waste",
    description: "Produkter sorteret efter antal Waste-registreringer.",
    formula: "Antal aktive Waste-registreringer pr. produkt i perioden, sorteret faldende (top 10).",
    sourceTables: ["wasteRegistrations"],
    source: "internal",
    unit: "count",
    visualizations: ["bar", "donut", "list", "table"],
    defaultVisualization: "list",
    defaultSize: "2x2",
  },
  wasteByCategory: {
    id: "wasteByCategory",
    label: "Waste pr. kategori",
    category: "Waste",
    description: "Waste-registreringer fordelt på produktkategori.",
    formula: "Antal aktive Waste-registreringer i perioden, fordelt på produktkategori. Viser de 10 kategorier med flest registreringer.",
    sourceTables: ["wasteRegistrations", "products", "categories"],
    source: "internal",
    unit: "count",
    visualizations: ["bar", "donut", "list", "table"],
    defaultVisualization: "donut",
    defaultSize: "2x2",
  },
  badDeliveries: {
    id: "badDeliveries",
    label: "Dårlige leveringer",
    category: "Leveringer",
    description: "Antal aktive registreringer af dårlige leveringer.",
    formula: "Antal aktive registreringer af dårlige leveringer i perioden.",
    sourceTables: ["badDeliveries"],
    source: "internal",
    unit: "count",
    visualizations: ["kpi", "line", "bar", "area"],
    defaultVisualization: "kpi",
    defaultSize: "1x1",
  },
  countCompliance: {
    id: "countCompliance",
    label: "Gennemførte Counts",
    category: "Count",
    description: "Andel af periodens Counts, der er indsendt.",
    formula: "Antal indsendte Counts ÷ antal Counts × 100.",
    sourceTables: ["counts"],
    source: "internal",
    unit: "percent",
    visualizations: ["kpi", "gauge", "bar"],
    defaultVisualization: "gauge",
    defaultSize: "1x1",
  },
  openCounts: {
    id: "openCounts",
    label: "Åbne Counts",
    category: "Count",
    description: "Counts, der endnu ikke er indsendt.",
    formula: "Antal Counts oprettet før måletidspunktet, som ikke er indsendt ved måletidspunktet.",
    sourceTables: ["counts"],
    source: "internal",
    unit: "count",
    visualizations: ["kpi", "list", "table"],
    defaultVisualization: "kpi",
    defaultSize: "1x1",
  },
  transfers: {
    id: "transfers",
    label: "Transfers",
    category: "Transfer",
    description: "Antal transfers i perioden.",
    formula: "Antal transfers i perioden, hvor en valgt lokation er afsender eller modtager. Transferen tælles på afsenderlokationen.",
    sourceTables: ["transfers"],
    source: "internal",
    unit: "count",
    visualizations: ["kpi", "line", "bar", "area", "table"],
    defaultVisualization: "kpi",
    defaultSize: "1x1",
  },
  itemsMoved: {
    id: "itemsMoved",
    label: "Transfermængde",
    category: "Transfer",
    description: "Samlet registreret mængde på transferlinjer.",
    formula: "Summen af transferlinjens antal × faktor til standardenhed.",
    sourceTables: ["transfers", "transferItems"],
    source: "internal",
    unit: "quantity",
    visualizations: ["kpi", "line", "bar", "area", "table"],
    defaultVisualization: "line",
    defaultSize: "2x1",
  },
  topTransferredProducts: {
    id: "topTransferredProducts",
    label: "Produkter med størst transfermængde",
    category: "Transfer",
    description: "Produkter sorteret efter registreret transfermængde.",
    formula: "Samlet transfermængde pr. produkt i perioden, omregnet til produktets standardenhed. Viser de 10 produkter med størst mængde.",
    sourceTables: ["transfers", "transferItems"],
    source: "internal",
    unit: "quantity",
    visualizations: ["bar", "donut", "list", "table"],
    defaultVisualization: "bar",
    defaultSize: "2x2",
  },
  staffFoodRegistrations: {
    id: "staffFoodRegistrations",
    label: "Staff food-registreringer",
    category: "Staff food",
    description: "Antal aktive Staff food-registreringer.",
    formula: "Antal aktive Staff food-registreringer i perioden.",
    sourceTables: ["staffFoodRegistrations"],
    source: "internal",
    unit: "count",
    visualizations: ["kpi", "line", "bar", "area", "table"],
    defaultVisualization: "kpi",
    defaultSize: "1x1",
  },
  staffFoodPerEmployee: {
    id: "staffFoodPerEmployee",
    label: "Staff food pr. medarbejder",
    category: "Staff food",
    description: "Registreringer fordelt på medarbejder.",
    formula: "Antal aktive Staff food-registreringer pr. medarbejder, sorteret faldende (top 10).",
    sourceTables: ["staffFoodRegistrations"],
    source: "internal",
    unit: "count",
    visualizations: ["bar", "donut", "list", "table"],
    defaultVisualization: "list",
    defaultSize: "2x2",
  },
  scheduledHours: {
    id: "scheduledHours",
    label: "Planlagte timer",
    category: "Vagtplan",
    description: "Samlede timer i den synkroniserede vagtplan.",
    formula: "Summen af max(0, sluttid − starttid) omregnet til timer.",
    sourceTables: ["scheduledShifts"],
    source: "workfeed",
    unit: "hours",
    visualizations: ["kpi", "line", "bar", "area", "table"],
    defaultVisualization: "area",
    defaultSize: "2x1",
  },
  headcountToday: {
    id: "headcountToday",
    label: "På vagt i dag",
    category: "Vagtplan",
    description: "Unikke medarbejdere med en planlagt vagt i dag.",
    formula: "Antal unikke medarbejdere med en vagt, der overlapper i dag.",
    sourceTables: ["scheduledShifts", "employees"],
    source: "workfeed",
    unit: "count",
    visualizations: ["kpi", "list", "table"],
    defaultVisualization: "kpi",
    defaultSize: "1x1",
  },
  locationComparison: {
    id: "locationComparison",
    label: "Aktivitet pr. lokation",
    category: "Sammenligning",
    description: "Samlet antal registreringer og transfers pr. lokation.",
    formula: "Aktive Waste-registreringer, dårlige leveringer, Staff food-registreringer og afsendte transfers pr. lokation.",
    sourceTables: ["wasteRegistrations", "badDeliveries", "transfers", "staffFoodRegistrations"],
    source: "internal",
    unit: "count",
    visualizations: ["bar", "list", "table"],
    defaultVisualization: "table",
    defaultSize: "4x2",
  },
  salesRevenue: {
    id: "salesRevenue",
    label: "Omsætning",
    category: "Salg",
    description: "Samlet omsætning i perioden.",
    formula: "Summen af daglig omsætning i mindreenheder ÷ 100.",
    sourceTables: ["salesDaily"],
    source: "onlinepos",
    unit: "currency",
    visualizations: ["kpi", "line", "bar", "area", "table"],
    defaultVisualization: "kpi",
    defaultSize: "2x1",
    sensitive: true,
    shareable: true,
  },
  salesOrderCount: {
    id: "salesOrderCount",
    label: "Ordrer",
    category: "Salg",
    description: "Antal ordrer i perioden.",
    formula: "Summen af daglige ordreantal.",
    sourceTables: ["salesDaily"],
    source: "onlinepos",
    unit: "count",
    visualizations: ["kpi", "line", "bar", "area", "table"],
    defaultVisualization: "kpi",
    defaultSize: "1x1",
    sensitive: true,
    shareable: true,
  },
  averageBasket: {
    id: "averageBasket",
    label: "Gennemsnitlig kurv",
    category: "Salg",
    description: "Omsætning divideret med antal ordrer.",
    formula: "Summen af omsætning i mindreenheder ÷ summen af ordrer ÷ 100; 0 hvis der ikke er ordrer.",
    sourceTables: ["salesDaily"],
    source: "onlinepos",
    unit: "currency",
    visualizations: ["kpi", "line", "bar", "area", "table"],
    defaultVisualization: "kpi",
    defaultSize: "1x1",
    sensitive: true,
    shareable: true,
  },
  woltCancellationRate: {
    id: "woltCancellationRate",
    label: "Wolt-annulleringsrate",
    category: "Salg",
    description: "Andel af Wolt-ordrer, der blev annulleret i perioden.",
    formula: "Annullerede Wolt-ordrer ÷ (leverede + annullerede Wolt-ordrer) × 100.",
    sourceTables: ["woltSalesDaily"],
    source: "wolt",
    unit: "percent",
    visualizations: ["kpi", "line", "bar", "area", "table"],
    defaultVisualization: "kpi",
    defaultSize: "1x1",
    sensitive: true,
    shareable: true,
  },
} satisfies Record<MetricId, MetricDefinition>;

export const metricRegistry: Record<MetricId, MetricDefinition> = definitions;

export const metrics: MetricDefinition[] = Object.values(metricRegistry);

export const visualizationLabels: Record<VisualizationId, string> = {
  kpi: "Nøgletal",
  line: "Linjediagram",
  bar: "Søjlediagram",
  area: "Områdediagram",
  donut: "Donutdiagram",
  gauge: "Måler",
  list: "Liste",
  table: "Tabel",
};

export const sizeLabels: Record<WidgetSize, string> = {
  "1x1": "Lille",
  "1x2": "Høj",
  "2x1": "Bred",
  "2x2": "Stor",
  "4x2": "Fuld bredde",
};

export const defaultWidgets: WidgetInstance[] = [
  {
    key: "waste-registrations",
    metric: { kind: "builtin", id: "wasteRegistrations" },
    visualization: "kpi",
    size: "1x1",
    position: { column: 0, row: 0 },
  },
  {
    key: "transfers",
    metric: { kind: "builtin", id: "transfers" },
    visualization: "kpi",
    size: "1x1",
    position: { column: 1, row: 0 },
  },
  {
    key: "scheduled-hours",
    metric: { kind: "builtin", id: "scheduledHours" },
    visualization: "area",
    size: "2x1",
    position: { column: 2, row: 0 },
  },
  {
    key: "waste-over-time",
    metric: { kind: "builtin", id: "wasteQuantity" },
    visualization: "area",
    size: "2x2",
    position: { column: 0, row: 1 },
  },
  {
    key: "location-comparison",
    metric: { kind: "builtin", id: "locationComparison" },
    visualization: "table",
    size: "2x2",
    position: { column: 2, row: 1 },
  },
];
