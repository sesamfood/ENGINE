"use client";

import { getUserErrorMessage } from "@/lib/user-errors";
import {
  CircleAlertIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CloudOffIcon,
  ExternalLinkIcon,
  Link2Icon,
  RefreshCwIcon,
  SaveIcon,
  ServerCogIcon,
  UnplugIcon,
} from "lucide-react";
import { useAction, useMutation, useQuery } from "convex/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAccess, usePermission } from "@/components/app-shell";
import {
  CreatableCombobox,
  type ComboboxOption,
} from "@/components/catalog/creatable-combobox";
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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import {
  formatWoltDateTime,
  woltHealthLabel,
  woltHealthVariant,
} from "@/components/wolt/wolt-format";
import type {
  WoltIntegrationOverview,
  WoltObservedItem,
} from "@/components/wolt/wolt-types";

type WoltLocation = WoltIntegrationOverview["locations"][number];
type ProductOption = { id: Id<"products">; name: string };

type MatchChoice = {
  matchType: "gtin" | "posId" | "sku" | "name";
  matchValue: string;
  label: string;
};

function bestMatchChoice(row: WoltObservedItem): MatchChoice {
  if (row.gtin) return { matchType: "gtin", matchValue: row.gtin, label: "GTIN" };
  if (row.posId) return { matchType: "posId", matchValue: row.posId, label: "POS-id" };
  if (row.sku) return { matchType: "sku", matchValue: row.sku, label: "SKU" };
  return { matchType: "name", matchValue: row.name, label: "navn" };
}

function formatExpiry(value: number) {
  return value > 0 ? formatWoltDateTime(value) : "Ikke tilgængelig";
}

