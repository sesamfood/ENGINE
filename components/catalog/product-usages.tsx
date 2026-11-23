"use client";

import Link from "next/link";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function formatAmount(quantity: number, unitName: string) {
  return `${quantity.toLocaleString("da-DK", { maximumFractionDigits: 3 })} ${unitName}`;
}

export function ProductUsages({
  productId,
  linkQuery,
}: {
  productId: Id<"products">;
  linkQuery: string;
}) {
  const usages = useQuery(api.catalog.listProductUsages, { productId });
  if (!usages?.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bruges i</CardTitle>
        <CardDescription>
          Produkter, der har dette produkt som ingrediens eller emballage.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y rounded-xl border">
          {usages.map((usage) => (
            <li key={`${usage.productId}-${usage.packaging}`}>
              <Link
                href={`/administration/products/${usage.productId}${linkQuery}`}
                className="flex min-h-14 items-center gap-3 px-4 py-2 outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <span className="truncate font-medium">
                    {usage.productName}
                  </span>
                  {usage.packaging ? (
                    <Badge variant="outline">Emballage</Badge>
                  ) : null}
                  {usage.productStatus === "archived" ? (
                    <Badge variant="outline">Arkiveret</Badge>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end text-end">
                  <span className="font-medium tabular-nums">
                    {formatAmount(usage.quantity, usage.unitName)}
                  </span>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    pr. {formatAmount(usage.yieldQuantity, usage.yieldUnitName)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
