"use client";

import { dateTimeFormatter as sharedDateTimeFormatter } from "@/lib/date";

import { useConvex } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowRightIcon, ShoppingCartIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AppBottomBar } from "@/components/app-bottom-bar";
import { TransferForm, type TransferOrder } from "@/components/transfers/transfer-form";
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

const dateTimeFormatter = sharedDateTimeFormatter("da-DK", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function InternalOrders({
  orders,
  navigation,
}: {
  orders: OpenOrders;
  navigation?: ReactNode;
}) {
  const convex = useConvex();
  const [loadingId, setLoadingId] = useState<Id<"orders"> | null>(null);
  const [order, setOrder] = useState<TransferOrder | null>(null);

  async function open(orderId: Id<"orders">) {
    if (loadingId) return;
    setLoadingId(orderId);
    try {
      const result = await convex.query(api.internalOrders.getOpenOrder, {
        orderId,
      });
      if (!result) toast.error("Der er allerede oprettet en transfer for bestillingen");
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
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Mængderne er udfyldt fra bestillingen. Ret dem, hvis I sender noget
          andet. Bestillingen lukkes, når transferen er gemt.
        </p>
        <TransferForm
          key={order.id}
          order={order}
          navigation={navigation}
          onSaved={() => setOrder(null)}
          onCancel={() => setOrder(null)}
        />
      </div>
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
