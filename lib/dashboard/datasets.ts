import type {
  CustomMetricDatasetId,
  MetricUnit,
  VisualizationId,
} from "./types";

export type DatasetMeasure = {
  id: string;
  label: string;
  unit: MetricUnit;
};

export type DatasetField = {
  id: string;
  label: string;
  anonymous?: boolean;
};

export type DashboardDataset = {
  id: CustomMetricDatasetId;
  label: string;
  measures: readonly DatasetMeasure[];
  dimensions: readonly DatasetField[];
  filters: readonly DatasetField[];
  permission?: "sales.viewAggregate" | "sales.viewDetail";
};

export const customMetricVisualizations: readonly VisualizationId[] = [
  "kpi",
  "line",
  "bar",
  "area",
  "donut",
  "gauge",
  "list",
  "table",
];

export const ratioMetricVisualizations: readonly VisualizationId[] = [
  "kpi",
  "line",
  "bar",
  "area",
  "gauge",
  "list",
  "table",
];

export const dashboardDatasets: Record<
  CustomMetricDatasetId,
  DashboardDataset
> = {
  waste: {
    id: "waste",
    label: "Waste",
    measures: [
      { id: "registrations", label: "Registreringer", unit: "count" },
      { id: "quantity", label: "Mængde", unit: "quantity" },
    ],
    dimensions: [
      { id: "product", label: "Produkt" },
      { id: "category", label: "Kategori" },
      { id: "unit", label: "Enhed" },
      { id: "location", label: "Lokation" },
      { id: "source", label: "Kilde" },
      { id: "registeredBy", label: "Registreret af" },
    ],
    filters: [
      { id: "status", label: "Status" },
      { id: "source", label: "Kilde" },
    ],
  },
  badDelivery: {
    id: "badDelivery",
    label: "Dårlige leveringer",
    measures: [
      { id: "registrations", label: "Registreringer", unit: "count" },
      { id: "itemCount", label: "Antal produkter", unit: "count" },
    ],
    dimensions: [
      { id: "location", label: "Lokation" },
      { id: "registeredBy", label: "Registreret af" },
    ],
    filters: [
      { id: "status", label: "Status" },
      { id: "deductFromStock", label: "Træk fra lager" },
    ],
  },
  transfers: {
    id: "transfers",
    label: "Transfer",
    measures: [
      { id: "transfers", label: "Transfers", unit: "count" },
      { id: "itemsMoved", label: "Transfermængde", unit: "quantity" },
    ],
    dimensions: [
      { id: "fromLocation", label: "Fra lokation" },
      { id: "toLocation", label: "Til lokation" },
      { id: "product", label: "Produkt" },
      { id: "unit", label: "Enhed" },
      { id: "responsible", label: "Ansvarlig" },
    ],
    filters: [],
  },
  staffFood: {
    id: "staffFood",
    label: "Staff food",
    measures: [
      { id: "registrations", label: "Registreringer", unit: "count" },
      { id: "quantity", label: "Mængde", unit: "quantity" },
      { id: "employees", label: "Medarbejdere", unit: "count" },
    ],
    dimensions: [
      { id: "employee", label: "Medarbejder", anonymous: true },
      { id: "product", label: "Produkt" },
      { id: "category", label: "Kategori" },
      { id: "location", label: "Lokation" },
      { id: "sessionSource", label: "Sessionskilde" },
    ],
    filters: [
      { id: "status", label: "Status" },
      { id: "sessionSource", label: "Sessionskilde" },
    ],
  },
  shifts: {
    id: "shifts",
    label: "Vagter",
    measures: [
      { id: "hours", label: "Timer", unit: "hours" },
      { id: "shifts", label: "Vagter", unit: "count" },
      { id: "employees", label: "Medarbejdere", unit: "count" },
    ],
    dimensions: [
      { id: "employee", label: "Medarbejder", anonymous: true },
      { id: "location", label: "Lokation" },
      { id: "roleName", label: "Rolle" },
    ],
    filters: [{ id: "roleName", label: "Rolle" }],
  },
  counts: {
    id: "counts",
    label: "Count",
    measures: [
      { id: "counts", label: "Counts", unit: "count" },
      { id: "submitted", label: "Indsendte", unit: "count" },
    ],
    dimensions: [
      { id: "location", label: "Lokation" },
      { id: "status", label: "Status" },
      { id: "periodKey", label: "Periode" },
    ],
    filters: [{ id: "status", label: "Status" }],
  },
  salesDaily: {
    id: "salesDaily",
    label: "Dagligt salg",
    permission: "sales.viewAggregate",
    measures: [
      { id: "revenue", label: "Omsætning", unit: "currency" },
      { id: "orders", label: "Ordrer", unit: "count" },
      { id: "items", label: "Produkter", unit: "count" },
    ],
    dimensions: [{ id: "location", label: "Lokation" }],
    filters: [],
  },
  salesOrders: {
    id: "salesOrders",
    label: "Salgsordrer",
    permission: "sales.viewDetail",
    measures: [
      { id: "revenue", label: "Omsætning", unit: "currency" },
      { id: "orders", label: "Ordrer", unit: "count" },
      { id: "items", label: "Produkter", unit: "count" },
    ],
    dimensions: [
      { id: "location", label: "Lokation" },
      { id: "paymentType", label: "Betalingstype" },
      { id: "department", label: "Afdeling" },
      { id: "hourOfDay", label: "Klokkeslæt" },
    ],
    filters: [
      { id: "paymentType", label: "Betalingstype" },
      { id: "department", label: "Afdeling" },
    ],
  },
  salesLines: {
    id: "salesLines",
    label: "Salgslinjer",
    permission: "sales.viewDetail",
    measures: [
      { id: "revenue", label: "Omsætning", unit: "currency" },
      { id: "quantity", label: "Mængde", unit: "quantity" },
      { id: "lines", label: "Linjer", unit: "count" },
    ],
    dimensions: [
      { id: "product", label: "Produkt" },
      { id: "location", label: "Lokation" },
    ],
    filters: [{ id: "product", label: "Produkt" }],
  },
};
