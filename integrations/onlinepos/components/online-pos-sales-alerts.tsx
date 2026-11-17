"use client";

import { useAction, useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import type { FunctionReturnType } from "convex/server";
import { ChevronRightIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { usePermission } from "@/components/app-shell";
import { CreatableCombobox } from "@/components/catalog/creatable-combobox";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIntegrations } from "@/integrations/use-integrations";
import { getUserErrorMessage } from "@/lib/user-errors";

const WINDOW_DAYS = 30;

type SoldItem = FunctionReturnType<
  typeof api.integrations.onlinepos.salesAlerts.getUnmappedSales
>["items"][number];
type ConnectKind = "product" | "addition" | "removal";

function windowStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - WINDOW_DAYS);
  return date.getTime();
}

const dateFormat = new Intl.DateTimeFormat("da-DK", {
  day: "numeric",
  month: "short",
});

function AlertBanner({
  title,
  description,
  onOpen,
}: {
  title: string;
  description: string;
  onOpen: () => void;
}) {
  return (
    <Alert variant="paused" role="status">
      <TriangleAlertIcon />
      <AlertTitle>
        {/* The stretched button makes the whole banner one touch target. */}
        <button
          type="button"
          onClick={onOpen}
          className="text-left outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-3 focus-visible:after:ring-ring"
        >
          {title}
        </button>
      </AlertTitle>
      <AlertDescription>{description}</AlertDescription>
      {/* Clicks pass through to the stretched button. */}
      <AlertAction className="pointer-events-none top-1/2 -translate-y-1/2">
        <ChevronRightIcon aria-hidden="true" className="mr-1" />
      </AlertAction>
    </Alert>
  );
}

