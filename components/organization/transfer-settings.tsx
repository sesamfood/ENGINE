"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { useAccess, usePermission } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { FormCardSkeleton } from "@/components/page-skeletons";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { getUserErrorMessage } from "@/lib/user-errors";

export function TransferSettings() {
  const access = useAccess();
  const canManage = usePermission("organization.settings");
  const settings = useQuery(
    api.transfers.getSettings,
    canManage && !access?.kiosk?.kioskModeEnabled ? {} : "skip",
  );
  const saveSettings = useMutation(api.transfers.setSettings);
  const [daysDraft, setDaysDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!access) return <FormCardSkeleton fields={1} className="max-w-3xl" />;
  if (!canManage || access.kiosk?.kioskModeEnabled) return null;
  if (settings === undefined) {
    return <FormCardSkeleton fields={1} className="max-w-3xl" />;
  }

  const days = daysDraft ?? String(settings.maxFutureDays);
  const changed = days !== String(settings.maxFutureDays);

  async function save() {
    setSaving(true);
    try {
      await saveSettings({ maxFutureDays: Number(days) });
      setDaysDraft(null);
      toast.success("Indstillingerne for transfers er gemt");
    } catch (error) {
      toast.error(
        getUserErrorMessage(error, "Indstillingerne for transfers kunne ikke gemmes. Prøv igen."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Indstillinger for transfers</CardTitle>
        <CardDescription>
          Vælg, hvor langt frem i tiden en transfer må dateres.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <div className="flex items-center gap-1">
              <FieldLabel htmlFor="transfer-max-future-days">
                Maks. dage frem i tiden
              </FieldLabel>
              <HelpTooltip
                label="Maks. dage frem i tiden"
                content="Hvor mange dage frem en transferdato må ligge, fx ved transfers, der planlægges før levering. 0 betyder senest i dag."
              />
            </div>
            <Input
              id="transfer-max-future-days"
              type="number"
              inputMode="numeric"
              min={0}
              max={365}
              step={1}
              value={days}
              onChange={(event) => setDaysDraft(event.target.value)}
              className="h-11 max-w-xs"
            />
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          size="lg"
          disabled={!changed || !days.trim() || saving}
          onClick={() => void save()}
        >
          {saving ? <Spinner data-icon="inline-start" /> : null}
          Gem indstillinger
        </Button>
      </CardFooter>
    </Card>
  );
}
