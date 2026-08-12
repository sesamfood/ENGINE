"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import { useAccess, usePermission } from "@/components/app-shell";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Indstillingerne kunne ikke gemmes";
}

export function OwnCheckSettings() {
  const access = useAccess();
  const canManage = usePermission("ownChecks.manage");
  const settings = useQuery(api.ownCheckTemplates.getSettings, canManage ? {} : "skip");
  const saveSettings = useMutation(api.ownCheckTemplates.saveSettings);
  const [lateSubmissionDays, setLateSubmissionDays] = useState<number | null>(null);
  const [requireSecondPersonApproval, setRequireSecondPersonApproval] = useState<boolean | null>(null);
  const [blockDuringCount, setBlockDuringCount] = useState<boolean | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);

  if (!access || (canManage && settings === undefined)) {
    return <Skeleton className="h-80 w-full max-w-3xl" />;
  }
  if (!canManage) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>Du har ikke adgang til at administrere egenkontroller.</AlertDescription>
      </Alert>
    );
  }

  const days = lateSubmissionDays ?? settings?.lateSubmissionDays ?? 7;
  const secondPerson = requireSecondPersonApproval ?? settings?.requireSecondPersonApproval ?? true;
  const blockCount = blockDuringCount ?? settings?.blockDuringCount ?? false;

  async function save() {
    if (!reason.trim()) {
      toast.error("Angiv en begrundelse");
      return;
    }
    setSaving(true);
    try {
      await saveSettings({
        lateSubmissionDays: days,
        requireSecondPersonApproval: secondPerson,
        blockDuringCount: blockCount,
        reason,
      });
      toast.success("Egenkontrolindstillingerne er gemt");
      setReason("");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Indstillinger for egenkontrol</CardTitle>
          <CardDescription>Vælg organisationens regler for efterregistrering, godkendelse og optælling.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <FieldGroup>
            <Field>
              <div className="flex items-center gap-1">
                <FieldLabel htmlFor="own-check-late-days">Frist for efterregistrering</FieldLabel>
                <HelpTooltip label="Frist for efterregistrering" content="Hvor mange dage tilbage en egenkontrol må registreres. 0 betyder kun samme dag." />
              </div>
              <Input id="own-check-late-days" type="number" min={0} max={30} value={days} onChange={(event) => setLateSubmissionDays(Number(event.target.value))} className="h-11 max-w-xs" />
            </Field>
            <Field orientation="horizontal">
              <FieldContent>
                <div className="flex items-center gap-1">
                  <FieldLabel htmlFor="own-check-second-person">Godkendelse kræver en anden person</FieldLabel>
                  <HelpTooltip label="Godkendelse kræver en anden person" content="Den, der udførte kontrollen, kan ikke godkende den. Brugere med rettigheden til at administrere egenkontroller kan godkende som undtagelse." />
                </div>
              </FieldContent>
              <Switch id="own-check-second-person" checked={secondPerson} onCheckedChange={setRequireSecondPersonApproval} />
            </Field>
            <Field orientation="horizontal" data-invalid={blockCount}>
              <FieldContent>
                <FieldLabel htmlFor="own-check-count-lock">Bloker egenkontrol under optælling</FieldLabel>
                <FieldDescription className={blockCount ? "text-destructive" : undefined}>
                  Advarsel: egenkontroller kan ikke udføres, mens en optælling låser lokationen.
                </FieldDescription>
              </FieldContent>
              <Switch
                id="own-check-count-lock"
                checked={blockCount}
                onCheckedChange={(checked) => {
                  if (checked && !blockCount) setConfirmBlock(true);
                  else setBlockDuringCount(checked);
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="own-check-settings-reason">Begrundelse</FieldLabel>
              <Input id="own-check-settings-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Angiv en begrundelse" maxLength={1_000} />
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="button" size="lg" disabled={saving} onClick={() => void save()}>
            {saving ? <Spinner data-icon="inline-start" /> : null}
            Gem indstillinger
          </Button>
        </CardFooter>
      </Card>
      <AlertDialog open={confirmBlock} onOpenChange={setConfirmBlock}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bloker egenkontroller under optælling?</AlertDialogTitle>
            <AlertDialogDescription>
              Advarsel: egenkontroller kan ikke udføres, mens en optælling låser lokationen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuller</AlertDialogCancel>
            <AlertDialogAction onClick={() => setBlockDuringCount(true)}>Jeg forstår, aktivér</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
