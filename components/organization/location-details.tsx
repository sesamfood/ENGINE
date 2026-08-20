"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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

type OwnershipType = "owned" | "franchise" | "jointVenture" | "license";
type LocationStatus = "planned" | "open" | "temporarilyClosed" | "closed";

type Draft = {
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

function messageFrom(error: unknown) {
  return error instanceof Error ? error.message : "Der opstod en fejl";
}

export function LocationDetails({
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
  const updateLocation = useMutation(api.locations.updateLocation);
  const [editedDraft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const draft = editedDraft ??
    (details
      ? {
          marketId: details.marketId,
          legalEntityId: details.legalEntityId,
          operatorId: details.operatorId,
          ownershipType: details.ownershipType,
          conceptVersion: details.conceptVersion ?? "",
          openedAt: dateValue(details.openedAt),
          currency: details.currency ?? "",
          timeZone: details.timeZone ?? "",
          status: details.status,
        }
      : emptyDraft);

  const loading =
    details === undefined ||
    markets === undefined ||
    legalEntities === undefined ||
    operators === undefined;

  async function save() {
    setSaving(true);
    try {
      await updateLocation({
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
      toast.error(messageFrom(error));
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
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="location-market">Marked</FieldLabel>
                <Select
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
          </FieldGroup>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Annullér
          </Button>
          <Button disabled={loading || saving} onClick={save}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            Gem
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
