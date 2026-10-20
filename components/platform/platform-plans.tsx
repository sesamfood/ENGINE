"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { usePlatformRole } from "@/components/platform/platform-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  integrationRegistry,
  type IntegrationId,
} from "@/integrations/registry";
import { featureLabels, type FeatureId } from "@/lib/features";
import { getUserErrorMessage } from "@/lib/user-errors";

type AddOn = FunctionReturnType<typeof api.platform.addOns.list>[number];
type Kind = "plan" | "addOn";

type Values = {
  name: string;
  features: FeatureId[];
  integrations: IntegrationId[];
  addOnIds: Id<"addOns">[];
  deprecated: boolean;
};

type Item = Omit<Values, "addOnIds"> & {
  id: string;
  addOnIds?: Id<"addOns">[];
  usage: number;
};

const copy = {
  plan: {
    create: "Opret plan",
    edit: "Redigér plan",
    save: "Gem plan",
    created: "Planen er oprettet",
    saved: "Planen er gemt",
    saveError: "Planen kunne ikke gemmes. Prøv igen.",
    deleted: "er slettet",
    deleteError: "Planen kunne ikke slettes. Prøv igen.",
    description:
      "Organisationer på planen får de valgte funktioner og integrationer og de tilkøb, de har købt. Ændringer gælder straks.",
    deprecatedHelp:
      "Organisationer beholder planen, men den kan ikke vælges til andre organisationer.",
    deleteHelp: "Planen fjernes permanent. Ingen organisationer bruger den.",
    empty: "Ingen planer endnu.",
    ownersOnly: "Kun platformejere kan ændre planer.",
    usage: (count: number) =>
      `${count} ${count === 1 ? "organisation" : "organisationer"}`,
  },
  addOn: {
    create: "Opret tilkøb",
    edit: "Redigér tilkøb",
    save: "Gem tilkøb",
    created: "Tilkøbet er oprettet",
    saved: "Tilkøbet er gemt",
    saveError: "Tilkøbet kunne ikke gemmes. Prøv igen.",
    deleted: "er slettet",
    deleteError: "Tilkøbet kunne ikke slettes. Prøv igen.",
    description:
      "Organisationer, der har købt tilkøbet, får de valgte funktioner og integrationer oven i deres plan. Ændringer gælder straks.",
    deprecatedHelp:
      "Planer og organisationer beholder tilkøbet, men det kan ikke tilføjes igen.",
    deleteHelp: "Tilkøbet fjernes permanent. Ingen planer tilbyder det.",
    empty: "Ingen tilkøb endnu.",
    ownersOnly: "Kun platformejere kan ændre tilkøb.",
    usage: (count: number) => `${count} ${count === 1 ? "plan" : "planer"}`,
  },
} satisfies Record<Kind, unknown>;

export const featureIds = Object.keys(featureLabels) as FeatureId[];

function toggle<T>(values: T[], value: T, checked: boolean) {
  return checked
    ? [...new Set([...values, value])]
    : values.filter((item) => item !== value);
}

export function AccessFields({
  idPrefix,
  features,
  integrations,
  disabled,
  onFeaturesChange,
  onIntegrationsChange,
  featureNote,
}: {
  idPrefix: string;
  features: FeatureId[];
  integrations: IntegrationId[];
  disabled: boolean;
  onFeaturesChange: (features: FeatureId[]) => void;
  onIntegrationsChange: (integrations: IntegrationId[]) => void;
  featureNote?: (feature: FeatureId) => string | undefined;
}) {
  return (
    <>
      <FieldSet>
        <FieldLegend variant="label">Funktioner</FieldLegend>
        <FieldGroup appearance="dense" className="grid sm:grid-cols-2">
          {featureIds.map((feature) => (
            <Field key={feature} orientation="horizontal">
              <Checkbox
                id={`${idPrefix}-feature-${feature}`}
                checked={features.includes(feature)}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onFeaturesChange(toggle(features, feature, checked === true))
                }
              />
              <FieldLabel
                htmlFor={`${idPrefix}-feature-${feature}`}
                appearance="regular"
              >
                {featureLabels[feature]}
                {featureNote?.(feature) ?? ""}
              </FieldLabel>
            </Field>
          ))}
        </FieldGroup>
      </FieldSet>
      <FieldSet>
        <FieldLegend variant="label">Integrationer</FieldLegend>
        <FieldGroup appearance="dense" className="grid sm:grid-cols-2">
          {integrationRegistry.map((entry) => (
            <Field key={entry.id} orientation="horizontal">
              <Checkbox
                id={`${idPrefix}-integration-${entry.id}`}
                checked={integrations.includes(entry.id)}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onIntegrationsChange(
                    toggle(integrations, entry.id, checked === true),
                  )
                }
              />
              <FieldLabel
                htmlFor={`${idPrefix}-integration-${entry.id}`}
                appearance="regular"
              >
                {entry.name}
              </FieldLabel>
            </Field>
          ))}
        </FieldGroup>
      </FieldSet>
    </>
  );
}

