import { downloadCsv } from "./download-csv";

export function downloadOrderCsv(order: {
  locationId: string;
  locationName: string;
  fromDate: string;
  toDate: string;
  rows: readonly {
    productId: string;
    productName: string;
    unitName: string;
    quantity: number;
  }[];
}) {
  downloadCsv(
    `bestilling-${order.fromDate}-${order.locationId}.csv`,
    ["Lokation", "Fra dato", "Til dato", "Produkt-id", "Produkt", "Enhed", "Mængde"],
    order.rows.map((row) => [
      order.locationName,
      order.fromDate,
      order.toDate,
      row.productId,
      row.productName,
      row.unitName,
      String(row.quantity).replace(".", ","),
    ]),
  );
}
