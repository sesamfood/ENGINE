"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  useConvex,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { DownloadIcon, PackageXIcon, RotateCcwIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadCsv } from "@/lib/download-csv";
import { useKiosk, usePermission } from "@/components/app-shell";

type NoticeStatus =
  | "notConfigured"
  | "pending"
  | "sent"
  | "failed"
  | "skipped";

type Row = {
  id: Id<"badDeliveries">;
  registeredAt: number;
  locationId: Id<"locations">;
  locationName: string;
  registeredByName: string;
  itemCount: number;
  deductFromStock: boolean;
  initialNoticeStatus: NoticeStatus;
  cancellationNoticeStatus: NoticeStatus;
  status: "active" | "voided";
};

type ExportRow = {
  badDeliveryId: Id<"badDeliveries">;
  registeredAt: number;
  locationName: string;
  registeredByName: string;
  productName: string;
  quantity: number;
  unitName: string;
  deductFromStock: boolean;
  comment: string | null;
  status: "active" | "voided";
  initialNoticeStatus: NoticeStatus;
  to: string[];
  cc: string[];
  bcc: string[];
  voidedAt: number | null;
  voidedByName: string | null;
  cancellationNoticeStatus: NoticeStatus;
};

const noticeLabels: Record<NoticeStatus, string> = {
  notConfigured: "Ikke konfigureret",
  pending: "Afventer",
  sent: "Sendt",
  failed: "Fejlet",
  skipped: "Sprunget over",
};

function noticeBadge(status: NoticeStatus) {
  const variant =
    status === "failed"
      ? "destructive"
      : status === "sent"
        ? "default"
        : status === "pending"
          ? "secondary"
          : "outline";
  return <Badge variant={variant}>{noticeLabels[status]}</Badge>;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("da-DK", { maximumFractionDigits: 6 }).format(
    value,
  );
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en fejl";
}