// Deprecated add-ons are only listed where they are already selected.
export function AddOnFields({
  idPrefix,
  addOns,
  selected,
  current,
  disabled,
  onChange,
}: {
  idPrefix: string;
  addOns: AddOn[];
  selected: Id<"addOns">[];
  current: Id<"addOns">[];
  disabled: boolean;
  onChange: (addOnIds: Id<"addOns">[]) => void;
}) {
  const visible = addOns.filter(
    (addOn) => !addOn.deprecated || current.includes(addOn.id),
  );
  if (visible.length === 0) return null;
  return (
    <FieldSet>
      <FieldLegend variant="label">Tilkøb</FieldLegend>
      <FieldGroup appearance="dense" className="grid sm:grid-cols-2">
        {visible.map((addOn) => (
          <Field key={addOn.id} orientation="horizontal">
            <Checkbox
              id={`${idPrefix}-addon-${addOn.id}`}
              checked={selected.includes(addOn.id)}
              disabled={disabled}
              onCheckedChange={(checked) =>
                onChange(toggle(selected, addOn.id, checked === true))
              }
            />
            <FieldLabel
              htmlFor={`${idPrefix}-addon-${addOn.id}`}
              appearance="regular"
            >
              {addOn.name}
              {addOn.deprecated ? " (udfaset)" : ""}
            </FieldLabel>
          </Field>
        ))}
      </FieldGroup>
    </FieldSet>
  );
}