function ConnectionHealth({
  location,
  connection,
  busy,
  onRetry,
}: {
  location: WoltLocation;
  connection: NonNullable<WoltLocation["connection"]>;
  busy: boolean;
  onRetry: () => void;
}) {
  const canRetry = connection.state === "ready" && connection.deadLetterCount > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={woltHealthVariant(connection.state)}>
          {woltHealthLabel(connection.state)}
        </Badge>
        <Badge variant="outline">
          {connection.onboardingMode === "ssio" ? "SSIO" : "WIO"}
        </Badge>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-muted-foreground">Venue-id</dt>
          <dd className="truncate font-mono text-xs" title={connection.venueId}>{connection.venueId}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Aktiveret</dt>
          <dd className="font-medium">{formatWoltDateTime(connection.activatedAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Adgangstoken udløber</dt>
          <dd className="font-medium">{formatExpiry(connection.accessTokenExpiresAt)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Seneste webhook</dt>
          <dd className="font-medium">
            {connection.lastWebhookAt ? formatWoltDateTime(connection.lastWebhookAt) : "Ingen endnu"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Seneste hentning</dt>
          <dd className="font-medium">
            {connection.lastSuccessAt ? formatWoltDateTime(connection.lastSuccessAt) : "Ingen endnu"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Kø</dt>
          <dd className="font-medium">{connection.backlogCount}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={connection.deadLetterCount ? "destructive" : "secondary"}>
          {connection.deadLetterCount} fejlede events
        </Badge>
        {connection.deadLetterCount ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-11"
            disabled={!canRetry || busy}
            title={!canRetry ? "Forbindelsen skal være klar" : undefined}
            onClick={onRetry}
          >
            {busy ? <Spinner data-icon="inline-start" /> : <RefreshCwIcon data-icon="inline-start" />}
            Prøv fejlede events igen
          </Button>
        ) : null}
      </div>
      {connection.lastError ? (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Seneste fejl</AlertTitle>
          <AlertDescription>{connection.lastError}</AlertDescription>
        </Alert>
      ) : null}
      {connection.state === "reauthorizationRequired" ? (
        <p className="text-sm text-muted-foreground">
          Start SSIO igen for at godkende lokationen på ny.
        </p>
      ) : null}
      <span className="sr-only">Lokation {location.name}</span>
    </div>
  );
}

function LocationHealthCard({
  location,
  canUseWio,
  busyKey,
  onStartSsio,
  onSavePartner,
  onRemovePartner,
  onDisconnect,
  onRetry,
}: {
  location: WoltLocation;
  canUseWio: boolean;
  busyKey: string | null;
  onStartSsio: () => void;
  onSavePartner: (partnerVenueId: string) => void;
  onRemovePartner: () => void;
  onDisconnect: () => void;
  onRetry: () => void;
}) {
  const [partnerVenueDraft, setPartnerVenueDraft] = useState(location.partnerVenueId ?? "");
  const connection = location.connection;
  const partnerChanged = partnerVenueDraft.trim() !== (location.partnerVenueId ?? "");
  const ssioBusy = busyKey === `ssio:${location.id}`;
  const partnerBusy = busyKey === `partner:${location.id}`;
  const removePartnerBusy = busyKey === `remove-partner:${location.id}`;
  const disconnectBusy = busyKey === `disconnect:${location.id}`;
  const retryBusy = busyKey === `retry:${location.id}`;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{location.name}</CardTitle>
        <CardDescription>
          Forbindelse og modtagelse af Wolt-events for lokationen.
        </CardDescription>
        <CardAction>
          <Badge variant={connection ? woltHealthVariant(connection.state) : "secondary"}>
            {connection ? woltHealthLabel(connection.state) : "Ikke forbundet"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {connection ? (
          <ConnectionHealth
            location={location}
            connection={connection}
            busy={retryBusy}
            onRetry={onRetry}
          />
        ) : (
          <Alert>
            <CloudOffIcon aria-hidden="true" />
            <AlertTitle>Ingen Wolt-forbindelse</AlertTitle>
            <AlertDescription>
              Start SSIO for at forbinde denne lokation. Forbindelsen henter kun nye events efter godkendelsen.
            </AlertDescription>
          </Alert>
        )}

        <FieldGroup className="gap-3">
          <Field data-disabled={!canUseWio}>
            <FieldLabel htmlFor={`wolt-partner-venue-${location.id}`}>
              WIO partner-venue-id
            </FieldLabel>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id={`wolt-partner-venue-${location.id}`}
                value={partnerVenueDraft}
                onChange={(event) => setPartnerVenueDraft(event.target.value)}
                placeholder="Partner-venue-id fra Wolt"
                autoComplete="off"
                disabled={!canUseWio || partnerBusy}
                className="h-11 min-w-0 flex-1"
              />
              <Button
                type="button"
                size="lg"
                className="min-h-11"
                disabled={!canUseWio || !partnerVenueDraft.trim() || !partnerChanged || partnerBusy}
                onClick={() => onSavePartner(partnerVenueDraft.trim())}
              >
                {partnerBusy ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
                Gem
              </Button>
            </div>
            <FieldDescription>
              Partner-venue-id bruges kun ved WIO. Forslag eller indtastede værdier gemmes ikke, før du vælger Gem.
            </FieldDescription>
          </Field>
          {!canUseWio ? (
            <p className="text-sm text-muted-foreground">
              WIO-konfiguration kræver adgang til alle lokationer.
            </p>
          ) : null}
        </FieldGroup>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="min-h-11"
            disabled={ssioBusy}
            onClick={onStartSsio}
          >
            {ssioBusy ? <Spinner data-icon="inline-start" /> : <ExternalLinkIcon data-icon="inline-start" />}
            {connection ? "Godkend SSIO igen" : "Start SSIO"}
          </Button>
          {location.partnerVenueId ? (
            <AlertDialog>
              <AlertDialogTrigger
                render={<Button type="button" variant="ghost" size="lg" className="min-h-11" disabled={removePartnerBusy} />}
              >
                {removePartnerBusy ? <Spinner data-icon="inline-start" /> : <UnplugIcon data-icon="inline-start" />}
                Fjern WIO-id
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Fjern WIO partner-venue-id?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Nye WIO-events for {location.name} kan ikke kobles til lokationen, før et nyt id er gemt.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={removePartnerBusy}>Behold id</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={removePartnerBusy}
                    onClick={onRemovePartner}
                  >
                    {removePartnerBusy ? <Spinner data-icon="inline-start" /> : null}
                    Fjern id
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
          {connection ? (
            <AlertDialog>
              <AlertDialogTrigger
                render={<Button type="button" variant="ghost" size="lg" className="min-h-11" disabled={disconnectBusy} />}
              >
                {disconnectBusy ? <Spinner data-icon="inline-start" /> : <UnplugIcon data-icon="inline-start" />}
                Afbryd forbindelse
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Afbryd Wolt-forbindelsen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Nye Wolt-events hentes ikke for {location.name}. Eksisterende ordredata og historik bevares.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={disconnectBusy}>Behold forbindelse</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={disconnectBusy}
                    onClick={onDisconnect}
                  >
                    {disconnectBusy ? <Spinner data-icon="inline-start" /> : null}
                    Afbryd forbindelse
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function IdentifierList({ row }: { row: WoltObservedItem }) {
  const identifiers = [
    ["GTIN", row.gtin],
    ["POS-id", row.posId],
    ["SKU", row.sku],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  return identifiers.length ? (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {identifiers.map(([label, value]) => (
        <div key={label} className="flex gap-1">
          <dt>{label}:</dt>
          <dd className="font-mono">{value}</dd>
        </div>
      ))}
    </dl>
  ) : null;
}

function ObservedMappingRow({
  row,
  selectedProductId,
  mappingScope,
  saving,
  canDelete,
  canUseWio,
  products,
  onScopeChange,
  onSelect,
  onSave,
  onDelete,
}: {
  row: WoltObservedItem;
  selectedProductId: Id<"products"> | null;
  mappingScope: Id<"locations"> | "all";
  saving: boolean;
  canDelete: boolean;
  canUseWio: boolean;
  products: ProductOption[];
  onScopeChange: (scope: Id<"locations"> | "all") => void;
  onSelect: (productId: Id<"products">) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const match = bestMatchChoice(row);
  const productOptions: ComboboxOption[] = products.map((product) => ({
    value: product.id,
    label: product.name,
  }));
  const suggestionOptions: ComboboxOption[] = row.suggestions.map((product) => ({
    value: product.id,
    label: product.name,
  }));
  const currentMapping = row.mapping;

  return (
    <article className="flex flex-col gap-4 rounded-xl border p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="truncate font-medium" title={row.name}>{row.name}</h3>
          <p className="text-sm text-muted-foreground">{row.locationName}</p>
          <IdentifierList row={row} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {row.conflict ? <Badge variant="destructive">Konflikt</Badge> : null}
          {currentMapping ? (
            <Badge variant="default">Koblet{currentMapping.locationOverride ? " lokalt" : " globalt"}</Badge>
          ) : (
            <Badge variant="secondary">Ikke koblet</Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <FieldGroup className="gap-3 sm:grid sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`wolt-mapping-scope-${row.key}`}>Gælder for</FieldLabel>
            {canUseWio ? (
              <Select
                items={[
                  { value: "all", label: "Alle lokationer" },
                  { value: row.locationId, label: `Kun ${row.locationName}` },
                ]}
                value={mappingScope === "all" ? "all" : String(mappingScope)}
                onValueChange={(value) => {
                  if (value === "all") {
                    onScopeChange("all");
                    return;
                  }
                  if (value === String(row.locationId)) onScopeChange(row.locationId);
                }}
                disabled={saving}
              >
                <SelectTrigger id={`wolt-mapping-scope-${row.key}`} className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">Alle lokationer</SelectItem>
                    <SelectItem value={row.locationId}>Kun {row.locationName}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : (
              <p className="flex h-11 items-center rounded-lg border px-3 text-sm text-muted-foreground">
                Kun {row.locationName}
              </p>
            )}
            <FieldDescription>
              En global kobling bruges på tværs af lokationer.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel>Lokalt produkt</FieldLabel>
            {productOptions.length ? (
              <CreatableCombobox
                options={productOptions}
                suggestionOptions={suggestionOptions}
                suggestionLabel="Navneforslag"
                value={selectedProductId}
                onValueChange={(value) => {
                  const product = products.find((candidate) => candidate.id === value);
                  if (product) onSelect(product.id);
                }}
                placeholder="Søg efter produkt"
                ariaLabel={`Vælg lokalt produkt til ${row.name}`}
                disabled={saving}
              />
            ) : (
              <p className="flex h-11 items-center rounded-lg border px-3 text-sm text-muted-foreground">
                Ingen produktforslag endnu.
              </p>
            )}
            <FieldDescription>
              Forslagene er kun navneforslag. Gem manuelt på {match.label} ({match.matchValue}).
            </FieldDescription>
          </Field>
        </FieldGroup>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button
            type="button"
            size="lg"
            className="min-h-11"
            disabled={!selectedProductId || saving}
            onClick={onSave}
          >
            {saving ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
            Gem
          </Button>
          {currentMapping ? (
            <AlertDialog>
              <AlertDialogTrigger
                render={<Button type="button" variant="outline" size="lg" className="min-h-11" disabled={!canDelete || saving} />}
              >
                Fjern kobling
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Fjern produktkoblingen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Koblingen for {row.name} fjernes. Det påvirker fremtidige visninger af mapping-status.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={saving}>Behold kobling</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={!canDelete || saving}
                    onClick={onDelete}
                  >
                    Fjern kobling
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </div>
      {currentMapping && !canDelete ? (
        <p className="text-xs text-muted-foreground">
          En global kobling kan kun fjernes af en bruger med adgang til alle lokationer.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Senest observeret {formatWoltDateTime(row.lastObservedAt)}
      </p>
    </article>
  );
}

function ObservedItemMappings({
  overview,
  observed,
  locationFilter,
  onLocationChange,
  mappingDrafts,
  mappingScopes,
  products,
  savingKey,
  canUseWio,
  onSelectProduct,
  onScopeChange,
  onSave,
  onDelete,
}: {
  overview: WoltIntegrationOverview;
  observed: { rows: WoltObservedItem[]; truncated: boolean } | undefined;
  locationFilter: Id<"locations"> | "all";
  onLocationChange: (value: Id<"locations"> | "all") => void;
  mappingDrafts: Record<string, Id<"products"> | undefined>;
  mappingScopes: Record<string, Id<"locations"> | "all" | undefined>;
  products: ProductOption[] | undefined;
  savingKey: string | null;
  canUseWio: boolean;
  onSelectProduct: (rowKey: string, productId: Id<"products">) => void;
  onScopeChange: (rowKey: string, scope: Id<"locations"> | "all") => void;
  onSave: (row: WoltObservedItem, productId: Id<"products">, scope: Id<"locations"> | "all") => void;
  onDelete: (row: WoltObservedItem) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2Icon aria-hidden="true" />
          Observerede Wolt-produkter
        </CardTitle>
        <CardDescription>
          Vælg et lokalt Produkt for hver observeret Wolt-vare. Ingen forslag gemmes automatisk.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <FieldGroup className="sm:max-w-sm">
          <Field>
            <FieldLabel htmlFor="wolt-observed-location">Lokation</FieldLabel>
            <Select
              items={[
                { value: "all", label: "Alle lokationer" },
                ...overview.locations.map((location) => ({
                  value: location.id,
                  label: location.name,
                })),
              ]}
              value={locationFilter === "all" ? "all" : String(locationFilter)}
              onValueChange={(value) => {
                if (value === "all") {
                  onLocationChange("all");
                  return;
                }
                const selected = overview.locations.find((location) => location.id === value);
                if (selected) onLocationChange(selected.id);
              }}
            >
              <SelectTrigger id="wolt-observed-location" className="h-11 w-full">
                <SelectValue placeholder="Alle lokationer" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">Alle lokationer</SelectItem>
                  {overview.locations.map((location) => (
                    <SelectItem key={location.id} value={location.id}>
                      {location.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        {!canUseWio ? (
          <Alert>
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>Global WIO-konfiguration er begrænset</AlertTitle>
            <AlertDescription>
              Produktkoblinger kan stadig gemmes for en tilgængelig lokation. Globale koblinger kræver adgang til alle lokationer.
            </AlertDescription>
          </Alert>
        ) : null}
        {observed === undefined || products === undefined ? (
          <div className="flex flex-col gap-3" aria-label="Indlæser observerede produkter">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : observed.rows.length === 0 ? (
          <Empty className="min-h-48 border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon"><ServerCogIcon aria-hidden="true" /></EmptyMedia>
              <EmptyTitle>Ingen observerede Wolt-produkter</EmptyTitle>
              <EmptyDescription>
                Produktlinjer bliver synlige her, når Wolt-ordrer er modtaget.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {observed.rows.map((row) => {
              const selectedProductId = mappingDrafts[row.key] ?? row.mapping?.productId ?? null;
              const defaultScope = row.mapping?.locationOverride || !canUseWio
                ? row.locationId
                : "all";
              const mappingScope = mappingScopes[row.key] ?? defaultScope;
              return (
                <ObservedMappingRow
                  key={row.key}
                  row={row}
                  selectedProductId={selectedProductId}
                  mappingScope={mappingScope}
                  saving={savingKey === `mapping:${row.key}` || savingKey === `delete:${row.key}`}
                  canDelete={canUseWio || Boolean(row.mapping?.locationOverride)}
                  canUseWio={canUseWio}
                  products={products}
                  onScopeChange={(scope) => onScopeChange(row.key, scope)}
                  onSelect={(productId) => onSelectProduct(row.key, productId)}
                  onSave={() => {
                    if (selectedProductId) onSave(row, selectedProductId, mappingScope);
                  }}
                  onDelete={() => onDelete(row)}
                />
              );
            })}
          </div>
        )}
        {observed?.truncated ? (
          <Alert>
            <CircleAlertIcon aria-hidden="true" />
            <AlertTitle>Listen er afkortet</AlertTitle>
            <AlertDescription>
              Der er flere observerede varer eller koblinger end denne visning kan hente.
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function WoltIntegration() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackHandled = useRef(false);
  const access = useAccess();
  const canManage = usePermission("integrations.manage");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const integrationOpen = detailsOpen || setupOpen;
  const overview = useQuery(api.wolt.getIntegrationOverview, canManage ? {} : "skip");
  const observedLocationState = useState<Id<"locations"> | "all">("all");
  const observedLocationFilter = observedLocationState[0];
  const setObservedLocationFilter = observedLocationState[1];
  const observed = useQuery(
    api.wolt.listObservedItems,
    canManage && integrationOpen
      ? { locationId: observedLocationFilter === "all" ? null : observedLocationFilter }
      : "skip",
  );
  const products = useQuery(
    api.catalog.listActiveProductSearchOptions,
    canManage && integrationOpen ? {} : "skip",
  );
  const beginSsio = useAction(api.wolt.beginSsio);
  const setPartnerVenueMapping = useMutation(api.wolt.setPartnerVenueMapping);
  const removePartnerVenueMapping = useMutation(api.wolt.removePartnerVenueMapping);
  const disconnectLocation = useMutation(api.wolt.disconnectLocation);
  const retryDeadLetters = useMutation(api.wolt.retryDeadLetters);
  const setEnabled = useMutation(api.wolt.setEnabled);
  const saveProductMapping = useMutation(api.wolt.saveProductMapping);
  const deleteProductMapping = useMutation(api.wolt.deleteProductMapping);
  const [changingEnabled, setChangingEnabled] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [mappingDrafts, setMappingDrafts] = useState<Record<string, Id<"products"> | undefined>>({});
  const [mappingScopes, setMappingScopes] = useState<Record<string, Id<"locations"> | "all" | undefined>>({});

  useEffect(() => {
    const result = searchParams.get("wolt");
    if (callbackHandled.current || (result !== "processing" && result !== "error")) {
      return;
    }
    callbackHandled.current = true;
    setDetailsOpen(true);
    if (result === "processing") {
      toast.success("Wolt-godkendelsen behandles. Status opdateres automatisk.");
    } else {
      toast.error("Wolt-godkendelsen kunne ikke startes. Prøv igen.");
    }
    const next = new URLSearchParams(searchParams.toString());
    next.delete("wolt");
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  async function changeIntegrationEnabled(enabled: boolean) {
    if (!overview?.connected) {
      setSetupOpen(enabled);
      return;
    }

    setChangingEnabled(true);
    try {
      await setEnabled({ enabled });
      setDetailsOpen(false);
      setSetupOpen(false);
      toast.success(
        enabled
          ? "Wolt-integrationen er aktiveret"
          : "Wolt-integrationen er deaktiveret",
      );
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Wolt-integrationen kunne ikke opdateres. Prøv igen."));
    } finally {
      setChangingEnabled(false);
    }
  }

  async function startSsio(locationId: Id<"locations">) {
    setBusyKey(`ssio:${locationId}`);
    try {
      const result = await beginSsio({ locationId });
      window.location.assign(result.url);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Wolt-integrationen kunne ikke opdateres. Prøv igen."));
      setBusyKey(null);
    }
  }

  async function savePartner(locationId: Id<"locations">, partnerVenueId: string) {
    setBusyKey(`partner:${locationId}`);
    try {
      const result = await setPartnerVenueMapping({ locationId, partnerVenueId });
      toast.success(
          result.adoptedOnboardingEvents
          ? `WIO-id gemt. ${result.adoptedOnboardingEvents} opsætnings-events blev sat i kø.`
          : "WIO partner-venue-id er gemt",
      );
      setBusyKey(null);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Wolt-integrationen kunne ikke opdateres. Prøv igen."));
      setBusyKey(null);
    }
  }

  async function removePartner(locationId: Id<"locations">) {
    setBusyKey(`remove-partner:${locationId}`);
    try {
      await removePartnerVenueMapping({ locationId });
      toast.success("WIO partner-venue-id er fjernet");
      setBusyKey(null);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Wolt-integrationen kunne ikke opdateres. Prøv igen."));
      setBusyKey(null);
    }
  }

  async function disconnect(locationId: Id<"locations">) {
    setBusyKey(`disconnect:${locationId}`);
    try {
      await disconnectLocation({ locationId });
      toast.success("Wolt-forbindelsen er afbrudt");
      setBusyKey(null);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Wolt-integrationen kunne ikke opdateres. Prøv igen."));
      setBusyKey(null);
    }
  }

  async function retry(locationId: Id<"locations">) {
    setBusyKey(`retry:${locationId}`);
    try {
      const count = await retryDeadLetters({ locationId });
      toast.success(`${count} fejlede events blev sat til nyt forsøg`);
      setBusyKey(null);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Wolt-integrationen kunne ikke opdateres. Prøv igen."));
      setBusyKey(null);
    }
  }

  async function saveMapping(
    row: WoltObservedItem,
    productId: Id<"products">,
    scope: Id<"locations"> | "all",
  ) {
    const match = bestMatchChoice(row);
    setBusyKey(`mapping:${row.key}`);
    try {
      await saveProductMapping({
        locationId: scope === "all" ? null : scope,
        matchType: match.matchType,
        matchValue: match.matchValue,
        productId,
      });
      toast.success(`Produktkoblingen for ${row.name} er gemt`);
      setMappingDrafts((current) => {
        const next = { ...current };
        delete next[row.key];
        return next;
      });
      setMappingScopes((current) => {
        const next = { ...current };
        delete next[row.key];
        return next;
      });
      setBusyKey(null);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Wolt-integrationen kunne ikke opdateres. Prøv igen."));
      setBusyKey(null);
    }
  }

  async function deleteMapping(row: WoltObservedItem) {
    if (!row.mapping) return;
    setBusyKey(`delete:${row.key}`);
    try {
      await deleteProductMapping({ mappingId: row.mapping.id });
      toast.success(`Produktkoblingen for ${row.name} er fjernet`);
      setMappingDrafts((current) => {
        const next = { ...current };
        delete next[row.key];
        return next;
      });
      setMappingScopes((current) => {
        const next = { ...current };
        delete next[row.key];
        return next;
      });
      setBusyKey(null);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Wolt-integrationen kunne ikke opdateres. Prøv igen."));
      setBusyKey(null);
    }
  }

  if (!access) return <Skeleton className="h-96 w-full max-w-6xl" />;

  if (!canManage) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <CircleAlertIcon aria-hidden="true" />
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at administrere Wolt-integrationen.
        </AlertDescription>
      </Alert>
    );
  }

  if (!overview || !products) {
    return <Skeleton className="h-96 w-full max-w-6xl" />;
  }

  return (
    <Collapsible
      open={integrationOpen}
      onOpenChange={(open) => {
        setDetailsOpen(open);
        if (!open && !overview.connected) setSetupOpen(false);
      }}
    >
      <Card className="max-w-6xl">
        <CardHeader>
          <CardTitle>Wolt</CardTitle>
          <CardDescription>
            Modtag Wolt-ordrer, og overvåg forbindelser pr. lokation.
          </CardDescription>
          <CardAction className="flex items-center gap-3">
            <Field orientation="horizontal" className="w-auto">
              <Switch
                id="wolt-integration-enabled"
                aria-controls={
                  overview.connected ? undefined : "wolt-integration-settings"
                }
                aria-expanded={overview.connected ? undefined : integrationOpen}
                aria-label="Aktivér Wolt-integration"
                checked={overview.connected ? overview.enabled : setupOpen}
                disabled={
                  changingEnabled || (overview.connected && !overview.canUseWio)
                }
                title={
                  overview.connected && !overview.canUseWio
                    ? "Kræver adgang til alle lokationer"
                    : undefined
                }
                onCheckedChange={(enabled) =>
                  void changeIntegrationEnabled(enabled)
                }
              />
            </Field>
            <CollapsibleTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`${integrationOpen ? "Skjul" : "Vis"} Wolt-indstillinger`}
                />
              }
            >
              {integrationOpen ? "Skjul" : "Vis"}
              {integrationOpen ? (
                <ChevronUpIcon data-icon="inline-end" />
              ) : (
                <ChevronDownIcon data-icon="inline-end" />
              )}
            </CollapsibleTrigger>
          </CardAction>
        </CardHeader>
        <CollapsibleContent id="wolt-integration-settings">
          <CardContent className="flex flex-col gap-5">
            <div>
              <Badge variant="outline">Kun læsning af ordredata</Badge>
            </div>
            {overview.limitReached ? (
              <Alert>
                <CircleAlertIcon aria-hidden="true" />
                <AlertTitle>Visningen er begrænset</AlertTitle>
                <AlertDescription>
                  Der er flere Wolt-lokationer eller events end administrationsvisningen kan vise. Kontakt en administrator, før du foretager bulkændringer.
                </AlertDescription>
              </Alert>
            ) : null}
            {!overview.canUseWio ? (
              <Alert>
                <CircleAlertIcon aria-hidden="true" />
                <AlertTitle>WIO kræver adgang til alle lokationer</AlertTitle>
                <AlertDescription>
                  Du kan stadig forbinde en tilgængelig lokation med SSIO. WIO partner-venue-id’er kræver adgang til hele organisationen.
                </AlertDescription>
              </Alert>
            ) : null}
            {overview.locations.length ? (
              <div className="grid gap-5 xl:grid-cols-2">
                {overview.locations.map((location) => (
                  <LocationHealthCard
                    key={`${location.id}:${location.partnerVenueId ?? ""}`}
                    location={location}
                    canUseWio={overview.canUseWio}
                    busyKey={busyKey}
                    onStartSsio={() => void startSsio(location.id)}
                    onSavePartner={(partnerVenueId) => void savePartner(location.id, partnerVenueId)}
                    onRemovePartner={() => void removePartner(location.id)}
                    onDisconnect={() => void disconnect(location.id)}
                    onRetry={() => void retry(location.id)}
                  />
                ))}
              </div>
            ) : (
              <Empty className="min-h-48">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><CloudOffIcon aria-hidden="true" /></EmptyMedia>
                  <EmptyTitle>Ingen tilgængelige lokationer</EmptyTitle>
                  <EmptyDescription>Der er ingen lokationer, du kan administrere Wolt for.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            <ObservedItemMappings
              overview={overview}
              observed={observed}
              locationFilter={observedLocationFilter}
              onLocationChange={setObservedLocationFilter}
              mappingDrafts={mappingDrafts}
              mappingScopes={mappingScopes}
              products={products}
              savingKey={busyKey}
              canUseWio={overview.canUseWio}
              onSelectProduct={(rowKey, productId) => {
                setMappingDrafts((current) => ({ ...current, [rowKey]: productId }));
              }}
              onScopeChange={(rowKey, scope) => {
                setMappingScopes((current) => ({ ...current, [rowKey]: scope }));
              }}
              onSave={(row, productId, scope) => void saveMapping(row, productId, scope)}
              onDelete={(row) => void deleteMapping(row)}
            />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
