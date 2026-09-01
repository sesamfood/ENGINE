"use client";

import { useQuery } from "convex/react";
import { ArrowRightIcon, PackageCheckIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useAccess, usePermission } from "@/components/app-shell";
import { useGoodsReceiptContext } from "@/components/goods-receipts/goods-receipt-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";

const dateTimeFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function PendingTransfers() {
  const access = useAccess();
  const canRegister = usePermission("goodsReceipts.register");
  const { locationId } = useGoodsReceiptContext();
  const result = useQuery(
    api.goodsReceipts.listPendingTransfers,
    canRegister && locationId ? { locationId } : "skip",
  );

  if (!access) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  if (!canRegister) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at registrere varemodtagelser.
        </AlertDescription>
      </Alert>
    );
  }

  if (!locationId) {
    return (
      <Empty className="min-h-80 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PackageCheckIcon />
          </EmptyMedia>
          <EmptyTitle>Ingen lokationer tilgængelige</EmptyTitle>
          <EmptyDescription>
            Du har ikke adgang til en lokation, der kan modtage transfers.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (result === undefined) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  if (result.transfers.length === 0) {
    return (
      <Empty className="min-h-80 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PackageCheckIcon />
          </EmptyMedia>
          <EmptyTitle>Ingen transfers afventer modtagelse</EmptyTitle>
          <EmptyDescription>
            Der er ingen åbne transfers til den valgte lokation.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link
            href="/goods-receipts/manual"
            className={cn(buttonVariants({ size: "lg" }), "min-h-11")}
          >
            <PlusIcon data-icon="inline-start" />
            Manuel varemodtagelse
          </Link>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-xl font-semibold tracking-tight">
            Transfers der afventer modtagelse
          </h2>
        </div>
        <Link
          href="/goods-receipts/manual"
          className={cn(buttonVariants({ size: "lg" }), "min-h-11 sm:self-end")}
        >
          <PlusIcon data-icon="inline-start" />
          Manuel varemodtagelse
        </Link>
      </div>

      {result.truncated ? (
        <Alert>
          <AlertTitle>Listen viser de første 100 transfers</AlertTitle>
          <AlertDescription>
            Registrér de ældste modtagelser for at se resten.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {result.transfers.map((transfer) => (
          <Link
            key={transfer.id}
            href={`/goods-receipts/${transfer.id}`}
            aria-label={`Registrér transfer fra ${transfer.fromLocationName} til ${transfer.toLocationName}`}
            className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Card className="h-full transition-colors group-hover:bg-muted/50 group-active:bg-muted/50">
              <CardHeader>
                <CardTitle>
                  {transfer.fromLocationName} → {transfer.toLocationName}
                </CardTitle>
                <CardDescription>
                  {dateTimeFormatter.format(transfer.transferredAt)}
                </CardDescription>
                <CardAction>
                  <Badge variant="secondary">Transfer</Badge>
                </CardAction>
              </CardHeader>
              <CardFooter className="justify-between font-medium">
                <span>Registrér modtagelse</span>
                <ArrowRightIcon aria-hidden="true" />
              </CardFooter>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
