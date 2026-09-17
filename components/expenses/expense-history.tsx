"use client";

import { useIntegrations } from "@/integrations/use-integrations";

import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { FileTextIcon, ReceiptTextIcon } from "lucide-react";
import { toast } from "sonner";
import { usePermission } from "@/components/app-shell";
import { LocationField } from "@/components/location-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { expenseCategories, formatExpenseAmount } from "@/lib/expenses";
import { selectedLocationId } from "@/lib/location-preference";
import { getUserErrorMessage } from "@/lib/user-errors";
import { setRegistrationLocation, useWasteLocation } from "@/lib/waste-prefs";

const PAGE_SIZE = 30;
const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "short",
  timeZone: "UTC",
});
const periodFormatter = new Intl.DateTimeFormat("da-DK", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const timestampFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Europe/Copenhagen",
});
const noticeLabels = {
  notConfigured: "Ingen modtagere",
  pending: "Afventer afsendelse",
  sending: "Sender",
  sent: "Sendt",
  failed: "Afsendelse fejlede",
} satisfies Record<Doc<"expenses">["noticeStatus"], string>;
const economicLabels = {
  notRequested: "Ikke overført",
  pending: "Afventer overførsel",
  sending: "Overfører",
  created: "Kladde oprettet",
  failed: "Overførsel fejlede",
  uncertain: "Kontrollér i e-conomic",
} satisfies Record<Doc<"expenses">["economicStatus"], string>;

function ExpenseStatuses({
  expense,
  economicConfigured,
}: {
  expense: Pick<Doc<"expenses">, "noticeStatus" | "economicStatus">;
  economicConfigured: boolean;
}) {
  const integrations = useIntegrations();
  return (
    <div className="flex flex-wrap gap-2">
      <Badge
        variant={expense.noticeStatus === "failed" ? "destructive" : "outline"}
      >
        E-mail: {noticeLabels[expense.noticeStatus]}
      </Badge>
      {integrations?.economic && economicConfigured ? <Badge
        variant={
          expense.economicStatus === "failed" ||
          expense.economicStatus === "uncertain"
            ? "destructive"
            : "secondary"
        }
      >
        e-conomic: {economicLabels[expense.economicStatus]}
      </Badge> : null}
    </div>
  );
}

