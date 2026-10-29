"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { getUserErrorMessage } from "@/lib/user-errors";
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

const dateFormatter = new Intl.DateTimeFormat("da-DK", { dateStyle: "long" });

export function OnlinePosSalesHistory() {
  const history = useQuery(api.onlinePosSync.getSalesHistory);
  const setRetention = useMutation(api.onlinePosSync.setSalesRetentionDays);
  const importHistory = useMutation(api.onlinePosSync.importSalesHistory);
  const [days, setDays] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!history) return <Skeleton className="h-48 w-full" />;
  const disabled = busy || !history.canManage;

  async function saveRetention() {
    setBusy(true);
    try {
      await setRetention({ days: Number(days) });
      setDays(null);
      toast.success("Opbevaringstiden er gemt");
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Opbevaringstiden kunne ikke gemmes"),
      );
    } finally {
      setBusy(false);
    }
  }

  async function startImport() {
    setBusy(true);
    try {
      const result = await importHistory({ from });
      setConfirming(false);
      if (result.started > 0)
        toast.success(`Ældre salg hentes for ${result.started} lokationer`);
      for (const { name, reason } of result.skipped)
        toast.warning(`${name}: ${reason}`);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Ældre salg kunne ikke hentes"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Salgshistorik</CardTitle>
        <CardDescription>
          Hent ældre salg fra OnlinePOS, og vælg hvor længe salgslinjer gemmes.
        </CardDescription>
      </CardHeader>
      <CardContent appearance="stacked" className="flex flex-col">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveRetention();
          }}
        >
          <FieldGroup>
            <Field orientation="responsive" data-disabled={disabled}>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="online-pos-retention-days">
                  Gem salgslinjer i antal dage
                </FieldLabel>
                <HelpTooltip
                  label="Opbevaring af salgslinjer"
                  content="Salgslinjer og ordrer ældre end dette slettes automatisk. Daglige salgstal på dashboardet bevares altid. Mindst 400 og højst 3650 dage."
                />
              </div>
              <Input
                id="online-pos-retention-days"
                type="number"
                inputMode="numeric"
                min={400}
                max={3650}
                step={1}
                required
                value={days ?? String(history.retentionDays)}
                onChange={(event) => setDays(event.target.value)}
                disabled={disabled}
              />
              <Button
                type="submit"
                disabled={disabled || days === null}
              >
                {busy && days !== null ? (
                  <Spinner data-icon="inline-start" />
                ) : null}
                Gem
              </Button>
            </Field>
          </FieldGroup>
        </form>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setConfirming(true);
          }}
        >
          <FieldGroup>
            <Field orientation="responsive" data-disabled={disabled}>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="online-pos-history-from">
                  Hent salg fra
                </FieldLabel>
                <HelpTooltip
                  label="Hent ældre salg"
                  content="Henter salg fra datoen frem til den ældste dato, der allerede er hentet. Det sker en uge ad gangen og kan tage lang tid. Imens venter den løbende synkronisering af salg og lager. Fejler hentningen, kan du starte den igen og fortsætte, hvor den stoppede."
                />
              </div>
              <Input
                id="online-pos-history-from"
                type="date"
                required
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                disabled={disabled}
              />
              <Button type="submit" variant="outline" disabled={disabled}>
                Hent salg
              </Button>
            </Field>
          </FieldGroup>
        </form>
        {history.locations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Forbind en lokation til OnlinePOS for at hente salg.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.locations.map((location) => (
              <li
                key={location.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span className="font-medium">{location.name}</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  {location.historyFrom !== null
                    ? `Salg fra ${dateFormatter.format(location.historyFrom)}`
                    : "Ingen salg hentet"}
                  {location.state === "running" ||
                  location.state === "queued" ? (
                    <Badge variant="secondary">Henter</Badge>
                  ) : location.state === "error" ? (
                    <Badge variant="destructive">Fejl</Badge>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!busy) setConfirming(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hent ældre salg?</AlertDialogTitle>
            <AlertDialogDescription>
              Salg fra{" "}
              {from ? dateFormatter.format(new Date(`${from}T12:00:00`)) : ""}{" "}
              hentes for alle forbundne lokationer. Det kan tage lang tid,
              og imens venter den løbende synkronisering af salg og lager.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Annullér</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                void startImport();
              }}
            >
              {busy ? <Spinner data-icon="inline-start" /> : null}
              Hent salg
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
