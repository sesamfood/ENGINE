"use client";

import { dateTimeFormatter as sharedDateTimeFormatter } from "@/lib/date";

import { useConvex, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowRightIcon,
  ShoppingCartIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AppBottomBar } from "@/components/app-bottom-bar";
import { TransferForm } from "@/components/transfers/transfer-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getUserErrorMessage } from "@/lib/user-errors";

type OpenOrders = NonNullable<
  FunctionReturnType<typeof api.internalOrders.listOpenOrders>
>;

type OpenOrder = Exclude<
  FunctionReturnType<typeof api.internalOrders.getOpenOrder>,
  "cancelled" | null
>;

const dateTimeFormatter = sharedDateTimeFormatter("da-DK", {
  dateStyle: "medium",
  timeStyle: "short",
});

function OrderTransfer({
  order,
  navigation,
  onClose,
}: {
  order: OpenOrder;
  navigation?: ReactNode;
  onClose: () => void;
}) {
  const liveOrder = useQuery(api.internalOrders.getOpenOrder, {
    orderId: order.id,
  });

  useEffect(() => {
    if (liveOrder !== "cancelled") return;
    toast.error("Bestillingen er annulleret");
    onClose();
  }, [liveOrder, onClose]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Mængderne er udfyldt fra bestillingen. Ret dem, hvis I sender noget
        andet. Bestillingen lukkes, når transferen er gemt.
      </p>
      {order.unavailableItems.length > 0 ? (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>Ikke med i transferen</AlertTitle>
          <AlertDescription>
            Disse Produkter er ikke længere aktive:{" "}
            {order.unavailableItems
              .map(
                (item) =>
                  `${item.productName} (${item.quantity} ${item.unitName})`,
              )
              .join(", ")}
          </AlertDescription>
        </Alert>
      ) : null}
      <TransferForm
        key={order.id}
        order={order}
        navigation={navigation}
        onSaved={onClose}
        onCancel={onClose}
      />
    </div>
  );
}

export function InternalOrders({
  orders,
  navigation,
}: {
  orders: OpenOrders;
  navigation?: ReactNode;
}) {
  const convex = useConvex();
  const [loadingId, setLoadingId] = useState<Id<"orders"> | null>(null);
  const [order, setOrder] = useState<OpenOrder | null>(null);

  async function open(orderId: Id<"orders">) {
    if (loadingId) return;
    setLoadingId(orderId);
    try {
      const result = await convex.query(api.internalOrders.getOpenOrder, {
        orderId,
      });
      if (result === "cancelled") toast.error("Bestillingen er annulleret");
      else if (!result)
        toast.error("Der er allerede oprettet en transfer for bestillingen");
      else if (!result.items.length)
        toast.error("Bestillingen har ingen Produkter, der kan sendes");
      else setOrder(result);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Bestillingen kunne ikke åbnes"));
    } finally {
      setLoadingId(null);
    }
  }

  if (order) {
    return (
      <OrderTransfer
        order={order}
        navigation={navigation}
        onClose={() => setOrder(null)}
      />
    );
  }

  return (
    <>
      {orders.length === 0 ? (
        <Empty appearance="outlined" className="min-h-80">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShoppingCartIcon />
            </EmptyMedia>
            <EmptyTitle>Ingen åbne bestillinger</EmptyTitle>
            <EmptyDescription>
              Interne bestillinger til dine lokationer vises her.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {orders.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={loadingId !== null}
              aria-label={`Opret transfer fra ${item.fulfillingLocationName} til ${item.locationName}`}
              className="group rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              onClick={() => void open(item.id)}
            >
              <Card appearance="link" className="h-full">
                <CardHeader>
                  <CardTitle>
                    {item.fulfillingLocationName} → {item.locationName}
                  </CardTitle>
                  <CardDescription>
                    {dateTimeFormatter.format(item.createdAt)} ·{" "}
                    {item.createdByName}
                  </CardDescription>
                  <CardAction>
                    <Badge variant="secondary">{item.itemCount} Produkter</Badge>
                  </CardAction>
                </CardHeader>
                <CardFooter appearance="emphasized" className="justify-between">
                  <span>Opret transfer</span>
                  {loadingId === item.id ? (
                    <Spinner />
                  ) : (
                    <ArrowRightIcon aria-hidden="true" />
                  )}
                </CardFooter>
              </Card>
            </button>
          ))}
        </div>
      )}
      {navigation ? (
        <AppBottomBar>
          <div className="mx-auto w-full max-w-(--container-page)">
            {navigation}
          </div>
        </AppBottomBar>
      ) : null}
    </>
  );
}
