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
import { FieldGroup } from "@/components/ui/field";
import { api } from "@/convex/_generated/api";
import { getUserErrorMessage } from "@/lib/user-errors";

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
            disabled={settings === undefined || saving}
            onCheckedChange={(checked) => void setPackagingEnabled(checked)}
            help={{
              label: "emballage",
              content:
                "Viser en separat emballageliste på produkter. Emballage trækkes fra lageret ligesom ingredienser.",
            }}
          />
        </FieldGroup>
      </DialogContent>
    </Dialog>
  );
}
