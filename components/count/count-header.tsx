"use client";

import { useQuery } from "convex/react";
import {
  CheckCircle2Icon,
  Clock3Icon,
  LockKeyholeIcon,
  MapPinIcon,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { authClient } from "@/lib/auth-client";
import { setCountLocation, useCountLocation } from "@/lib/count-prefs";

const periodFormatter = new Intl.DateTimeFormat("da-DK", {
  month: "long",
  year: "numeric",
  timeZone: "Europe/Copenhagen",
});

function formatPeriod(periodKey: string) {
  const [year, month] = periodKey.split("-").map(Number);
  return periodFormatter.format(Date.UTC(year, month - 1, 15));
}

function countdown(target: number, now: number) {
  const seconds = Math.max(0, Math.ceil((target - now) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours} t ${minutes} min`;
  if (minutes > 0) return `${minutes} min ${rest} sek`;
  return `${rest} sek`;
}

export function CountHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const organization = authClient.useActiveOrganization();
  const organizationId = organization.data?.id;
  const storedLocationId = useCountLocation(organizationId);
  const locations = useQuery(api.locations.listLocationOptions);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!organizationId || !locations) return;
    const valid = locations.some(
      (location) => location.id === storedLocationId,
    );
    if (!valid) {
      setCountLocation(organizationId, locations[0]?.id ?? null);
    }
  }, [locations, organizationId, storedLocationId]);

  const locationId = locations?.some(
    (location) => location.id === storedLocationId,
  )
    ? (storedLocationId as Id<"locations">)
    : null;
  const queryNow = Math.floor(now / 60_000) * 60_000;
  const state = useQuery(
    api.count.getCountState,
    locationId ? { locationId, now: queryNow } : "skip",
  );
  const submitted = state?.count?.status === "submitted";
  const statusTitle = submitted
    ? "Optællingen er registreret"
    : state?.isOpen
      ? "Optællingen er åben"
      : "Optællingen er låst";
  const statusDescription =
    state
      ? submitted
        ? state.count?.submittedAt
          ? `Registreret ${new Intl.DateTimeFormat("da-DK", { dateStyle: "short", timeStyle: "short" }).format(state.count.submittedAt)}${state.count.submittedByName ? ` af ${state.count.submittedByName}` : ""}.`
          : "Denne måneds optælling kan ikke ændres."
        : state.isOpen
          ? `Vinduet lukker om ${countdown(state.closesAt, now)}.`
          : `Næste vindue åbner om ${countdown(state.opensAt, now)}.`
      : "Vælg en location for at se optællingsvinduet.";
  const locationItems =
    locations?.map((location) => ({
      value: location.id,
      label: location.name,
    })) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
        <header className="flex min-w-0 flex-col gap-2">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            Lagerstyring
          </p>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Count
            </h1>
            {state ? (
              <p className="text-lg capitalize text-muted-foreground">
                {formatPeriod(state.periodKey)}
              </p>
            ) : null}
          </div>
        </header>

        <Field>
          <FieldLabel>Location</FieldLabel>
          <Select
            items={locationItems}
            value={locationId}
            onValueChange={(value) => {
              if (organizationId) {
                setCountLocation(organizationId, value as string);
              }
            }}
            disabled={!locations || locations.length === 0}
          >
            <SelectTrigger className="h-11 w-full">
              <MapPinIcon aria-hidden="true" />
              <SelectValue placeholder="Vælg location" />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {locationItems.map((location) => (
                  <SelectItem key={location.value} value={location.value}>
                    {location.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Alert>
        {submitted ? (
          <CheckCircle2Icon />
        ) : state?.isOpen ? (
          <Clock3Icon />
        ) : (
          <LockKeyholeIcon />
        )}
        <AlertTitle>{statusTitle}</AlertTitle>
        <AlertDescription>{statusDescription}</AlertDescription>
      </Alert>

      <Tabs
        value={pathname.startsWith("/count/stock") ? "stock" : "count"}
        onValueChange={(value) =>
          router.push(value === "stock" ? "/count/stock" : "/count", {
            scroll: false,
          })
        }
      >
        <TabsList
          aria-label="Countsektioner"
          className="h-14 w-full justify-start"
        >
          <TabsTrigger value="count" className="min-w-36 px-6">
            Optælling
          </TabsTrigger>
          <TabsTrigger value="stock" className="min-w-36 px-6">
            Lager
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
