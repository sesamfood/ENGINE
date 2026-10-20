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
import {
  integrationRegistry,
  type IntegrationId,
} from "@/integrations/registry";
import { featureLabels, type FeatureId } from "@/lib/features";
import { getUserErrorMessage } from "@/lib/user-errors";

type Plan = FunctionReturnType<typeof api.platform.plans.list>[number];

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

function PlanDialog({
  plan,
  onClose,
}: {
  plan: Plan | null;
  onClose: () => void;
}) {
  const create = useMutation(api.platform.plans.create);
  const update = useMutation(api.platform.plans.update);
  const [name, setName] = useState(plan?.name ?? "");
  const [features, setFeatures] = useState<FeatureId[]>(plan?.features ?? []);
  const [integrations, setIntegrations] = useState<IntegrationId[]>(
    plan?.integrations ?? [],
  );
  const [deprecated, setDeprecated] = useState(plan?.deprecated ?? false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      if (plan) {
        await update({
          planId: plan.id,
          name,
          features,
          integrations,
          deprecated,
        });
        toast.success("Planen er gemt");
      } else {
        await create({ name, features, integrations });
        toast.success("Planen er oprettet");
      }
      onClose();
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Planen kunne ikke gemmes. Prøv igen."),
      );
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
          <DialogTitle>{plan ? "Redigér plan" : "Opret plan"}</DialogTitle>
          <DialogDescription>
            Organisationer på planen får præcis de valgte funktioner og
            integrationer.
            {plan?.organizationCount
              ? ` Ændringer gælder straks for ${plan.organizationCount} ${plan.organizationCount === 1 ? "organisation" : "organisationer"}.`
              : ""}
          </DialogDescription>
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
              <FieldLabel htmlFor="plan-name">Navn</FieldLabel>
              <Input
                id="plan-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={saving}
                maxLength={100}
                required
              />
            </Field>
            <AccessFields
              idPrefix="plan"
              features={features}
              integrations={integrations}
              disabled={saving}
              onFeaturesChange={setFeatures}
              onIntegrationsChange={setIntegrations}
            />
            {plan ? (
              <Field orientation="horizontal" data-disabled={saving}>
                <Switch
                  id="plan-deprecated"
                  checked={deprecated}
                  onCheckedChange={setDeprecated}
                  disabled={saving}
                />
                <FieldLabel htmlFor="plan-deprecated" appearance="regular">
                  Udfaset
                </FieldLabel>
              </Field>
            ) : null}
            {deprecated ? (
              <FieldDescription>
                Organisationer beholder planen, men den kan ikke vælges til
                andre organisationer.
              </FieldDescription>
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
              {plan ? "Gem plan" : "Opret plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeletePlanAction({ plan }: { plan: Plan }) {
  const remove = useMutation(api.platform.plans.remove);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function confirm() {
    setSaving(true);
    try {
      await remove({ planId: plan.id });
      toast.success(`${plan.name} er slettet`);
      setOpen(false);
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Planen kunne ikke slettes. Prøv igen."),
      );
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
            disabled={plan.organizationCount > 0}
          />
        }
      >
        Slet
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Slet {plan.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Planen fjernes permanent. Ingen organisationer bruger den.
          </AlertDialogDescription>
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

export function PlatformPlanSettings() {
  const role = usePlatformRole();
  const plans = useQuery(api.platform.plans.list);
  const [editing, setEditing] = useState<Plan | "new" | null>(null);
  const canEdit = role === "owner";

  if (plans === undefined) {
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
          Opret plan
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          Kun platformejere kan ændre planer.
        </p>
      )}
      {plans.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ingen planer endnu.</p>
      ) : null}
      {plans.map((plan) => (
        <Card key={plan.id} size="sm">
          <CardHeader>
            <CardTitle>
              <span className="flex flex-wrap items-center gap-2">
                {plan.name}
                {plan.deprecated ? (
                  <Badge variant="secondary">Udfaset</Badge>
                ) : null}
              </span>
            </CardTitle>
            <CardDescription>
              {plan.features.length} funktioner · {plan.integrations.length}{" "}
              integrationer · {plan.organizationCount}{" "}
              {plan.organizationCount === 1 ? "organisation" : "organisationer"}
            </CardDescription>
            {canEdit ? (
              <CardAction>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => setEditing(plan)}
                  >
                    Redigér
                  </Button>
                  <DeletePlanAction plan={plan} />
                </div>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {plan.features
                .map((feature) => featureLabels[feature])
                .join(", ") || "Ingen funktioner"}
            </p>
          </CardContent>
        </Card>
      ))}
      {editing ? (
        <PlanDialog
          plan={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}
