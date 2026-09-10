"use client";

import { SettingsSwitchField } from "./settings-switch-field";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { useAccess, usePermission } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { getUserErrorMessage } from "@/lib/user-errors";

export function OrderingSettings() {
  const { data: session } = authClient.useSession();
  return (
    <Settings
      key={`${session?.session.activeOrganizationId}:${session?.user.id}`}
    />
  );
}

function Settings() {
  const access = useAccess();
  const canManage = usePermission("organization.settings");
  const settings = useQuery(
    api.orderingSettings.getSettings,
    canManage ? {} : "skip",
  );
  const saveSettings = useMutation(api.orderingSettings.setSettings);
  const [includeRecipesDraft, setIncludeRecipesDraft] = useState<
    boolean | null
  >(null);
  const [saving, setSaving] = useState(false);

  if (!access) return <Skeleton className="h-56 max-w-3xl" />;
  if (!canManage) {
    return (
      <Alert variant="destructive" className="max-w-3xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at ændre indstillinger for bestilling.
        </AlertDescription>
      </Alert>
    );
  }
  if (settings === undefined) {
    return <Skeleton className="h-56 max-w-3xl" />;
  }

  const includeRecipes = includeRecipesDraft ?? settings.includeRecipes;
  const changed = includeRecipes !== settings.includeRecipes;

  async function save() {
    setSaving(true);
    try {
      await saveSettings({ includeRecipes });
      setIncludeRecipesDraft(null);
      toast.success("Indstillingerne for bestilling er gemt");
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Indstillingerne for bestilling kunne ikke gemmes. Prøv igen.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Produkter</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <SettingsSwitchField
            label="Medtag produkter med ingredienser"
            id="ordering-include-recipes"
            checked={includeRecipes}
            onCheckedChange={setIncludeRecipesDraft}
            disabled={saving}
          />
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end">
        <Button size="lg" disabled={!changed || saving} onClick={() => void save()}>
          {saving ? <Spinner data-icon="inline-start" /> : null}
          Gem indstillinger
        </Button>
      </CardFooter>
    </Card>
  );
}
