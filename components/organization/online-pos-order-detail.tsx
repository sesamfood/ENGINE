"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { CircleAlertIcon, PackageIcon, ReceiptTextIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type OnlinePosOrderDetailRecord = NonNullable<
  FunctionReturnType<typeof api.sales.getOrder>
>;

type OnlinePosMoneyFormatter = (minorUnits: number, currency: string) => string;

function formatDateTime(value: number, timeZone?: string) {
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(value);
}

function OrderDetailContent({
  order,
  formatMoney,
  timeZone,
}: {
  order: OnlinePosOrderDetailRecord;
  formatMoney: OnlinePosMoneyFormatter;
  timeZone?: string;
}) {
  return (
    <div className="flex flex-col gap-5 px-4 pb-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Omsætning</p>
          <p className="mt-1 text-lg font-semibold">
            {formatMoney(order.revenue, order.currency)}
          </p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Produkter i alt</p>
          <p className="mt-1 text-lg font-semibold">
            {order.itemCount.toLocaleString("da-DK")}
          </p>
        </div>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ReceiptTextIcon aria-hidden="true" />
            Ordreoplysninger
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Ordrenummer</dt>
              <dd className="font-medium">{order.orderNumber}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Tidspunkt</dt>
              <dd className="font-medium">
                {formatDateTime(order.occurredAt, timeZone)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Lokation</dt>
              <dd className="font-medium">{order.locationName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Afdeling</dt>
              <dd className="font-medium">{order.department || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Betaling</dt>
              <dd className="font-medium">{order.paymentType || "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Senest opdateret</dt>
              <dd className="font-medium">
                {formatDateTime(order.updatedAt, timeZone)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <section
        aria-labelledby="online-pos-order-lines"
        className="flex flex-col gap-3"
      >
        <div className="flex items-center gap-2">
          <PackageIcon aria-hidden="true" />
          <h2
            id="online-pos-order-lines"
            className="font-heading text-base font-medium"
          >
            Produktlinjer
          </h2>
        </div>
        {order.lines.length ? (
          <div className="flex flex-col gap-3">
            {order.lines.map((line) => (
              <Card size="sm" key={line.id}>
                <CardHeader>
                  <CardTitle>{line.productName || "Ukendt produkt"}</CardTitle>
                  <CardDescription
                    className="truncate"
                    title={line.externalProductId}
                  >
                    OnlinePOS-produkt-id: {line.externalProductId || "—"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-muted-foreground">Antal</dt>
                      <dd className="font-medium">
                        {line.quantity.toLocaleString("da-DK")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Pris pr. stk.</dt>
                      <dd className="font-medium">
                        {formatMoney(line.unitPrice, order.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Linjetotal</dt>
                      <dd className="font-medium">
                        {formatMoney(line.revenue, order.currency)}
                      </dd>
                    </div>
                    {line.clerkName ? (
                      <div>
                        <dt className="text-muted-foreground">Kasserer</dt>
                        <dd className="font-medium">{line.clerkName}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {line.menuItems.length ? (
                    <div className="mt-5 flex flex-col gap-3">
                      <Separator />
                      <h3 className="text-sm font-medium">
                        Produkter i menuen
                      </h3>
                      <ul className="flex flex-col divide-y rounded-lg border bg-muted/20">
                        {line.menuItems.map((menuItem) => (
                          <li
                            key={menuItem.id}
                            className="grid gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
                          >
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <p className="truncate font-medium">
                                  {menuItem.product.name}
                                </p>
                                <Badge
                                  variant={
                                    menuItem.product.kind === "primary"
                                      ? "secondary"
                                      : "outline"
                                  }
                                  className="shrink-0"
                                >
                                  {menuItem.product.kind === "primary"
                                    ? "Primær"
                                    : "Ekstra"}
                                </Badge>
                              </div>
                              <p
                                className="truncate text-xs text-muted-foreground"
                                title={`${menuItem.productName} · OnlinePOS-produkt-id: ${menuItem.externalProductId}`}
                              >
                                {menuItem.productName || "Ukendt OnlinePOS-produkt"}
                                {" · "}OnlinePOS-produkt-id:{" "}
                                {menuItem.externalProductId || "—"}
                              </p>
                            </div>
                            <dl className="grid grid-cols-2 gap-x-5 gap-y-1 text-sm sm:min-w-52">
                              <div>
                                <dt className="text-xs text-muted-foreground">
                                  Antal
                                </dt>
                                <dd className="font-medium">
                                  {menuItem.quantity.toLocaleString("da-DK")}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-xs text-muted-foreground">
                                  Linjetotal
                                </dt>
                                <dd className="font-medium">
                                  {formatMoney(
                                    menuItem.revenue,
                                    order.currency,
                                  )}
                                </dd>
                              </div>
                            </dl>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {line.menuItemsTruncated ? (
                    <Alert className="mt-4">
                      <CircleAlertIcon aria-hidden="true" />
                      <AlertDescription>
                        Menuens produktliste er afkortet.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Empty className="min-h-32 border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PackageIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>Ingen produktlinjer</EmptyTitle>
              <EmptyDescription>
                Der er ingen produktlinjer på denne ordre.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {order.linesTruncated ? (
          <Alert>
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>Produktlisten er afkortet</AlertTitle>
            <AlertDescription>
              Viser de første{" "}
              {order.lines
                .reduce((sum, line) => sum + 1 + line.menuItems.length, 0)
                .toLocaleString("da-DK")}{" "}
              produktlinjer.
            </AlertDescription>
          </Alert>
        ) : null}
      </section>
    </div>
  );
}

export function OnlinePosOrderDetail({
  orderId,
  formatMoney,
  onClose,
  timeZone,
}: {
  orderId: Id<"salesOrders"> | null;
  formatMoney: OnlinePosMoneyFormatter;
  onClose: () => void;
  timeZone?: string;
}) {
  const order = useQuery(api.sales.getOrder, orderId ? { orderId } : "skip");

  return (
    <Sheet open={orderId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full max-w-xl overflow-y-auto sm:max-w-xl"
      >
        <SheetHeader className="border-b pr-12">
          <SheetTitle>
            {order ? `OnlinePOS-ordre ${order.orderNumber}` : "OnlinePOS-ordre"}
          </SheetTitle>
          <SheetDescription>
            Ordreoplysninger og produktlinjer.
          </SheetDescription>
        </SheetHeader>
        {!orderId || order === undefined ? (
          <div className="flex flex-col gap-3 px-4" aria-label="Indlæser ordre">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : order === null ? (
          <div className="px-4">
            <Alert variant="destructive">
              <CircleAlertIcon aria-hidden="true" />
              <AlertTitle>Ordren kunne ikke indlæses</AlertTitle>
              <AlertDescription>
                Ordren findes ikke længere, eller du har ikke adgang til den.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <OrderDetailContent
            order={order}
            formatMoney={formatMoney}
            timeZone={timeZone}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