function NoticeAudit({
  title,
  notice,
  formatter,
}: {
  title: string;
  notice: {
    status: NoticeStatus;
    attemptedAt: number | null;
    sentAt: number | null;
    providerId: string | null;
    failureMessage: string | null;
  };
  formatter: Intl.DateTimeFormat;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">{title}</h3>
        {noticeBadge(notice.status)}
      </div>
      <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2 text-sm">
        <dt className="text-muted-foreground">Forsøgt</dt>
        <dd>{notice.attemptedAt ? formatter.format(notice.attemptedAt) : "–"}</dd>
        <dt className="text-muted-foreground">Sendt</dt>
        <dd>{notice.sentAt ? formatter.format(notice.sentAt) : "–"}</dd>
        <dt className="text-muted-foreground">Provider-ID</dt>
        <dd className="break-all">{notice.providerId ?? "–"}</dd>
        {notice.failureMessage ? (
          <>
            <dt className="text-muted-foreground">Fejl</dt>
            <dd>{notice.failureMessage}</dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}

export function BadDeliveriesReportSection({
  startAt,
  endAt,
  locationId,
  formatter,
  from,
  to,
  rangeValid,
}: {
  startAt: number;
  endAt: number;
  locationId?: Id<"locations">;
  formatter: Intl.DateTimeFormat;
  from: string;
  to: string;
  rangeValid: boolean;
}) {
  const convex = useConvex();
  const kiosk = useKiosk();
  const canExport = usePermission("waste.export") || Boolean(kiosk?.kioskModeEnabled && kiosk.settings?.enabledPages.includes("waste.report"));
  const args = rangeValid
    ? { startAt, endAt, ...(locationId ? { locationId } : {}) }
    : "skip";
  const { results, status, loadMore } = usePaginatedQuery(
    api.badDeliveries.listBadDeliveries,
    args,
    { initialNumItems: 20 },
  );
  const [selectedId, setSelectedId] = useState<Id<"badDeliveries">>();
  const detail = useQuery(
    api.badDeliveries.getBadDelivery,
    selectedId ? { badDeliveryId: selectedId } : "skip",
  );
  const voidDelivery = useMutation(api.badDeliveries.voidBadDelivery);
  const retryNotice = useMutation(api.badDeliveries.retryBadDeliveryNotice);
  const [confirmingVoid, setConfirmingVoid] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [working, setWorking] = useState<string>();
  const [exporting, setExporting] = useState(false);

  async function retry(kind: "initial" | "cancellation") {
    if (!selectedId) return;
    setWorking(kind);
    try {
      await retryNotice({ badDeliveryId: selectedId, kind });
      toast.success("Meddelelsen sendes nu");
    } catch (error) {
      toast.error(message(error));
    } finally {
      setWorking(undefined);
    }
  }

  async function voidSelected() {
    if (!selectedId) return;
    setWorking("void");
    try {
      await voidDelivery({ badDeliveryId: selectedId, reason: voidReason });
      toast.success("Registreringen er annulleret");
      setConfirmingVoid(false);
    } catch (error) {
      toast.error(message(error));
    } finally {
      setWorking(undefined);
    }
  }

  async function exportRows() {
    if (args === "skip") return;
    setExporting(true);
    try {
      const rows: ExportRow[] = [];
      let cursor: string | null = null;
      let done = false;
      while (!done) {
        const page: {
          page: Array<{ rows: ExportRow[] }>;
          continueCursor: string;
          isDone: boolean;
        } = await convex.query(api.badDeliveries.exportBadDeliveries, {
          ...args,
          paginationOpts: {
            numItems: 10,
            cursor,
            maximumRowsRead: 10,
          },
        });
        rows.push(...page.page.flatMap((entry) => entry.rows));
        cursor = page.continueCursor;
        done = page.isDone;
      }
      downloadCsv(
        `daarlige-leveringer-${from}-${to}.csv`,
        [
          "Reference",
          "Dato og tid",
          "Lokation",
          "Registreret af",
          "Produkt",
          "Mængde",
          "Enhed",
          "Trukket fra lager",
          "Kommentar",
          "Status",
          "Oprindelig e-mail",
          "Til",
          "CC",
          "BCC",
          "Annullering",
          "Annulleringsmail",
        ],
        rows.map((row) => [
          String(row.badDeliveryId),
          formatter.format(row.registeredAt),
          row.locationName,
          row.registeredByName,
          row.productName,
          String(row.quantity).replace(".", ","),
          row.unitName,
          row.deductFromStock ? "Ja" : "Nej",
          row.comment ?? "",
          row.status === "active" ? "Aktiv" : "Annulleret",
          noticeLabels[row.initialNoticeStatus],
          row.to.join(", "),
          row.cc.join(", "),
          row.bcc.join(", "),
          row.voidedAt
            ? `${formatter.format(row.voidedAt)}${row.voidedByName ? ` af ${row.voidedByName}` : ""}`
            : "",
          noticeLabels[row.cancellationNoticeStatus],
        ]),
      );
    } catch (error) {
      toast.error(message(error));
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="sm:grid-cols-[1fr_auto]">
          <CardTitle>Dårlige leveringer</CardTitle>
          {canExport ? (
            <Button
              variant="outline"
              disabled={exporting || !rangeValid}
              onClick={() => void exportRows()}
            >
              {exporting ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <DownloadIcon data-icon="inline-start" />
              )}
              Eksportér dårlige leveringer
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {status === "LoadingFirstPage" ? (
            <Skeleton className="h-56" />
          ) : results.length ? (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tidspunkt</TableHead>
                    <TableHead>Lokation</TableHead>
                    <TableHead>Registreret af</TableHead>
                    <TableHead>Varelinjer</TableHead>
                    <TableHead>Lager</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(results as Row[]).map((row) => (
                    <TableRow
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Åbn registrering af dårlig levering på ${row.locationName}`}
                      className="cursor-pointer focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
                      onClick={() => setSelectedId(row.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedId(row.id);
                        }
                      }}
                    >
                      <TableCell>{formatter.format(row.registeredAt)}</TableCell>
                      <TableCell>{row.locationName}</TableCell>
                      <TableCell>{row.registeredByName}</TableCell>
                      <TableCell>{row.itemCount}</TableCell>
                      <TableCell>{row.deductFromStock ? "Trukket" : "Uændret"}</TableCell>
                      <TableCell>{noticeBadge(row.initialNoticeStatus)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={row.status === "active" ? "secondary" : "outline"}
                        >
                          {row.status === "active" ? "Aktiv" : "Annulleret"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {status === "CanLoadMore" ? (
                <div className="mt-4 flex justify-center">
                  <Button variant="outline" onClick={() => loadMore(20)}>
                    Indlæs flere
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <Empty className="min-h-44">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PackageXIcon />
                </EmptyMedia>
                <EmptyTitle>Ingen dårlige leveringer</EmptyTitle>
                <EmptyDescription>
                  Der er ingen registreringer i den valgte periode.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selectedId)}
        onOpenChange={(open) => !open && setSelectedId(undefined)}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
          {!detail ? (
            <Skeleton className="h-96" />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Dårlig levering</DialogTitle>
                <DialogDescription>
                  {formatter.format(detail.registeredAt)} · {detail.locationName} ·
                  Reference {String(detail.id)}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 sm:grid-cols-2">
                {detail.attachments
                  .toSorted((a, b) => a.kind.localeCompare(b.kind))
                  .map((attachment) => (
                    <a
                      key={attachment.kind}
                      href={attachment.url ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="flex flex-col gap-2 rounded-xl border p-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span className="font-medium">
                        {attachment.kind === "badProducts"
                          ? "Dårlige varer"
                          : "Følgeseddel"}
                      </span>
                      {attachment.url ? (
                        <div
                          role="img"
                          aria-label={
                            attachment.kind === "badProducts"
                              ? "Foto af dårlige varer"
                              : "Foto af følgeseddel"
                          }
                          className="aspect-video w-full rounded-lg bg-contain bg-center bg-no-repeat"
                          style={{
                            backgroundImage: `url("${attachment.url}")`,
                          }}
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Billedet er ikke tilgængeligt
                        </span>
                      )}
                    </a>
                  ))}
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produkt</TableHead>
                    <TableHead>Mængde</TableHead>
                    <TableHead>Enhed</TableHead>
                    <TableHead>Standardmængde</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.productName}</TableCell>
                      <TableCell>{formatQuantity(item.quantity)}</TableCell>
                      <TableCell>{item.unitName}</TableCell>
                      <TableCell>
                        {formatQuantity(item.defaultQuantity)} {item.defaultUnitName}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 text-sm">
                <dt className="text-muted-foreground">Registreret af</dt>
                <dd>{detail.registeredByName}</dd>
                <dt className="text-muted-foreground">Kommentar</dt>
                <dd>{detail.comment ?? "Ingen kommentar"}</dd>
                <dt className="text-muted-foreground">Lager</dt>
                <dd>
                  {detail.deductFromStock
                    ? "Varerne er trukket fra lageret"
                    : "Lageret er ikke ændret"}
                </dd>
                <dt className="text-muted-foreground">Til</dt>
                <dd>{detail.to.join(", ") || "Ingen"}</dd>
                <dt className="text-muted-foreground">CC</dt>
                <dd>{detail.cc.join(", ") || "Ingen"}</dd>
                <dt className="text-muted-foreground">BCC</dt>
                <dd>{detail.bcc.join(", ") || "Ingen"}</dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd>{detail.status === "active" ? "Aktiv" : "Annulleret"}</dd>
                {detail.voidedAt ? (
                  <>
                    <dt className="text-muted-foreground">Annulleret</dt>
                    <dd>
                      {formatter.format(detail.voidedAt)}
                      {detail.voidedByName ? ` af ${detail.voidedByName}` : ""}
                    </dd>
                  </>
                ) : null}
              </dl>

              <div className="grid gap-3 sm:grid-cols-2">
                <NoticeAudit
                  title="Oprindelig meddelelse"
                  notice={detail.initialNotice}
                  formatter={formatter}
                />
                <NoticeAudit
                  title="Annulleringsmeddelelse"
                  notice={detail.cancellationNotice}
                  formatter={formatter}
                />
              </div>

              <DialogFooter>
                {detail.status === "active" &&
                ["failed", "notConfigured"].includes(
                  detail.initialNotice.status,
                ) ? (
                  <Button
                    variant="outline"
                    disabled={Boolean(working)}
                    onClick={() => void retry("initial")}
                  >
                    {working === "initial" ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <RotateCcwIcon data-icon="inline-start" />
                    )}
                    Send oprindelig meddelelse
                  </Button>
                ) : null}
                {detail.cancellationNotice.status === "failed" ? (
                  <Button
                    variant="outline"
                    disabled={Boolean(working)}
                    onClick={() => void retry("cancellation")}
                  >
                    {working === "cancellation" ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <RotateCcwIcon data-icon="inline-start" />
                    )}
                    Send annullering igen
                  </Button>
                ) : null}
                {detail.status === "active" ? (
                  <Button
                    variant="destructive"
                    disabled={Boolean(working)}
                    onClick={() => {
                      setVoidReason("");
                      setConfirmingVoid(true);
                    }}
                  >
                    Annullér registrering
                  </Button>
                ) : null}
                <Button variant="outline" onClick={() => setSelectedId(undefined)}>
                  Luk
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmingVoid} onOpenChange={setConfirmingVoid}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annullér registreringen?</AlertDialogTitle>
            <AlertDialogDescription>
              {detail?.deductFromStock
                ? "De præcise standardmængder føres tilbage på lageret. Billeder og auditlog bevares."
                : "Billeder og auditlog bevares. Lageret ændres ikke."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="bad-delivery-void-reason">Begrundelse</FieldLabel>
            <Textarea
              id="bad-delivery-void-reason"
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              placeholder="Skriv, hvorfor registreringen annulleres"
              required
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working === "void"}>
              Behold
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={working === "void" || !voidReason.trim()}
              onClick={() => void voidSelected()}
            >
              {working === "void" ? <Spinner data-icon="inline-start" /> : null}
              Annullér registrering
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
