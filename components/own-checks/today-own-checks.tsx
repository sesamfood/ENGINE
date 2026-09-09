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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { ownCheckControlTypeLabels, ownCheckStatusLabels } from "@/lib/own-checks";
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

function CheckRow({ item, locationId, timeZone, now }: { item: PlanItem; locationId: Id<"locations">; timeZone: string; now: number }) {
  const overdue = item.status === "notCompleted" && now > item.dueAt;
  return (
    <Button variant="outline" nativeButton={false} render={<Link href={`/own-checks/check/${item.templateId}?${new URLSearchParams({ locationId, date: item.dueDateKey })}`} />} className="flex h-auto min-h-16 w-full items-center justify-start gap-3 p-3 text-left">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><ClipboardCheckIcon /></span>
      <span className="min-w-0 flex-1"><span className="block whitespace-normal break-words font-medium">{item.name}</span><span className="block whitespace-normal text-sm text-muted-foreground">{ownCheckControlTypeLabels[item.controlType]} · {timeLabel(item, timeZone)}</span></span>
      <span className="flex shrink-0 flex-col items-end gap-1"><StatusBadge item={item} />{overdue ? <span className="text-xs font-medium text-destructive">Overskredet</span> : null}</span>
    </Button>
  );
}

function CheckSection({ title, items, locationId, timeZone, now, icon }: { title: string; items: PlanItem[]; locationId: Id<"locations">; timeZone: string; now: number; icon: React.ReactNode }) {
  if (!items.length) return null;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
          <CardTitle><h3>{title}</h3></CardTitle>
          <Badge variant="secondary">{items.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {items.map((item) => (
          <CheckRow key={`${item.templateId}-${item.dueDateKey}`} item={item} timeZone={timeZone} now={now} locationId={locationId} />
        ))}
      </CardContent>
    </Card>
  );
}

export function TodayOwnChecks({ initialLocationId }: { initialLocationId?: string }) {
  const { locations, isLocked, lockedId, lockedName } = useLocationAccess();
  const kiosk = useKiosk();
  const canManage = usePermission("ownChecks.manage");
  const [selectedLocation, setSelectedLocation] = useState<string | null>(initialLocationId ?? null);
  const locationId = lockedId ?? locations?.find((location) => location.id === selectedLocation)?.id ?? locations?.[0]?.id ?? null;
  const now = useOwnCheckNow(locationId ?? "");
  const dateContext = useQuery(api.ownChecks.getTodayDateContext, locationId ? { locationId, now } : "skip");
  const result = useQuery(api.ownChecks.listToday, locationId && dateContext ? { locationId, dateKey: dateContext.todayDateKey } : "skip");

  if (locations === undefined || (locationId && (dateContext === undefined || result === undefined))) return <Skeleton className="h-[34rem] w-full" />;
  if (!locations.length || !locationId) return <Empty className="min-h-72 border"><EmptyHeader><EmptyMedia variant="icon"><ClipboardCheckIcon /></EmptyMedia><EmptyTitle>Ingen lokationer</EmptyTitle><EmptyDescription>Opret en lokation, før egenkontroller kan registreres.</EmptyDescription></EmptyHeader></Empty>;
  if (!result) return null;

  const pending = result.items.filter((item) => item.status === "notCompleted");
  const deviations = result.items.filter((item) => item.entry?.followUp === "open");
  const done = result.items.filter((item) => item.status !== "notCompleted" && item.entry?.followUp !== "open");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">I dag</h2>
          <p className="text-sm text-muted-foreground">
            {new Intl.DateTimeFormat("da-DK", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${result.dateKey}T12:00:00Z`))} · {result.items.length} planlagte kontroller
          </p>
        </div>
        {!kiosk?.kioskModeEnabled ? <Field className="sm:max-w-xs"><FieldLabel htmlFor="own-check-location">Lokation</FieldLabel><LocationField id="own-check-location" locations={locations} value={locationId} locked={isLocked} lockedName={lockedName} onValueChange={setSelectedLocation} /></Field> : null}
      </div>
      <div className="flex flex-col gap-4">
        <CheckSection title="Mangler" items={pending} timeZone={result.timeZone} now={now} icon={<Clock3Icon />} locationId={locationId} />
        <CheckSection title="Afvigelser" items={deviations} timeZone={result.timeZone} now={now} icon={<AlertTriangleIcon />} locationId={locationId} />
        <CheckSection title="Udført i dag" items={done} timeZone={result.timeZone} now={now} icon={<CheckCircle2Icon />} locationId={locationId} />
        {result.backlog.length ? <CheckSection title="Manglende fra tidligere dage" items={result.backlog} timeZone={result.timeZone} now={now} icon={<AlertTriangleIcon />} locationId={locationId} /> : null}
        {!pending.length && !deviations.length && !done.length && !result.backlog.length ? <Empty className="min-h-72 border"><EmptyHeader><EmptyMedia variant="icon"><ClipboardCheckIcon /></EmptyMedia><EmptyTitle>Ingen egenkontroller planlagt i dag</EmptyTitle><EmptyDescription>Der er ingen aktive kontroller for denne lokation.{canManage ? <> <Link href="/administration/own-checks" className="font-medium underline underline-offset-4">Administrér egenkontroller</Link></> : null}</EmptyDescription></EmptyHeader></Empty> : null}
        {result.truncated ? <p className="text-sm text-muted-foreground">Listen er for lang. Vælg en kortere periode, eller kontakt en bruger med rollen Administrator.</p> : null}
      </div>
    </div>
  );
}
