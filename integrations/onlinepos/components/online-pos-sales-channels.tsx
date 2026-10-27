"use client";

import { SettingsSwitchField } from "@/components/organization/settings-switch-field";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { getUserErrorMessage } from "@/lib/user-errors";
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