function ExpenseDetails({ expenseId }: { expenseId: Id<"expenses"> }) {
  const expense = useQuery(api.expenses.get, { expenseId });
  const requestExport = useMutation(api.expenses.requestEconomicExport);
  const retryNotice = useMutation(api.expenses.retryNotice);
  const integrations = useIntegrations();
  const canExport = usePermission("expenses.exportEconomic") && integrations?.economic === true;
  const canCreate = usePermission("expenses.create");
  const [confirmExport, setConfirmExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [retrying, setRetrying] = useState(false);

  async function sendToEconomic() {
    if (exporting) return;
    setExporting(true);
    try {
      await requestExport({ expenseId });
      setConfirmExport(false);
      toast.success("Udgiften er sat i kø til e-conomic.");
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Udgiften kunne ikke sendes til e-conomic. Prøv igen.",
        ),
      );
    } finally {
      setExporting(false);
    }
  }

  async function resendNotice() {
    if (retrying) return;
    setRetrying(true);
    try {
      await retryNotice({ expenseId });
      toast.success("E-mailen er sat i kø til afsendelse.");
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "E-mailen kunne ikke sendes. Prøv igen."),
      );
    } finally {
      setRetrying(false);
    }
  }

  if (expense === undefined) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Udgift</DialogTitle>
          <DialogDescription>Henter udgiften…</DialogDescription>
        </DialogHeader>
        <Skeleton className="h-64 w-full" />
      </>
    );
  }
  if (!expense) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Udgift ikke fundet</DialogTitle>
          <DialogDescription>
            Udgiften findes ikke, eller du har ikke adgang til den.
          </DialogDescription>
        </DialogHeader>
      </>
    );
  }
  const category = expenseCategories.find(
    (option) => option.id === expense.categoryId,
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle className="break-words">{expense.supplier}</DialogTitle>
        <DialogDescription>
          {expense.locationName} ·{" "}
          {dateFormatter.format(new Date(`${expense.date}T00:00:00Z`))}
        </DialogDescription>
      </DialogHeader>
      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto">
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Kategori</dt>
            <dd>{category?.label}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Periode</dt>
            <dd>
              {periodFormatter.format(
                new Date(`${expense.period}-01T00:00:00Z`),
              )}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Registreret af</dt>
            <dd>{expense.registeredByName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Registreret</dt>
            <dd>{timestampFormatter.format(expense.registeredAt)}</dd>
          </div>
          {expense.comment ? (
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Kommentar</dt>
              <dd className="whitespace-pre-wrap break-words">
                {expense.comment}
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableBody>
              <TableRow>
                <TableCell>Beløb ekskl. moms</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatExpenseAmount(expense.netAmount, expense.currency)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Moms · {expense.vatRate} %</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatExpenseAmount(expense.vatAmount, expense.currency)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Beløb inkl. moms</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatExpenseAmount(expense.grossAmount, expense.currency)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <ExpenseStatuses expense={expense} economicConfigured={expense.economicConfigured} />
        {expense.noticeError ? (
          <Alert variant="destructive">
            <AlertTitle>E-mailen kunne ikke sendes</AlertTitle>
            <AlertDescription>{expense.noticeError}</AlertDescription>
          </Alert>
        ) : null}
        {integrations?.economic && expense.economicConfigured && expense.economicError ? (
          <Alert variant="destructive">
            <AlertTitle>
              {expense.economicStatus === "uncertain"
                ? "Kontrollér udgiften i e-conomic"
                : "Overførslen til e-conomic fejlede"}
            </AlertTitle>
            <AlertDescription>{expense.economicError}</AlertDescription>
          </Alert>
        ) : null}
        {integrations?.economic && expense.economicConfigured && expense.economicStatus === "uncertain" ? (
          <p className="text-sm text-muted-foreground">
            e-conomic kan have modtaget udgiften. Kontrollér kladden i
            e-conomic, før udgiften oprettes igen.
          </p>
        ) : null}
        {integrations?.economic && expense.economicConfigured && expense.economicEntryNumber !== undefined ? (
          <p className="text-sm">
            Postering i e-conomic: {expense.economicEntryNumber}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {expense.attachmentUrl && expense.attachment ? (
            <Button
              variant="outline"
              className="min-h-11 max-w-full"
              render={
                <a
                  href={expense.attachmentUrl}
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              <FileTextIcon data-icon="inline-start" />
              <span className="truncate">
                Åbn {expense.attachment.fileName}
              </span>
            </Button>
          ) : null}
          {canCreate && expense.noticeStatus === "failed" ? (
            <Button
              variant="outline"
              className="min-h-11"
              disabled={retrying}
              onClick={() => void resendNotice()}
            >
              {retrying ? <Spinner data-icon="inline-start" /> : null}Send
              e-mail igen
            </Button>
          ) : null}
          {canExport &&
          expense.economicConfigured &&
          expense.economicAvailable &&
          (expense.economicStatus === "notRequested" ||
            expense.economicStatus === "failed") ? (
            <Button className="min-h-11" onClick={() => setConfirmExport(true)}>
              {expense.economicStatus === "failed"
                ? "Prøv e-conomic igen"
                : "Opret i e-conomic"}
            </Button>
          ) : null}
        </div>
      </div>
      <AlertDialog
        open={integrations?.economic === true && expense.economicConfigured && confirmExport}
        onOpenChange={(open) => {
          if (!exporting) setConfirmExport(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Opret udgift i e-conomic?</AlertDialogTitle>
            <AlertDialogDescription>
              Udgiften til {expense.supplier} på{" "}
              {formatExpenseAmount(expense.grossAmount, expense.currency)}{" "}
              overføres til e-conomic som en kladde. Kladden skal kontrolleres
              og bogføres i e-conomic.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={exporting}>Annullér</AlertDialogCancel>
            <AlertDialogAction
              disabled={exporting}
              onClick={(event) => {
                event.preventDefault();
                void sendToEconomic();
              }}
            >
              {exporting ? <Spinner data-icon="inline-start" /> : null}Opret
              kladde
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function ExpenseHistory({ organizationId }: { organizationId: string }) {
  const locations = useQuery(api.expenses.getHistoryLocations, {});
  const storedLocationId = useWasteLocation(organizationId);
  const locationId = selectedLocationId({
    locations: locations ?? [],
    storedId: storedLocationId,
    lockedId: null,
    isLocked: false,
  });
  const location = locations?.find((option) => option.id === locationId);
  const [selectedExpenseId, setSelectedExpenseId] =
    useState<Id<"expenses"> | null>(null);
  const { results, status, loadMore } = usePaginatedQuery(
    api.expenses.list,
    location ? { locationId: location.id } : "skip",
    { initialNumItems: PAGE_SIZE },
  );
  const loading =
    locations === undefined ||
    Boolean(location && status === "LoadingFirstPage");

  return (
    <div className="flex flex-col gap-5">
      <FieldGroup className="max-w-sm">
        <Field>
          <FieldLabel htmlFor="expense-history-location">Lokation</FieldLabel>
          <LocationField
            id="expense-history-location"
            locations={locations}
            value={locationId}
            onValueChange={(value) => {
              setRegistrationLocation(organizationId, value);
              setSelectedExpenseId(null);
            }}
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
              Vælg en lokation for at se registrerede udgifter.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : results.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ReceiptTextIcon />
            </EmptyMedia>
            <EmptyTitle>Ingen registrerede udgifter</EmptyTitle>
            <EmptyDescription>
              Udgifter for {location.name} vises her, når de er registreret.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="hidden rounded-xl border lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Leverandør / modtager</TableHead>
                  <TableHead>Dato</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead className="text-right">Beløb inkl. moms</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="sr-only">Se udgift</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((expense) => (
                  <TableRow key={expense._id}>
                    <TableCell className="max-w-60 whitespace-normal break-words font-medium">
                      {expense.supplier}
                    </TableCell>
                    <TableCell>
                      {dateFormatter.format(
                        new Date(`${expense.date}T00:00:00Z`),
                      )}
                    </TableCell>
                    <TableCell>
                      {
                        expenseCategories.find(
                          (option) => option.id === expense.categoryId,
                        )?.label
                      }
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatExpenseAmount(
                        expense.grossAmount,
                        expense.currency,
                      )}
                    </TableCell>
                    <TableCell className="max-w-72">
                      <ExpenseStatuses expense={expense} economicConfigured={location.economicConfigured} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        className="min-h-11"
                        aria-label={`Se udgift til ${expense.supplier}`}
                        onClick={() => setSelectedExpenseId(expense._id)}
                      >
                        Se udgift
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="flex flex-col gap-3 lg:hidden">
            {results.map((expense) => (
              <li key={expense._id}>
                <Card>
                  <CardHeader>
                    <CardTitle className="break-words">
                      {expense.supplier}
                    </CardTitle>
                    <CardDescription>
                      {dateFormatter.format(
                        new Date(`${expense.date}T00:00:00Z`),
                      )}{" "}
                      ·{" "}
                      {
                        expenseCategories.find(
                          (option) => option.id === expense.categoryId,
                        )?.label
                      }
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <p className="font-semibold tabular-nums">
                      {formatExpenseAmount(
                        expense.grossAmount,
                        expense.currency,
                      )}
                    </p>
                    <ExpenseStatuses expense={expense} economicConfigured={location.economicConfigured} />
                  </CardContent>
                  <CardFooter>
                    <Button
                      variant="outline"
                      className="min-h-11 w-full"
                      aria-label={`Se udgift til ${expense.supplier}`}
                      onClick={() => setSelectedExpenseId(expense._id)}
                    >
                      Se udgift
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
            Vis flere udgifter
          </Button>
        </div>
      ) : null}
      <Dialog
        open={selectedExpenseId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedExpenseId(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] sm:max-w-2xl">
          {selectedExpenseId ? (
            <ExpenseDetails
              key={selectedExpenseId}
              expenseId={selectedExpenseId}
            />
          ) : (
            <DialogHeader>
              <DialogTitle>Udgift</DialogTitle>
            </DialogHeader>
          )}
          <DialogFooter showCloseButton />
        </DialogContent>
      </Dialog>
    </div>
  );
}
