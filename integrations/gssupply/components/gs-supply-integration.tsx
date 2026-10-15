"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getUserErrorMessage } from "@/lib/user-errors";
import { GsSupplyCatalogLinks } from "./gs-supply-catalog-links";

const NO_SUPPLIER = "none";

export function GsSupplyIntegration() {
  const settings = useQuery(api.integrations.gssupply.api.getSettings);
  if (settings === undefined) return <Skeleton className="h-72 w-full" />;
  return (
    <div className="flex flex-col gap-5">
      <ConnectionCard settings={settings} />
      {settings.connection ? (
        <>
          <SupplierCard
            supplierId={settings.connection.supplierId}
            suppliers={settings.suppliers}
          />
          <GsSupplyCatalogLinks />
        </>
      ) : null}
    </div>
  );
}

function ConnectionCard({
  settings,
}: {
  settings: FunctionReturnType<
    typeof api.integrations.gssupply.api.getSettings
  >;
}) {
  const connect = useAction(api.integrations.gssupply.api.connect);
  const disconnect = useMutation(api.integrations.gssupply.api.disconnect);
  const [editing, setEditing] = useState(false);
  const [catalogUrl, setCatalogUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const showForm = !settings.connection || editing;

  async function save() {
    setSaving(true);
    try {
      const count = await connect({
        expectedOrganizationId: settings.organizationId,
        catalogUrl,
      });
      setCatalogUrl("");
      setEditing(false);
      toast.success(
        `GS Supply er forbundet. Kataloget har ${count} produkter.`,
      );
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "GS Supply kunne ikke forbindes. Prøv igen.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmDisconnect() {
    setSaving(true);
    try {
      await disconnect({});
      setConfirming(false);
      toast.success("GS Supply er afbrudt");
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "GS Supply kunne ikke afbrydes. Prøv igen."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Katalog-API</CardTitle>
        <CardDescription>
          {settings.connection
            ? settings.connection.catalogUrlPreview
            : "Indsæt linket til organisationens GS Supply-katalog med API-nøglen."}
        </CardDescription>
      </CardHeader>
      {showForm ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <CardContent>
            <Field>
              <FieldLabel htmlFor="gs-supply-catalog-url">
                Link til katalog-API
              </FieldLabel>
              <Input
                id="gs-supply-catalog-url"
                type="password"
                autoComplete="off"
                className="h-11"
                placeholder="https://www.gs-supply.dk/api/products/catalog/…?api_key=…"
                value={catalogUrl}
                disabled={saving}
                onChange={(event) => setCatalogUrl(event.target.value)}
              />
              <FieldDescription>
                Linket gemmes krypteret og vises ikke igen.
              </FieldDescription>
            </Field>
          </CardContent>
          <CardFooter className="mt-6 justify-end">
            <div className="flex gap-2">
              {settings.connection ? (
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={saving}
                  onClick={() => setEditing(false)}
                >
                  Annullér
                </Button>
              ) : null}
              <Button
                type="submit"
                size="lg"
                disabled={saving || !catalogUrl.trim()}
              >
                {saving ? <Spinner data-icon="inline-start" /> : null}
                Forbind GS Supply
              </Button>
            </div>
          </CardFooter>
        </form>
      ) : (
        <CardFooter className="justify-end">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="lg"
              onClick={() => setConfirming(true)}
            >
              Afbryd
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => setEditing(true)}
            >
              Skift link
            </Button>
          </div>
        </CardFooter>
      )}
      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!saving) setConfirming(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Afbryd GS Supply?</AlertDialogTitle>
            <AlertDialogDescription>
              Linket slettes, og kataloget kan ikke hentes, før du forbinder
              igen. Produktkoblinger og tidligere bestillinger bevares.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Annullér</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={saving}
              onClick={(event) => {
                event.preventDefault();
                void confirmDisconnect();
              }}
            >
              {saving ? <Spinner data-icon="inline-start" /> : null}
              Afbryd GS Supply
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function SupplierCard({
  supplierId,
  suppliers,
}: {
  supplierId: Id<"suppliers"> | null;
  suppliers: { id: Id<"suppliers">; name: string }[];
}) {
  const setSupplier = useMutation(api.integrations.gssupply.api.setSupplier);
  const [saving, setSaving] = useState(false);
  const items = [
    { value: NO_SUPPLIER, label: "Ingen leverandør" },
    ...suppliers.map((supplier) => ({
      value: supplier.id,
      label: supplier.name,
    })),
  ];

  async function change(value: string | null) {
    if (!value) return;
    setSaving(true);
    try {
      await setSupplier({
        supplierId: value === NO_SUPPLIER ? null : (value as Id<"suppliers">),
      });
      toast.success("Leverandøren er gemt");
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Leverandøren kunne ikke gemmes. Prøv igen.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Leverandør</CardTitle>
        <CardDescription>
          Bestillinger hos denne leverandør bruger GS Supply-kataloget med
          priser, lager og leveringstid.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field className="max-w-sm">
            <FieldLabel htmlFor="gs-supply-supplier">Leverandør</FieldLabel>
            <Select
              items={items}
              value={supplierId ?? NO_SUPPLIER}
              onValueChange={(value) => void change(value)}
              disabled={saving}
            >
              <SelectTrigger id="gs-supply-supplier" className="h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {items.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              Opret og redigér leverandører under{" "}
              <Link className="underline" href="/administration/ordering">
                Administration → Bestilling
              </Link>
              .
            </FieldDescription>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
