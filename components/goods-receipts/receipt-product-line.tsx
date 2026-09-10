import {
  ProductUnitLine,
  type ProductLineUnit,
} from "@/components/product-unit-line";
import { Badge } from "@/components/ui/badge";
import type { Id } from "@/convex/_generated/dataModel";
import { PackageIcon } from "lucide-react";
import Image from "next/image";
import type { ComponentProps } from "react";

export type ReceiptLine = {
  key: string;
  productId: Id<"products">;
  productName: string;
  imageUrl: string | null;
  unitId: Id<"units">;
  units: ProductLineUnit[];
  quantity: string;
};

export function ReceiptProductLine({
  line,
  ...controls
}: { line: ReceiptLine } & Omit<
  ComponentProps<typeof ProductUnitLine>,
  "lineKey" | "productName" | "units" | "unitId" | "quantity"
>) {
  return (
    <li className="grid gap-4 py-4 xl:grid-cols-[minmax(12rem,1fr)_minmax(20rem,1fr)] xl:items-start">
      <div className="flex min-w-0 items-center gap-3">
        {line.imageUrl ? (
          <Image
            src={line.imageUrl}
            alt=""
            width={48}
            height={48}
            className="size-12 rounded-lg object-cover"
          />
        ) : (
          <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <PackageIcon className="size-5" aria-hidden="true" />
          </div>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <span className="truncate font-medium">{line.productName}</span>
          <Badge variant="secondary" className="w-fit">
            Tilføjet
          </Badge>
        </div>
      </div>
      <ProductUnitLine
        lineKey={line.key}
        productName={line.productName}
        units={line.units}
        unitId={line.unitId}
        quantity={line.quantity}
        {...controls}
      />
    </li>
  );
}
