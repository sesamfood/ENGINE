"use client";

import Image from "next/image";
import { useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { FileImageIcon, ReceiptTextIcon } from "lucide-react";
import { useKiosk } from "@/components/app-shell";
import { CreatableCombobox } from "@/components/catalog/creatable-combobox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { dateTimeFormatter } from "@/lib/date";
import { authClient } from "@/lib/auth-client";
import { selectedLocationId } from "@/lib/location-preference";
import { setRegistrationLocation, useWasteLocation } from "@/lib/waste-prefs";

const dateFormatter = dateTimeFormatter("da-DK", {
  dateStyle: "short",
  timeStyle: "short",
});
const quantityFormatter = new Intl.NumberFormat("da-DK", {
  maximumFractionDigits: 6,
});
const PAGE_SIZE = 25;

function InvoiceDetails({ invoiceId }: { invoiceId: Id<"invoices"> }) {
  const invoice = useQuery(api.invoices.get, { invoiceId });
  if (invoice === undefined) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Kvittering</DialogTitle>
          <DialogDescription>Henter kvitteringen…</DialogDescription>
        </DialogHeader>
        <Skeleton className="h-64 w-full" />
      </>
    );
  }
  if (!invoice) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Kvittering ikke fundet</DialogTitle>
        </DialogHeader>
        <Alert>
          <AlertTitle>Kvitteringen er ikke tilgængelig</AlertTitle>
          <AlertDescription>
            Den findes ikke, eller du har ikke adgang til den.
          </AlertDescription>
        </Alert>
      </>
    );
  }
  return (
    <>
      <DialogHeader>
        <DialogTitle>{invoice.title}</DialogTitle>
        <DialogDescription>
          {invoice.locationName} · {dateFormatter.format(invoice.soldAt)}
        </DialogDescription>
      </DialogHeader>
      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Registreret af</dt>
            <dd>{invoice.registeredByName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Produktlinjer</dt>
            <dd>{invoice.items.length}</dd>
          </div>
          {invoice.comment ? (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Kommentar</dt>
              <dd className="whitespace-pre-wrap break-words">
                {invoice.comment}
              </dd>
            </div>
          ) : null}
        </dl>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produkt</TableHead>
              <TableHead className="text-right">Mængde</TableHead>
              <TableHead>Enhed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoice.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="whitespace-normal">
                  <div className="flex flex-col gap-1">
                    <span>{item.productName}</span>
                    {item.menuName ? (
                      <span className="text-xs text-muted-foreground">
                        {item.menuName}
                        {item.menuQuantity
                          ? ` × ${quantityFormatter.format(item.menuQuantity)}`
                          : ""}
                        {item.menuGroupTitle ? ` · ${item.menuGroupTitle}` : ""}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {quantityFormatter.format(item.quantity)}
                </TableCell>
                <TableCell>{item.unitName}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {invoice.receiptUrl ? (
          <div className="flex flex-col gap-2">
            <h3 className="font-medium">Billede af kvittering</h3>
            <a
              href={invoice.receiptUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Åbn billedet af kvitteringen i en ny fane"
              className="relative block h-80 rounded-lg border focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Image
                src={invoice.receiptUrl}
                alt={`Kvittering for ${invoice.title}`}
                fill
                sizes="(max-width: 640px) 90vw, 640px"
                className="object-contain"
              />
            </a>
          </div>
        ) : null}
      </div>
    </>
  );
}

export function InvoiceHistory() {
  const kiosk = useKiosk();
  const organization = authClient.useActiveOrganization();
  const organizationId = organization.data?.id;
  const storedLocationId = useWasteLocation(organizationId);
  const locations = useQuery(api.invoices.listLocations, { page: "history" });
  const [selectedInvoiceId, setSelectedInvoiceId] =
    useState<Id<"invoices"> | null>(null);
  const locationId = selectedLocationId({
    locations: locations ?? [],
    storedId: storedLocationId,
    lockedId: kiosk?.locationId ?? null,
    isLocked: Boolean(kiosk?.isKioskAccount),
  });
  const location = locations?.find((option) => option.id === locationId);
  const { results, status, loadMore } = usePaginatedQuery(
    api.invoices.list,
    location ? { locationId: location.id } : "skip",
    { initialNumItems: PAGE_SIZE },
  );
  const loading =
    locations === undefined ||
    Boolean(location && status === "LoadingFirstPage");

  return (
    <div className="flex flex-col gap-6">
      <FieldGroup className="max-w-sm">
        <Field>
          <FieldLabel>Lokation</FieldLabel>
          <CreatableCombobox
            options={(locations ?? []).map((option) => ({
              value: option.id,
              label: option.name,
            }))}
            value={location?.id ?? null}
            onValueChange={(value) => {
              const nextLocation = locations?.find(
                (option) => option.id === value,
              );
              if (organizationId && nextLocation) {
                setRegistrationLocation(organizationId, nextLocation.id);
              }
              setSelectedInvoiceId(null);
            }}
            placeholder="Vælg lokation"
            ariaLabel="Lokation for kvitteringshistorik"
            disabled={locations === undefined || Boolean(kiosk?.isKioskAccount)}
          />
        </Field>
      </FieldGroup>
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : !location ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Ingen lokation valgt</EmptyTitle>
            <EmptyDescription>
              Vælg en lokation for at se registrerede kvitteringer.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : results.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ReceiptTextIcon />
            </EmptyMedia>
            <EmptyTitle>Ingen registrerede kvitteringer</EmptyTitle>
            <EmptyDescription>
              Registrerede kvitteringer for {location.name} vises her.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="hidden rounded-xl border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titel</TableHead>
                  <TableHead>Dato</TableHead>
                  <TableHead>Lokation</TableHead>
                  <TableHead>Registreret af</TableHead>
                  <TableHead className="text-right">Produktlinjer</TableHead>
                  <TableHead>
                    <span className="sr-only">Billede</span>
                  </TableHead>
                  <TableHead>
                    <span className="sr-only">Se kvittering</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="max-w-72 whitespace-normal break-words font-medium">
                      {invoice.title}
                    </TableCell>
                    <TableCell>
                      {dateFormatter.format(invoice.soldAt)}
                    </TableCell>
                    <TableCell>{invoice.locationName}</TableCell>
                    <TableCell>{invoice.registeredByName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {invoice.itemCount}
                    </TableCell>
                    <TableCell>
                      {invoice.hasPhoto ? (
                        <FileImageIcon
                          className="size-4"
                          aria-label="Med billede"
                        />
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        className="min-h-11"
                        onClick={() => setSelectedInvoiceId(invoice.id)}
                        aria-label={`Se kvittering: ${invoice.title}`}
                      >
                        Se kvittering
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="flex flex-col gap-3 md:hidden">
            {results.map((invoice) => (
              <li key={invoice.id}>
                <Card>
                  <CardHeader>
                    <CardTitle>{invoice.title}</CardTitle>
                    <CardDescription>
                      {dateFormatter.format(invoice.soldAt)} ·{" "}
                      {invoice.locationName}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-2">
                    <p className="w-full text-muted-foreground">
                      Registreret af {invoice.registeredByName}
                    </p>
                    <Badge variant="secondary">
                      {invoice.itemCount}{" "}
                      {invoice.itemCount === 1
                        ? "produktlinje"
                        : "produktlinjer"}
                    </Badge>
                    {invoice.hasPhoto ? (
                      <Badge variant="outline">
                        <FileImageIcon data-icon="inline-start" />
                        Med billede
                      </Badge>
                    ) : null}
                  </CardContent>
                  <CardFooter>
                    <Button
                      variant="outline"
                      className="min-h-11 w-full"
                      onClick={() => setSelectedInvoiceId(invoice.id)}
                      aria-label={`Se kvittering: ${invoice.title}`}
                    >
                      Se kvittering
                    </Button>
                  </CardFooter>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
      {location && (status === "CanLoadMore" || status === "LoadingMore") ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            className="min-h-11"
            disabled={status === "LoadingMore"}
            onClick={() => loadMore(PAGE_SIZE)}
          >
            {status === "LoadingMore" ? (
              <Spinner data-icon="inline-start" />
            ) : null}
            Vis flere kvitteringer
          </Button>
        </div>
      ) : null}
      <Dialog
        open={selectedInvoiceId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedInvoiceId(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl">
          {selectedInvoiceId ? (
            <InvoiceDetails invoiceId={selectedInvoiceId} />
          ) : (
            <DialogHeader>
              <DialogTitle>Kvittering</DialogTitle>
            </DialogHeader>
          )}
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </div>
  );
}
