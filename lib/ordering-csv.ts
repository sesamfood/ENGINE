import { downloadCsv } from "./download-csv";

export function downloadOrderCsv(order: {
  locationId: string;
  locationName: string;
  supplierName?: string;
  fromDate: string;
  toDate: string;
  rows: readonly {
    productId: string;
    productName: string;
    unitName: string;
    quantity: number;
    supplierProductNumber?: string;
  }[];
}) {
  downloadCsv(
    `bestilling-${order.fromDate}-${order.locationId}.csv`,
    ["Lokation", "Leverandør", "Fra dato", "Til dato", "Produkt-id", "Varenummer", "Produkt", "Enhed", "Mængde"],
    order.rows.map((row) => [
      order.locationName,
      order.supplierName ?? "",
      order.fromDate,
      order.toDate,
      row.productId,
      row.supplierProductNumber ?? "",
      row.productName,
      row.unitName,
      String(row.quantity).replace(".", ","),
    ]),
  );
}
