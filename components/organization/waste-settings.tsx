"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { authClient } from "@/lib/auth-client";
import { canManageWasteSettings } from "@/lib/auth-permissions";

type Period = "allTime" | "30Days" | "90Days";

const periodItems = [
  { value: "allTime", label: "Al tid" },
  { value: "30Days", label: "Seneste 30 dage" },
  { value: "90Days", label: "Seneste 90 dage" },
] satisfies Array<{ value: Period; label: string }>;

function message(error: unknown) {
  return error instanceof Error ? error.message : "Indstillingerne kunne ikke gemmes";
}

export function WasteSettings() {
  const membership = authClient.useActiveMemberRole();
  const canManage = canManageWasteSettings(membership.data?.role);
  const settings = useQuery(api.waste.getSettings, canManage ? {} : "skip");
  const saveSettings = useMutation(api.waste.setSettings);
  const [secondsDraft, setSecondsDraft] = useState<string | null>(null);
  const [periodDraft, setPeriodDraft] = useState<Period | null>(null);
  const [saving, setSaving] = useState(false);

  if (membership.isPending) return <Skeleton className="h-72 max-w-3xl" />;
  if (!canManage) {
    return <Alert variant="destructive"><AlertTitle>Ingen adgang</AlertTitle><AlertDescription>Kun administratorer kan ændre Waste-indstillinger.</AlertDescription></Alert>;
  }
  if (settings === undefined) return <Skeleton className="h-72 max-w-3xl" />;

  const seconds = secondsDraft ?? String(settings.inactivitySeconds);
  const period = periodDraft ?? settings.popularityPeriod;

  async function save() {
    const parsed = Number(seconds);
    if (!Number.isInteger(parsed) || parsed < 5 || parsed > 3600) {
      toast.error("Inaktivitet skal være mellem 5 og 3600 sekunder");
      return;
    }
    setSaving(true);
    try {
      await saveSettings({ inactivitySeconds: parsed, popularityPeriod: period });
      setSecondsDraft(null);
      setPeriodDraft(null);
      toast.success("Waste-indstillingerne er gemt");
    } catch (error) {
      toast.error(message(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Waste-indstillinger</CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field orientation="horizontal">
            <FieldContent><div className="flex items-center gap-1"><FieldLabel htmlFor="waste-inactivity">Nulstil efter inaktivitet</FieldLabel><HelpTooltip label="Nulstil efter inaktivitet" content="Efter denne tid åbnes Registrér med Alle produkter, tom søgning og lukkede dialoger." /></div></FieldContent>
            <div className="flex items-center gap-2"><Input id="waste-inactivity" className="w-28" type="number" min="5" max="3600" step="1" value={seconds} onChange={(event) => setSecondsDraft(event.target.value)} /><span className="text-sm text-muted-foreground">sekunder</span></div>
          </Field>
          <Field orientation="horizontal">
            <FieldContent><FieldLabel>Popularitetsperiode</FieldLabel></FieldContent>
            <Select items={periodItems} value={period} onValueChange={(value) => setPeriodDraft(value as Period)}><SelectTrigger className="w-52"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{periodItems.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectGroup></SelectContent></Select>
          </Field>
        </FieldGroup>
      </CardContent>
      <CardFooter className="justify-end"><Button disabled={saving} onClick={save}>{saving ? "Gemmer…" : "Gem indstillinger"}</Button></CardFooter>
    </Card>
  );
}
