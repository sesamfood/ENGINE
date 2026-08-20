"use client";

import { useQuery } from "convex/react";
import { AlertTriangleIcon, CheckCircle2Icon, ClipboardCheckIcon, Clock3Icon } from "lucide-react";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useKiosk, useLocationAccess, usePermission } from "@/components/app-shell";
import { LocationField } from "@/components/location-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { ownCheckControlTypeLabels, ownCheckStatusLabels } from "@/lib/own-checks";
import { OwnCheckSheet } from "./own-check-sheet";
import { useOwnCheckNow } from "./use-own-check-now";

type TodayResult = NonNullable<ReturnType<typeof useQuery<typeof api.ownChecks.listToday>>>;
type PlanItem = TodayResult["items"][number];

function timeLabel(item: PlanItem, timeZone: string) {
  const format = (timestamp: number) => new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit", timeZone }).format(timestamp);
  return item.startsAt === null ? `Inden kl. ${format(item.dueAt)}` : `Kl. ${format(item.startsAt)}–${format(item.dueAt)}`;
}

function StatusBadge({ item }: { item: PlanItem }) {
  const variant = item.status === "deviation" ? "destructive" : item.status === "approved" ? "default" : item.status === "notCompleted" ? "outline" : "secondary";
  return <Badge variant={variant}>{item.status === "approved" ? <CheckCircle2Icon data-icon="inline-start" /> : null}{ownCheckStatusLabels[item.status]}</Badge>;
}

function CheckRow({ item, timeZone, now, onOpen }: { item: PlanItem; timeZone: string; now: number; onOpen: () => void }) {
  const overdue = item.status === "notCompleted" && now > item.dueAt;
  return (
    <Button type="button" variant="ghost" className="flex h-auto min-h-16 w-full items-center justify-start gap-3 rounded-xl border p-3 text-left hover:bg-muted/60" onClick={onOpen}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><ClipboardCheckIcon /></span>
      <span className="min-w-0 flex-1"><span className="block truncate font-medium">{item.name}</span><span className="block text-sm text-muted-foreground">{ownCheckControlTypeLabels[item.controlType]} · {timeLabel(item, timeZone)}</span></span>
      <span className="flex shrink-0 flex-col items-end gap-1"><StatusBadge item={item} />{overdue ? <span className="text-xs font-medium text-destructive">Overskredet</span> : null}</span>
    </Button>
  );
}

function CheckSection({ title, items, timeZone, now, icon, onOpen }: { title: string; items: PlanItem[]; timeZone: string; now: number; icon: React.ReactNode; onOpen: (item: PlanItem) => void }) {
  if (!items.length) return null;
  return <section className="flex flex-col gap-3"><div className="flex items-center gap-2"><span className="text-muted-foreground">{icon}</span><h2 className="text-lg font-semibold">{title} <span className="text-muted-foreground">({items.length})</span></h2></div><div className="flex flex-col gap-2">{items.map((item) => <CheckRow key={`${item.templateId}-${item.dueDateKey}`} item={item} timeZone={timeZone} now={now} onOpen={() => onOpen(item)} />)}</div></section>;
}

export function TodayOwnChecks() {
  const { locations, isLocked, lockedId, lockedName } = useLocationAccess();
  const kiosk = useKiosk();
  const canManage = usePermission("ownChecks.manage");
  const [selectedLocation, setSelectedLocation] = useState<Id<"locations"> | null>(null);
  const [selected, setSelected] = useState<PlanItem | null>(null);
  const locationId = lockedId ?? (selectedLocation && locations?.some((location) => location.id === selectedLocation) ? selectedLocation : locations?.[0]?.id ?? null);
  const now = useOwnCheckNow(locationId ?? "");
  const dateContext = useQuery(api.ownChecks.getTodayDateContext, locationId ? { locationId, now } : "skip");
  const result = useQuery(api.ownChecks.listToday, locationId && dateContext ? { locationId, dateKey: dateContext.todayDateKey } : "skip");

  if (locations === undefined || (locationId && (dateContext === undefined || result === undefined))) return <Skeleton className="h-[34rem] w-full" />;
  if (!locations.length || !locationId) return <Empty className="min-h-72"><EmptyHeader><EmptyMedia variant="icon"><ClipboardCheckIcon /></EmptyMedia><EmptyTitle>Ingen lokationer</EmptyTitle><EmptyDescription>Opret en lokation, før egenkontroller kan registreres.</EmptyDescription></EmptyHeader></Empty>;
  if (!result) return null;

  const pending = result.items.filter((item) => item.status === "notCompleted");
  const deviations = result.items.filter((item) => item.entry?.followUp === "open");
  const done = result.items.filter((item) => item.status !== "notCompleted" && item.entry?.followUp !== "open");

  return (
    <div className="flex flex-col gap-6">
      {!kiosk?.kioskModeEnabled ? <Field className="max-w-sm"><FieldLabel htmlFor="own-check-location">Lokation</FieldLabel><LocationField id="own-check-location" locations={locations} value={locationId} locked={isLocked} lockedName={lockedName} onValueChange={(value) => setSelectedLocation(value as Id<"locations">)} /></Field> : null}
      <Card>
        <CardHeader><CardTitle>I dag</CardTitle><CardDescription>{result.dateKey} · {result.items.length} planlagte kontroller</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-7">
          <CheckSection title="Mangler" items={pending} timeZone={result.timeZone} now={now} icon={<Clock3Icon />} onOpen={setSelected} />
          <CheckSection title="Afvigelser" items={deviations} timeZone={result.timeZone} now={now} icon={<AlertTriangleIcon />} onOpen={setSelected} />
          <CheckSection title="Udført i dag" items={done} timeZone={result.timeZone} now={now} icon={<CheckCircle2Icon />} onOpen={setSelected} />
          {result.backlog.length ? <CheckSection title="Manglende fra tidligere dage" items={result.backlog} timeZone={result.timeZone} now={now} icon={<AlertTriangleIcon />} onOpen={setSelected} /> : null}
          {!pending.length && !deviations.length && !done.length && !result.backlog.length ? <Empty className="min-h-56"><EmptyHeader><EmptyMedia variant="icon"><ClipboardCheckIcon /></EmptyMedia><EmptyTitle>Ingen egenkontroller planlagt i dag</EmptyTitle><EmptyDescription>Der er ingen aktive kontroller for denne lokation.{canManage ? <> <Link href="/organization/own-checks" className="font-medium underline underline-offset-4">Administrér egenkontroller</Link></> : null}</EmptyDescription></EmptyHeader></Empty> : null}
          {result.truncated ? <p className="text-sm text-muted-foreground">Listen er begrænset. Vælg en kortere periode eller kontakt en bruger med rollen Administrator.</p> : null}
        </CardContent>
      </Card>
      <OwnCheckSheet key={selected ? `${selected.templateId}-${selected.dueDateKey}` : "empty"} item={selected} locationId={locationId} timeZone={result.timeZone} open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  );
}
