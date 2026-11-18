"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { ArrowLeftIcon, ClipboardCheckIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useKiosk, useLocationAccess, usePermission } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { FormCardSkeleton } from "@/components/page-skeletons";
import { api } from "@/convex/_generated/api";
import { addDateKey } from "@/lib/food-safety";
import { FoodSafetyForm } from "./food-safety-form";
import { useFoodSafetyNow } from "./use-food-safety-now";

export function FoodSafetyDetail({ templateId, locationId, dateKey }: {
  templateId: string;
  locationId: string;
  dateKey: string;
}) {
  const router = useRouter();
  const { locations, lockedId } = useLocationAccess();
  const kiosk = useKiosk();
  const canPerform = usePermission("foodSafety.perform");
  const canAccess = kiosk?.kioskModeEnabled
    ? Boolean(kiosk.settings?.enabledPages.includes("foodSafety.today"))
    : canPerform;
  const location = locations?.find((item) => item.id === locationId && (!lockedId || item.id === lockedId));
  const now = useFoodSafetyNow(locationId);
  const result = useQuery(api.foodSafety.listToday, canAccess && location ? { locationId: location.id, dateKey } : "skip");
  const dateContext = useQuery(api.foodSafety.getTodayDateContext, canAccess && location ? { locationId: location.id, now } : "skip");
  const backHref = `/food-safety?${new URLSearchParams({ locationId })}`;

  if (locations === undefined || (canAccess && location && (!result || !dateContext))) {
    return <FormCardSkeleton fields={5} />;
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
        <Empty appearance="outlined" className="min-h-72">
          <EmptyHeader>
            <EmptyMedia variant="icon"><ClipboardCheckIcon /></EmptyMedia>
            <EmptyTitle>Kontrollen er ikke tilgængelig</EmptyTitle>
            <EmptyDescription>Kontrollen findes ikke for denne dato og lokation, eller du har ikke adgang til den.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {!item.entry && !canSubmit ? <Alert role="note"><AlertTitle>Kontrollen kan ikke registreres</AlertTitle><AlertDescription>Datoen ligger i fremtiden, eller fristen for efterregistrering er udløbet.</AlertDescription></Alert> : null}
          <FoodSafetyForm
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
