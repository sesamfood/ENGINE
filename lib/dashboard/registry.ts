import type {
  MetricId,
  MetricUnit,
  VisualizationId,
  WidgetInstance,
  WidgetSize,
} from "./types";

export type MetricDefinition = {
  id: MetricId;
  label: string;
  category: string;
  description: string;
  unit: MetricUnit;
  visualizations: readonly VisualizationId[];
  defaultVisualization: VisualizationId;
  defaultSize: WidgetSize;
  adminOnly?: boolean;
  shareable?: boolean;
};

const definitions = {
  wasteQuantity: {
    id: "wasteQuantity",
    label: "Waste-mængde",
    category: "Waste",
    description: "Registreret waste i produkternes standardenhed.",
    unit: "quantity",
    visualizations: ["kpi", "line", "bar", "area", "table"],
    defaultVisualization: "area",
    defaultSize: "2x2",
  },
  wasteRegistrations: {
    id: "wasteRegistrations",
    label: "Waste-registreringer",
    category: "Waste",
    description: "Antal aktive waste-registreringer.",
    unit: "count",
    visualizations: ["kpi", "line", "bar", "area", "table"],
    defaultVisualization: "kpi",
    defaultSize: "1x1",
  },
  topWastedProducts: {
    id: "topWastedProducts",
    label: "Mest registrerede waste-produkter",
    category: "Waste",
    description: "Produkter sorteret efter antal waste-registreringer.",
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
    unit: "count",
    visualizations: ["kpi", "line", "bar", "area"],
    defaultVisualization: "kpi",
    defaultSize: "1x1",
  },
  countCompliance: {
    id: "countCompliance",
    label: "Count-compliance",
    category: "Counts",
    description: "Andel af periodens counts, der er indsendt.",
    unit: "percent",
    visualizations: ["kpi", "gauge", "bar"],
    defaultVisualization: "gauge",
    defaultSize: "1x1",
  },
  openCounts: {
    id: "openCounts",
    label: "Åbne counts",
    category: "Counts",
    description: "Counts der endnu ikke er indsendt.",
    unit: "count",
    visualizations: ["kpi", "list", "table"],
    defaultVisualization: "kpi",
    defaultSize: "1x1",
  },
  transfers: {
    id: "transfers",
    label: "Transfers",
    category: "Transfers",
    description: "Antal transfers i perioden.",
    unit: "count",
    visualizations: ["kpi", "line", "bar", "area", "table"],
    defaultVisualization: "kpi",
    defaultSize: "1x1",
  },
  itemsMoved: {
    id: "itemsMoved",
    label: "Flyttede varer",
    category: "Transfers",
    description: "Samlet registreret mængde på transferlinjer.",
    unit: "quantity",
    visualizations: ["kpi", "line", "bar", "area", "table"],
    defaultVisualization: "line",
    defaultSize: "2x1",
  },
  topTransferredProducts: {
    id: "topTransferredProducts",
    label: "Mest flyttede produkter",
    category: "Transfers",
    description: "Produkter sorteret efter registreret transfermængde.",
    unit: "quantity",
    visualizations: ["bar", "donut", "list", "table"],
    defaultVisualization: "bar",
    defaultSize: "2x2",
  },
  staffFoodRegistrations: {
    id: "staffFoodRegistrations",
    label: "Staff food-registreringer",
    category: "Staff food",
    description: "Antal aktive staff food-registreringer.",
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
    unit: "count",
    visualizations: ["kpi", "list", "table"],
    defaultVisualization: "kpi",
    defaultSize: "1x1",
  },
  locationComparison: {
    id: "locationComparison",
    label: "Aktivitet pr. location",
    category: "Sammenligning",
    description: "Samlet antal registreringer og transfers pr. location.",
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
    unit: "currency",
    visualizations: ["kpi", "line", "bar", "area", "table"],
    defaultVisualization: "kpi",
    defaultSize: "2x1",
    adminOnly: true,
    shareable: true,
  },
  salesOrderCount: {
    id: "salesOrderCount",
    label: "Ordrer",
    category: "Salg",
    description: "Antal ordrer i perioden.",
    unit: "count",
    visualizations: ["kpi", "line", "bar", "area", "table"],
    defaultVisualization: "kpi",
    defaultSize: "1x1",
    adminOnly: true,
    shareable: true,
  },
  averageBasket: {
    id: "averageBasket",
    label: "Gennemsnitlig kurv",
    category: "Salg",
    description: "Omsætning divideret med antal ordrer.",
    unit: "currency",
    visualizations: ["kpi", "line", "bar", "area", "table"],
    defaultVisualization: "kpi",
    defaultSize: "1x1",
    adminOnly: true,
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
    metricId: "wasteRegistrations",
    visualization: "kpi",
    size: "1x1",
    position: { column: 0, row: 0 },
  },
  {
    key: "transfers",
    metricId: "transfers",
    visualization: "kpi",
    size: "1x1",
    position: { column: 1, row: 0 },
  },
  {
    key: "scheduled-hours",
    metricId: "scheduledHours",
    visualization: "area",
    size: "2x1",
    position: { column: 2, row: 0 },
  },
  {
    key: "waste-over-time",
    metricId: "wasteQuantity",
    visualization: "area",
    size: "2x2",
    position: { column: 0, row: 1 },
  },
  {
    key: "location-comparison",
    metricId: "locationComparison",
    visualization: "table",
    size: "2x2",
    position: { column: 2, row: 1 },
  },
];
