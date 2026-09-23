"use client";

import { OnlinePosMasterSelect } from "./online-pos-master-select";
import { getUserErrorMessage } from "@/lib/user-errors";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  PlugIcon,
  UnplugIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type Draft = {
  masterIntegrationId: Id<"onlinePosIntegrations"> | null;
  companyId: string;
  token: string;
};

const connectedAtFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function OnlinePosLocationConnections() {
  const settings = useQuery(api.onlinePos.getSettings);
  const setLocationMaster = useMutation(api.onlinePos.setLocationMaster);
  const connections = useQuery(api.onlinePos.listLocationConnections);
  const connectLocation = useAction(api.onlinePos.connectLocation);
  const disconnectLocation = useMutation(api.onlinePos.disconnectLocation);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [connectingIds, setConnectingIds] = useState<Set<Id<"locations">>>(
    new Set(),
  );
  const [disconnectingIds, setDisconnectingIds] = useState<
    Set<Id<"locations">>
  >(new Set());

  if (!connections || !settings) {
    return <Skeleton className="h-96 w-full" />;
  }
  const { locations } = connections;
  const missingCount = locations.filter((location) => !location.connected).length;
  const visibleLocations = locations.filter((location) => filter !== "attention" || !location.connected);

  function getDraft(location: (typeof locations)[number]) {
    return (
      drafts[location.id] ?? {
        masterIntegrationId:
          location.masterIntegrationId ?? settings?.masters[0]?.id ?? null,
        companyId: String(location.companyId ?? ""),
        token: "",
      }
    );
  }

  function updateDraft(locationId: Id<"locations">, patch: Partial<Draft>) {
    const location = locations.find((location) => location.id === locationId);
    if (!location) return;
    setDrafts((current) => {
      const draft = current[locationId] ?? {
        masterIntegrationId:
          location.masterIntegrationId ?? settings?.masters[0]?.id ?? null,
        companyId: String(location.companyId ?? ""),
        token: "",
      };
      return {
        ...current,
        [locationId]: { ...draft, ...patch },
      };
    });
  }

  function clearDraft(locationId: Id<"locations">) {
    setDrafts((current) => {
      const next = { ...current };
      delete next[locationId];
      return next;
    });
  }

  async function saveLocation(location: (typeof locations)[number]) {
    const draft = getDraft(location);
    if (!draft.masterIntegrationId) {
      toast.error("Vælg en masterforbindelse");
      return;
    }
    const companyId = Number(draft.companyId);
    if (!Number.isSafeInteger(companyId) || companyId <= 0) {
      toast.error(`Indtast et gyldigt firma-id for ${location.name}`);
      return;
    }
    if (!draft.token.trim()) {
      toast.error(`Indtast et OnlinePOS-token for ${location.name}`);
      return;
    }

    setConnectingIds((current) => new Set(current).add(location.id));
    try {
      await connectLocation({
        locationId: location.id,
        masterIntegrationId: draft.masterIntegrationId,
        companyId,
        token: draft.token,
      });
      clearDraft(location.id);
      toast.success(`${location.name} er forbundet med OnlinePOS`);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "OnlinePOS-forbindelsen kunne ikke opdateres. Prøv igen."));
    } finally {
      setConnectingIds((current) => {
        const next = new Set(current);
        next.delete(location.id);
        return next;
      });
    }
  }

  async function changeMaster(
    location: (typeof locations)[number],
    integrationId: Id<"onlinePosIntegrations">,
  ) {
    if (!location.connected) {
      updateDraft(location.id, { masterIntegrationId: integrationId });
      return;
    }
    setConnectingIds((current) => new Set(current).add(location.id));
    try {
      await setLocationMaster({ locationId: location.id, integrationId });
      setDrafts((current) =>
        current[location.id]
          ? {
              ...current,
              [location.id]: {
                ...current[location.id],
                masterIntegrationId: integrationId,
              },
            }
          : current,
      );
      toast.success(`Masterforbindelsen for ${location.name} er gemt`);
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Masterforbindelsen kunne ikke gemmes. Prøv igen.",
        ),
      );
    } finally {
      setConnectingIds((current) => {
        const next = new Set(current);
        next.delete(location.id);
        return next;
      });
    }
  }

  async function removeLocation(location: (typeof locations)[number]) {
    setDisconnectingIds((current) => new Set(current).add(location.id));
    try {
      await disconnectLocation({ locationId: location.id });
      clearDraft(location.id);
      toast.success(`Forbindelsen for ${location.name} er fjernet`);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "OnlinePOS-forbindelsen kunne ikke opdateres. Prøv igen."));
    } finally {
      setDisconnectingIds((current) => {
        const next = new Set(current);
        next.delete(location.id);
        return next;
      });
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="w-full">
        <CardHeader className="flex flex-col sm:grid">
          <CardTitle appearance="compact" className="flex items-center">
            Lokationsindstillinger
            <HelpTooltip
              label="OnlinePOS-lokationsindstillinger"
              content="Tilføj firma-id og token til hver lokation. Forbindelsen henter kun salg for den pågældende lokation."
            />
          </CardTitle>
          <CardDescription>{locations.length - missingCount} af {locations.length} lokationer forbundet</CardDescription>
          <CardAction appearance="standard" className="flex flex-wrap items-center">
            {missingCount > 0 ? <Button variant="outline" className="min-h-11" onClick={() => { setFilter("attention"); setOpen(true); }}>{missingCount} mangler forbindelse</Button> : null}
            <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>
              {open ? "Skjul" : "Vis"}
              {open ? (
                <ChevronUpIcon data-icon="inline-end" />
              ) : (
                <ChevronDownIcon data-icon="inline-end" />
              )}
            </CollapsibleTrigger>
          </CardAction>
        </CardHeader>
        <CollapsibleContent>
          <CardContent appearance="stacked" className="flex flex-col">
            <ToggleGroup variant="outline" value={[filter]} onValueChange={(values) => { if (values[0]) setFilter(values[0]); }} aria-label="OnlinePOS-forbindelser">
              <ToggleGroupItem value="all" className="min-h-11">Alle</ToggleGroupItem>
              <ToggleGroupItem value="attention" className="min-h-11">Kræver handling ({missingCount})</ToggleGroupItem>
            </ToggleGroup>
            {connections.limitReached ? (
              <Alert>
                <AlertTitle>Kun de første 200 lokationer vises</AlertTitle>
                <AlertDescription>
                  Fjern ubrugte lokationer for at se hele listen.
                </AlertDescription>
              </Alert>
            ) : null}

            {locations.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>Ingen lokationer endnu</EmptyTitle>
                  <EmptyDescription>
                    Opret en lokation, før du tilføjer OnlinePOS-oplysninger.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex flex-col gap-4">
                {visibleLocations.length === 0 ? <p className="text-sm text-muted-foreground">Alle lokationer er forbundet.</p> : null}
                {visibleLocations.map((location) => {
                  const draft = getDraft(location);
                  const connecting = connectingIds.has(location.id);
                  const disconnecting = disconnectingIds.has(location.id);
                  return (
                    <Collapsible key={location.id}><div className="flex flex-col gap-3">
                      <div className="grid gap-3 sm:grid-cols-(--grid-cols-content-actions) sm:items-center">
                        <div className="min-w-0">
                          <h3 className="font-medium">{location.name}</h3>
                          {location.companyId ? <p className="text-sm text-muted-foreground">Firma-id {location.companyId}</p> : null}
                        </div>
                        <Badge variant={location.connected ? "secondary" : "outline"}>{location.connected ? "Forbundet" : "Ikke forbundet"}</Badge>
                        <CollapsibleTrigger render={<Button variant="outline" className="min-h-11" aria-label={`${location.connected ? "Redigér" : "Forbind"} ${location.name}`} />}>
                          {location.connected ? "Redigér forbindelse" : "Forbind"}
                          <ChevronDownIcon data-icon="inline-end" />
                        </CollapsibleTrigger>
                      </div>
                      <CollapsibleContent><div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-4">
                        <FieldGroup className="grid sm:grid-cols-2">
                          <OnlinePosMasterSelect
                            masters={settings.masters}
                            value={draft.masterIntegrationId}
                            onValueChange={(value) =>
                              void changeMaster(location, value)
                            }
                            disabled={connecting || disconnecting}
                          />
                          <Field>
                            <div className="flex items-center gap-1">
                              <FieldLabel
                                htmlFor={`online-pos-${location.id}-company-id`}
                              >
                                Firma-id
                              </FieldLabel>
                              <HelpTooltip
                                label={`OnlinePOS firma-id for ${location.name}`}
                                content="Brug firma-id'et fra lokationens OnlinePOS-konto. Mangler I det eller API-adgang, skal I kontakte OnlinePOS. Firma-id'et bruges kun til lokationens salg."
                              />
                            </div>
                            <Input
                              id={`online-pos-${location.id}-company-id`}
                              type="number"
                              inputMode="numeric"
                              min={1}
                              value={draft.companyId}
                              onChange={(event) =>
                                updateDraft(location.id, {
                                  companyId: event.target.value,
                                })
                              }
                              placeholder="Firma-id"
                              className="h-11"
                            />
                          </Field>
                          <Field>
                            <div className="flex items-center gap-1">
                              <FieldLabel
                                htmlFor={`online-pos-${location.id}-token`}
                              >
                                {location.connected ? "Nyt token" : "Token"}
                              </FieldLabel>
                              <HelpTooltip
                                label={`OnlinePOS-token for ${location.name}`}
                                content="Brug tokenet fra lokationens OnlinePOS-konto. Mangler I det, skal I kontakte OnlinePOS. Tokenet gemmes på serveren og kan ikke vises igen."
                              />
                            </div>
                            <Input
                              id={`online-pos-${location.id}-token`}
                              type="password"
                              autoComplete="off"
                              value={draft.token}
                              onChange={(event) =>
                                updateDraft(location.id, {
                                  token: event.target.value,
                                })
                              }
                              placeholder={
                                location.connected
                                  ? "Indtast kun ved opdatering"
                                  : "Token"
                              }
                              className="h-11"
                            />
                          </Field>
                        </FieldGroup>
                        {location.connectedAt ? (
                          <p className="text-sm text-muted-foreground">
                            Senest forbundet{" "}
                            {connectedAtFormatter.format(location.connectedAt)}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        {location.connected ? (
                          <AlertDialog>
                            <AlertDialogTrigger
                              render={
                                <Button
                                  variant="outline"
                                  disabled={disconnecting}
                                />
                              }
                            >
                              <UnplugIcon data-icon="inline-start" />
                              Fjern
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Fjern forbindelsen for {location.name}?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tokenet slettes, og salg fra lokationen kan
                                  ikke længere hentes.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel disabled={disconnecting}>
                                  Annullér
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  variant="destructive"
                                  disabled={disconnecting}
                                  onClick={() => void removeLocation(location)}
                                >
                                  {disconnecting ? (
                                    <Spinner data-icon="inline-start" />
                                  ) : null}
                                  Fjern forbindelse
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : null}
                        <Button
                          disabled={connecting}
                          onClick={() => void saveLocation(location)}
                        >
                          {connecting ? (
                            <Spinner data-icon="inline-start" />
                          ) : (
                            <PlugIcon data-icon="inline-start" />
                          )}
                          {location.connected ? "Opdatér" : "Forbind"}
                        </Button>
                      </div>
                      </div></CollapsibleContent>
                      <Separator />
                    </div></Collapsible>
                  );
                })}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
