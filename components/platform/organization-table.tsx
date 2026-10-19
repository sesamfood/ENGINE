"use client";

import { usePaginatedQuery } from "convex/react";
import { PlusIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { usePlatformRole } from "@/components/platform/platform-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";

const PAGE_SIZE = 25;

export function OrganizationStatusBadge({
  status,
}: {
  status: "active" | "suspended";
}) {
  return status === "suspended" ? (
    <Badge variant="destructive">Suspenderet</Badge>
  ) : (
    <Badge variant="secondary">Aktiv</Badge>
  );
}

export function PlatformOrganizationTable() {
  const role = usePlatformRole();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const { results, status, loadMore } = usePaginatedQuery(
    api.platform.organizations.list,
    { search: deferredSearch || undefined },
    { initialNumItems: PAGE_SIZE },
  );

  return (
    <section className="mx-auto flex w-full max-w-(--container-page) flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">Organisationer</h1>
        {role === "owner" ? (
          <Button
            size="lg"
            render={<Link href="/platform/organizations/new" />}
            nativeButton={false}
          >
            <PlusIcon data-icon="inline-start" />
            Ny organisation
          </Button>
        ) : null}
      </div>
      <Field className="sm:max-w-sm">
        <FieldLabel htmlFor="platform-organization-search" className="sr-only">
          Søg efter organisation
        </FieldLabel>
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            id="platform-organization-search"
            type="search"
            placeholder="Søg efter organisation"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </InputGroup>
      </Field>
      {status === "LoadingFirstPage" ? (
        <Skeleton className="h-64 w-full" />
      ) : results.length === 0 ? (
        <Empty appearance="outlined">
          <EmptyHeader>
            <EmptyTitle>Ingen organisationer</EmptyTitle>
            <EmptyDescription>
              {deferredSearch
                ? "Ingen organisationer matcher søgningen."
                : "Der er endnu ingen organisationer."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Navn</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Brugere</TableHead>
              <TableHead className="text-right">Lokationer</TableHead>
              <TableHead>Oprettet</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((organization) => (
              <TableRow key={organization.id}>
                <TableCell>
                  <Link
                    href={`/platform/organizations/${organization.id}`}
                    className="font-medium underline-offset-4 hover:underline focus-visible:underline"
                  >
                    {organization.name}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {organization.plan ? `${organization.plan} · ` : null}
                    {organization.entitledFeatureCount}{" "}
                    {organization.entitledFeatureCount === 1 ? "funktion" : "funktioner"}
                    {" · "}
                    {organization.entitledIntegrationCount}{" "}
                    {organization.entitledIntegrationCount === 1
                      ? "integration"
                      : "integrationer"}
                  </span>
                </TableCell>
                <TableCell>
                  <OrganizationStatusBadge status={organization.status} />
                </TableCell>
                <TableCell appearance="numeric" className="text-right">
                  {organization.memberCount >= 100
                    ? "100+"
                    : organization.memberCount}
                </TableCell>
                <TableCell appearance="numeric" className="text-right">
                  {organization.locationCount > 200
                    ? "200+"
                    : organization.locationCount}
                </TableCell>
                <TableCell>
                  {new Date(organization.createdAt).toLocaleDateString("da-DK")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <Button
          variant="outline"
          className="self-start"
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(PAGE_SIZE)}
        >
          {status === "LoadingMore" ? (
            <Spinner data-icon="inline-start" />
          ) : null}
          Vis flere
        </Button>
      ) : null}
    </section>
  );
}
