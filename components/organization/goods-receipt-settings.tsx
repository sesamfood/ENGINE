"use client";

import { getUserErrorMessage } from "@/lib/user-errors";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { useAccess, usePermission } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";

export function GoodsReceiptSettings() {
  const access = useAccess();
  const canManage = usePermission("goodsReceipts.settings");
  const settings = useQuery(
    api.goodsReceipts.getSettings,
    canManage ? {} : "skip",
  );
  const saveSettings = useMutation(api.goodsReceipts.setSettings);
  const [photoDraft, setPhotoDraft] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  if (!access) return <Skeleton className="h-72 max-w-3xl" />;
  if (!canManage) {
    return (
      <Alert variant="destructive" className="max-w-3xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at ændre indstillinger for varemodtagelse.
        </AlertDescription>
      </Alert>
    );
  }
  if (settings === undefined) {
    return <Skeleton className="h-72 max-w-3xl" />;
  }

  const photoEnabled =
    photoDraft ?? settings.transferDeliveryNotePhotoEnabled;
  const changed =
    photoEnabled !== settings.transferDeliveryNotePhotoEnabled;

  async function save() {
    setSaving(true);
    try {
      await saveSettings({
        transferDeliveryNotePhotoEnabled: photoEnabled,
      });
      setPhotoDraft(null);
      toast.success("Indstillingerne for varemodtagelse er gemt");
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Indstillingerne for varemodtagelse kunne ikke gemmes. Prøv igen."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Følgesedler</CardTitle>
        <CardDescription>
          Vælg, om varemodtagelser fra transfers kan få et billede af
          følgesedlen. Manuelle varemodtagelser har altid billedfeltet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldContent>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="goods-receipt-transfer-photo">
                  Transfer
                </FieldLabel>
                <HelpTooltip
                  label="billede af følgeseddel for transfers"
                  content="Viser et kamerafelt, når en transfer registreres som modtaget. Billedet er valgfrit."
                />
              </div>
            </FieldContent>
            <Switch
              id="goods-receipt-transfer-photo"
              aria-label="Tillad billede af følgeseddel for transfers"
              checked={photoEnabled}
              onCheckedChange={setPhotoDraft}
            />
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          size="lg"
          disabled={!changed || saving}
          onClick={() => void save()}
        >
          {saving ? <Spinner data-icon="inline-start" /> : null}
          Gem indstillinger
        </Button>
      </CardFooter>
    </Card>
  );
}
