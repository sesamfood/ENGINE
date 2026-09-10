"use client";

import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Field, FieldDescription, FieldError, FieldLabel, FieldSet } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Spinner } from "@/components/ui/spinner";
import { getUserErrorMessage } from "@/lib/user-errors";

type PlaceDetails = FunctionReturnType<typeof api.googlePlaces.details>;
type PlaceSuggestion = FunctionReturnType<typeof api.googlePlaces.search>[number];

export function LocationAddressSearch({
  locationId,
  value,
  onChange,
  onPendingChange,
  disabled,
  configured,
}: {
  locationId: Id<"locations">;
  value: string | null;
  onChange: (value: string | null) => void;
  onPendingChange: (pending: boolean) => void;
  disabled: boolean;
  configured: boolean;
}) {
  const searchPlaces = useAction(api.googlePlaces.search);
  const getDetails = useAction(api.googlePlaces.details);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [selected, setSelected] = useState<PlaceDetails | null>(null);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const sessionToken = useRef<string | null>(null);
  const requestVersion = useRef(0);
  const selectionVersion = useRef(0);
  const disabledSearch = disabled || !configured;
  const selectedDetails = selected?.placeId === value ? selected : null;

  useEffect(() => {
    if (!value || !configured || selected?.placeId === value) return;
    let cancelled = false;
    void getDetails({ locationId, placeId: value }).then((place) => {
      if (!cancelled) {
        setSelected(place);
        setDetailsError(null);
      }
    }).catch((error) => {
      if (!cancelled) {
        setDetailsError(getUserErrorMessage(error, "Det tilknyttede Google-sted kunne ikke hentes."));
      }
    });
    return () => { cancelled = true; };
  }, [configured, getDetails, locationId, selected?.placeId, value]);

  useEffect(() => {
    if (disabledSearch || !open || query.trim().length < 3) return;
    let cancelled = false;
    const version = requestVersion.current;
    const timer = setTimeout(() => {
      sessionToken.current ??= crypto.randomUUID();
      setSearching(true);
      setError(null);
      void searchPlaces({
        locationId,
        query: query.trim(),
        sessionToken: sessionToken.current,
      }).then((places) => {
        if (!cancelled && version === requestVersion.current) setResults(places);
      }).catch((error) => {
        if (!cancelled && version === requestVersion.current) {
          setError(getUserErrorMessage(error, "Stederne kunne ikke hentes. Prøv igen."));
        }
      }).finally(() => {
        if (!cancelled && version === requestVersion.current) setSearching(false);
      });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [disabledSearch, locationId, open, query, searchPlaces]);

  useEffect(() => () => {
    requestVersion.current += 1;
    selectionVersion.current += 1;
  }, []);

  async function selectPlace(placeId: string) {
    if (disabledSearch || selecting) return;
    requestVersion.current += 1;
    const version = ++selectionVersion.current;
    const token = sessionToken.current;
    sessionToken.current = null;
    setOpen(false);
    setResults([]);
    setSearching(false);
    setSelecting(true);
    setError(null);
    onPendingChange(true);
    try {
      const place = await getDetails({ locationId, placeId, ...(token ? { sessionToken: token } : {}) });
      if (version !== selectionVersion.current) return;
      setSelected(place);
      setDetailsError(null);
      setQuery("");
      setResults([]);
      onChange(place.placeId);
    } catch (error) {
      if (version === selectionVersion.current) {
        setError(getUserErrorMessage(error, "Stedet kunne ikke vælges. Prøv igen."));
      }
    } finally {
      if (version === selectionVersion.current) {
        setSelecting(false);
        onPendingChange(false);
      }
    }
  }

  return (
    <FieldSet>
      <Field data-invalid={!!error} data-disabled={disabledSearch}>
        <div className="flex items-center gap-2">
          <FieldLabel htmlFor="location-address-search">Google-sted</FieldLabel>
          <HelpTooltip label="Google-sted" content="Søg efter lokationens virksomhedsnavn og adresse. Det valgte sted bruges til Google-bedømmelsen på dashboardet og til vejr og helligdage i prognoser, hvis de er slået til. Din søgning deles med Google. Tilknytningen gemmes først, når du vælger Gem." />
        </div>
        <Combobox
          items={results.map((result) => result.placeId)}
          filteredItems={results.map((result) => result.placeId)}
          value={null}
          inputValue={query}
          open={open}
          disabled={disabledSearch || selecting}
          itemToStringLabel={(placeId) => results.find((result) => result.placeId === placeId)?.mainText ?? ""}
          onInputValueChange={(nextQuery, eventDetails) => {
            if (eventDetails.reason !== "input-change" && eventDetails.reason !== "clear-press") return;
            requestVersion.current += 1;
            setQuery(nextQuery);
            setResults([]);
            setSearching(nextQuery.trim().length >= 3);
            setError(null);
            setOpen(true);
          }}
          onOpenChange={(nextOpen, eventDetails) => {
            setOpen(nextOpen);
            if (!nextOpen && eventDetails.reason !== "item-press") {
              requestVersion.current += 1;
              sessionToken.current = null;
              setResults([]);
              setSearching(false);
            }
          }}
          onValueChange={(placeId) => { if (placeId) void selectPlace(placeId); }}
        >
          <ComboboxInput
            id="location-address-search"
            placeholder="Virksomhedsnavn og by"
            maxLength={200}
            autoComplete="off"
            disabled={disabledSearch || selecting}
            aria-invalid={!!error}
            aria-describedby={error ? "location-address-error" : undefined}
            showTrigger={false}
            className="h-11 w-full"
          />
          <ComboboxContent>
            <ComboboxEmpty>
              {searching ? "Søger…" : query.trim().length < 3 ? "Skriv mindst 3 tegn." : error ? "Søgningen mislykkedes." : "Ingen steder fundet. Prøv navn og by."}
            </ComboboxEmpty>
            <ComboboxList>
              <ComboboxGroup>
                {results.map((result) => (
                  <ComboboxItem key={result.placeId} value={result.placeId} className="min-h-12">
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="break-words">{result.mainText}</span>
                      <span className="break-words text-xs text-muted-foreground">{result.secondaryText}</span>
                    </span>
                  </ComboboxItem>
                ))}
              </ComboboxGroup>
            </ComboboxList>
            <p translate="no" className="whitespace-nowrap px-3 py-2 text-xs font-normal text-muted-foreground">Google Maps</p>
          </ComboboxContent>
        </Combobox>
        {error && <FieldError id="location-address-error">{error}</FieldError>}
        {selecting && <FieldDescription role="status" className="flex items-center gap-2"><Spinner /> Henter sted…</FieldDescription>}
        {!configured && <FieldDescription>Google Places er ikke konfigureret. Du kan stadig redigere lokationens øvrige oplysninger.</FieldDescription>}
      </Field>
      {value && (
        <Field>
          {selectedDetails ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="break-words text-sm font-medium">{selectedDetails.displayName}</span>
                  <FieldDescription>{selectedDetails.address}</FieldDescription>
                </div>
                <Button type="button" variant="outline" size="sm" disabled={disabled || selecting} onClick={() => { setSelected(null); setDetailsError(null); onChange(null); }}>Frakobl</Button>
              </div>
              {!selectedDetails.types.includes("establishment") && (
                <Alert><AlertDescription>Det valgte resultat er en adresse. Vælg virksomhedens Google-sted for at kunne vise en bedømmelse.</AlertDescription></Alert>
              )}
              {(selectedDetails.businessStatus === "CLOSED_PERMANENTLY" || selectedDetails.businessStatus === "CLOSED_TEMPORARILY") && (
                <Alert><AlertDescription>Google viser stedet som {selectedDetails.businessStatus === "CLOSED_PERMANENTLY" ? "permanent" : "midlertidigt"} lukket. Kontrollér, at du har valgt det rigtige sted.</AlertDescription></Alert>
              )}
              <FieldDescription>
                <span translate="no" className="whitespace-nowrap text-xs font-normal">Google Maps</span>
                {selectedDetails.attributions.map((attribution, index) => (
                  <span key={`${attribution.provider}:${index}`}>
                    {" · "}{attribution.providerUri
                      ? <a href={attribution.providerUri} target="_blank" rel="noreferrer">{attribution.provider}</a>
                      : attribution.provider}
                  </span>
                ))}
              </FieldDescription>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <FieldDescription role="status">{detailsError ?? (configured ? "Henter tilknyttet Google-sted…" : "Et Google-sted er tilknyttet lokationen.")}</FieldDescription>
              <Button type="button" variant="outline" size="sm" disabled={disabled || selecting} onClick={() => { setDetailsError(null); onChange(null); }}>Frakobl</Button>
            </div>
          )}
        </Field>
      )}
    </FieldSet>
  );
}
