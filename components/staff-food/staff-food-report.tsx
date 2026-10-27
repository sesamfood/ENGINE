"use client";

import { usePaginatedQuery, useQuery } from "convex/react";
import { DownloadIcon, UtensilsIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppPageHeader } from "@/components/app-page-header";
import {
  useKiosk,
  useLocationAccess,
  usePermission,
} from "@/components/app-shell";
import { LocationField } from "@/components/location-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  addDays,
  dateKey,
  dateTimeFormatter,
  DEFAULT_TIME_ZONE,
  zonedStart,
} from "@/lib/date";
import { downloadCsv } from "@/lib/download-csv";

const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;

function formatNumber(value: number) {
  return new Intl.NumberFormat("da-DK", { maximumFractionDigits: 2 }).format(
    value,
  );
}

function formatHours(minutes: number) {
  return new Intl.NumberFormat("da-DK", { maximumFractionDigits: 1 }).format(
    minutes / 60,
  );
}

export function StaffFoodReport() {
  const kiosk = useKiosk();
  const { locations, isLocked, lockedId, lockedName } = useLocationAccess();
  const canReport = usePermission("staffFood.report");
  const canRegister = usePermission("staffFood.register");
  const [todayTimestamp] = useState(() => Date.now());
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [location, setLocation] = useState("all");
  const effectiveLocation =
    isLocked && lockedId
      ? String(lockedId)
      : location === "all" || locations?.some((item) => item.id === location)
        ? location
        : "all";
  const context = useQuery(api.employees.getContext, canReport ? {} : "skip");
  const timeZone = context?.timeZone ?? DEFAULT_TIME_ZONE;
  const resolvedFrom =
    from ?? `${dateKey(todayTimestamp, timeZone).slice(0, 8)}01`;
  const resolvedTo = to ?? dateKey(todayTimestamp, timeZone);
  let startAt = Number.NaN;
  let endAt = Number.NaN;
  try {
    startAt = zonedStart(resolvedFrom, timeZone);
    endAt = zonedStart(addDays(resolvedTo, 1), timeZone) - 1;
  } catch {
    // An incomplete date input keeps the report query paused.
  }
  const rangeValid =
    Number.isFinite(startAt) &&
    Number.isFinite(endAt) &&
    startAt <= endAt &&
    endAt - startAt <= MAX_RANGE_MS;
  const { results, status, loadMore } = usePaginatedQuery(
    api.staffFood.exportRegistrations,
    context && rangeValid && canReport
      ? {
          startAt,
          endAt,
          ...(effectiveLocation === "all"
            ? {}
            : { locationId: effectiveLocation as Id<"locations"> }),
        }
      : "skip",
    { initialNumItems: 100 },
  );

  // Totals need every row in the period, so keep loading until exhausted.
  useEffect(() => {
    if (status === "CanLoadMore") loadMore(100);
  }, [loadMore, status]);

  const report = useMemo(() => {
    const active = results.filter((row) => row.status === "active");
    const employees = new Map<
      string,
      { name: string; checkouts: Set<string>; quantity: number }
    >();
    const products = new Map<
      string,
      { name: string; category: string; unit: string; quantity: number }
    >();
    for (const row of active) {
      const employee = employees.get(row.employeeId) ?? {
        name: row.employeeName,
        checkouts: new Set<string>(),
        quantity: 0,
      };
      employee.checkouts.add(row.checkoutId);
      employee.quantity += row.quantity;
      employees.set(row.employeeId, employee);

      const key = `${row.productId}:${row.defaultUnitName}`;
      const product = products.get(key) ?? {
        name: row.productName,
        category: row.categoryName,
        unit: row.defaultUnitName,
        quantity: 0,
      };
      product.quantity += row.quantity;
      products.set(key, product);
    }
    return {
      checkouts: new Set(active.map((row) => row.checkoutId)).size,
      quantity: active.reduce((sum, row) => sum + row.quantity, 0),
      employees: [...employees.entries()]
        .map(([id, employee]) => ({
          id,
          name: employee.name,
          checkouts: employee.checkouts.size,
          quantity: employee.quantity,
        }))
        .sort(
          (a, b) =>
            b.checkouts - a.checkouts || a.name.localeCompare(b.name, "da"),
        ),
      products: [...products.entries()]
        .map(([key, product]) => ({ key, ...product }))
        .sort(
          (a, b) =>
            b.quantity - a.quantity || a.name.localeCompare(b.name, "da"),
        ),
    };
  }, [results]);
  const loading = rangeValid && status !== "Exhausted";

  function exportCsv() {
    const formatter = dateTimeFormatter("da-DK", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone,
    });
    downloadCsv(
      `staff-food-${resolvedFrom}-${resolvedTo}.csv`,
      [
        "Registreret",
        "Lokation",
        "Medarbejder",
        "Vagttype",
        "Arbejdsdato",
        "Vagtlængde (timer)",
        "Regel fra (timer)",
        "Kategori",
        "Produkt",
        "Antal",
        "Standardenhed",
        "Status",
        "Registreret af",
        "Annulleret",
      ],
      results.map((row) => [
        formatter.format(row.registeredAt),
        row.locationName,
        row.employeeName,
        row.sessionSource === "scheduled" ? "Planlagt" : "Manuel",
        row.workDate,
        formatHours(row.shiftDurationMinutes),
        formatHours(row.tierMinimumShiftMinutes),
        row.categoryName,
        row.productName,
        String(row.quantity),
        row.defaultUnitName,
        row.status === "active" ? "Aktiv" : "Annulleret",
        row.registeredByName,
        row.voidedAt ? formatter.format(row.voidedAt) : "",
      ]),
    );
    toast.success("CSV-filen er klar");
  }

  const header = (
    <div className="grid gap-5 sm:grid-cols-(--grid-cols-content-action) sm:items-end">
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          Staff food
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Staff food-rapport
        </h1>
      </div>
      <div className="flex flex-wrap gap-2">
        {canRegister && !kiosk?.kioskModeEnabled ? (
          <Button
            variant="outline"
            size="lg"
            render={<Link href="/staff-food" />}
            nativeButton={false}
          >
            <UtensilsIcon data-icon="inline-start" />
            Registrér
          </Button>
        ) : null}
        <Button
          size="lg"
          disabled={loading || !results.length}
          onClick={exportCsv}
        >
          <DownloadIcon data-icon="inline-start" />
          Eksportér CSV
        </Button>
      </div>
    </div>
  );

  if (!canReport) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at se Staff food-rapporter.
        </AlertDescription>
      </Alert>
    );
  }
  if (!locations) return <Skeleton className="h-96" />;

  return (
    <section className="mx-auto flex w-full max-w-(--container-page) flex-col gap-6 pb-20">
      <AppPageHeader>{header}</AppPageHeader>

      <Card>
        <CardContent appearance="summary" className="grid sm:grid-cols-3">
          <Field data-invalid={!rangeValid}>
            <FieldLabel htmlFor="staff-food-report-from">Fra</FieldLabel>
            <Input
              id="staff-food-report-from"
              type="date"
              value={resolvedFrom}
              aria-invalid={!rangeValid}
              onChange={(event) => setFrom(event.target.value)}
            />
          </Field>
          <Field data-invalid={!rangeValid}>
            <FieldLabel htmlFor="staff-food-report-to">Til</FieldLabel>
            <Input
              id="staff-food-report-to"
              type="date"
              value={resolvedTo}
              aria-invalid={!rangeValid}
              onChange={(event) => setTo(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="staff-food-report-location">Lokation</FieldLabel>
            {isLocked ? (
              <LocationField
                id="staff-food-report-location"
                locations={locations}
                value={lockedId}
                locked
                lockedName={lockedName}
              />
            ) : (
              <Select
                items={[
                  { value: "all", label: "Alle lokationer" },
                  ...locations.map((item) => ({
                    value: item.id,
                    label: item.name,
                  })),
                ]}
                value={effectiveLocation}
                onValueChange={(value) => setLocation(value ?? "all")}
              >
                <SelectTrigger id="staff-food-report-location">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">Alle lokationer</SelectItem>
                    {locations.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
          </Field>
        </CardContent>
      </Card>

      {!rangeValid ? (
        <Alert variant="destructive">
          <AlertTitle>Ugyldig periode</AlertTitle>
          <AlertDescription>
            Fra-dato skal være før eller samme dag som til-dato, og perioden
            må højst være ét år.
          </AlertDescription>
        </Alert>
      ) : loading ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Udleveringer", value: report.checkouts },
              { label: "Medarbejdere", value: report.employees.length },
              { label: "Produkter", value: report.quantity },
            ].map((stat) => (
              <Card key={stat.label} size="sm">
                <CardHeader>
                  <CardDescription>{stat.label}</CardDescription>
                  <CardTitle appearance="hero">
                    {formatNumber(stat.value)}
                  </CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Pr. medarbejder</CardTitle>
            </CardHeader>
            <CardContent>
              {report.employees.length ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Medarbejder</TableHead>
                      <TableHead className="text-right">Udleveringer</TableHead>
                      <TableHead className="text-right">Produkter</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.employees.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell className="text-right">
                          {row.checkouts}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatNumber(row.quantity)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <UtensilsIcon />
                    </EmptyMedia>
                    <EmptyTitle>Ingen Staff food i perioden</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>

          {report.products.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Pr. produkt</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produkt</TableHead>
                      <TableHead>Kategori</TableHead>
                      <TableHead className="text-right">Antal</TableHead>
                      <TableHead>Enhed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.products.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{row.category}</TableCell>
                        <TableCell className="text-right">
                          {formatNumber(row.quantity)}
                        </TableCell>
                        <TableCell>{row.unit}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </section>
  );
}
