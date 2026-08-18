"use client";

import { useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CopyIcon, GripVerticalIcon, SaveIcon, SettingsIcon, Trash2Icon } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { DashboardRecord } from "@/lib/dashboard/dashboard-record";
import { cn } from "@/lib/utils";

type RoleOption = {
  role: string;
  name: string;
};

type SettingsChanges = Pick<DashboardRecord, "name" | "roleIds" | "defaultForRoleIds" | "defaultForLocationIds" | "isOrganizationDefault">;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Indstillingerne kunne ikke gemmes";
}

function toggleValue(values: string[], value: string, checked: boolean) {
  if (checked) return values.includes(value) ? values : [...values, value];
  return values.filter((candidate) => candidate !== value);
}

function SortableDashboardOrderItem({ dashboard }: { dashboard: DashboardRecord }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dashboard.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex min-h-11 items-center gap-2 rounded-lg border px-3 touch-none cursor-grab active:cursor-grabbing", isDragging && "opacity-50")}
      {...attributes}
      {...listeners}
    >
      <GripVerticalIcon className="shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate font-medium">{dashboard.name}</span>
    </div>
  );
}

export function DashboardSettingsDialog({
  dashboard,
  dashboards,
  open,
  onOpenChange,
  onReorder,
  onSaved,
  onDuplicated,
  onDeleted,
}: {
  dashboard: DashboardRecord;
  dashboards: DashboardRecord[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReorder: (dashboardIds: string[]) => Promise<void>;
  onSaved: (changes: SettingsChanges, updatedAt: number) => void;
  onDuplicated: (dashboardId: Id<"dashboards">) => void;
  onDeleted: () => void;
}) {
  const rolesQuery = useQuery(api.dashboard.listRoleOptions, open ? {} : "skip");
  const scopeOptions = useQuery(api.dashboard.listScopeOptions, open ? {} : "skip");
  const saveSettings = useMutation(api.dashboard.saveSettings);
  const duplicate = useMutation(api.dashboard.duplicate);
  const remove = useMutation(api.dashboard.remove);
  const [name, setName] = useState(dashboard.name);
  const [roleIds, setRoleIds] = useState<string[]>(dashboard.roleIds);
  const [defaultForRoleIds, setDefaultForRoleIds] = useState<string[]>(dashboard.defaultForRoleIds);
  const [defaultForLocationIds, setDefaultForLocationIds] = useState<Id<"locations">[]>(dashboard.defaultForLocationIds);
  const [isOrganizationDefault, setIsOrganizationDefault] = useState(dashboard.isOrganizationDefault);
  const [duplicateName, setDuplicateName] = useState(`${dashboard.name} (kopi)`);
  const [pending, setPending] = useState(false);
  const [duplicatePending, setDuplicatePending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [draftOrder, setDraftOrder] = useState(() => dashboards.map((candidate) => String(candidate.id)));
  const reorderSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const roles = (rolesQuery ?? []) as RoleOption[];
  const locations = scopeOptions?.locations ?? [];
  const orderedDashboards = draftOrder.flatMap((dashboardId) => {
    const candidate = dashboards.find((dashboardItem) => String(dashboardItem.id) === dashboardId);
    return candidate ? [candidate] : [];
  });

  function handleDialogOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setDraftOrder(dashboards.map((candidate) => String(candidate.id)));
      onOpenChange(true);
      return;
    }
    const currentOrder = dashboards.map((candidate) => String(candidate.id));
    onOpenChange(false);
    if (
      draftOrder.length === currentOrder.length &&
      draftOrder.some((dashboardId, index) => dashboardId !== currentOrder[index])
    ) {
      void onReorder(draftOrder);
    }
  }

  function closeDialog() {
    handleDialogOpenChange(false);
  }

  async function save() {
    setPending(true);
    try {
      const updatedAt = await saveSettings({
        dashboardId: dashboard.id,
        name,
        roleIds,
        defaultForRoleIds,
        defaultForLocationIds,
        isOrganizationDefault,
        expectedUpdatedAt: dashboard.updatedAt,
      });
      onSaved({ name: name.trim(), roleIds, defaultForRoleIds, defaultForLocationIds, isOrganizationDefault }, updatedAt);
      closeDialog();
      toast.success("Dashboardindstillingerne er gemt");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function duplicateDashboard() {
    setDuplicatePending(true);
    try {
      const dashboardId = await duplicate({ dashboardId: dashboard.id, name: duplicateName });
      toast.success("Dashboardet er duplikeret");
      onDuplicated(dashboardId);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDuplicatePending(false);
    }
  }

  async function deleteDashboard() {
    setPending(true);
    try {
      await remove({ dashboardId: dashboard.id });
      setDeleteOpen(false);
      onOpenChange(false);
      toast.success("Dashboardet er slettet");
      onDeleted();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  function reorderDashboards(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const from = draftOrder.indexOf(String(event.active.id));
    const to = draftOrder.indexOf(String(event.over.id));
    if (from < 0 || to < 0) return;
    const next = [...draftOrder];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDraftOrder(next);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogTrigger render={<Button type="button" variant="ghost" size="icon-lg" className="size-11" aria-label={`Indstillinger for ${dashboard.name}`} />}>
          <SettingsIcon />
        </DialogTrigger>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Dashboardindstillinger</DialogTitle>
            <DialogDescription>Styr navn, adgang og standarder for {dashboard.name}.</DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`dashboard-name-${dashboard.id}`}>Navn</FieldLabel>
              <Input id={`dashboard-name-${dashboard.id}`} value={name} maxLength={100} onChange={(event) => setName(event.target.value)} />
            </Field>

            <FieldSet>
              <FieldLegend variant="label">Dashboardrækkefølge</FieldLegend>
              <FieldDescription>Bestem rækkefølgen på dashboards i fanerne.</FieldDescription>
              <DndContext
                sensors={reorderSensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => void reorderDashboards(event)}
              >
                <SortableContext items={draftOrder} strategy={verticalListSortingStrategy}>
                  <FieldGroup className="gap-2" aria-label="Dashboardrækkefølge">
                    {orderedDashboards.map((candidate) => <SortableDashboardOrderItem key={candidate.id} dashboard={candidate} />)}
                  </FieldGroup>
                </SortableContext>
              </DndContext>
            </FieldSet>

            <FieldSet>
              <FieldLegend variant="label">Adgang</FieldLegend>
              <FieldDescription>Vælg roller, der må se dashboardet. Ingen valgte roller betyder alle roller.</FieldDescription>
              <FieldGroup className="gap-2">
                {roles.map((role) => (
                  <Field key={role.role} orientation="horizontal">
                    <Checkbox id={`dashboard-access-${dashboard.id}-${role.role}`} checked={roleIds.includes(role.role)} onCheckedChange={(checked) => setRoleIds((current) => {
                      const next = toggleValue(current, role.role, checked === true);
                      if (next.length > 0) setDefaultForRoleIds((defaults) => defaults.filter((candidate) => next.includes(candidate)));
                      return next;
                    })} />
                    <FieldLabel htmlFor={`dashboard-access-${dashboard.id}-${role.role}`} className="font-normal">{role.name}</FieldLabel>
                  </Field>
                ))}
              </FieldGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend variant="label">Standard for roller</FieldLegend>
              <FieldDescription>Disse roller åbner dashboardet som standard.</FieldDescription>
              <FieldGroup className="gap-2">
                {roles.map((role) => {
                  const allowed = roleIds.length === 0 || roleIds.includes(role.role);
                  return (
                    <Field key={role.role} orientation="horizontal" data-disabled={!allowed}>
                      <Checkbox id={`dashboard-role-default-${dashboard.id}-${role.role}`} checked={defaultForRoleIds.includes(role.role)} disabled={!allowed} onCheckedChange={(checked) => setDefaultForRoleIds((current) => toggleValue(current, role.role, checked === true))} />
                      <FieldLabel htmlFor={`dashboard-role-default-${dashboard.id}-${role.role}`} className="font-normal">{role.name}</FieldLabel>
                    </Field>
                  );
                })}
              </FieldGroup>
            </FieldSet>

            <FieldSet>
              <FieldLegend variant="label">Standard for lokationer</FieldLegend>
              <FieldDescription>En lokation kan kun have ét standarddashboard.</FieldDescription>
              <div className="max-h-44 overflow-y-auto rounded-lg border p-3">
                <FieldGroup className="gap-2">
                  {locations.map((location) => (
                    <Field key={location.id} orientation="horizontal">
                      <Checkbox id={`dashboard-location-default-${dashboard.id}-${location.id}`} checked={defaultForLocationIds.includes(location.id)} onCheckedChange={(checked) => setDefaultForLocationIds((current) => checked === true ? [...current, location.id] : current.filter((id) => id !== location.id))} />
                      <FieldLabel htmlFor={`dashboard-location-default-${dashboard.id}-${location.id}`} className="font-normal">{location.name}</FieldLabel>
                    </Field>
                  ))}
                </FieldGroup>
              </div>
            </FieldSet>

            <Field orientation="horizontal">
              <Switch id={`dashboard-organization-default-${dashboard.id}`} checked={isOrganizationDefault} onCheckedChange={setIsOrganizationDefault} />
              <FieldLabel htmlFor={`dashboard-organization-default-${dashboard.id}`} className="font-normal">Standard for organisationen</FieldLabel>
            </Field>

            <Field>
              <FieldLabel htmlFor={`dashboard-duplicate-name-${dashboard.id}`}>Duplikér</FieldLabel>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input id={`dashboard-duplicate-name-${dashboard.id}`} value={duplicateName} maxLength={100} onChange={(event) => setDuplicateName(event.target.value)} />
                <Button type="button" variant="outline" className="min-h-11 shrink-0" disabled={duplicatePending || !duplicateName.trim()} onClick={() => void duplicateDashboard()}>
                  {duplicatePending ? <Spinner data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
                  Duplikér
                </Button>
              </div>
            </Field>
          </FieldGroup>

          <DialogFooter>
            <Button type="button" onClick={() => void save()} disabled={pending || !name.trim()}>
              {pending ? <Spinner data-icon="inline-start" /> : <SaveIcon data-icon="inline-start" />}
              Gem indstillinger
            </Button>
            <Button type="button" variant="destructive" onClick={() => setDeleteOpen(true)} disabled={pending}>
              <Trash2Icon data-icon="inline-start" />
              Slet dashboard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slet {dashboard.name}?</AlertDialogTitle>
            <AlertDialogDescription>Dashboardet og dets widgets slettes permanent. Handlingen kan ikke fortrydes.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Behold dashboard</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void deleteDashboard()}>Slet dashboard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
