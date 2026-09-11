"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { PlusIcon, PlugIcon, Trash2Icon, UnplugIcon } from "lucide-react";
import { toast } from "sonner";
import { useAccess, usePermission } from "@/components/app-shell";
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
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/convex/_generated/api";
import { getUserErrorMessage } from "@/lib/user-errors";
import { IntegrationCard } from "./integration-card";

type Settings = FunctionReturnType<typeof api.economic.getSettings>;
type Connection = Settings["connections"][number];
type Catalog = FunctionReturnType<typeof api.economic.getCatalog>;
type Category = Connection["accountMappings"][number]["category"];
type AccountDraft = { accountNumber: number | null; category: Category | null };

const categories = [
  { value: "sales", label: "Nettoomsætning" },
  { value: "cogs", label: "Vareforbrug" },
  { value: "labour", label: "Løn" },
  { value: "rent", label: "Husleje" },
  { value: "utilities", label: "Forsyning" },
  { value: "other", label: "Øvrige driftsomkostninger" },
] satisfies Array<{ value: Category; label: string }>;

function ConnectionForm({
  connection,
  onDone,
  onCancel,
}: {
  connection?: Connection;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const connect = useAction(api.economic.connect);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!token.trim()) return;
    setSaving(true);
    try {
      await connect({
        agreementGrantToken: token.trim(),
        ...(connection ? { connectionId: connection.id } : {}),
      });
      setToken("");
      toast.success(
        connection ? "Forbindelsen er opdateret" : "e-conomic er forbundet",
      );
      onDone();
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Aftalen kunne ikke forbindes. Prøv igen."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="flex flex-col gap-4"
    >
      <FieldGroup>
        <Field data-disabled={saving}>
          <div className="flex items-center gap-1">
            <FieldLabel htmlFor={`economic-token-${connection?.id ?? "new"}`}>
              {connection ? "Ny adgangsnøgle" : "Adgangsnøgle"}
            </FieldLabel>
            <HelpTooltip
              label="e-conomic-adgangsnøgle"
              content={
                connection
                  ? `Indsæt et AgreementGrantToken til aftale ${connection.agreementNumber}. En anden aftale skal tilføjes som en ny forbindelse. Nøglen gemmes kun på serveren og vises ikke igen.`
                  : "Indsæt det AgreementGrantToken, du får, når du giver integrationen adgang til aftalen i e-conomic. Nøglen gemmes kun på serveren og vises ikke igen."
              }
            />
          </div>
          <Input
            id={`economic-token-${connection?.id ?? "new"}`}
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            autoComplete="off"
            placeholder="AgreementGrantToken"
            required
            disabled={saving}
            className="h-11"
          />
        </Field>
      </FieldGroup>
      <div className="flex flex-wrap justify-end gap-3">
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={onCancel}
          >
            Annullér
          </Button>
        ) : null}
        <Button type="submit" disabled={saving || !token.trim()}>
          {saving ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <PlugIcon data-icon="inline-start" />
          )}
          {connection ? "Opdatér forbindelse" : "Forbind e-conomic"}
        </Button>
      </div>
    </form>
  );
}

