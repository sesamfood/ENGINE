"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { SettingsSwitchField } from "@/components/organization/settings-switch-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/convex/_generated/api";
import {
  DEFAULT_UNIT_SYSTEM,
  standardUnitFor,
  type UnitSystemId,
  type UnitSystemSettings,
} from "@/lib/unit-system";
import { getUserErrorMessage } from "@/lib/user-errors";

const systemItems = [
  { value: "metric", label: "Metrisk" },
  { value: "imperial", label: "Imperisk" },
];

export function ProductSettings({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const settings = useQuery(api.catalog.getSettings);
  const saveSettings = useMutation(api.catalog.setSettings);
  const [saving, setSaving] = useState(false);
  const unitSystem = settings?.unitSystem ?? DEFAULT_UNIT_SYSTEM;

  async function setPackagingEnabled(packagingEnabled: boolean) {
    setSaving(true);
    try {
      await saveSettings({ packagingEnabled });
      toast.success(
        packagingEnabled ? "Emballage er slået til" : "Emballage er slået fra",
      );
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Produktindstillingerne kunne ikke gemmes. Prøv igen.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function setUnitSystem(next: UnitSystemSettings) {
    setSaving(true);
    try {
      await saveSettings({ unitSystem: next });
      toast.success("Enhedssystemet er gemt");
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Produktindstillingerne kunne ikke gemmes. Prøv igen.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  const disabled = settings === undefined || saving;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Produktindstillinger</DialogTitle>
          <DialogDescription>
            Indstillingerne gælder for alle produkter i organisationen.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <SettingsSwitchField
            label="Emballage"
            id="catalog-packaging-enabled"
            checked={settings?.packagingEnabled ?? false}
            disabled={disabled}
            onCheckedChange={(checked) => void setPackagingEnabled(checked)}
            help={{
              label: "emballage",
              content:
                "Viser en separat emballageliste på produkter. Emballage trækkes fra lageret ligesom ingredienser.",
            }}
          />
          <Field data-disabled={disabled}>
            <div className="flex items-center gap-1">
              <FieldTitle>Enhedssystem</FieldTitle>
              <HelpTooltip
                label="enhedssystem"
                content="Ændringen gælder for nye produkter. Eksisterende produkter flyttes under Administration → Enheder."
              />
            </div>
            <ToggleGroup
              value={[unitSystem.mode]}
              variant="outline"
              spacing={0}
              className="w-full"
              aria-label="Enhedssystem"
              disabled={disabled}
              onValueChange={(value) => {
                const mode = value[0];
                if (
                  (mode === "metric" ||
                    mode === "imperial" ||
                    mode === "custom") &&
                  mode !== unitSystem.mode
                ) {
                  void setUnitSystem({ ...unitSystem, mode });
                }
              }}
            >
              <ToggleGroupItem value="metric" className="min-h-11 flex-1">
                Metrisk
              </ToggleGroupItem>
              <ToggleGroupItem value="imperial" className="min-h-11 flex-1">
                Imperisk
              </ToggleGroupItem>
              <ToggleGroupItem value="custom" className="min-h-11 flex-1">
                Brugerdefineret
              </ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>
              Standard: {standardUnitFor("dry", unitSystem).name} for tørvarer
              og {standardUnitFor("wet", unitSystem).name} for væsker
            </FieldDescription>
          </Field>
          {unitSystem.mode === "custom" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <SystemSelect
                id="catalog-dry-system"
                label="Tørvarer"
                value={unitSystem.drySystem}
                disabled={disabled}
                onValueChange={(drySystem) =>
                  void setUnitSystem({ ...unitSystem, drySystem })
                }
              />
              <SystemSelect
                id="catalog-wet-system"
                label="Væsker"
                value={unitSystem.wetSystem}
                disabled={disabled}
                onValueChange={(wetSystem) =>
                  void setUnitSystem({ ...unitSystem, wetSystem })
                }
              />
            </div>
          ) : null}
        </FieldGroup>
      </DialogContent>
    </Dialog>
  );
}

function SystemSelect({
  id,
  label,
  value,
  disabled,
  onValueChange,
}: {
  id: string;
  label: string;
  value: UnitSystemId;
  disabled: boolean;
  onValueChange: (value: UnitSystemId) => void;
}) {
  return (
    <Field data-disabled={disabled}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        items={systemItems}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if ((next === "metric" || next === "imperial") && next !== value) {
            onValueChange(next);
          }
        }}
      >
        <SelectTrigger id={id} className="h-11! w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {systemItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
