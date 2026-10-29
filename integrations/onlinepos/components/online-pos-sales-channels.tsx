"use client";

import { SettingsSwitchField } from "@/components/organization/settings-switch-field";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { getUserErrorMessage } from "@/lib/user-errors";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldDescription, FieldGroup } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";

const countFormatter = new Intl.NumberFormat("da-DK");

export function OnlinePosSalesChannels() {
  const settings = useQuery(api.integrations.onlinepos.channels.getSalesChannels);
  const save = useMutation(api.integrations.onlinepos.channels.setOnlinePaymentTypes);
  const backfill = useMutation(
    api.integrations.onlinepos.channels.backfillRecentPaymentTypes,
  );
  const [saving, setSaving] = useState(false);

  if (!settings) return <Skeleton className="h-24 w-full" />;

  async function toggle(paymentType: string, online: boolean) {
    if (!settings) return;
    setSaving(true);
    try {
      await save({
        paymentTypes: online
          ? [...settings.onlinePaymentTypes, paymentType]
          : settings.onlinePaymentTypes.filter((type) => type !== paymentType),
      });
      toast.success(
        online
          ? `${paymentType} tælles som online salg`
          : `${paymentType} tælles som salg i butik`,
      );
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Indstillingen kunne ikke gemmes"));
    } finally {
      setSaving(false);
    }
  }

  async function fetchMissing() {
    setSaving(true);
    try {
      await backfill();
      toast.success("Betalingstyperne hentes. Listen opdateres om lidt.");
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Betalingstyperne kunne ikke hentes"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Salgskanaler</CardTitle>
        <CardDescription>
          Markér de betalingstyper, som online bestillinger bruger. Dashboardet
          viser dem som OnlinePOS online og resten som OnlinePOS i butik.
        </CardDescription>
      </CardHeader>
      <CardContent appearance="stacked" className="flex flex-col">
        {settings.missingDayCount > 0 && settings.canManage && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <p className="text-sm text-muted-foreground">
              {countFormatter.format(settings.missingDayCount)}{" "}
              {settings.missingDayCount === 1 ? "dag" : "dage"} blev synkroniseret
              før salgskanaler fandtes og mangler betalingstyper.
            </p>
            <Button disabled={saving} onClick={() => void fetchMissing()}>
              Hent betalingstyper
            </Button>
          </div>
        )}
        {settings.paymentTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Der er ingen betalingstyper fra de seneste 30 dage endnu.
          </p>
        ) : (
          <FieldGroup>
            {settings.paymentTypes.map(({ paymentType, orderCount }) => (
              <SettingsSwitchField
                key={paymentType}
                label={paymentType}
                description={
                  <FieldDescription>
                    {countFormatter.format(orderCount)} ordrer de seneste 30 dage
                  </FieldDescription>
                }
                checked={settings.onlinePaymentTypes.includes(paymentType)}
                disabled={saving || !settings.canManage}
                onCheckedChange={(online) => void toggle(paymentType, online)}
              />
            ))}
          </FieldGroup>
        )}
      </CardContent>
    </Card>
  );
}