function MappingEditor({
  connection,
  catalog,
  settings,
  onDone,
}: {
  connection: Connection;
  catalog: Catalog;
  settings: Settings;
  onDone: () => void;
}) {
  const saveMappings = useAction(api.economic.saveMappings);
  const [revision] = useState(connection.revision);
  const [dimensionNumber, setDimensionNumber] = useState(
    connection.dimensionNumber,
  );
  const [locationMappings, setLocationMappings] = useState(
    connection.locationMappings,
  );
  const [accountMappings, setAccountMappings] = useState<AccountDraft[]>(
    connection.accountMappings,
  );
  const [budgetSource, setBudgetSource] = useState(connection.budgetSource);
  const [cogsStockAdjusted, setCogsStockAdjusted] = useState(
    connection.cogsStockAdjusted,
  );
  const [saving, setSaving] = useState(false);

  const dimensionOptions = [
    { value: "agreement", label: "Hele aftalen til én lokation" },
    ...catalog.dimensions.map((dimension) => ({
      value: String(dimension.number),
      label: dimension.name,
    })),
  ];
  const dimensionValues = catalog.values.filter(
    (value) => value.dimensionNumber === dimensionNumber,
  );
  const accountOptions = catalog.accounts
    .filter((account) => account.type === 1)
    .map((account) => ({
      value: account.number,
      label: `${account.number} · ${account.name}`,
    }));
  const otherConnections = settings.connections.filter(
    (item) => item.id !== connection.id,
  );
  const usedBy = (locationId: Settings["locations"][number]["id"]) =>
    otherConnections.find((item) =>
      item.locationMappings.some(
        (mapping) => mapping.locationId === locationId,
      ),
    );

  async function save() {
    const accounts: Connection["accountMappings"] = [];
    for (const mapping of accountMappings) {
      if (mapping.accountNumber === null || mapping.category === null) {
        toast.error("Vælg konto og nøgletal på alle kontolinjer");
        return;
      }
      accounts.push({
        accountNumber: mapping.accountNumber,
        category: mapping.category,
      });
    }
    if (locationMappings.length === 0) {
      toast.error("Kobl mindst én lokation til aftalen");
      return;
    }
    setSaving(true);
    try {
      await saveMappings({
        connectionId: connection.id,
        expectedRevision: revision,
        dimensionNumber,
        accountMappings: accounts,
        locationMappings,
        budgetSource,
        cogsStockAdjusted,
      });
      toast.success("Koblinger og beregningsgrundlag er gemt");
      onDone();
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Koblingerne kunne ikke gemmes. Prøv igen."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="flex flex-col gap-5"
    >
      <FieldSet disabled={saving}>
        <FieldLegend>Lokationer</FieldLegend>
        <FieldGroup>
          <Field>
            <div className="flex items-center gap-1">
              <FieldLabel htmlFor={`economic-dimension-${connection.id}`}>
                Fordeling på lokationer
              </FieldLabel>
              <HelpTooltip
                label="fordeling på lokationer"
                content="Brug aftalens afdeling eller dimension til at fordele posteringer mellem lokationer. Vælg hele aftalen, hvis den kun tilhører én lokation. Posteringer uden en koblet dimensionsværdi fordeles ikke automatisk."
              />
            </div>
            <Select
              items={dimensionOptions}
              value={
                dimensionNumber === null ? "agreement" : String(dimensionNumber)
              }
              onValueChange={(value) => {
                if (value === null) return;
                const next = value === "agreement" ? null : Number(value);
                if (next !== dimensionNumber) {
                  setDimensionNumber(next);
                  setLocationMappings([]);
                }
              }}
            >
              <SelectTrigger
                id={`economic-dimension-${connection.id}`}
                className="h-11 w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {dimensionOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {!catalog.dimensionsAvailable ? (
            <Alert>
              <AlertTitle>Dimensioner er ikke tilgængelige</AlertTitle>
              <AlertDescription>
                Aftalen kan kobles til én lokation. Fordeling mellem flere
                lokationer kræver adgang til dimensioner i e-conomic.
              </AlertDescription>
            </Alert>
          ) : null}
          {dimensionNumber === null ? (
            <Field>
              <FieldLabel htmlFor={`economic-location-${connection.id}`}>
                Lokation
              </FieldLabel>
              <Select
                items={settings.locations.map((location) => ({
                  value: location.id,
                  label: location.name,
                }))}
                value={locationMappings[0]?.locationId ?? null}
                onValueChange={(value) => {
                  const location = settings.locations.find(
                    (item) => item.id === value,
                  );
                  if (location)
                    setLocationMappings([
                      { locationId: location.id, dimensionKey: null },
                    ]);
                }}
              >
                <SelectTrigger
                  id={`economic-location-${connection.id}`}
                  className="h-11 w-full"
                >
                  <SelectValue placeholder="Vælg lokation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {settings.locations.map((location) => {
                      const owner = usedBy(location.id);
                      const wrongCurrency =
                        location.currency !== connection.currency;
                      return (
                        <SelectItem
                          key={location.id}
                          value={location.id}
                          disabled={Boolean(owner) || wrongCurrency}
                        >
                          {location.name}
                          {owner
                            ? ` · aftale ${owner.agreementNumber}`
                            : wrongCurrency
                              ? ` · ${location.currency}`
                              : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <FieldGroup className="grid md:grid-cols-2">
              {settings.locations.map((location) => {
                const owner = usedBy(location.id);
                const wrongCurrency = location.currency !== connection.currency;
                const mapping = locationMappings.find(
                  (item) => item.locationId === location.id,
                );
                const options = [
                  {
                    value: "unmapped",
                    label: owner
                      ? `Koblet til aftale ${owner.agreementNumber}`
                      : wrongCurrency
                        ? `Anden valuta · ${location.currency}`
                        : "Ikke koblet",
                  },
                  ...dimensionValues.map((value) => ({
                    value: String(value.number),
                    label: `${value.number} · ${value.name}`,
                  })),
                ];
                return (
                  <Field
                    key={location.id}
                    data-disabled={Boolean(owner) || wrongCurrency}
                  >
                    <FieldLabel
                      htmlFor={`economic-value-${connection.id}-${location.id}`}
                    >
                      {location.name}
                    </FieldLabel>
                    <Select
                      items={options}
                      value={
                        mapping?.dimensionKey == null
                          ? "unmapped"
                          : String(mapping.dimensionKey)
                      }
                      disabled={Boolean(owner) || wrongCurrency}
                      onValueChange={(value) => {
                        if (value === null) return;
                        setLocationMappings((current) => [
                          ...current.filter(
                            (item) => item.locationId !== location.id,
                          ),
                          ...(value === "unmapped"
                            ? []
                            : [
                                {
                                  locationId: location.id,
                                  dimensionKey: Number(value),
                                },
                              ]),
                        ]);
                      }}
                    >
                      <SelectTrigger
                        id={`economic-value-${connection.id}-${location.id}`}
                        className="h-11 w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {options.map((option) => (
                            <SelectItem
                              key={option.value}
                              value={option.value}
                              disabled={
                                option.value !== "unmapped" &&
                                locationMappings.some(
                                  (item) =>
                                    item.locationId !== location.id &&
                                    item.dimensionKey === Number(option.value),
                                )
                              }
                            >
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                );
              })}
            </FieldGroup>
          )}
        </FieldGroup>
      </FieldSet>

      <Separator />

      <FieldSet disabled={saving}>
        <FieldLegend>Konti og nøgletal</FieldLegend>
        <FieldGroup>
          {accountMappings.map((mapping, index) => (
            <FieldGroup
              key={index}
              className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
            >
              <Field>
                <FieldLabel
                  htmlFor={`economic-account-${connection.id}-${index}`}
                >
                  Konto
                </FieldLabel>
                <Select
                  items={accountOptions}
                  value={mapping.accountNumber}
                  onValueChange={(value) => {
                    setAccountMappings((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, accountNumber: value }
                          : item,
                      ),
                    );
                  }}
                >
                  <SelectTrigger
                    id={`economic-account-${connection.id}-${index}`}
                    className="h-11 w-full"
                  >
                    <SelectValue placeholder="Vælg konto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {accountOptions.map((account) => (
                        <SelectItem
                          key={account.value}
                          value={account.value}
                          disabled={accountMappings.some(
                            (item, itemIndex) =>
                              itemIndex !== index &&
                              item.accountNumber === account.value,
                          )}
                        >
                          {account.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel
                  htmlFor={`economic-category-${connection.id}-${index}`}
                >
                  Nøgletal
                </FieldLabel>
                <Select
                  items={categories}
                  value={mapping.category}
                  onValueChange={(value) => {
                    const category = categories.find(
                      (item) => item.value === value,
                    );
                    if (category)
                      setAccountMappings((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, category: category.value }
                            : item,
                        ),
                      );
                  }}
                >
                  <SelectTrigger
                    id={`economic-category-${connection.id}-${index}`}
                    className="h-11 w-full"
                  >
                    <SelectValue placeholder="Vælg nøgletal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {categories.map((category) => (
                        <SelectItem key={category.value} value={category.value}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11"
                aria-label={`Fjern kontolinje ${index + 1}`}
                onClick={() =>
                  setAccountMappings((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
              >
                <Trash2Icon />
              </Button>
            </FieldGroup>
          ))}
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              disabled={
                accountMappings.length >= Math.min(200, accountOptions.length)
              }
              onClick={() =>
                setAccountMappings((current) => [
                  ...current,
                  { accountNumber: null, category: null },
                ])
              }
            >
              <PlusIcon data-icon="inline-start" />
              Tilføj konto
            </Button>
            <HelpTooltip
              label="konti og nøgletal"
              content="Hver konto kan indgå i ét nøgletal. Nettoomsætning fra e-conomic bruges til budget og afstemning. Rapportens omsætning hentes fortsat fra POS."
            />
          </div>
        </FieldGroup>
      </FieldSet>

      <Separator />

      <FieldSet disabled={saving}>
        <FieldLegend>Beregningsgrundlag</FieldLegend>
        <FieldGroup>
          <Field>
            <div className="flex items-center gap-1">
              <FieldLabel id={`economic-budget-${connection.id}`}>
                Budget
              </FieldLabel>
              <HelpTooltip
                label="budget"
                content="Manuelt budget indtastes i månedsrapporten. Budget fra e-conomic bruger de valgte konti og samme lokationskoblinger som de bogførte beløb."
              />
            </div>
            <ToggleGroup
              aria-labelledby={`economic-budget-${connection.id}`}
              variant="outline"
              value={[budgetSource]}
              onValueChange={(values) => {
                const value = values[0];
                if (value === "manual" || value === "economic")
                  setBudgetSource(value);
              }}
            >
              <ToggleGroupItem value="manual" className="h-11">
                Manuelt
              </ToggleGroupItem>
              <ToggleGroupItem value="economic" className="h-11">
                e-conomic
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id={`economic-cogs-${connection.id}`}
              checked={cogsStockAdjusted}
              onCheckedChange={setCogsStockAdjusted}
            />
            <FieldLabel htmlFor={`economic-cogs-${connection.id}`}>
              Vareforbruget er lagerreguleret og godkendt
            </FieldLabel>
            <HelpTooltip
              label="vareforbrug"
              content="Bekræft kun, når kontiene indeholder lagerregulering, og håndteringen af transfers er godkendt. Ellers kræver vareforbruget et manuelt godkendt beløb i månedsrapporten."
            />
          </Field>
        </FieldGroup>
      </FieldSet>
      <div className="flex flex-wrap justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={onDone}
        >
          Annullér
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? <Spinner data-icon="inline-start" /> : null}
          Gem koblinger
        </Button>
      </div>
    </form>
  );
}

function AgreementCard({
  connection,
  settings,
}: {
  connection: Connection;
  settings: Settings;
}) {
  const setEnabled = useMutation(api.economic.setEnabled);
  const disconnect = useMutation(api.economic.disconnect);
  const getCatalog = useAction(api.economic.getCatalog);
  const [busy, setBusy] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [editor, setEditor] = useState<{
    catalog: Catalog;
    connection: Connection;
  } | null>(null);

  async function changeEnabled(enabled: boolean) {
    setBusy(true);
    try {
      await setEnabled({
        connectionId: connection.id,
        enabled,
        expectedRevision: connection.revision,
      });
      toast.success(
        enabled ? "Aftalen er aktiveret" : "Aftalen er deaktiveret",
      );
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Aftalen kunne ikke opdateres. Prøv igen."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await disconnect({
        connectionId: connection.id,
        expectedRevision: connection.revision,
      });
      toast.success("Forbindelsen til aftalen er fjernet");
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Forbindelsen kunne ikke fjernes. Prøv igen.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function edit() {
    setLoadingCatalog(true);
    try {
      const catalog = await getCatalog({ connectionId: connection.id });
      setEditor({ catalog, connection });
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Konti og dimensioner kunne ikke hentes. Prøv igen.",
        ),
      );
    } finally {
      setLoadingCatalog(false);
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{connection.name}</CardTitle>
        <CardDescription>
          Aftale {connection.agreementNumber} · {connection.currency}
        </CardDescription>
        <CardAction className="flex items-center gap-3">
          <Badge variant={connection.enabled ? "default" : "secondary"}>
            {connection.enabled ? "Aktiv" : "Deaktiveret"}
          </Badge>
          <Switch
            aria-label={`Aktivér aftale ${connection.agreementNumber}`}
            checked={connection.enabled}
            disabled={busy || reconnecting || loadingCatalog || editor !== null}
            onCheckedChange={(enabled) => void changeEnabled(enabled)}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {editor ? (
          <MappingEditor
            connection={editor.connection}
            catalog={editor.catalog}
            settings={settings}
            onDone={() => setEditor(null)}
          />
        ) : reconnecting ? (
          <ConnectionForm
            connection={connection}
            onDone={() => setReconnecting(false)}
            onCancel={() => setReconnecting(false)}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="secondary">
              {connection.locationMappings.length} lokationer
            </Badge>
            <Badge variant="secondary">
              {connection.accountMappings.length} konti
            </Badge>
            {connection.locationMappings.length === 0 ||
            connection.accountMappings.length === 0 ? (
              <Badge variant="outline">Mangler koblinger</Badge>
            ) : null}
          </div>
        )}
      </CardContent>
      {!editor && !reconnecting ? (
        <CardFooter className="flex-wrap justify-end gap-3">
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="outline" disabled={busy || loadingCatalog} />
              }
            >
              <UnplugIcon data-icon="inline-start" />
              Fjern aftale
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Fjern aftale {connection.agreementNumber}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Adgangsnøglen og aftalens konto- og lokationskoblinger
                  slettes. Rapporten kan ikke længere hente beløb fra aftalen.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>
                  Behold aftale
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void remove()}
                >
                  Fjern aftale
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            variant="outline"
            disabled={busy || loadingCatalog}
            onClick={() => setReconnecting(true)}
          >
            Opdatér forbindelse
          </Button>
          <Button disabled={busy || loadingCatalog} onClick={() => void edit()}>
            {loadingCatalog ? <Spinner data-icon="inline-start" /> : null}
            Redigér koblinger
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}

export function EconomicIntegration() {
  const access = useAccess();
  const canManage = usePermission("integrations.manage");
  const canManageEconomic = canManage && access?.locationScope.all === true;
  const settings = useQuery(
    api.economic.getSettings,
    canManageEconomic ? {} : "skip",
  );
  const setEnabled = useMutation(api.economic.setEnabled);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  async function changeEnabled(enabled: boolean) {
    if (!settings?.connections.length) {
      setOpen(enabled);
      return;
    }
    const connection = settings.connections[0];
    if (settings.connections.length !== 1 || !connection) return;
    setBusy(true);
    try {
      await setEnabled({
        connectionId: connection.id,
        expectedRevision: connection.revision,
        enabled,
      });
      toast.success(
        enabled ? "e-conomic er aktiveret" : "e-conomic er deaktiveret",
      );
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "e-conomic kunne ikke opdateres. Prøv igen.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!access || (canManageEconomic && !settings))
    return <Skeleton className="h-72 w-full max-w-6xl" />;
  if (!canManageEconomic || !settings) return null;

  const connected = settings.connections.length > 0;
  const multiple = settings.connections.length > 1;

  return (
    <IntegrationCard
      id="economic-integration"
      title="e-conomic"
      description="Hent bogførte omkostninger og budget til månedsrapporten. Beløbene hentes, når rapporten åbnes eller opdateres."
      connected={connected}
      checked={
        connected
          ? settings.connections.some((connection) => connection.enabled)
          : open && settings.configured
      }
      open={open}
      onOpenChange={setOpen}
      onEnabledChange={(enabled) => void changeEnabled(enabled)}
      disabled={busy || !settings.configured || multiple}
      disabledReason={
        multiple
          ? "Aktivér eller deaktivér hver aftale nedenfor"
          : !settings.configured
            ? "Integrationen skal først klargøres på serveren"
            : undefined
      }
      contentClassName="flex flex-col gap-5 pb-4"
    >
      {!settings.configured ? (
        <Alert>
          <AlertTitle>e-conomic er ikke klargjort</AlertTitle>
          <AlertDescription>
            Integrationen skal klargøres på serveren, før du kan forbinde en
            aftale.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {settings.connections.map((connection) => (
            <AgreementCard
              key={connection.id}
              connection={connection}
              settings={settings}
            />
          ))}
          {!connected || adding ? (
            <Card size="sm">
              <CardHeader>
                <CardTitle>
                  {connected ? "Tilføj aftale" : "Forbind aftale"}
                </CardTitle>
                <CardDescription>
                  {connected
                    ? "Forbind en ekstra aftale for en lokation eller et selskab."
                    : "Forbind kædens aftale. Kobl derefter afdelinger eller dimensioner til lokationerne."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ConnectionForm
                  onDone={() => setAdding(false)}
                  onCancel={connected ? () => setAdding(false) : undefined}
                />
              </CardContent>
            </Card>
          ) : (
            <div>
              <Button variant="outline" onClick={() => setAdding(true)}>
                <PlusIcon data-icon="inline-start" />
                Tilføj aftale
              </Button>
            </div>
          )}
        </>
      )}
    </IntegrationCard>
  );
}
