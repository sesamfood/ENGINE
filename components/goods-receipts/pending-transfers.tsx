"use client";

import { dateTimeFormatter as sharedDateTimeFormatter } from "@/lib/date";

import { useQuery } from "convex/react";
import { ArrowRightIcon, PackageCheckIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useAccess, usePermission } from "@/components/app-shell";
import { useGoodsReceiptContext } from "@/components/goods-receipts/goods-receipt-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";

const dateFormatter = sharedDateTimeFormatter("da-DK", {
  dateStyle: "long",
});
const timeFormatter = sharedDateTimeFormatter("da-DK", {
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
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
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

  if (result === undefined) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (result.transfers.length === 0) {
    return (
      <Empty appearance="outlined" className="min-h-80">
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

  const dateGroups = new Map<string, typeof result.transfers>();
  for (const transfer of [...result.transfers].sort((a, b) => a.transferredAt - b.transferredAt)) {
    const date = dateFormatter.format(transfer.transferredAt);
    const transfers = dateGroups.get(date) ?? [];
    transfers.push(transfer);
    dateGroups.set(date, transfers);
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

      <div className="flex flex-col gap-6">
        {[...dateGroups].map(([date, transfers]) => (
          <section key={date} className="flex flex-col gap-2" aria-label={`Transfers fra ${date}`}>
            <h3 className="font-semibold">{date}</h3>
            <ul className="flex flex-col gap-1">
              {transfers.map((transfer, index) => (
                <li key={transfer.id} className="flex flex-col gap-1">
                  {index > 0 ? <Separator /> : null}
                  <Link
                    href={`/goods-receipts/${transfer.id}`}
                    aria-label={`Registrér transfer fra ${transfer.fromLocationName} til ${transfer.toLocationName}, ${date} kl. ${timeFormatter.format(transfer.transferredAt)}`}
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "lg" }),
                      "grid h-auto min-h-16 w-full justify-stretch gap-2 px-3 py-3 sm:grid-cols-3",
                    )}
                  >
                    <span className="min-w-0 whitespace-normal">{transfer.fromLocationName}</span>
                    <time dateTime={new Date(transfer.transferredAt).toISOString()} className="text-sm text-muted-foreground sm:text-center">
                      Kl. {timeFormatter.format(transfer.transferredAt)}
                    </time>
                    <span className="flex items-center gap-2 sm:justify-end">
                      Registrér modtagelse
                      <ArrowRightIcon aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
