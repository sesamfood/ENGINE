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
import {
  AmountInput,
  parseAmount,
  type Amount,
} from "@/components/catalog/modifier-manager";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import {
  normalizeProductSearch,
  productNameSearchScore,
  searchProducts,
} from "@/lib/product-search";
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

const MAX_SUGGESTIONS = 3;

// Matches either way round, so "Pointy Green Bowl" suggests "Pointy Green"
// and "PLUS Selleri" suggests "Selleri".
function suggestByName<T extends { searchName: string; disabled: boolean }>(
  options: T[],
  name: string,
) {
  return options
    .flatMap((option) => {
      const scores = [
        productNameSearchScore(option.searchName, name),
        normalizeProductSearch(option.searchName).length >= 4
          ? productNameSearchScore(name, option.searchName)
          : null,
      ].filter((score) => score !== null);
      return option.disabled || scores.length === 0
        ? []
        : [{ option, score: Math.min(...scores) }];
    })
    .sort((left, right) => left.score - right.score)
    .slice(0, MAX_SUGGESTIONS)
    .map(({ option }) => option);
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

const MAX_PRODUCTS_PER_SAVE = 200;
const MAX_CATEGORY_MATCHES = 5;

type SetupKind = Exclude<ConnectKind, "product">;
type ModifierSetupData = FunctionReturnType<
  typeof api.integrations.onlinepos.salesAlerts.getModifierSetup
>;

function ModifierSetup(props: {
  item: SoldItem;
  kind: SetupKind;
  ingredientId: Id<"products">;
  ingredientName: string;
}) {
  const setup = useQuery(api.integrations.onlinepos.salesAlerts.getModifierSetup, {
    ingredientProductId: props.ingredientId,
    kind: props.kind,
  });
  if (!setup) return <Skeleton className="h-40 w-full" />;
  return <ModifierSetupForm {...props} setup={setup} />;
}

function ModifierSetupForm({
  item,
  kind,
  ingredientId,
  ingredientName,
  setup,
}: {
  item: SoldItem;
  kind: SetupKind;
  ingredientId: Id<"products">;
  ingredientName: string;
  setup: ModifierSetupData;
}) {
  const addition = kind === "addition";
  const [amount, setAmount] = useState<Amount>(() => ({
    quantity: setup.standard
      ? setup.standard.quantity.toLocaleString("da-DK")
      : "",
    unitId: setup.standard?.unitId ?? setup.defaultUnitId,
  }));
  const enabled = useMemo(
    () => setup.products.filter((product) => product.enabled).map((product) => product.id),
    [setup.products],
  );
  // A sold fravalg means the ingredient is removable, so start with every recipe.
  const [selected, setSelected] = useState(
    () =>
      new Set(
        enabled.length === 0 && !addition
          ? setup.products.map((product) => product.id)
          : enabled,
      ),
  );
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const saveAdditionDefault = useMutation(
    api.catalogModifiers.saveAdditionDefault,
  );
  const saveProductModifiers = useMutation(
    api.catalogModifiers.saveProductModifiers,
  );
  const setModifierMapping = useAction(api.onlinePos.setModifierMapping);

  const categories = useQuery(api.catalog.listCategoryOptions);
  const categoryPaths = useMemo(
    () => new Map(categories?.map((category) => [category.id, category.path])),
    [categories],
  );
  // Products per category, including those in subcategories.
  const productsByCategory = useMemo(() => {
    const parents = new Map(
      categories?.map((category) => [category.id, category.parentCategoryId]),
    );
    const result = new Map<Id<"categories">, Set<Id<"products">>>();
    for (const product of setup.products) {
      for (const categoryId of product.categoryIds) {
        let current: Id<"categories"> | null | undefined = categoryId;
        const seen = new Set<Id<"categories">>();
        while (current && !seen.has(current)) {
          seen.add(current);
          const ids = result.get(current) ?? new Set();
          ids.add(product.id);
          result.set(current, ids);
          current = parents.get(current);
        }
      }
    }
    return result;
  }, [categories, setup.products]);

  const visible = useMemo(
    () =>
      search.trim()
        ? searchProducts(setup.products, search, (product) => ({
            name: product.name,
            categoryPath: product.categoryIds
              .map((id) => categoryPaths.get(id) ?? "")
              .join(" · "),
          }))
        : setup.products,
    [categoryPaths, search, setup.products],
  );
  const matchingCategories = useMemo(() => {
    if (!search.trim() || !categories) return [];
    return categories
      .flatMap((category) => {
        const ids = productsByCategory.get(category.id);
        const score = productNameSearchScore(category.path, search);
        return ids && score !== null ? [{ category, ids, score }] : [];
      })
      .sort((left, right) => left.score - right.score)
      .slice(0, MAX_CATEGORY_MATCHES);
  }, [categories, productsByCategory, search]);

  function toggleAll(ids: Set<Id<"products">>, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  const parsed = parseAmount(amount);

  async function setOnProducts(ids: Id<"products">[], on: boolean) {
    for (let index = 0; index < ids.length; index += MAX_PRODUCTS_PER_SAVE) {
      await saveProductModifiers({
        productIds: ids.slice(index, index + MAX_PRODUCTS_PER_SAVE),
        removals: addition ? [] : [{ ingredientProductId: ingredientId, removable: on }],
        additions: addition ? [{ ingredientProductId: ingredientId, enabled: on }] : [],
      });
    }
  }

  async function save() {
    if (addition && !parsed) {
      toast.error("Angiv en mængde og en enhed for tilvalget");
      return;
    }
    setSaving(true);
    try {
      if (
        addition &&
        parsed &&
        (setup.standard?.quantity !== parsed.quantity ||
          setup.standard.unitId !== parsed.unitId)
      ) {
        await saveAdditionDefault({ ingredientProductId: ingredientId, ...parsed });
      }
      await setOnProducts(
        [...selected].filter((id) => !enabled.includes(id)),
        true,
      );
      await setOnProducts(
        enabled.filter((id) => !selected.has(id)),
        false,
      );
      await setModifierMapping({
        expectedIntegrationId: item.integrationId,
        kind,
        ingredientProductId: ingredientId,
        onlinePosProductId: item.onlinePosProductId,
      });
      toast.success(
        `${item.name} er koblet som ${addition ? "tilvalg" : "fravalg"} til ${ingredientName}`,
      );
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Koblingen kunne ikke gemmes"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-muted/50 p-3">
      {addition ? (
        <Field>
          <div className="flex items-center gap-2">
            <FieldLabel>Mængde pr. tilvalg</FieldLabel>
            <HelpTooltip
              label="Mængde pr. tilvalg"
              content={`Trækkes fra lageret, hver gang ${item.name} sælges. Gemmes som standardmængde for ${ingredientName}.`}
            />
          </div>
          <AmountInput
            amount={amount}
            units={setup.units}
            label={ingredientName}
            onChange={setAmount}
          />
        </Field>
      ) : null}
      <Field>
        <FieldLabel>
          {addition
            ? `Produkter, der kan få ${ingredientName}`
            : `Produkter, hvor ${ingredientName} kan fravælges`}
        </FieldLabel>
        {setup.products.length === 0 ? (
          <FieldDescription>
            {addition
              ? "Der er ingen produkter med salgspris."
              : `Ingen produkter har ${ingredientName} som ingrediens. Fravalget trækker derfor ikke noget fra lageret.`}
          </FieldDescription>
        ) : (
          <>
            {setup.products.length > 8 ? (
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Søg i produkter og kategorier"
                aria-label="Søg i produkter og kategorier"
              />
            ) : null}
            <div className="flex max-h-56 flex-col divide-y overflow-y-auto rounded-lg border bg-background">
              {matchingCategories.map(({ category, ids }) => {
                const count = [...ids].filter((id) => selected.has(id)).length;
                return (
                  <label
                    key={category.id}
                    className="flex min-h-11 cursor-pointer items-center gap-3 bg-muted/50 px-3 py-2"
                  >
                    <Checkbox
                      checked={count === ids.size}
                      indeterminate={count > 0 && count < ids.size}
                      onCheckedChange={() => toggleAll(ids, count < ids.size)}
                    />
                    <span className="min-w-0 flex-1 break-words text-sm font-medium">
                      Alle i {category.path}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {count} af {ids.size}
                    </span>
                  </label>
                );
              })}
              {visible.map((product) => (
                <label
                  key={product.id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2"
                >
                  <Checkbox
                    checked={selected.has(product.id)}
                    onCheckedChange={(checked) =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (checked) next.add(product.id);
                        else next.delete(product.id);
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1 break-words text-sm">
                    {product.name}
                  </span>
                </label>
              ))}
            </div>
            <FieldDescription>
              {selected.size === 0
                ? "Vælg mindst ét produkt, ellers trækkes salget ikke fra lageret."
                : `${selected.size} valgt`}
            </FieldDescription>
          </>
        )}
      </Field>
      <Button onClick={save} disabled={saving || (addition && !parsed)}>
        {addition ? "Kobl tilvalg" : "Kobl fravalg"}
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
  const [ingredientId, setIngredientId] = useState<Id<"products"> | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const canCatalog = usePermission("catalog.manage");
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
    // Products can have several POS links; a tilvalg/fravalg default has one.
    const linked = new Set(
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
      label: !linked.has(product.id)
        ? product.name
        : kind === "product"
          ? `${product.name} (har en kobling)`
          : `${product.name} (allerede koblet)`,
      searchName: product.name,
      disabled: kind !== "product" && linked.has(product.id),
    }));
  }, [kind, modifiers, options]);

  const suggestions = useMemo(
    () => suggestByName(comboboxOptions, item.name),
    [comboboxOptions, item.name],
  );

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
          previousOnlinePosProductId: null,
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
          if (next === "product" || next === "addition" || next === "removal") {
            setKind(next);
            setIngredientId(null);
          }
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
          value={kind === "product" ? null : ingredientId}
          onValueChange={(value) => {
            // Catalog managers set amount and products before linking.
            if (kind !== "product" && canCatalog)
              setIngredientId(value as Id<"products"> | null);
            else void connect(value);
          }}
          disabled={saving}
          placeholder={kind === "product" ? "Vælg produkt" : "Vælg ingrediens"}
          ariaLabel={
            kind === "product"
              ? `Produkt til ${item.name}`
              : `Ingrediens til ${item.name}`
          }
          suggestionLabel="Forslag ud fra navnet"
          suggestionOptions={suggestions}
          productSearch
        />
      )}
      {kind !== "product" && ingredientId && canCatalog ? (
        <ModifierSetup
          key={`${kind}:${ingredientId}`}
          item={item}
          kind={kind}
          ingredientId={ingredientId}
          ingredientName={
            options?.products.find((row) => row.id === ingredientId)?.name ??
            "ingrediensen"
          }
        />
      ) : null}
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
