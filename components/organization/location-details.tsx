"use client";

import { getUserErrorMessage } from "@/lib/user-errors";
import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { LocationAddressSearch } from "@/components/organization/location-address-search";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSet } from "@/components/ui/field";
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
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type OwnershipType = "owned" | "franchise" | "jointVenture" | "license";
type LocationStatus = "planned" | "open" | "temporarilyClosed" | "closed";

const ownershipItems = [
  { value: "none", label: "Organisationens egen" },
  { value: "owned", label: "Ejet" },
  { value: "franchise", label: "Franchise" },
  { value: "jointVenture", label: "Joint venture" },
  { value: "license", label: "Licens" },
] satisfies Array<{ value: OwnershipType | "none"; label: string }>;

const statusItems = [
  { value: "none", label: "Ikke angivet" },
  { value: "planned", label: "Planlagt" },
  { value: "open", label: "Åben" },
  { value: "temporarilyClosed", label: "Midlertidigt lukket" },
  { value: "closed", label: "Lukket" },
] satisfies Array<{ value: LocationStatus | "none"; label: string }>;

type Draft = {
  forecastEnabled: boolean;
  googlePlaceId: string | null;
  forecastSource: "manual" | "google";
  forecastCountryCode: string;
  forecastSubdivisionCode: string;
  forecastLatitude: string;
  forecastLongitude: string;
  marketId: Id<"markets"> | null;
  legalEntityId: Id<"legalEntities"> | null;
  operatorId: Id<"operators"> | null;
  ownershipType: OwnershipType | null;
  conceptVersion: string;
  openedAt: string;
  currency: string;
  timeZone: string;
  status: LocationStatus | null;
};

const emptyDraft: Draft = {
  forecastEnabled: false,
  googlePlaceId: null,
  forecastSource: "manual",
  forecastCountryCode: "",
  forecastSubdivisionCode: "",
  forecastLatitude: "",
  forecastLongitude: "",
  marketId: null,
  legalEntityId: null,
  operatorId: null,
  ownershipType: null,
  conceptVersion: "",
  openedAt: "",
  currency: "",
  timeZone: "",
  status: null,
};

function dateValue(timestamp: number | null) {
  return timestamp === null ? "" : new Date(timestamp).toISOString().slice(0, 10);
}

