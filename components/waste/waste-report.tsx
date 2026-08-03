"use client";

import { useConvex, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { DownloadIcon, FileChartColumnIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
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
import { authClient } from "@/lib/auth-client";
import { canViewWasteReports } from "@/lib/auth-permissions";
import { downloadCsv } from "@/lib/download-csv";
import { BadDeliveriesReportSection } from "./bad-deliveries-report-section";
import { useWasteContext } from "./waste-header";

type Row = {
  id: Id<"wasteRegistrations">;
  registeredAt: number;
  locationId: Id<"locations">;
  locationName: string;
  productId: Id<"products">;
  productName: string;
  registeredByName: string;
  quantity: number;
  unitName: string;
  defaultQuantity: number;
  defaultUnitId: Id<"units">;
  defaultUnitName: string;
  source: "shortcut" | "custom";
  status: "active" | "voided";
  voidedAt: number | null;
  voidedByName: string | null;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dateValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function zonedStart(value: string, timeZone: string) {
  const [year, month, day] = value.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day);
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(guess).map((part) => [part.type, part.value]),
    );
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    guess += target - represented;
  }
  return guess;
}

function zonedEnd(value: string, timeZone: string) {
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const nextValue = `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
  return zonedStart(nextValue, timeZone) - 1;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("da-DK", { maximumFractionDigits: 6 }).format(value);
}


function message(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en fejl";
}

export function WasteReport() {
  const convex = useConvex();
  const membership = authClient.useActiveMemberRole();
  const { locations } = useWasteContext();
  const now = new Date();
  const [from, setFrom] = useState(() => dateValue(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(() => dateValue(now));
  const [location, setLocation] = useState("all");
  const [selected, setSelected] = useState<Row | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [exporting, setExporting] = useState(false);
  const voidWaste = useMutation(api.waste.voidWasteRegistration);
  const canReport = canViewWasteReports(membership.data?.role);
  const reportContext = useQuery(api.employees.getContext, canReport ? {} : "skip");
  const timeZone = reportContext?.timeZone ?? "Europe/Copenhagen";
  const formatter = useMemo(
    () =>
      new Intl.DateTimeFormat("da-DK", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone,
      }),
    [timeZone],
  );
  const startAt = zonedStart(from, timeZone);
  const endAt = zonedEnd(to, timeZone);
  const rangeValid = Number.isFinite(startAt) && Number.isFinite(endAt) && startAt <= endAt;
  const args = rangeValid && canReport
    ? { startAt, endAt, ...(location === "all" ? {} : { locationId: location as Id<"locations"> }) }
    : "skip";
  const { results, status, loadMore } = usePaginatedQuery(api.waste.listRegistrations, args, { initialNumItems: 25 });
  const {
    results: activeResults,
    status: activeStatus,
    loadMore: loadMoreActive,
  } = usePaginatedQuery(
    api.waste.exportRegistrations,
    args === "skip" ? "skip" : { ...args, activeOnly: true },
    { initialNumItems: 100 },
  );

  useEffect(() => {
    if (activeStatus === "CanLoadMore") loadMoreActive(100);
  }, [activeStatus, loadMoreActive]);
  const summary = useMemo(() => {
    const groups = new Map<string, { location: string; product: string; quantity: number; unit: string; count: number }>();
    for (const row of activeResults as Row[]) {
      const key = `${row.locationId}:${row.productId}:${row.defaultUnitId}`;
      const group = groups.get(key) ?? { location: row.locationName, product: row.productName, quantity: 0, unit: row.defaultUnitName, count: 0 };
      group.quantity += row.defaultQuantity;
      group.count += 1;
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => a.location.localeCompare(b.location, "da") || a.product.localeCompare(b.product, "da"));
  }, [activeResults]);

  if (membership.isPending) return <Skeleton className="h-96" />;
  if (!canReport) {
    return <Alert variant="destructive"><AlertTitle>Ingen adgang</AlertTitle><AlertDescription>Kun ledere og administratorer kan se Waste-rapporter.</AlertDescription></Alert>;
  }

  async function allRows(activeOnly: boolean) {
    if (args === "skip") throw new Error("Vælg en gyldig periode");
    const rows: Row[] = [];
    let cursor: string | null = null;
    let done = false;
    while (!done) {
      const page: {
        page: Row[];
        continueCursor: string;
        isDone: boolean;
      } = await convex.query(api.waste.exportRegistrations, {
        ...args,
        activeOnly,
        paginationOpts: { numItems: 100, cursor },
      });
      rows.push(...page.page);
      cursor = page.continueCursor;
      done = page.isDone;
    }
    return rows;
  }

  async function exportSummary() {
    setExporting(true);
    try {
      const rows = await allRows(true);
      const groups = new Map<string, Row[]>();
      for (const row of rows) {
        const key = `${row.locationId}:${row.productId}:${row.defaultUnitId}`;
        groups.set(key, [...(groups.get(key) ?? []), row]);
      }
      downloadCsv(`waste-oversigt-${from}-${to}.csv`, ["Location", "Produkt", "Mængde", "Enhed", "Registreringer"], [...groups.values()].map((group) => [group[0].locationName, group[0].productName, String(group.reduce((sum, row) => sum + row.defaultQuantity, 0)).replace(".", ","), group[0].defaultUnitName, String(group.length)]));
    } catch (error) { toast.error(message(error)); } finally { setExporting(false); }
  }

  async function exportLog() {
    setExporting(true);
    try {
      const rows = await allRows(false);
      downloadCsv(`waste-registreringer-${from}-${to}.csv`, ["Tidspunkt", "Location", "Medarbejder", "Produkt", "Mængde", "Enhed", "Kilde", "Status"], rows.map((row) => [formatter.format(row.registeredAt), row.locationName, row.registeredByName, row.productName, String(row.quantity).replace(".", ","), row.unitName, row.source === "shortcut" ? "Shortcut" : "Tilpasset", row.status === "active" ? "Aktiv" : "Annulleret"]));
    } catch (error) { toast.error(message(error)); } finally { setExporting(false); }
  }

  async function voidSelected() {
    if (!selected) return;
    try {
      await voidWaste({ registrationId: selected.id });
      toast.success("Waste-registreringen er annulleret");
      setConfirming(false);
      setSelected(null);
    } catch (error) { toast.error(message(error)); }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="grid gap-4 pt-4 sm:grid-cols-3">
          <Field><FieldLabel htmlFor="waste-from">Fra</FieldLabel><Input id="waste-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
          <Field><FieldLabel htmlFor="waste-to">Til</FieldLabel><Input id="waste-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
          <Field><FieldLabel>Location</FieldLabel><Select value={location} onValueChange={(value) => setLocation(value ?? "all")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Alle locations</SelectItem>{locations?.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
        </CardContent>
      </Card>
      {!rangeValid ? <Alert variant="destructive"><AlertTitle>Ugyldig periode</AlertTitle><AlertDescription>Fra-dato skal være før eller samme dag som til-dato.</AlertDescription></Alert> : null}

      <Card>
        <CardHeader className="sm:grid-cols-[1fr_auto]"><CardTitle>Oversigt</CardTitle><Button variant="outline" disabled={exporting || !rangeValid} onClick={exportSummary}><DownloadIcon data-icon="inline-start" />Eksportér oversigt</Button></CardHeader>
        <CardContent>
          {activeStatus !== "Exhausted" ? <Skeleton className="h-40" /> : summary.length ? <Table><TableHeader><TableRow><TableHead>Location</TableHead><TableHead>Produkt</TableHead><TableHead className="text-right">Mængde</TableHead><TableHead>Enhed</TableHead><TableHead className="text-right">Registreringer</TableHead></TableRow></TableHeader><TableBody>{summary.map((row) => <TableRow key={`${row.location}:${row.product}:${row.unit}`}><TableCell>{row.location}</TableCell><TableCell>{row.product}</TableCell><TableCell className="text-right">{formatNumber(row.quantity)}</TableCell><TableCell>{row.unit}</TableCell><TableCell className="text-right">{row.count}</TableCell></TableRow>)}</TableBody></Table> : <Empty><EmptyHeader><EmptyTitle>Ingen Waste i perioden</EmptyTitle></EmptyHeader></Empty>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="sm:grid-cols-[1fr_auto]"><CardTitle>Registreringer</CardTitle><Button variant="outline" disabled={exporting || !rangeValid} onClick={exportLog}><DownloadIcon data-icon="inline-start" />Eksportér registreringer</Button></CardHeader>
        <CardContent>
          {status === "LoadingFirstPage" ? <Skeleton className="h-56" /> : results.length ? <><Table><TableHeader><TableRow><TableHead>Tidspunkt</TableHead><TableHead>Location</TableHead><TableHead>Medarbejder</TableHead><TableHead>Produkt</TableHead><TableHead>Mængde</TableHead><TableHead>Kilde</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{(results as Row[]).map((row) => <TableRow key={row.id} className="cursor-pointer" tabIndex={0} onClick={() => setSelected(row)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelected(row); }}><TableCell>{formatter.format(row.registeredAt)}</TableCell><TableCell>{row.locationName}</TableCell><TableCell>{row.registeredByName}</TableCell><TableCell>{row.productName}</TableCell><TableCell>{formatNumber(row.quantity)} {row.unitName}</TableCell><TableCell>{row.source === "shortcut" ? "Shortcut" : "Tilpasset"}</TableCell><TableCell><Badge variant={row.status === "active" ? "secondary" : "outline"}>{row.status === "active" ? "Aktiv" : "Annulleret"}</Badge></TableCell></TableRow>)}</TableBody></Table>{status === "CanLoadMore" ? <div className="mt-4 flex justify-center"><Button variant="outline" onClick={() => loadMore(25)}>Indlæs flere</Button></div> : null}</> : <Empty className="min-h-44"><EmptyHeader><EmptyMedia variant="icon"><FileChartColumnIcon /></EmptyMedia><EmptyTitle>Ingen registreringer</EmptyTitle><EmptyDescription>Der er ingen Waste-registreringer i den valgte periode.</EmptyDescription></EmptyHeader></Empty>}
        </CardContent>
      </Card>

      <Separator />
      <BadDeliveriesReportSection
        startAt={startAt}
        endAt={endAt}
        locationId={
          location === "all" ? undefined : (location as Id<"locations">)
        }
        formatter={formatter}
        from={from}
        to={to}
        rangeValid={rangeValid}
      />

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><DialogContent>{selected ? <><DialogHeader><DialogTitle>{selected.productName}</DialogTitle><DialogDescription>{formatter.format(selected.registeredAt)} · {selected.locationName}</DialogDescription></DialogHeader><dl className="grid grid-cols-2 gap-3"><dt className="text-muted-foreground">Medarbejder</dt><dd>{selected.registeredByName}</dd><dt className="text-muted-foreground">Mængde</dt><dd>{formatNumber(selected.quantity)} {selected.unitName}</dd><dt className="text-muted-foreground">Kilde</dt><dd>{selected.source === "shortcut" ? "Shortcut" : "Tilpasset"}</dd><dt className="text-muted-foreground">Status</dt><dd>{selected.status === "active" ? "Aktiv" : "Annulleret"}</dd>{selected.voidedAt ? <><dt className="text-muted-foreground">Annulleret</dt><dd>{formatter.format(selected.voidedAt)}{selected.voidedByName ? ` af ${selected.voidedByName}` : ""}</dd></> : null}</dl><DialogFooter><Button variant="outline" onClick={() => setSelected(null)}>Luk</Button>{selected.status === "active" ? <Button variant="destructive" onClick={() => setConfirming(true)}>Annullér registrering</Button> : null}</DialogFooter></> : null}</DialogContent></Dialog>
      <AlertDialog open={confirming} onOpenChange={setConfirming}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Annullér registrering?</AlertDialogTitle><AlertDialogDescription>Lageret bliver tilført den registrerede mængde igen. Auditloggen bevares.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Behold</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={voidSelected}>Annullér registrering</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}
