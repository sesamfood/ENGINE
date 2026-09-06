"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { getUserErrorMessage } from "@/lib/user-errors";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";

const dateFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "short",
  timeStyle: "short",
});

export function OnlinePosStockSettings() {
  const settings = useQuery(api.onlinePosStock.getSettings);
  const setEnabled = useMutation(api.onlinePosStock.setEnabled);
  const retry = useMutation(api.onlinePosStock.retry);
  const setRefundsToWaste = useMutation(api.onlinePosStock.setRefundsToWaste);
  const [refundsToWaste, setRefundsToWasteChoice] = useState(false);
  const [open, setOpen] = useState(false);
  const [sinceCount, setSinceCount] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);

  async function save(enabled: boolean) {
    setSaving(true);
    try {
      await setEnabled({ enabled, syncSinceLastCount: enabled && sinceCount, refundsToWaste });
      setOpen(false);
      toast.success(
        enabled
          ? "Lagersynkronisering er aktiveret"
          : "Lagersynkronisering er deaktiveret",
      );
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Lagersynkroniseringen kunne ikke ændres"),
      );
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <Skeleton className="h-24 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lagersynkronisering</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup>
          <Field
            orientation="horizontal"
            data-disabled={
              saving || !settings.canManage || !settings.integrationEnabled
            }
          >
            <div className="flex flex-1 items-center gap-1">
              <FieldLabel htmlFor="online-pos-stock-sync">
                Opdatér lageret fra salg
              </FieldLabel>
              <HelpTooltip
                label="Lagersynkronisering fra OnlinePOS"
                content="Salg hentes hvert 10. minut. Produkter med opskrifter reducerer ingrediensernes lager; andre Produkter reducerer deres egen beholdning. Tilvalg og fravalg bruger de eksisterende koblinger. Refunderinger fører mængden tilbage på lageret, medmindre du vælger at registrere dem som Waste. Deaktivering stopper nye opdateringer og bevarer tidligere lagerændringer."
              />
            </div>
            <Switch
              id="online-pos-stock-sync"
              checked={settings.enabled}
              disabled={
                saving || !settings.canManage || !settings.integrationEnabled
              }
              onCheckedChange={(enabled) => {
                if (enabled) {
                  setSinceCount(false);
                  setRefundsToWasteChoice(settings.refundsToWaste);
                  setOpen(true);
                } else void save(false);
              }}
            />
          </Field>
          {settings.enabled ? (
            <Field orientation="horizontal" data-disabled={saving || !settings.canManage || !settings.integrationEnabled}>
              <div className="flex flex-1 items-center gap-1">
                <FieldLabel htmlFor="online-pos-refunds-waste">Registrér refunderinger som Waste</FieldLabel>
                <HelpTooltip label="Refunderinger som Waste" content="Nye refunderinger, der synkroniseres, registreres automatisk som Waste. Maden føres derfor ikke tilbage på lageret. Opskrifter, tilvalg og fravalg bestemmer mængderne. Allerede behandlede refunderinger ændres ikke. Ret eventuelle fejl i OnlinePOS." />
              </div>
              <Switch id="online-pos-refunds-waste" checked={settings.refundsToWaste} disabled={saving || !settings.canManage || !settings.integrationEnabled}
                onCheckedChange={async (enabled) => {
                  setSaving(true);
                  try {
                    await setRefundsToWaste({ enabled });
                    toast.success(enabled ? "Nye refunderinger registreres som Waste" : "Nye refunderinger føres tilbage på lageret");
                  } catch (error) {
                    toast.error(getUserErrorMessage(error, "Indstillingen kunne ikke gemmes"));
                  } finally { setSaving(false); }
                }} />
            </Field>
          ) : null}
        </FieldGroup>
        {!settings.integrationEnabled ? (
          <p className="text-sm text-muted-foreground">
            Aktivér OnlinePOS-integrationen for at synkronisere lageret.
          </p>
        ) : null}
        {settings.enabled && settings.integrationEnabled ? (
          <div className="flex flex-col gap-4">
            {settings.locations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Forbind en lokation til OnlinePOS for at synkronisere lageret.
              </p>
            ) : null}
            {settings.locations.map((location) => (
              <div key={location.id} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">{location.name}</span>
                  <Badge
                    variant={
                      location.state === "error" ? "destructive" : "secondary"
                    }
                  >
                    {location.state === "error"
                      ? "Kræver handling"
                      : location.state === "running"
                        ? "Synkroniserer"
                        : location.state === "waiting"
                          ? "Afventer salg"
                          : "Synkroniseret"}
                  </Badge>
                </div>
                {location.lastSuccessAt ? (
                  <p className="text-sm text-muted-foreground">
                    Senest gennemført{" "}
                    {dateFormatter.format(location.lastSuccessAt)}
                  </p>
                ) : null}
                {location.lastError ? (
                  <Alert variant="destructive">
                    <AlertDescription>{location.lastError}</AlertDescription>
                  </Alert>
                ) : null}
                <Button
                  variant="outline"
                  className="self-start"
                  disabled={retrying !== null || location.state === "running"}
                  onClick={async () => {
                    setRetrying(location.id);
                    try {
                      await retry({ locationId: location.id });
                      toast.success("Lagersynkronisering er bestilt");
                    } catch (error) {
                      toast.error(
                        getUserErrorMessage(
                          error,
                          "Lagersynkroniseringen kunne ikke startes",
                        ),
                      );
                    } finally {
                      setRetrying(null);
                    }
                  }}
                >
                  {retrying === location.id ? (
                    <Spinner data-icon="inline-start" />
                  ) : null}
                  Synkronisér igen
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!saving) setOpen(value);
        }}
      >
        <DialogContent showCloseButton={!saving}>
          <DialogHeader>
            <DialogTitle>Aktivér lagersynkronisering</DialogTitle>
            <DialogDescription>
              OnlinePOS-salg vil automatisk opdatere lageret på alle forbundne
              lokationer.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field orientation="horizontal" data-disabled={saving}>
              <Checkbox id="online-pos-enable-refunds-waste" checked={refundsToWaste} onCheckedChange={setRefundsToWasteChoice} disabled={saving} />
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="online-pos-enable-refunds-waste">Registrér refunderinger som Waste</FieldLabel>
                <FieldDescription>Refunderinger registreres som Waste, så maden ikke føres tilbage på lageret. Gælder også refunderinger siden seneste Count, hvis du vælger at synkronisere dem. Allerede behandlede refunderinger ændres ikke.</FieldDescription>
              </div>
            </Field>
            <Field orientation="horizontal" data-disabled={saving}>
              <Checkbox
                id="online-pos-stock-since-count"
                checked={sinceCount}
                onCheckedChange={setSinceCount}
                disabled={saving}
              />
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="online-pos-stock-since-count">
                  Synkronisér med salg siden seneste Count
                </FieldLabel>
                <FieldDescription>
                  Afstem lageret med salget siden hvert Produkts seneste Count
                  på lokationen. Tidligere synkroniserede salg trækkes ikke fra
                  igen. Produkter uden Count starter fra nu.
                </FieldDescription>
              </div>
            </Field>
          </FieldGroup>
          <p className="text-sm text-muted-foreground">
            {sinceCount
              ? "Dette ændrer den nuværende lagerbeholdning. Hvis salgshistorikken ikke dækker perioden, vises en fejl på lokationen."
              : "Kun salg fra aktiveringstidspunktet vil ændre lageret."}
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              Annullér
            </Button>
            <Button disabled={saving} onClick={() => void save(true)}>
              {saving ? <Spinner data-icon="inline-start" /> : null}Aktivér
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
