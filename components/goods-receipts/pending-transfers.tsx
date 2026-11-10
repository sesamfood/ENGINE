"use client";

import { dateTimeFormatter as sharedDateTimeFormatter } from "@/lib/date";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowRightIcon,
  CheckIcon,
  PackageCheckIcon,
  PlusIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { useAccess, usePermission } from "@/components/app-shell";
import { useGoodsReceiptContext } from "@/components/goods-receipts/goods-receipt-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
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
import { CardGridSkeleton } from "@/components/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { getUserErrorMessage } from "@/lib/user-errors";
import { cn } from "@/lib/utils";

const dateTimeFormatter = sharedDateTimeFormatter("da-DK", {
  dateStyle: "medium",
  timeStyle: "short",
});
const quantityFormatter = new Intl.NumberFormat("da-DK", {
  maximumFractionDigits: 3,
});

type PendingTransfer = FunctionReturnType<
  typeof api.goodsReceipts.listPendingTransfers
>["transfers"][number];

export function PendingTransfers() {
  const access = useAccess();
  const canRegister = usePermission("goodsReceipts.register");
  const { locationId } = useGoodsReceiptContext();
  const result = useQuery(
    api.goodsReceipts.listPendingTransfers,
    canRegister && locationId ? { locationId } : "skip",
  );
  const orders = useQuery(
    api.goodsReceipts.listPendingOrders,
    canRegister && locationId ? { locationId } : "skip",
  );

  if (!access) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-11 w-48" />
        </div>
        <CardGridSkeleton count={3} />
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
      <Empty appearance="outlined" className="min-h-80">
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

  if (result === undefined || orders === undefined) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-11 w-48" />
        </div>
        <CardGridSkeleton count={3} />
      </div>
    );
  }

  if (result.transfers.length === 0 && orders.orders.length === 0) {
    return (
      <Empty appearance="outlined" className="min-h-80">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PackageCheckIcon />
          </EmptyMedia>
          <EmptyTitle>Intet afventer modtagelse</EmptyTitle>
          <EmptyDescription>
            Der er ingen åbne transfers eller bestillinger til den valgte
            lokation.
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

  const quickTransfers = result.transfers.filter((transfer) => transfer.quick);
  const fullTransfers = result.transfers.filter((transfer) => !transfer.quick);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-xl font-semibold tracking-tight">
            Afventer modtagelse
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

      {orders.truncated ? (
        <Alert>
          <AlertTitle>Listen viser de første 100 bestillinger</AlertTitle>
          <AlertDescription>
            Registrér de ældste modtagelser for at se resten.
          </AlertDescription>
        </Alert>
      ) : null}

      {quickTransfers.length > 0 ? (
        <section
          aria-labelledby="quick-transfers-heading"
          className="flex flex-col gap-3"
        >
          <div>
            <h3
              id="quick-transfers-heading"
              className="text-base font-semibold"
            >
              Hurtig modtagelse
            </h3>
            <p className="text-sm text-muted-foreground">
              Transfers uden bestilling. Acceptér dem, som de blev sendt, eller
              åbn dem for at rette mængderne.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {quickTransfers.map((transfer) => (
              <QuickTransferCard key={transfer.id} transfer={transfer} />
            ))}
          </div>
        </section>
      ) : null}

      {orders.orders.length > 0 || fullTransfers.length > 0 ? (
        <section className="flex flex-col gap-3">
          {quickTransfers.length > 0 ? (
            <h3 className="text-base font-semibold">Bestillinger</h3>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {orders.orders.map((order) => (
              <Link
                key={order.id}
                href={`/goods-receipts/manual?order=${order.id}`}
                aria-label={`Registrér bestilling${order.supplierName ? ` fra ${order.supplierName}` : ""}`}
                className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Card appearance="link" className="h-full">
                  <CardHeader>
                    <CardTitle>{order.supplierName ?? "Bestilling"}</CardTitle>
                    <CardDescription>
                      {dateTimeFormatter.format(order.createdAt)} ·{" "}
                      {order.createdByName}
                    </CardDescription>
                    <CardAction>
                      <Badge variant="secondary">Bestilling</Badge>
                    </CardAction>
                  </CardHeader>
                  <CardFooter
                    appearance="emphasized"
                    className="justify-between"
                  >
                    <span>Registrér modtagelse</span>
                    <ArrowRightIcon aria-hidden="true" />
                  </CardFooter>
                </Card>
              </Link>
            ))}
            {fullTransfers.map((transfer) => (
              <Link
                key={transfer.id}
                href={`/goods-receipts/${transfer.id}`}
                aria-label={`Registrér transfer fra ${transfer.fromLocationName} til ${transfer.toLocationName}`}
                className="group rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Card appearance="link" className="h-full">
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
                  <CardFooter
                    appearance="emphasized"
                    className="justify-between"
                  >
                    <span>Registrér modtagelse</span>
                    <ArrowRightIcon aria-hidden="true" />
                  </CardFooter>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function QuickTransferCard({ transfer }: { transfer: PendingTransfer }) {
  const registerReceipt = useMutation(
    api.goodsReceipts.registerTransferReceipt,
  );
  const [accepting, setAccepting] = useState(false);

  async function accept() {
    setAccepting(true);
    try {
      await registerReceipt({
        transferId: transfer.id,
        items: transfer.items.map((item) => ({
          transferItemId: item.id,
          unitId: item.unitId,
          quantity: item.quantity,
        })),
      });
      toast.success(`Transferen fra ${transfer.fromLocationName} er modtaget`);
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Transferen kunne ikke modtages. Prøv igen.",
        ),
      );
      setAccepting(false);
    }
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>
          {transfer.fromLocationName} → {transfer.toLocationName}
        </CardTitle>
        <CardDescription>
          {dateTimeFormatter.format(transfer.transferredAt)} ·{" "}
          {transfer.responsibleName}
        </CardDescription>
      </CardHeader>
      <CardContent appearance="details" className="flex flex-col">
        <ul className="flex flex-col gap-1">
          {transfer.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3">
              <span className="min-w-0 truncate">{item.productName}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {quantityFormatter.format(item.quantity)} {item.unitName}
              </span>
            </li>
          ))}
        </ul>
        {transfer.comment ? (
          <p className="text-muted-foreground">{transfer.comment}</p>
        ) : null}
      </CardContent>
      <CardFooter appearance="compact" className="mt-auto justify-end">
        <Link
          href={`/goods-receipts/${transfer.id}`}
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "min-h-11",
          )}
        >
          Åbn
        </Link>
        <Button
          size="lg"
          className="min-h-11"
          disabled={accepting}
          onClick={() => void accept()}
        >
          {accepting ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <CheckIcon data-icon="inline-start" />
          )}
          Acceptér
        </Button>
      </CardFooter>
    </Card>
  );
}
