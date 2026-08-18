"use client";

import { useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation } from "convex/react";
import { PlusIcon } from "lucide-react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DashboardRecord } from "@/lib/dashboard/dashboard-record";
import { cn } from "@/lib/utils";
import { DashboardSettingsDialog } from "./dashboard-settings-dialog";

const MAX_DASHBOARDS = 8;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Dashboardrækkefølgen kunne ikke gemmes";
}

function SortableDashboardTab({ dashboard, canManage }: { dashboard: DashboardRecord; canManage: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: dashboard.id, disabled: !canManage });
  const dragAttributes = {
    "aria-describedby": attributes["aria-describedby"],
    "aria-roledescription": attributes["aria-roledescription"],
  };
  return (
    <TabsTrigger
      ref={setNodeRef}
      value={String(dashboard.id)}
      className={cn("min-w-28 shrink-0 px-4", canManage && "touch-none cursor-grab active:cursor-grabbing", isDragging && "opacity-30")}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...dragAttributes}
      {...listeners}
    >
      {dashboard.name}
    </TabsTrigger>
  );
}

function DashboardDragPreview({ name }: { name: string }) {
  return (
    <Card className="min-w-36 border-primary/50 bg-card/95 shadow-xl ring-2 ring-primary/20">
      <CardHeader className="p-3">
        <CardTitle className="truncate text-sm">{name}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function CreateDashboardDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (dashboardId: string) => void;
}) {
  const create = useMutation(api.dashboard.create);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    try {
      const dashboardId = await create({ name });
      setName("");
      onOpenChange(false);
      toast.success("Dashboardet er oprettet");
      onCreated(String(dashboardId));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Opret dashboard</DialogTitle>
          <DialogDescription>Giv det nye dashboard et navn. Widgets kan tilføjes bagefter.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="new-dashboard-name">Navn</FieldLabel>
            <Input id="new-dashboard-name" value={name} maxLength={100} autoFocus onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && name.trim()) void submit(); }} />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuller</Button>
          <Button type="button" disabled={pending || !name.trim()} onClick={() => void submit()}>
            {pending ? <Spinner data-icon="inline-start" /> : <PlusIcon data-icon="inline-start" />}
            Opret dashboard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DashboardTabs({
  dashboards,
  activeId,
  canManage,
  onChange,
  onReordered,
  onSettingsSaved,
  onDuplicated,
  onDeleted,
  onCreated,
}: {
  dashboards: DashboardRecord[];
  activeId: string;
  canManage: boolean;
  onChange: (dashboardId: string) => void;
  onReordered: (dashboardIds: string[]) => void;
  onSettingsSaved: (dashboard: DashboardRecord) => void;
  onDuplicated: (dashboardId: string) => void;
  onDeleted: (dashboardId: string) => void;
  onCreated: (dashboardId: string) => void;
}) {
  const reorder = useMutation(api.dashboard.reorder);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [order, setOrder] = useState(dashboards);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeDashboard = order.find((dashboard) => String(dashboard.id) === activeId) ?? order[0];
  const canCreate = canManage && order.length < MAX_DASHBOARDS;

  async function saveOrder(next: DashboardRecord[]) {
    const previous = order;
    setOrder(next);
    onReordered(next.map((dashboard) => String(dashboard.id)));
    try {
      await reorder({ dashboardIds: next.map((dashboard) => dashboard.id) });
    } catch (error) {
      setOrder(previous);
      onReordered(previous.map((dashboard) => String(dashboard.id)));
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      <div className="flex min-w-0 items-center gap-2" aria-label="Dashboardnavigation">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={({ active }) => setActiveDragId(String(active.id))}
          onDragCancel={() => setActiveDragId(null)}
          onDragEnd={({ active, over }) => {
            setActiveDragId(null);
            if (!over || active.id === over.id || !canManage) return;
            const from = order.findIndex((dashboard) => dashboard.id === active.id);
            const to = order.findIndex((dashboard) => dashboard.id === over.id);
            if (from < 0 || to < 0) return;
            void saveOrder(arrayMove(order, from, to));
          }}
        >
          <Tabs value={activeId} onValueChange={(value) => { if (value === "new") setCreateOpen(true); else onChange(value); }} className="min-w-0 flex-1">
            <TabsList className="h-12 w-full justify-start overflow-x-auto" aria-label="Dashboards">
              <SortableContext items={order.map((dashboard) => dashboard.id)} strategy={horizontalListSortingStrategy}>
                {order.map((dashboard) => <SortableDashboardTab key={dashboard.id} dashboard={dashboard} canManage={canManage} />)}
              </SortableContext>
              {canCreate ? <TabsTrigger value="new" className="min-w-12 shrink-0 px-4" aria-label="Opret dashboard"><PlusIcon /></TabsTrigger> : null}
            </TabsList>
          </Tabs>
          {canManage && activeDashboard && String(activeDashboard.id) === activeId ? (
            <DashboardSettingsDialog
              key={`${activeDashboard.id}:${activeDashboard.updatedAt}`}
              dashboard={activeDashboard}
              open={settingsId === String(activeDashboard.id)}
              onOpenChange={(open) => setSettingsId(open ? String(activeDashboard.id) : null)}
              onSaved={(changes, updatedAt) => onSettingsSaved({ ...activeDashboard, ...changes, updatedAt })}
              onDuplicated={onDuplicated}
              onDeleted={() => onDeleted(String(activeDashboard.id))}
            />
          ) : null}
        </DndContext>
      </div>
      {activeDragId && typeof document !== "undefined"
        ? createPortal(<DragOverlay dropAnimation={null}><DashboardDragPreview name={order.find((dashboard) => String(dashboard.id) === activeDragId)?.name ?? "Dashboard"} /></DragOverlay>, document.body)
        : null}
      <CreateDashboardDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={onCreated} />
    </>
  );
}
