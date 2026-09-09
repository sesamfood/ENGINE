"use client";

import { useAction } from "convex/react";
import { SearchIcon } from "lucide-react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { getUserErrorMessage } from "@/lib/user-errors";

type ForecastProfile = Doc<"locationForecasts">["profile"];

export function LocationAddressSearch({ locationId, value, onChange, disabled }: {
  locationId: Id<"locations">;
  value: ForecastProfile | null;
  onChange: (value: ForecastProfile) => void;
  disabled: boolean;
}) {
  const searchAddresses = useAction(api.locationAddressSearch.search);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ForecastProfile[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (searching || disabled || query.trim().length < 3) return;
    setSearching(true);
    setError(null);
    setResults(null);
    try {
      setResults(await searchAddresses({ locationId, query }));
    } catch (error) {
      setError(getUserErrorMessage(error, "Adresserne kunne ikke hentes. Prøv igen."));
    } finally {
      setSearching(false);
    }
  }

  return (
    <FieldSet>
      <Field data-invalid={!!error} data-disabled={disabled}>
        <div className="flex items-center gap-2">
          <FieldLabel htmlFor="location-address-search">Adresse</FieldLabel>
          <HelpTooltip label="adresse" content="Søg efter lokationens adresse, og vælg et resultat. Adressen deles med OpenStreetMap. Land og region bruges til helligdage, og koordinater bruges til vejret." />
        </div>
        <div className="flex gap-2">
          <Input id="location-address-search" placeholder="Vej, husnummer og by"
            value={query} maxLength={200} autoComplete="off" disabled={disabled || searching}
            aria-invalid={!!error} aria-describedby={error ? "location-address-error" : undefined}
            onChange={(event) => { setQuery(event.target.value); setResults(null); setError(null); }}
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); void search(); }
            }} />
          <Button type="button" variant="outline" disabled={disabled || searching || query.trim().length < 3}
            onClick={() => void search()}>
            {searching ? <Spinner data-icon="inline-start" /> : <SearchIcon data-icon="inline-start" />}
            Søg
          </Button>
        </div>
        {error && <FieldError id="location-address-error">{error}</FieldError>}
        {value && <FieldDescription>
          Valgt: {value.addressLabel ?? `${value.latitude}, ${value.longitude} (${value.countryCode})`}
        </FieldDescription>}
      </Field>
      {results !== null && (
        <FieldSet>
          <FieldLegend variant="label">Vælg adresse</FieldLegend>
          {results.length === 0 ? (
            <FieldDescription role="status">Ingen adresser fundet. Prøv med vej, husnummer og by.</FieldDescription>
          ) : (
            <RadioGroup aria-label="Adresser" disabled={disabled}
              value={String(results.findIndex((result) => result.latitude === value?.latitude
                && result.longitude === value?.longitude && result.addressLabel === value?.addressLabel))}
              onValueChange={(resultIndex) => {
                const result = results[Number(resultIndex)];
                if (!result) return;
                onChange(result);
              }}>
              {results.map((result, index) => (
                <FieldLabel key={`${result.latitude}:${result.longitude}:${index}`} htmlFor={`location-address-result-${index}`}>
                  <Field orientation="horizontal" className="min-h-11">
                    <RadioGroupItem id={`location-address-result-${index}`} value={String(index)} />
                    <span className="min-w-0 break-words">{result.addressLabel}</span>
                  </Field>
                </FieldLabel>
              ))}
            </RadioGroup>
          )}
        </FieldSet>
      )}
      <FieldDescription>
        © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap-bidragydere</a>
      </FieldDescription>
    </FieldSet>
  );
}
