"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import {
  Building2Icon,
  PlugIcon,
  RefreshCwIcon,
  UnplugIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
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
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
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
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { canManageOrganization } from "@/lib/auth-permissions";

type Settings = {
  connected: boolean;
  enabled: boolean;
  companyId: string | null;
  connectedAt: number | null;
};

type Department = {
  id: string;
  name: string;
};

type Location = {
  id: Id<"locations">;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
};

const connectedAtFormatter = new Intl.DateTimeFormat("da-DK", {
  dateStyle: "medium",
  timeStyle: "short",
});

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en fejl";
}

function ConnectionCard({
  settings,
  onDisconnected,
}: {
  settings: Settings;
  onDisconnected: () => void;
}) {
  const connect = useAction(api.workfeed.connect);
  const disconnect = useMutation(api.workfeed.disconnect);
  const [companyIdDraft, setCompanyIdDraft] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const companyId = companyIdDraft ?? settings.companyId ?? "";

  async function saveConnection() {
    if (!companyId.trim()) {
      toast.error("Indtast Workfeed firma-id");
      return;
    }
    if (!apiKey.trim()) {
      toast.error("Indtast Workfeed API-nøglen");
      return;
    }

    setConnecting(true);
    try {
      const result = await connect({ companyId, apiKey });
      setApiKey("");
      setCompanyIdDraft(null);
      toast.success(
        `Workfeed er forbundet. ${result.departmentCount} afdelinger blev fundet.`,
      );
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setConnecting(false);
    }
  }

  async function removeConnection() {
    setDisconnecting(true);
    try {
      await disconnect({});
      setCompanyIdDraft("");
      setApiKey("");
      onDisconnected();
      toast.success("Workfeed-integrationen er fjernet");
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Forbindelse</CardTitle>
        <CardDescription>
          Brug firma-id og API-nøgle fra Workfeed.
        </CardDescription>
        <CardAction>
          <Badge variant={settings.connected ? "default" : "secondary"}>
            {settings.connected ? "Forbundet" : "Ikke forbundet"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup className="grid md:grid-cols-2">
          <Field>
            <div className="flex items-center gap-1">
              <FieldLabel htmlFor="workfeed-company-id">Firma-id</FieldLabel>
              <HelpTooltip
                label="Workfeed firma-id"
                content="Firma-id'et identificerer jeres virksomhed i Workfeed. Kontakt Workfeed, hvis I mangler firma-id eller API-adgang."
              />
            </div>
            <Input
              id="workfeed-company-id"
              value={companyId}
              onChange={(event) => setCompanyIdDraft(event.target.value)}
              placeholder="Firma-id fra Workfeed"
              autoComplete="off"
              className="h-11"
            />
          </Field>
          <Field>
            <div className="flex items-center gap-1">
              <FieldLabel htmlFor="workfeed-api-key">
                {settings.connected ? "Ny API-nøgle" : "API-nøgle"}
              </FieldLabel>
              <HelpTooltip
                label="Workfeed API-nøgle"
                content="API-nøglen gemmes kun på serveren og vises ikke igen."
              />
            </div>
            <Input
              id="workfeed-api-key"
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={
                settings.connected
                  ? "Indtast kun ved opdatering"
                  : "API-nøgle fra Workfeed"
              }
              autoComplete="off"
              className="h-11"
            />
          </Field>
        </FieldGroup>

        {settings.connectedAt ? (
          <p className="text-sm text-muted-foreground">
            Senest forbundet {connectedAtFormatter.format(settings.connectedAt)}
          </p>
        ) : null}
      </CardContent>
      <CardFooter className="flex-wrap justify-end gap-3">
        {settings.connected ? (
          <AlertDialog>
            <AlertDialogTrigger
              render={<Button variant="outline" disabled={disconnecting} />}
            >
              <UnplugIcon data-icon="inline-start" />
              Fjern forbindelse
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Fjern forbindelsen til Workfeed?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  API-nøglen og alle lokationers afdelingskoblinger slettes.
                  Handlingen kan ikke fortrydes.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={disconnecting}>
                  Behold forbindelse
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={disconnecting}
                  onClick={() => void removeConnection()}
                >
                  {disconnecting ? <Spinner data-icon="inline-start" /> : null}
                  Fjern forbindelse
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
        <Button disabled={connecting} onClick={() => void saveConnection()}>
          {connecting ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <PlugIcon data-icon="inline-start" />
          )}
          {settings.connected ? "Opdatér forbindelse" : "Forbind Workfeed"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function LocationMappings() {
  const mappings = useQuery(api.workfeed.listLocationMappings);
  const listDepartments = useAction(api.workfeed.listDepartments);
  const saveMapping = useAction(api.workfeed.saveLocationMapping);
  const removeMapping = useMutation(api.workfeed.removeLocationMapping);
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<Id<"locations">>();

  async function load() {
    setLoading(true);
    setLoadFailed(false);
    try {
      setDepartments(await listDepartments({}));
    } catch (error) {
      setLoadFailed(true);
      toast.error(messageFrom(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void listDepartments({})
      .then((result) => {
        if (!cancelled) setDepartments(result);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadFailed(true);
        toast.error(messageFrom(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [listDepartments]);

  async function save(location: Location) {
    const departmentId = drafts[location.id] ?? location.departmentId;
    if (!departmentId) {
      toast.error(`Vælg en Workfeed-afdeling for ${location.name}`);
      return;
    }
    setSavingId(location.id);
    try {
      await saveMapping({ locationId: location.id, departmentId });
      setDrafts((current) => {
        const next = { ...current };
        delete next[location.id];
        return next;
      });
      toast.success(`${location.name} er koblet til Workfeed`);
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setSavingId(undefined);
    }
  }

  async function remove(location: Location) {
    setSavingId(location.id);
    try {
      await removeMapping({ locationId: location.id });
      setDrafts((current) => ({ ...current, [location.id]: "" }));
      toast.success(`Koblingen for ${location.name} er fjernet`);
    } catch (error) {
      toast.error(messageFrom(error));
    } finally {
      setSavingId(undefined);
    }
  }

  if (!mappings) return <Skeleton className="h-72 w-full" />;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Lokationer og afdelinger</CardTitle>
        <CardDescription>
          Kobl hver lokation til den afdeling, der har lokationens vagtplan i
          Workfeed.
        </CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void load()}
          >
            {loading ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            Opdatér afdelinger
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {mappings.limitReached ? (
          <Alert>
            <AlertTitle>Kun de første 200 lokationer vises</AlertTitle>
            <AlertDescription>
              Fjern ubrugte lokationer for at se hele listen.
            </AlertDescription>
          </Alert>
        ) : null}

        {loadFailed ? (
          <Alert variant="destructive">
            <AlertTitle>Afdelingerne kunne ikke hentes</AlertTitle>
            <AlertDescription>
              Kontrollér Workfeed-forbindelsen, og prøv igen.
            </AlertDescription>
          </Alert>
        ) : null}

        {mappings.locations.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Building2Icon />
              </EmptyMedia>
              <EmptyTitle>Ingen lokationer endnu</EmptyTitle>
              <EmptyDescription>
                Opret en lokation, før du kobler Workfeed-afdelinger.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {mappings.locations.map((location) => {
              const value = drafts[location.id] ?? location.departmentId ?? "";
              const options =
                location.departmentId &&
                location.departmentName &&
                !departments?.some(
                  (department) => department.id === location.departmentId,
                )
                  ? [
                      {
                        id: location.departmentId,
                        name: location.departmentName,
                      },
                      ...(departments ?? []),
                    ]
                  : (departments ?? []);
              const saving = savingId === location.id;

              return (
                <Card key={location.id} size="sm">
                  <CardHeader>
                    <CardTitle>{location.name}</CardTitle>
                    <CardAction>
                      <Badge
                        variant={
                          location.departmentId ? "default" : "secondary"
                        }
                      >
                        {location.departmentId ? "Koblet" : "Ikke koblet"}
                      </Badge>
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <FieldGroup>
                      <Field data-disabled={!departments || saving}>
                        <FieldLabel htmlFor={`workfeed-${location.id}`}>
                          Workfeed-afdeling
                        </FieldLabel>
                        <Select
                          value={value || null}
                          disabled={!departments || saving}
                          onValueChange={(departmentId) =>
                            setDrafts((current) => ({
                              ...current,
                              [location.id]: departmentId ?? "",
                            }))
                          }
                        >
                          <SelectTrigger
                            id={`workfeed-${location.id}`}
                            className="h-11 w-full"
                          >
                            <SelectValue placeholder="Vælg afdeling" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {options.map((department) => {
                                const usedBy = mappings.locations.find(
                                  (item) =>
                                    item.id !== location.id &&
                                    item.departmentId === department.id,
                                );
                                return (
                                  <SelectItem
                                    key={department.id}
                                    value={department.id}
                                    disabled={Boolean(usedBy)}
                                  >
                                    {usedBy
                                      ? `${department.name} — ${usedBy.name}`
                                      : department.name}
                                  </SelectItem>
                                );
                              })}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </Field>
                    </FieldGroup>
                  </CardContent>
                  <CardFooter className="flex-wrap justify-end gap-3">
                    {location.departmentId ? (
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button variant="outline" disabled={saving} />
                          }
                        >
                          Fjern kobling
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Fjern Workfeed-koblingen for {location.name}?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Lokationen vises ikke længere på
                              medarbejdersiden, før en afdeling kobles igen.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel disabled={saving}>
                              Annuller
                            </AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              disabled={saving}
                              onClick={() => void remove(location)}
                            >
                              {saving ? (
                                <Spinner data-icon="inline-start" />
                              ) : null}
                              Fjern kobling
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    ) : null}
                    <Button
                      disabled={!departments || !value || saving}
                      onClick={() => void save(location)}
                    >
                      {saving ? <Spinner data-icon="inline-start" /> : null}
                      Gem kobling
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function WorkfeedIntegration() {
  const membership = authClient.useActiveMemberRole();
  const isAdmin = canManageOrganization(membership.data?.role);
  const settings = useQuery(api.workfeed.getSettings, isAdmin ? {} : "skip");
  const setEnabled = useAction(api.workfeed.setEnabled);
  const [setupOpen, setSetupOpen] = useState(false);
  const [changingEnabled, setChangingEnabled] = useState(false);

  async function changeIntegrationEnabled(enabled: boolean) {
    setSetupOpen(enabled);
    if (!settings?.connected) return;

    setChangingEnabled(true);
    try {
      await setEnabled({ enabled });
      toast.success(
        enabled
          ? "Workfeed-integrationen er aktiveret"
          : "Workfeed-integrationen er deaktiveret",
      );
    } catch (error) {
      setSetupOpen(settings.enabled);
      toast.error(messageFrom(error));
    } finally {
      setChangingEnabled(false);
    }
  }

  if (membership.isPending) {
    return <Skeleton className="h-72 w-full max-w-6xl" />;
  }

  if (!isAdmin) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Kun administratorer kan administrere integrationer.
        </AlertDescription>
      </Alert>
    );
  }

  if (!settings) return <Skeleton className="h-72 w-full max-w-6xl" />;

  const integrationOpen = settings.enabled || setupOpen;

  return (
    <Collapsible open={integrationOpen}>
      <Card className="max-w-6xl">
        <CardHeader>
          <CardTitle>Workfeed</CardTitle>
          <CardDescription>
            Se dagens planlagte medarbejdere og antal medarbejdere på arbejde
            for hver lokation.
          </CardDescription>
          <CardAction>
            <Field orientation="horizontal" className="w-auto">
              <Switch
                id="workfeed-integration-enabled"
                aria-controls="workfeed-integration-settings"
                aria-expanded={integrationOpen}
                aria-label="Aktivér Workfeed-integration"
                checked={integrationOpen}
                disabled={changingEnabled}
                onCheckedChange={(enabled) =>
                  void changeIntegrationEnabled(enabled)
                }
              />
            </Field>
          </CardAction>
        </CardHeader>
        <CollapsibleContent id="workfeed-integration-settings">
          <CardContent className="flex flex-col gap-5">
            <ConnectionCard
              settings={settings}
              onDisconnected={() => setSetupOpen(false)}
            />
            {settings.connected ? <LocationMappings /> : null}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