export function LocationDetails(props: {
  locationId: Id<"locations">;
  locationName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return props.open ? <LocationDetailsDialog key={props.locationId} {...props} /> : null;
}

function LocationDetailsDialog({
  locationId,
  locationName,
  open,
  onOpenChange,
}: {
  locationId: Id<"locations">;
  locationName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const details = useQuery(
    api.locations.getLocationDetails,
    open ? { locationId } : "skip",
  );
  const markets = useQuery(api.masterData.listMarkets, open ? {} : "skip");
  const legalEntities = useQuery(
    api.masterData.listLegalEntities,
    open ? {} : "skip",
  );
  const operators = useQuery(
    api.masterData.listOperators,
    open ? {} : "skip",
  );
  const updateLocation = useAction(api.googlePlaces.saveLocation);
  const [initialDetails, setInitialDetails] = useState<FunctionReturnType<typeof api.locations.getLocationDetails> | null>(null);
  if (details && !initialDetails) setInitialDetails(details);
  const [editedDraft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectingPlace, setSelectingPlace] = useState(false);
  const [confirmedForecastChange, setConfirmedForecastChange] = useState(false);
  const draft: Draft = editedDraft ??
    (initialDetails
      ? {
          forecastEnabled: initialDetails.forecastProfile !== null,
          googlePlaceId: initialDetails.googlePlaceId,
          forecastSource: initialDetails.forecastProfile && "source" in initialDetails.forecastProfile ? "google" : "manual",
          forecastCountryCode: initialDetails.forecastProfile?.countryCode ?? "",
          forecastSubdivisionCode: initialDetails.forecastProfile?.subdivisionCode ?? "",
          forecastLatitude: initialDetails.forecastProfile && "latitude" in initialDetails.forecastProfile ? String(initialDetails.forecastProfile.latitude) : "",
          forecastLongitude: initialDetails.forecastProfile && "longitude" in initialDetails.forecastProfile ? String(initialDetails.forecastProfile.longitude) : "",
          marketId: initialDetails.marketId,
          legalEntityId: initialDetails.legalEntityId,
          operatorId: initialDetails.operatorId,
          ownershipType: initialDetails.ownershipType,
          conceptVersion: initialDetails.conceptVersion ?? "",
          openedAt: dateValue(initialDetails.openedAt),
          currency: initialDetails.currency ?? "",
          timeZone: initialDetails.timeZone ?? "",
          status: initialDetails.status,
        }
      : emptyDraft);

  const loading =
    initialDetails === null ||
    markets === undefined ||
    legalEntities === undefined ||
    operators === undefined;
  const marketItems = [
    { value: "none", label: "Intet valgt" },
    ...(markets ?? []).map((market) => ({
      value: market.id,
      label: market.name,
    })),
  ];
  const legalEntityItems = [
    { value: "none", label: "Organisationens egen" },
    ...(legalEntities ?? []).map((entity) => ({
      value: entity.id,
      label: entity.name,
    })),
  ];
  const operatorItems = [
    { value: "none", label: "Ingen operatør" },
    ...(operators ?? []).map((operator) => ({
      value: operator.id,
      label: operator.name,
    })),
  ];

  const originalProfile = initialDetails?.forecastProfile;
  const originalGoogleForecast = !!originalProfile && "source" in originalProfile;
  const forecastSourceChanged = !!originalProfile && draft.forecastEnabled
    && originalGoogleForecast !== (draft.forecastSource === "google");
  const googleForecastChanged = originalGoogleForecast
    && (draft.googlePlaceId !== initialDetails?.googlePlaceId || !draft.forecastEnabled);
  const needsForecastConfirmation = forecastSourceChanged || googleForecastChanged;

  async function save() {
    if (!initialDetails || saving || selectingPlace) return;
    if (needsForecastConfirmation && !confirmedForecastChange) {
      toast.error("Bekræft ændringen af prognosens sted");
      return;
    }
    let forecastProfile: Doc<"locationForecasts">["profile"] | null = null;
    if (draft.forecastEnabled) {
      const countryCode = draft.forecastCountryCode.trim().toUpperCase();
      const subdivisionCode = draft.forecastSubdivisionCode.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(countryCode)) {
        toast.error("Angiv en landekode på 2 bogstaver til prognosen");
        return;
      }
      if (subdivisionCode && !new RegExp(`^${countryCode}-[A-Z0-9]{1,3}$`).test(subdivisionCode)) {
        toast.error("Angiv en regionskode, der starter med landekoden, for eksempel DK-84");
        return;
      }
      const country = { countryCode, ...(subdivisionCode ? { subdivisionCode } : {}) };
      if (draft.forecastSource === "google") {
        if (!draft.googlePlaceId) {
          toast.error("Vælg et Google-sted til prognosen");
          return;
        }
        forecastProfile = { source: "google", ...country };
      } else {
        const latitude = Number(draft.forecastLatitude.replace(",", "."));
        const longitude = Number(draft.forecastLongitude.replace(",", "."));
        if (!draft.forecastLatitude.trim() || !draft.forecastLongitude.trim()
          || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
          || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
          toast.error("Angiv gyldige koordinater til prognosen");
          return;
        }
        const previous = initialDetails.forecastProfile;
        const addressLabel = previous && "latitude" in previous
          && previous.latitude === latitude && previous.longitude === longitude
          ? previous.addressLabel : undefined;
        forecastProfile = { latitude, longitude, ...country, ...(addressLabel ? { addressLabel } : {}) };
      }
    }
    setSaving(true);
    try {
      await updateLocation({
        forecastProfile,
        googlePlaceId: draft.googlePlaceId,
        expectedGooglePlaceId: initialDetails.googlePlaceId,
        locationId,
        marketId: draft.marketId,
        legalEntityId: draft.legalEntityId,
        operatorId: draft.operatorId,
        ownershipType: draft.ownershipType,
        conceptVersion: draft.conceptVersion || null,
        openedAt: draft.openedAt
          ? Date.parse(`${draft.openedAt}T00:00:00.000Z`)
          : null,
        currency: draft.currency || null,
        timeZone: draft.timeZone || null,
        status: draft.status,
      });
      toast.success("Lokationsoplysningerne er gemt");
      onOpenChange(false);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Lokationen kunne ikke gemmes. Prøv igen."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Lokationsoplysninger</DialogTitle>
          <DialogDescription>
            Stamdata for {locationName}. Tomme felter bruger organisationens
            standarder.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <FieldSet disabled={saving} className="gap-5">
            <LocationAddressSearch
              locationId={locationId}
              value={draft.googlePlaceId}
              countryCode={/^[A-Z]{2}$/.test(draft.forecastCountryCode) ? draft.forecastCountryCode : undefined}
              configured={initialDetails?.googlePlacesConfigured ?? false}
              disabled={saving}
              onPendingChange={setSelectingPlace}
              onChange={(googlePlaceId) => {
                setConfirmedForecastChange(false);
                setDraft((current) => {
                  const latest = current ?? draft;
                  return {
                    ...latest,
                    googlePlaceId,
                    forecastEnabled: googlePlaceId === null && latest.forecastSource === "google" ? false : latest.forecastEnabled,
                  };
                });
              }}
            />
            <Field orientation="horizontal" data-disabled={saving}>
              <FieldLabel htmlFor="location-forecast-enabled">Vejr og helligdage i prognoser</FieldLabel>
              <HelpTooltip label="prognoser" content="Prognoser lærer af lokationens salg på tidligere dage med lignende vejr og helligdage. Koordinater og landekode deles med vejr- og kalenderudbyderne. Salgstal deles ikke. Det tilknyttede Google-sted kan bruges til at finde koordinaterne." />
              <Switch id="location-forecast-enabled" checked={draft.forecastEnabled} disabled={saving}
                onCheckedChange={(forecastEnabled) => { setConfirmedForecastChange(false); setDraft({ ...draft, forecastEnabled }); }} />
            </Field>
            {draft.forecastEnabled && (
              <FieldSet disabled={saving}>
                <Field>
                  <FieldLabel id="location-forecast-source">Sted til prognoser</FieldLabel>
                  <ToggleGroup
                    aria-labelledby="location-forecast-source"
                    variant="outline"
                    value={[draft.forecastSource]}
                    onValueChange={(values) => {
                      const forecastSource = values[0];
                      if (forecastSource !== "google" && forecastSource !== "manual") return;
                      setConfirmedForecastChange(false);
                      setDraft({ ...draft, forecastSource });
                    }}
                  >
                    <ToggleGroupItem value="manual">Manuelle koordinater</ToggleGroupItem>
                    <ToggleGroupItem value="google" disabled={!draft.googlePlaceId || !initialDetails?.googlePlacesConfigured}>Google-sted</ToggleGroupItem>
                  </ToggleGroup>
                  {originalProfile && "latitude" in originalProfile && draft.forecastSource === "manual" && (
                    <FieldDescription>De eksisterende koordinater bruges fortsat. Vælg Google-sted for at skifte.</FieldDescription>
                  )}
                  {draft.forecastSource === "google" && <FieldDescription>Prognosen bruger koordinater fra det tilknyttede Google-sted.</FieldDescription>}
                </Field>
                {draft.forecastSource === "manual" && (
                  <FieldGroup className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="location-forecast-latitude">Breddegrad</FieldLabel>
                      <Input id="location-forecast-latitude" inputMode="decimal" placeholder="55.6761"
                        value={draft.forecastLatitude} onChange={(event) => setDraft({ ...draft, forecastLatitude: event.target.value })} />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="location-forecast-longitude">Længdegrad</FieldLabel>
                      <Input id="location-forecast-longitude" inputMode="decimal" placeholder="12.5683"
                        value={draft.forecastLongitude} onChange={(event) => setDraft({ ...draft, forecastLongitude: event.target.value })} />
                    </Field>
                  </FieldGroup>
                )}
                <FieldGroup className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <div className="flex items-center gap-2">
                      <FieldLabel htmlFor="location-forecast-country">Landekode</FieldLabel>
                      <HelpTooltip label="landekode" content="Angiv landets ISO-kode på 2 bogstaver, for eksempel DK. Landet bruges til helligdage og angives uafhængigt af Google-stedet." />
                    </div>
                    <Input id="location-forecast-country" maxLength={2} placeholder="DK" autoComplete="off"
                      value={draft.forecastCountryCode} onChange={(event) => setDraft({ ...draft, forecastCountryCode: event.target.value.toUpperCase() })} />
                  </Field>
                  <Field>
                    <div className="flex items-center gap-2">
                      <FieldLabel htmlFor="location-forecast-subdivision">Regionskode</FieldLabel>
                      <HelpTooltip label="regionskode" content="Valgfri ISO-regionskode, for eksempel DK-84. Bruges, når en helligdag kun gælder i en del af landet. Lad feltet stå tomt for nationale helligdage." />
                    </div>
                    <Input id="location-forecast-subdivision" maxLength={6} placeholder="DK-84" autoComplete="off"
                      value={draft.forecastSubdivisionCode} onChange={(event) => setDraft({ ...draft, forecastSubdivisionCode: event.target.value.toUpperCase() })} />
                  </Field>
                </FieldGroup>
              </FieldSet>
            )}
            {needsForecastConfirmation && (
              <Field orientation="horizontal" data-disabled={saving}>
                <Checkbox id="location-confirm-forecast" checked={confirmedForecastChange} disabled={saving}
                  onCheckedChange={setConfirmedForecastChange} />
                <FieldLabel htmlFor="location-confirm-forecast">
                  {draft.forecastEnabled
                    ? "Jeg bekræfter, at prognosen skal bruge det nye sted. Vejr og helligdage genberegnes, når jeg gemmer."
                    : "Jeg bekræfter, at vejr og helligdage skal slås fra for prognosen, når jeg gemmer."}
                </FieldLabel>
              </Field>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="location-market">Marked</FieldLabel>
                <Select
                  items={marketItems}
                  value={draft.marketId ?? "none"}
                  onValueChange={(value) =>
                    setDraft({
                      ...draft,
                      marketId:
                        value === "none" ? null : (value as Id<"markets">),
                    })
                  }
                >
                  <SelectTrigger id="location-market" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">Intet valgt</SelectItem>
                      {markets.map((market) => (
                        <SelectItem key={market.id} value={market.id}>
                          {market.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="location-legal-entity">
                  Juridisk enhed
                </FieldLabel>
                <Select
                  items={legalEntityItems}
                  value={draft.legalEntityId ?? "none"}
                  onValueChange={(value) =>
                    setDraft({
                      ...draft,
                      legalEntityId:
                        value === "none"
                          ? null
                          : (value as Id<"legalEntities">),
                    })
                  }
                >
                  <SelectTrigger id="location-legal-entity" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">Organisationens egen</SelectItem>
                      {legalEntities.map((entity) => (
                        <SelectItem key={entity.id} value={entity.id}>
                          {entity.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="location-operator">Operatør</FieldLabel>
                <Select
                  items={operatorItems}
                  value={draft.operatorId ?? "none"}
                  onValueChange={(value) =>
                    setDraft({
                      ...draft,
                      operatorId:
                        value === "none" ? null : (value as Id<"operators">),
                    })
                  }
                >
                  <SelectTrigger id="location-operator" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">Ingen operatør</SelectItem>
                      {operators.map((operator) => (
                        <SelectItem key={operator.id} value={operator.id}>
                          {operator.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="location-ownership">Ejerskab</FieldLabel>
                <Select
                  items={ownershipItems}
                  value={draft.ownershipType ?? "none"}
                  onValueChange={(value) =>
                    setDraft({
                      ...draft,
                      ownershipType:
                        value === "none" ? null : (value as OwnershipType),
                    })
                  }
                >
                  <SelectTrigger id="location-ownership" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">Organisationens egen</SelectItem>
                      <SelectItem value="owned">Ejet</SelectItem>
                      <SelectItem value="franchise">Franchise</SelectItem>
                      <SelectItem value="jointVenture">Joint venture</SelectItem>
                      <SelectItem value="license">Licens</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="location-concept">Konceptversion</FieldLabel>
                <Input
                  id="location-concept"
                  value={draft.conceptVersion}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      conceptVersion: event.target.value,
                    })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="location-opened-at">Åbningsdato</FieldLabel>
                <Input
                  id="location-opened-at"
                  type="date"
                  value={draft.openedAt}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      openedAt: event.target.value,
                    })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="location-currency">Valuta</FieldLabel>
                <Input
                  id="location-currency"
                  value={draft.currency}
                  maxLength={3}
                  placeholder="DKK"
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      currency: event.target.value.toUpperCase(),
                    })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="location-time-zone">Tidszone</FieldLabel>
                <Input
                  id="location-time-zone"
                  value={draft.timeZone}
                  placeholder="Europe/Copenhagen"
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      timeZone: event.target.value,
                    })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="location-status">Status</FieldLabel>
                <Select
                  items={statusItems}
                  value={draft.status ?? "none"}
                  onValueChange={(value) =>
                    setDraft({
                      ...draft,
                      status:
                        value === "none" ? null : (value as LocationStatus),
                    })
                  }
                >
                  <SelectTrigger id="location-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">Ikke angivet</SelectItem>
                      <SelectItem value="planned">Planlagt</SelectItem>
                      <SelectItem value="open">Åben</SelectItem>
                      <SelectItem value="temporarilyClosed">
                        Midlertidigt lukket
                      </SelectItem>
                      <SelectItem value="closed">Lukket</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </FieldSet>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Annullér
          </Button>
          <Button disabled={loading || saving || selectingPlace || (needsForecastConfirmation && !confirmedForecastChange)} onClick={save}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            Gem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
