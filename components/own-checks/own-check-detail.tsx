"use client";

import { useQuery } from "convex/react";
import { ArrowLeftIcon, ClipboardCheckIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useKiosk, useLocationAccess, usePermission } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { addDateKey } from "@/lib/own-checks";
import { OwnCheckForm } from "./own-check-form";
import { useOwnCheckNow } from "./use-own-check-now";

export function OwnCheckDetail({ templateId, locationId, dateKey }: {
  templateId: string;
  locationId: string;
  dateKey: string;
}) {
  const router = useRouter();
  const { locations, lockedId } = useLocationAccess();
  const kiosk = useKiosk();
  const canPerform = usePermission("ownChecks.perform");
  const canAccess = kiosk?.kioskModeEnabled
    ? Boolean(kiosk.settings?.enabledPages.includes("ownChecks.today"))
    : canPerform;
  const location = locations?.find((item) => item.id === locationId && (!lockedId || item.id === lockedId));
  const now = useOwnCheckNow(locationId);
  const result = useQuery(api.ownChecks.listToday, canAccess && location ? { locationId: location.id, dateKey } : "skip");
  const dateContext = useQuery(api.ownChecks.getTodayDateContext, canAccess && location ? { locationId: location.id, now } : "skip");
  const backHref = `/own-checks?${new URLSearchParams({ locationId })}`;

  if (locations === undefined || (canAccess && location && (!result || !dateContext))) {
    return <Skeleton className="h-[34rem] w-full" />;
  }

  const item = result?.items.find((item) => item.templateId === templateId);
  const canSubmit = Boolean(result && dateContext && dateKey <= dateContext.todayDateKey && dateKey >= addDateKey(dateContext.todayDateKey, -result.lateSubmissionDays));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" className="min-h-11" nativeButton={false} render={<Link href={backHref} />}>
          <ArrowLeftIcon data-icon="inline-start" />Tilbage til egenkontrol
        </Button>
        {location ? <p className="text-sm text-muted-foreground">{location.name}</p> : null}
      </div>
      {!canAccess || !location || !result || !item ? (
        <Empty className="min-h-72 border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><ClipboardCheckIcon /></EmptyMedia>
            <EmptyTitle>Kontrollen er ikke tilgængelig</EmptyTitle>
            <EmptyDescription>Kontrollen findes ikke for denne dato og lokation, eller du har ikke adgang til den.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {!item.entry && !canSubmit ? <Alert role="note"><AlertTitle>Kontrollen kan ikke registreres</AlertTitle><AlertDescription>Datoen ligger i fremtiden, eller fristen for efterregistrering er udløbet.</AlertDescription></Alert> : null}
          <OwnCheckForm
            key={`${location.id}-${dateKey}-${item.templateVersionId}-${item.entry?.revision ?? 0}`}
            item={item}
            locationId={location.id}
            timeZone={result.timeZone}
            canSubmit={canSubmit}
            onSaved={() => router.push(backHref)}
          />
        </>
      )}
    </div>
  );
}
