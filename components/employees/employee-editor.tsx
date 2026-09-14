"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getUserErrorMessage } from "@/lib/user-errors";

export type DirectoryEmployee = FunctionReturnType<typeof api.employees.listDirectory>["page"][number];

export function EmployeeEditor({
  employee,
  locationId,
  onClose,
}: {
  employee?: DirectoryEmployee;
  locationId: Id<"locations">;
  onClose: () => void;
}) {
  const saveManual = useMutation(api.employees.saveManual);
  const [firstName, setFirstName] = useState(employee?.firstName ?? "");
  const [lastName, setLastName] = useState(employee?.lastName ?? "");
  const [active, setActive] = useState(employee?.active ?? true);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!firstName.trim() || saving) return;
    setSaving(true);
    try {
      await saveManual({
        employeeId: employee?.id,
        locationId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        active,
      });
      toast.success(employee ? "Medarbejderen er opdateret" : "Medarbejderen er oprettet");
      onClose();
    } catch (error) {
      toast.error(getUserErrorMessage(error, "Medarbejderen kunne ikke gemmes. Prøv igen."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent showCloseButton={!saving}>
        <DialogHeader>
          <DialogTitle>{employee ? "Redigér medarbejder" : "Opret medarbejder"}</DialogTitle>
          <DialogDescription>
            {employee
              ? "Opdatér medarbejderens navn og status."
              : "Medarbejderen oprettes på den valgte lokation."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <FieldGroup>
            <Field data-disabled={saving}>
              <FieldLabel htmlFor="employee-first-name">Fornavn</FieldLabel>
              <Input
                id="employee-first-name"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                disabled={saving}
                autoComplete="given-name"
                maxLength={100}
                required
              />
            </Field>
            <Field data-disabled={saving}>
              <FieldLabel htmlFor="employee-last-name">Efternavn</FieldLabel>
              <Input
                id="employee-last-name"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                disabled={saving}
                autoComplete="family-name"
                maxLength={100}
              />
            </Field>
            <Field orientation="horizontal" data-disabled={saving}>
              <FieldLabel htmlFor="employee-active">Aktiv</FieldLabel>
              <Switch
                id="employee-active"
                checked={active}
                onCheckedChange={setActive}
                disabled={saving}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={onClose} disabled={saving}>
              Annullér
            </Button>
            <Button type="submit" className="min-h-11" disabled={saving || !firstName.trim()}>
              {saving ? <Spinner data-icon="inline-start" /> : null}
              {employee ? "Gem ændringer" : "Opret medarbejder"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