function CatalogDialog({
  kind,
  item,
  addOns,
  onSave,
  onClose,
}: {
  kind: Kind;
  item: Item | null;
  addOns?: AddOn[];
  onSave: (values: Values) => Promise<unknown>;
  onClose: () => void;
}) {
  const text = copy[kind];
  const [name, setName] = useState(item?.name ?? "");
  const [features, setFeatures] = useState<FeatureId[]>(item?.features ?? []);
  const [integrations, setIntegrations] = useState<IntegrationId[]>(
    item?.integrations ?? [],
  );
  const [addOnIds, setAddOnIds] = useState<Id<"addOns">[]>(
    item?.addOnIds ?? [],
  );
  const [deprecated, setDeprecated] = useState(item?.deprecated ?? false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave({ name, features, integrations, addOnIds, deprecated });
      toast.success(item ? text.saved : text.created);
      onClose();
    } catch (error) {
      toast.error(getUserErrorMessage(error, text.saveError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent showCloseButton={!saving} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? text.edit : text.create}</DialogTitle>
          <DialogDescription>{text.description}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <FieldGroup>
            <Field data-disabled={saving}>
              <FieldLabel htmlFor={`${kind}-name`}>Navn</FieldLabel>
              <Input
                id={`${kind}-name`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={saving}
                maxLength={100}
                required
              />
            </Field>
            <AccessFields
              idPrefix={kind}
              features={features}
              integrations={integrations}
              disabled={saving}
              onFeaturesChange={setFeatures}
              onIntegrationsChange={setIntegrations}
            />
            {addOns ? (
              <AddOnFields
                idPrefix={kind}
                addOns={addOns}
                selected={addOnIds}
                current={item?.addOnIds ?? []}
                disabled={saving}
                onChange={setAddOnIds}
              />
            ) : null}
            {item ? (
              <Field orientation="horizontal" data-disabled={saving}>
                <Switch
                  id={`${kind}-deprecated`}
                  checked={deprecated}
                  onCheckedChange={setDeprecated}
                  disabled={saving}
                />
                <FieldLabel htmlFor={`${kind}-deprecated`} appearance="regular">
                  Udfaset
                </FieldLabel>
              </Field>
            ) : null}
            {deprecated ? (
              <FieldDescription>{text.deprecatedHelp}</FieldDescription>
            ) : null}
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={onClose}
              disabled={saving}
            >
              Annullér
            </Button>
            <Button
              type="submit"
              className="min-h-11"
              disabled={saving || !name.trim()}
            >
              {saving ? <Spinner data-icon="inline-start" /> : null}
              {item ? text.save : text.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAction({
  kind,
  item,
  onDelete,
}: {
  kind: Kind;
  item: Item;
  onDelete: () => Promise<unknown>;
}) {
  const text = copy[kind];
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function confirm() {
    setSaving(true);
    try {
      await onDelete();
      toast.success(`${item.name} ${text.deleted}`);
      setOpen(false);
    } catch (error) {
      toast.error(getUserErrorMessage(error, text.deleteError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={item.usage > 0}
          />
        }
      >
        Slet
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Slet {item.name}?</AlertDialogTitle>
          <AlertDialogDescription>{text.deleteHelp}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Annullér</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={saving}
            onClick={() => void confirm()}
          >
            {saving ? <Spinner data-icon="inline-start" /> : null}
            Slet
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CatalogSettings<T extends Item>({
  kind,
  items,
  addOns,
  onSave,
  onDelete,
}: {
  kind: Kind;
  items: T[] | undefined;
  addOns?: AddOn[];
  onSave: (item: T | null, values: Values) => Promise<unknown>;
  onDelete: (item: T) => Promise<unknown>;
}) {
  const role = usePlatformRole();
  const [editing, setEditing] = useState<T | "new" | null>(null);
  const canEdit = role === "owner";
  const text = copy[kind];

  if (items === undefined) {
    return <Skeleton className="h-40 w-full max-w-3xl" />;
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {canEdit ? (
        <Button
          type="button"
          size="lg"
          className="w-fit"
          onClick={() => setEditing("new")}
        >
          <PlusIcon data-icon="inline-start" />
          {text.create}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">{text.ownersOnly}</p>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{text.empty}</p>
      ) : null}
      {items.map((item) => (
        <Card key={item.id} size="sm">
          <CardHeader>
            <CardTitle>
              <span className="flex flex-wrap items-center gap-2">
                {item.name}
                {item.deprecated ? (
                  <Badge variant="secondary">Udfaset</Badge>
                ) : null}
              </span>
            </CardTitle>
            <CardDescription>
              {[
                `${item.features.length} funktioner`,
                `${item.integrations.length} integrationer`,
                item.addOnIds ? `${item.addOnIds.length} tilkøb` : null,
                text.usage(item.usage),
              ]
                .filter(Boolean)
                .join(" · ")}
            </CardDescription>
            {canEdit ? (
              <CardAction>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => setEditing(item)}
                  >
                    Redigér
                  </Button>
                  <DeleteAction
                    kind={kind}
                    item={item}
                    onDelete={() => onDelete(item)}
                  />
                </div>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {item.features
                .map((feature) => featureLabels[feature])
                .join(", ") || "Ingen funktioner"}
            </p>
          </CardContent>
        </Card>
      ))}
      {editing ? (
        <CatalogDialog
          kind={kind}
          item={editing === "new" ? null : editing}
          addOns={addOns}
          onSave={(values) =>
            onSave(editing === "new" ? null : editing, values)
          }
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

export function PlatformPlanSettings() {
  const plans = useQuery(api.platform.plans.list);
  const addOns = useQuery(api.platform.addOns.list);
  const create = useMutation(api.platform.plans.create);
  const update = useMutation(api.platform.plans.update);
  const remove = useMutation(api.platform.plans.remove);

  return (
    <CatalogSettings
      kind="plan"
      items={
        plans && addOns
          ? plans.map((plan) => ({ ...plan, usage: plan.organizationCount }))
          : undefined
      }
      addOns={addOns}
      onSave={(plan, { deprecated, ...values }) =>
        plan
          ? update({ planId: plan.id, ...values, deprecated })
          : create(values)
      }
      onDelete={(plan) => remove({ planId: plan.id })}
    />
  );
}

export function PlatformAddOnSettings() {
  const addOns = useQuery(api.platform.addOns.list);
  const create = useMutation(api.platform.addOns.create);
  const update = useMutation(api.platform.addOns.update);
  const remove = useMutation(api.platform.addOns.remove);

  return (
    <CatalogSettings
      kind="addOn"
      items={addOns?.map((addOn) => ({ ...addOn, usage: addOn.planCount }))}
      onSave={(addOn, { name, features, integrations, deprecated }) =>
        addOn
          ? update({
              addOnId: addOn.id,
              name,
              features,
              integrations,
              deprecated,
            })
          : create({ name, features, integrations })
      }
      onDelete={(addOn) => remove({ addOnId: addOn.id })}
    />
  );
}