function IgnoredList({
  count,
  children,
}: {
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <Collapsible>
      <CollapsibleTrigger
        render={
          <Button variant="ghost" className="justify-between">
            Ignorerede ({count})
            <ChevronRightIcon aria-hidden="true" />
          </Button>
        }
      />
      <CollapsibleContent>
        <div className="mt-2 flex flex-col gap-2">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function IgnoredRow({
  title,
  onRestore,
}: {
  title: string;
  onRestore: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
      <span className="min-w-0 truncate text-sm">{title}</span>
      <Button variant="outline" size="sm" onClick={onRestore}>
        Fortryd
      </Button>
    </div>
  );
}

function UnmappedRow({
  item,
  showMaster,
}: {
  item: SoldItem;
  showMaster: boolean;
}) {
  const [kind, setKind] = useState<ConnectKind>("product");
  const [saving, setSaving] = useState(false);
  const options = useQuery(api.onlinePos.listMappingOptions, {
    integrationId: item.integrationId,
  });
  const modifiers = useQuery(api.onlinePos.getModifierMappings, {
    integrationId: item.integrationId,
  });
  const setProductMapping = useAction(api.onlinePos.setProductMapping);
  const setModifierMapping = useAction(api.onlinePos.setModifierMapping);
  const setIgnored = useMutation(
    api.integrations.onlinepos.salesAlerts.setSoldProductIgnored,
  );

  const comboboxOptions = useMemo(() => {
    if (!options || !modifiers) return [];
    const taken = new Set(
      kind === "product"
        ? options.products.flatMap((product) =>
            product.onlinePosProductId === null ? [] : [product.id],
          )
        : modifiers.mappings.flatMap((row) =>
            row.kind === kind ? [row.ingredientProductId] : [],
          ),
    );
    return options.products.map((product) => ({
      value: product.id,
      label: taken.has(product.id)
        ? `${product.name} (allerede koblet)`
        : product.name,
      searchName: product.name,
      disabled: taken.has(product.id),
    }));
  }, [kind, modifiers, options]);

  async function connect(value: string | null) {
    if (!value) return;
    const productId = value as Id<"products">;
    const name = options?.products.find((row) => row.id === productId)?.name;
    setSaving(true);
    try {
      if (kind === "product") {
        await setProductMapping({
          integrationId: item.integrationId,
          productId,
          onlinePosProductId: item.onlinePosProductId,
        });
      } else {
        await setModifierMapping({
          expectedIntegrationId: item.integrationId,
          kind,
          ingredientProductId: productId,
          onlinePosProductId: item.onlinePosProductId,
        });
      }
      toast.success(`${item.name} er koblet til ${name ?? "produktet"}`);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Koblingen kunne ikke gemmes"));
    } finally {
      setSaving(false);
    }
  }

  async function ignore() {
    try {
      await setIgnored({
        integrationId: item.integrationId,
        onlinePosProductId: item.onlinePosProductId,
        ignored: true,
      });
      toast.success(`${item.name} ignoreres`);
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Produktet kunne ikke ignoreres"));
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium break-words">{item.name}</span>
          <span className="text-sm text-muted-foreground">
            Sidst solgt {dateFormat.format(item.lastSoldAt)}
            {showMaster ? ` · ${item.integrationName}` : ""}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={ignore} disabled={saving}>
          Ignorér
        </Button>
      </div>
      <ToggleGroup
        aria-label={`Kobl ${item.name} som`}
        variant="outline"
        spacing={0}
        className="w-full"
        value={[kind]}
        onValueChange={(values) => {
          const next = values[0];
          if (next === "product" || next === "addition" || next === "removal")
            setKind(next);
        }}
      >
        <ToggleGroupItem value="product" className="min-h-11 flex-1">
          Produkt
        </ToggleGroupItem>
        <ToggleGroupItem value="addition" className="min-h-11 flex-1">
          Tilvalg
        </ToggleGroupItem>
        <ToggleGroupItem value="removal" className="min-h-11 flex-1">
          Fravalg
        </ToggleGroupItem>
      </ToggleGroup>
      {options === undefined || modifiers === undefined ? (
        <Skeleton className="h-11 w-full" />
      ) : (
        <CreatableCombobox
          key={kind}
          options={comboboxOptions}
          value={null}
          onValueChange={connect}
          disabled={saving}
          placeholder={kind === "product" ? "Vælg produkt" : "Vælg ingrediens"}
          ariaLabel={
            kind === "product"
              ? `Produkt til ${item.name}`
              : `Ingrediens til ${item.name}`
          }
          productSearch
        />
      )}
    </li>
  );
}

function UnmappedSalesAlert({ since }: { since: number }) {
  const [open, setOpen] = useState(false);
  const data = useQuery(api.integrations.onlinepos.salesAlerts.getUnmappedSales, {
    since,
  });
  const setIgnored = useMutation(
    api.integrations.onlinepos.salesAlerts.setSoldProductIgnored,
  );
  if (!data || (data.items.length === 0 && !open)) return null;
  const count = data.items.length;

  return (
    <>
      <AlertBanner
        title={
          count === 1
            ? "1 solgt OnlinePOS-produkt er ikke koblet"
            : `${count} solgte OnlinePOS-produkter er ikke koblet`
        }
        description="Kobl dem til et produkt, et tilvalg eller et fravalg, så salget kan trækkes fra lageret."
        onOpen={() => setOpen(true)}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ukoblede salgsprodukter</DialogTitle>
            <DialogDescription>
              OnlinePOS-produkter solgt de seneste {WINDOW_DAYS} dage uden
              kobling. Vælg, hvad de skal kobles til, eller ignorér dem.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-w-0 flex-col gap-4">
            {count === 0 ? (
              <p className="text-sm text-muted-foreground">
                Alle solgte produkter er koblet.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {data.items.map((item) => (
                  <UnmappedRow
                    key={`${item.integrationId}:${item.onlinePosProductId}`}
                    item={item}
                    showMaster={data.multipleMasters}
                  />
                ))}
              </ul>
            )}
            <IgnoredList count={data.ignored.length}>
              {data.ignored.map((item) => (
                <IgnoredRow
                  key={`${item.integrationId}:${item.onlinePosProductId}`}
                  title={item.name}
                  onRestore={() => {
                    setIgnored({
                      integrationId: item.integrationId,
                      onlinePosProductId: item.onlinePosProductId,
                      ignored: false,
                    }).catch((error) =>
                      toast.error(
                        getUserErrorMessage(error, "Produktet kunne ikke gendannes"),
                      ),
                    );
                  }}
                />
              ))}
            </IgnoredList>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MissingIngredientsAlert({ since }: { since: number }) {
  const [open, setOpen] = useState(false);
  const data = useQuery(
    api.integrations.onlinepos.salesAlerts.getProductsWithoutIngredients,
    { since },
  );
  const setIgnored = useMutation(
    api.integrations.onlinepos.salesAlerts.setMissingIngredientsIgnored,
  );
  if (!data || (data.items.length === 0 && !open)) return null;
  const count = data.items.length;

  function update(productId: Id<"products">, name: string, ignored: boolean) {
    setIgnored({ productId, ignored })
      .then(() => {
        if (ignored) toast.success(`${name} ignoreres`);
      })
      .catch((error) =>
        toast.error(getUserErrorMessage(error, "Produktet kunne ikke opdateres")),
      );
  }

  return (
    <>
      <AlertBanner
        title={
          count === 1
            ? "1 solgt produkt mangler ingredienser"
            : `${count} solgte produkter mangler ingredienser`
        }
        description="Tilføj ingredienser, så salget trækker de rigtige råvarer fra lageret."
        onOpen={() => setOpen(true)}
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Produkter uden ingredienser</DialogTitle>
            <DialogDescription>
              Produkter solgt de seneste {WINDOW_DAYS} dage, som ikke har
              ingredienser. Åbn produktet for at tilføje dem, eller ignorér
              produkter, der sælges, som de er.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-w-0 flex-col gap-4">
            {count === 0 ? (
              <p className="text-sm text-muted-foreground">
                Alle solgte produkter har ingredienser.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {data.items.map((item) => (
                  <li
                    key={item.productId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                  >
                    <span className="min-w-0 font-medium break-words">
                      {item.name}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => update(item.productId, item.name, true)}
                      >
                        Ignorér
                      </Button>
                      <Button
                        size="sm"
                        nativeButton={false}
                        render={
                          <Link href={`/administration/products/${item.productId}`} />
                        }
                      >
                        Åbn produkt
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <IgnoredList count={data.ignored.length}>
              {data.ignored.map((item) => (
                <IgnoredRow
                  key={item.productId}
                  title={item.name}
                  onRestore={() => update(item.productId, item.name, false)}
                />
              ))}
            </IgnoredList>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function OnlinePosSalesAlerts() {
  const [since] = useState(windowStart);
  const integrations = useIntegrations();
  const canIntegrations = usePermission("integrations.manage");
  const canCatalog = usePermission("catalog.manage");
  const enabled = integrations?.onlinepos === true;
  if (!enabled || (!canIntegrations && !canCatalog)) return null;
  return (
    <div className="flex flex-col gap-3 empty:hidden">
      {canIntegrations ? <UnmappedSalesAlert since={since} /> : null}
      {canCatalog ? <MissingIngredientsAlert since={since} /> : null}
    </div>
  );
}
