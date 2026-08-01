"use client";

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
  CardFooter,
  CardHeader,
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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type Draft = {
  companyId: string;
  token: string;
};

const connectedAtFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "medium",
  timeStyle: "short",
});

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en fejl";
}

export function OnlinePosLocationConnections() {
  const connections = useQuery(api.onlinePos.listLocationConnections);
  const connectLocation = useAction(api.onlinePos.connectLocation);
  const disconnectLocation = useMutation(api.onlinePos.disconnectLocation);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [open, setOpen] = useState(false);
  const [connectingId, setConnectingId] = useState<Id<"locations">>();
  const [disconnectingId, setDisconnectingId] = useState<Id<"locations">>();

  if (!connections) {
    return <Skeleton className="h-96 w-full max-w-5xl" />;
  }
  const { locations } = connections;

  function getDraft(location: (typeof locations)[number]) {
    return (
      drafts[location.id] ?? {
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
    const companyId = Number(draft.companyId);
    if (!Number.isSafeInteger(companyId) || companyId <= 0) {
      toast.error(`Indtast et gyldigt firma-id for ${location.name}`);
      return;
    }
    if (!draft.token.trim()) {
      toast.error(`Indtast et OnlinePOS-token for ${location.name}`);
      return;
    }

    setConnectingId(location.id);
    try {
      await connectLocation({
        locationId: location.id,
        companyId,
        token: draft.token,
      });
      clearDraft(location.id);
      toast.success(`${location.name} er forbundet med OnlinePOS`);
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setConnectingId(undefined);
    }
  }

  async function removeLocation(location: (typeof locations)[number]) {
    setDisconnectingId(location.id);
    try {
      await disconnectLocation({ locationId: location.id });
      clearDraft(location.id);
      toast.success(`Forbindelsen for ${location.name} er fjernet`);
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setDisconnectingId(undefined);
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="max-w-5xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            Lokationsindstillinger
            <HelpTooltip
              label="OnlinePOS-lokationsindstillinger"
              content="Tilføj firma-id og token for hver lokation. De bruges kun til at hente salg for den valgte lokation."
            />
          </CardTitle>
          <CardAction>
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
          <CardContent className="flex flex-col gap-4">
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
              <div className="grid gap-4 lg:grid-cols-2">
                {locations.map((location) => {
                  const draft = getDraft(location);
                  const connecting = connectingId === location.id;
                  const disconnecting = disconnectingId === location.id;
                  return (
                    <Card key={location.id} size="sm">
                      <CardHeader>
                        <CardTitle>{location.name}</CardTitle>
                        <CardAction>
                          <Badge
                            variant={
                              location.connected ? "default" : "secondary"
                            }
                          >
                            {location.connected
                              ? "Forbundet"
                              : "Ikke forbundet"}
                          </Badge>
                        </CardAction>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-4">
                        <FieldGroup className="grid sm:grid-cols-2">
                          <Field>
                            <div className="flex items-center gap-1">
                              <FieldLabel
                                htmlFor={`online-pos-${location.id}-company-id`}
                              >
                                Firma-id
                              </FieldLabel>
                              <HelpTooltip
                                label={`OnlinePOS firma-id for ${location.name}`}
                                content="Brug firma-id'et for denne lokations OnlinePOS-konto. Kontakt OnlinePOS eller jeres OnlinePOS-kontakt, hvis I mangler det. Oplysningerne bruges kun til lokationens salg."
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
                                content="Brug tokenet for denne lokations OnlinePOS-konto. Kontakt OnlinePOS eller jeres OnlinePOS-kontakt, hvis I mangler det. Tokenet gemmes kun på serveren og vises ikke igen."
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
                      </CardContent>
                      <CardFooter className="flex-wrap justify-end gap-3">
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
                                  Annuller
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
                          {location.connected ? "Opdater" : "Forbind"}
                        </Button>
                      </CardFooter>
                    </Card>
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
