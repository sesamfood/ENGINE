"use client";

import { SettingsSwitchField } from "./settings-switch-field";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { useAccess, usePermission } from "@/components/app-shell";
import {
  ForecastSettingsFields,
  forecastSettingsDraft,
  parseForecastSettings,
  type ForecastSettingsDraft,
} from "@/components/ordering/forecast-settings-fields";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
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
  const [chooseSupplierFirstDraft, setChooseSupplierFirstDraft] = useState<
    boolean | null
  >(null);
  const [forecastDraft, setForecastDraft] =
    useState<ForecastSettingsDraft | null>(null);
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
  const chooseSupplierFirst =
    chooseSupplierFirstDraft ?? settings.chooseSupplierFirst;
  const forecastInput = forecastDraft ?? forecastSettingsDraft(settings);
  const forecast = parseForecastSettings(forecastInput);
  const changed =
    includeRecipes !== settings.includeRecipes ||
    chooseSupplierFirst !== settings.chooseSupplierFirst ||
    forecastDraft !== null;

  async function save() {
    if (!forecast) return;
    setSaving(true);
    try {
      await saveSettings({ includeRecipes, chooseSupplierFirst, ...forecast });
      setIncludeRecipesDraft(null);
      setChooseSupplierFirstDraft(null);
      setForecastDraft(null);
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
        <CardTitle>Bestilling</CardTitle>
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
          <SettingsSwitchField
            label="Vælg leverandør før bestilling"
            id="ordering-choose-supplier-first"
            help={{
              label: "vælg leverandør før bestilling",
              content:
                "Når der er oprettet leverandører, vælger brugeren først en leverandør eller Ingen leverandør. Slå fra for at vise alle Produkter, der kan bestilles, med det samme.",
            }}
            checked={chooseSupplierFirst}
            onCheckedChange={setChooseSupplierFirstDraft}
            disabled={saving}
          />
          <FieldSet>
            <FieldLegend variant="label">Uden leverandør</FieldLegend>
            <FieldDescription>
              Bruges, når der bestilles med Ingen leverandør. Hver leverandør
              har sin egen dækning og buffer.
            </FieldDescription>
            <ForecastSettingsFields
              id="ordering-forecast"
              value={forecastInput}
              onChange={setForecastDraft}
              disabled={saving}
            />
          </FieldSet>
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          size="lg"
          disabled={!changed || !forecast || saving}
          onClick={() => void save()}
        >
          {saving ? <Spinner data-icon="inline-start" /> : null}
          Gem indstillinger
        </Button>
      </CardFooter>
    </Card>
  );
}
