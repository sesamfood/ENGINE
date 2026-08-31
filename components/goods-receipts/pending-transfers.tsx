"use client";

import { useQuery } from "convex/react";
import {
  ArrowRightIcon,
  Clock3Icon,
  PackageCheckIcon,
  PackageIcon,
} from "lucide-react";
import Link from "next/link";
import { useAccess, usePermission } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";

const dateTimeFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "medium",
  timeStyle: "short",
});

const quantityFormatter = new Intl.NumberFormat("da-DK", {
  maximumFractionDigits: 6,
});

export function PendingTransfers() {
  const access = useAccess();
  const canRegister = usePermission("goodsReceipts.register");
  const result = useQuery(
    api.goodsReceipts.listPendingTransfers,
    canRegister ? {} : "skip",
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
            Nye transfers vises her, indtil den modtagne mængde er registreret.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex max-w-2xl flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight">
          Transfers der afventer modtagelse
        </h2>
        <p className="text-sm text-muted-foreground">
          Åbn en transfer for at registrere de mængder, lokationen har modtaget.
        </p>
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
                <CardDescription className="flex items-center gap-1.5">
                  <Clock3Icon aria-hidden="true" />
                  {dateTimeFormatter.format(transfer.transferredAt)}
                </CardDescription>
                <CardAction>
                  <Badge variant="secondary">Transfer</Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex flex-col gap-1">
                    <dt className="text-muted-foreground">Produktlinjer</dt>
                    <dd className="flex items-center gap-1.5 font-medium tabular-nums">
                      <PackageIcon aria-hidden="true" />
                      {transfer.itemCount}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-muted-foreground">Samlet mængde</dt>
                    <dd className="font-medium tabular-nums">
                      {quantityFormatter.format(transfer.totalQuantity)}
                    </dd>
                  </div>
                </dl>
              </CardContent>
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
