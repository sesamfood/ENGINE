"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { useAccess, usePermission } from "@/components/app-shell";
import { SettingsSwitchField } from "@/components/organization/settings-switch-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldDescription, FieldGroup } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { featureLabels, type FeatureId } from "@/lib/features";
import { getUserErrorMessage } from "@/lib/user-errors";

export function FeatureToggle({ feature }: { feature: FeatureId }) {
  const { data: session } = authClient.useSession();
  return (
    <FeatureToggleControl
      key={`${session?.session.activeOrganizationId}:${session?.user.id}:${feature}`}
      feature={feature}
    />
  );
}

function FeatureToggleControl({ feature }: { feature: FeatureId }) {
  const access = useAccess();
  const canManage = usePermission("organization.settings");
  const setEnabled = useMutation(api.features.setEnabled);
  const [saving, setSaving] = useState(false);

  if (!access) return <Skeleton className="h-32 w-full max-w-3xl" />;

  const label = featureLabels[feature];
  const enabled = !access.disabledFeatures.includes(feature);

  async function changeEnabled(nextEnabled: boolean) {
    if (!canManage || saving) return;
    setSaving(true);
    try {
      await setEnabled({ feature, enabled: nextEnabled });
      toast.success(`${label} er slået ${nextEnabled ? "til" : "fra"}`);
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Indstillingen kunne ikke gemmes. Prøv igen."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Aktivering</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <SettingsSwitchField
            label={label}
            checked={enabled}
            disabled={!canManage || saving}
            onCheckedChange={(checked) => void changeEnabled(checked)}
            help={{
              label: `aktivering af ${label}`,
              content:
                "Gælder hele organisationen. Når funktionen er slået fra, skjules den i sidemenuen og kan ikke bruges. Indstillinger og data bevares.",
            }}
            description={
              !canManage ? (
                <FieldDescription>
                  Kontakt en administrator for at ændre indstillingen.
                </FieldDescription>
              ) : undefined
            }
          />
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
