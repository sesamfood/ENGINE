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
  sensitive?: boolean;
  shareable?: boolean;
};

const definitions = {
  wasteQuantity: {
    id: "wasteQuantity",
    label: "Spildmængde",
    category: "Spild",
    description: "Registreret spild i produkternes standardenhed.",
    unit: "quantity",
    visualizations: ["kpi", "line", "bar", "area", "table"],
    defaultVisualization: "area",
    defaultSize: "2x2",
  },
  wasteRegistrations: {
    id: "wasteRegistrations",
    label: "Spildregistreringer",
    category: "Spild",
    description: "Antal aktive spildregistreringer.",
    unit: "count",
    visualizations: ["kpi", "line", "bar", "area", "table"],
    defaultVisualization: "kpi",
    defaultSize: "1x1",
  },
  topWastedProducts: {
    id: "topWastedProducts",
    label: "Mest registrerede spildprodukter",
    category: "Spild",
    description: "Produkter sorteret efter antal spildregistreringer.",
    unit: "count",
    visualizations: ["bar", "donut", "list", "table"],
    defaultVisualization: "list",
    defaultSize: "2x2",
  },
  wasteByCategory: {
    id: "wasteByCategory",
    label: "Spild pr. kategori",
    category: "Spild",
    description: "Spildregistreringer fordelt på produktkategori.",
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
    label: "Optællingsgrad",
    category: "Optælling",
    description: "Andel af periodens optællinger, der er indsendt.",
    unit: "percent",
    visualizations: ["kpi", "gauge", "bar"],
    defaultVisualization: "gauge",
    defaultSize: "1x1",
  },
  openCounts: {
    id: "openCounts",
    label: "Åbne optællinger",
    category: "Optælling",
    description: "Optællinger, der endnu ikke er indsendt.",
    unit: "count",
    visualizations: ["kpi", "list", "table"],
    defaultVisualization: "kpi",
    defaultSize: "1x1",
  },
  transfers: {
    id: "transfers",
    label: "Flytninger",
    category: "Flytninger",
    description: "Antal flytninger i perioden.",
    unit: "count",
    visualizations: ["kpi", "line", "bar", "area", "table"],
    defaultVisualization: "kpi",
    defaultSize: "1x1",
  },
  itemsMoved: {
    id: "itemsMoved",
    label: "Flyttede varer",
    category: "Flytninger",
    description: "Samlet registreret mængde på flyttelinjer.",
    unit: "quantity",
    visualizations: ["kpi", "line", "bar", "area", "table"],
    defaultVisualization: "line",
    defaultSize: "2x1",
  },
  topTransferredProducts: {
    id: "topTransferredProducts",
    label: "Mest flyttede produkter",
    category: "Flytninger",
    description: "Produkter sorteret efter registreret flyttemængde.",
    unit: "quantity",
    visualizations: ["bar", "donut", "list", "table"],
    defaultVisualization: "bar",
    defaultSize: "2x2",
  },
  staffFoodRegistrations: {
    id: "staffFoodRegistrations",
    label: "Personalemadsregistreringer",
    category: "Personalemad",
    description: "Antal aktive personalemadsregistreringer.",
    unit: "count",
    visualizations: ["kpi", "line", "bar", "area", "table"],
    defaultVisualization: "kpi",
    defaultSize: "1x1",
  },
  staffFoodPerEmployee: {
    id: "staffFoodPerEmployee",
    label: "Personalemad pr. medarbejder",
    category: "Personalemad",
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
    label: "Aktivitet pr. lokation",
    category: "Sammenligning",
    description: "Samlet antal registreringer og flytninger pr. lokation.",
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
    sensitive: true,
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
    sensitive: true,
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
