"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { usePermission } from "@/components/app-shell";
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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { dateTimeFormatter } from "@/lib/date";
import { getUserErrorMessage } from "@/lib/user-errors";

type Target = { id: Id<"locations">; name: string };

export function ExtraCounts() {
  const canManage = usePermission("count.manage");
  const locations = useQuery(
    api.count.listAdHocCountLocations,
    canManage ? {} : "skip",
  );
  const openAdHocCount = useMutation(api.count.openAdHocCount);
  const cancelAdHocCount = useMutation(api.count.cancelAdHocCount);
  const [opening, setOpening] = useState<Target | null>(null);
  const [cancelling, setCancelling] = useState<Target | null>(null);
  const [pending, setPending] = useState<"continue" | "fresh" | "cancel" | null>(
    null,
  );
  const formatter = dateTimeFormatter("da-DK", {
    dateStyle: "short",
    timeStyle: "short",
  });

  if (!canManage) return null;

  async function open(continueFromLatest: boolean) {
    if (!opening) return;
    setPending(continueFromLatest ? "continue" : "fresh");
    try {
      await openAdHocCount({ locationId: opening.id, continueFromLatest });
      toast.success(`Ekstra Count er åbnet for ${opening.name}`);
      setOpening(null);
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Ekstra Count kunne ikke åbnes. Prøv igen."),
      );
    } finally {
      setPending(null);
    }
  }

  async function cancel() {
    if (!cancelling) return;
    setPending("cancel");
    try {
      await cancelAdHocCount({ locationId: cancelling.id });
      toast.success(`Ekstra Count er annulleret for ${cancelling.name}`);
      setCancelling(null);
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Ekstra Count kunne ikke annulleres. Prøv igen.",
        ),
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Ekstra Count</CardTitle>
        <CardDescription>
          Åbn Count for en lokation uden for Count-vinduet. Den planlagte Count
          påvirkes ikke.
        </CardDescription>
      </CardHeader>
      <CardContent appearance="stacked" className="flex flex-col">
        {!locations ? (
          <Skeleton className="h-36 w-full" />
        ) : (
          locations.map((location) => (
            <div
              key={location.id}
              className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <h3 className="truncate font-medium">{location.name}</h3>
                {location.openedAt ? (
                  <Badge variant="secondary" className="w-fit">
                    Åben siden {formatter.format(location.openedAt)}
                  </Badge>
                ) : null}
              </div>
              {location.openedAt ? (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 sm:shrink-0"
                  onClick={() => setCancelling(location)}
                >
                  Annullér ekstra Count
                </Button>
              ) : (
                <Button
                  type="button"
                  className="min-h-11 sm:shrink-0"
                  onClick={() => setOpening(location)}
                >
                  Åbn ekstra Count
                </Button>
              )}
            </div>
          ))
        )}
      </CardContent>

      <AlertDialog
        open={opening !== null}
        onOpenChange={(next) => {
          if (!next && !pending) setOpening(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Åbn ekstra Count for {opening?.name}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Fortsæt med mængderne fra den seneste registrerede Count, eller
              start forfra med tomme mængder.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending !== null}>
              Annullér
            </AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              disabled={pending !== null}
              onClick={() => void open(false)}
            >
              {pending === "fresh" ? <Spinner data-icon="inline-start" /> : null}
              Start forfra
            </Button>
            <Button
              type="button"
              disabled={pending !== null}
              onClick={() => void open(true)}
            >
              {pending === "continue" ? (
                <Spinner data-icon="inline-start" />
              ) : null}
              Fortsæt fra seneste Count
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={cancelling !== null}
        onOpenChange={(next) => {
          if (!next && !pending) setCancelling(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Annullér ekstra Count for {cancelling?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Alle mængder i den ekstra Count slettes, og lageret ændres ikke.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending !== null}>
              Behold
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending !== null}
              onClick={() => void cancel()}
            >
              {pending === "cancel" ? (
                <Spinner data-icon="inline-start" />
              ) : null}
              Annullér ekstra Count
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
