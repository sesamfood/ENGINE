"use client";

import {
  ChevronDownIcon,
  CircleAlertIcon,
  Clock3Icon,
  PackageIcon,
  ReceiptTextIcon,
} from "lucide-react";
import { useQuery } from "convex/react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  formatWoltDateTime,
  formatWoltMoney,
  woltOrderTypeLabels,
  woltStatusLabels,
  woltStatusVariant,
} from "./wolt-format";
import type { WoltOrderDetail as WoltOrderDetailRecord } from "./wolt-types";

function Identifier({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-mono text-xs" title={value}>
        {value}
      </dd>
    </div>
  );
}

function MappingBadge({ item }: { item: WoltOrderDetailRecord["items"][number] }) {
  if (item.mappingConflict) {
    return <Badge variant="destructive">Konflikt</Badge>;
  }
  if (item.mapping) {
    return (
      <Badge variant="secondary">
        Koblet{item.mapping.locationOverride ? " for lokationen" : ""}
      </Badge>
    );
  }
  return <Badge variant="secondary">Ikke koblet</Badge>;
}

function OrderDetailContent({ order }: { order: WoltOrderDetailRecord }) {
  return (
    <div className="flex flex-col gap-5 px-4 pb-6">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Netto kurv</p>
          <p className="mt-1 text-lg font-semibold">
            {formatWoltMoney(order.netRevenue, order.currency)}
          </p>
        </div>
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Antal varer</p>
          <p className="mt-1 text-lg font-semibold">{order.itemCount}</p>
        </div>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle appearance="inline" className="flex items-center">
            <ReceiptTextIcon aria-hidden="true" />
            Ordreoplysninger
          </CardTitle>
        </CardHeader>
        <CardContent appearance="compact" className="flex flex-col">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Lokation</dt>
              <dd className="font-medium">{order.locationName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="mt-1">
                <Badge variant={woltStatusVariant(order.status)}>
                  {woltStatusLabels[order.status]}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Ordretype</dt>
              <dd className="font-medium">{woltOrderTypeLabels[order.orderType]}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Wolt-status</dt>
              <dd className="font-medium">{order.providerStatus}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Forretningstid</dt>
              <dd className="font-medium">{formatWoltDateTime(order.occurredAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Oprettet hos Wolt</dt>
              <dd className="font-medium">{formatWoltDateTime(order.providerCreatedAt)}</dd>
            </div>
            {order.scheduledAt ? (
              <div>
                <dt className="text-muted-foreground">Planlagt til</dt>
                <dd className="font-medium">{formatWoltDateTime(order.scheduledAt)}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-muted-foreground">Senest opdateret</dt>
              <dd className="font-medium">{formatWoltDateTime(order.modifiedAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Bruttobeløb</dt>
              <dd className="font-medium">{formatWoltMoney(order.basketPrice, order.currency)}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <section aria-labelledby="wolt-order-items" className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <PackageIcon aria-hidden="true" />
          <h2 id="wolt-order-items" className="font-heading text-base font-medium">
            Varer
          </h2>
        </div>
        <div className="flex flex-col gap-4">
          <div aria-hidden="true" className="hidden gap-3 text-xs text-muted-foreground sm:grid sm:grid-cols-(--grid-cols-order-values)">
            <span>Produkt</span><span className="text-right">Antal</span><span className="text-right">Beløb</span>
          </div>
          {order.items.map((item) => (
            <div key={item.id} className="flex flex-col gap-3">
              <div className="grid grid-cols-(--grid-cols-content-action) gap-3 sm:grid-cols-(--grid-cols-order-values)">
                <div className="min-w-0">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-sm text-muted-foreground">{formatWoltMoney(item.unitPrice, order.currency)} pr. stk.</p>
                </div>
                <p className="row-start-2 text-sm tabular-nums sm:col-start-2 sm:row-start-1 sm:text-right">{item.quantity} stk.</p>
                <p className="col-start-2 row-start-1 text-right font-semibold tabular-nums sm:col-start-3">{formatWoltMoney(item.lineTotal, order.currency)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <MappingBadge item={item} />
                {item.mapping ? <span className="text-sm text-muted-foreground">{item.mapping.productName}</span> : null}
              </div>
              {item.gtin || item.posId || item.sku ? (
                <Collapsible>
                  <CollapsibleTrigger render={<Button variant="ghost" className="min-h-11" aria-label={`Produkt-id’er for ${item.name}`} />}>
                    Produkt-id’er
                    <ChevronDownIcon data-icon="inline-end" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <dl className="flex flex-col gap-1 py-2">
                      <Identifier label="GTIN" value={item.gtin} />
                      <Identifier label="POS-id" value={item.posId} />
                      <Identifier label="SKU" value={item.sku} />
                    </dl>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}
              <Separator />
            </div>
          ))}
        </div>
        {order.mappingTruncated ? (
          <Alert>
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>Koblingslisten er afkortet</AlertTitle>
            <AlertDescription>
              Nogle produktkoblinger kunne ikke vurderes i denne visning.
            </AlertDescription>
          </Alert>
        ) : null}
      </section>

      <section aria-labelledby="wolt-order-history" className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Clock3Icon aria-hidden="true" />
          <h2 id="wolt-order-history" className="font-heading text-base font-medium">
            Statushistorik
          </h2>
        </div>
        {order.history.length ? (
          <ol className="flex flex-col gap-3">
            {order.history.map((event) => (
              <li key={`${event.eventId}-${event.receivedAt}`} className="flex gap-3">
                <span className="mt-1 size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{event.providerStatus}</span>
                    <span className="text-sm text-muted-foreground">
                      {formatWoltDateTime(event.eventCreatedAt)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Modtaget {formatWoltDateTime(event.receivedAt)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">Ingen statusændringer er registreret.</p>
        )}
      </section>

      <Separator />
      <p className="text-xs text-muted-foreground">
        Forbrugeroplysninger gemmes eller vises ikke i systemet.
      </p>
    </div>
  );
}

export function WoltOrderDetail({
  orderId,
  onClose,
}: {
  orderId: Id<"woltOrders"> | null;
  onClose: () => void;
}) {
  const order = useQuery(
    api.wolt.getOrder,
    orderId ? { orderId } : "skip",
  );

  return (
    <Sheet open={orderId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full max-w-xl overflow-y-auto sm:max-w-xl"
      >
        <SheetHeader appearance="separated">
          <SheetTitle>
            {order ? `Wolt-ordre ${order.displayNumber}` : "Wolt-ordre"}
          </SheetTitle>
          <SheetDescription>
            Ordrelinjer og status uden forbrugeroplysninger.
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
          <OrderDetailContent order={order} />
        )}
      </SheetContent>
    </Sheet>
  );
}
