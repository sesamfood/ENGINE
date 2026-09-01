"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  type Announcements,
  type ScreenReaderInstructions,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery } from "convex/react";
import { GripVerticalIcon, ListOrderedIcon } from "lucide-react";
import { createPortal } from "react-dom";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useAccess, usePermission } from "@/components/app-shell";
import {
  sidebarItems,
  type SidebarItemId,
} from "@/lib/sidebar-navigation";
import { cn } from "@/lib/utils";
import { getUserErrorMessage } from "@/lib/user-errors";

const labels = Object.fromEntries(
  sidebarItems.map((item) => [item.id, item.label]),
) as Record<SidebarItemId, string>;

const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "Tryk på mellemrum for at vælge menupunktet. Flyt det med piletasterne. Tryk på mellemrum igen for at placere det, eller Escape for at annullere.",
};

const announcements: Announcements = {
  onDragStart({ active }) {
    return `${labels[active.id as SidebarItemId]} er valgt.`;
  },
  onDragOver({ active, over }) {
    if (!over) return;
    return `${labels[active.id as SidebarItemId]} flyttes til ${labels[over.id as SidebarItemId]}.`;
  },
  onDragEnd({ active }) {
    return `${labels[active.id as SidebarItemId]} er placeret.`;
  },
  onDragCancel({ active }) {
    return `Flytning af ${labels[active.id as SidebarItemId]} blev annulleret.`;
  },
};

function SidebarDragPreview({ id }: { id: SidebarItemId }) {
  return (
    <div className="flex min-h-16 w-full cursor-grabbing items-center gap-3 rounded-xl border border-primary bg-background p-3 text-left shadow-xl ring-2 ring-primary/20">
      <span className="flex size-11 shrink-0 items-center justify-center text-muted-foreground">
        <GripVerticalIcon aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 font-medium">{labels[id]}</span>
    </div>
  );
}

function SidebarItemRow({
  id,
  dragActive,
}: {
  id: SidebarItemId;
  dragActive: boolean;
}) {
  const {
    attributes,
    isDragging,
    isOver,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 1 : undefined,
      }}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        className={cn(
          "flex min-h-16 w-full touch-none items-center gap-3 rounded-xl border bg-background p-3 text-left shadow-sm transition-[box-shadow,border-color] duration-150 select-none",
          dragActive ? "cursor-grabbing" : "cursor-grab active:cursor-grabbing",
          isDragging && "opacity-30",
          isOver &&
            !isDragging &&
            "border-primary bg-primary/5 ring-2 ring-primary/20",
        )}
        aria-label={`Flyt ${labels[id]}`}
        aria-roledescription="menupunkt, der kan flyttes"
      >
        <span className="flex size-11 shrink-0 items-center justify-center text-muted-foreground">
          <GripVerticalIcon aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 font-medium">{labels[id]}</span>
      </button>
    </li>
  );
}

function SidebarOrderForm({ initialOrder }: { initialOrder: SidebarItemId[] }) {
  const saveOrder = useMutation(api.navigation.saveOrder);
  const [itemOrder, setItemOrder] = useState(initialOrder);
  const [activeId, setActiveId] = useState<SidebarItemId | null>(null);
  const [saving, setSaving] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  async function save() {
    setSaving(true);
    try {
      await saveOrder({ itemOrder });
      toast.success("Rækkefølgen i sidemenuen er gemt");
    } catch (error) {
      toast.error(
        getUserErrorMessage(
          error,
          "Rækkefølgen kunne ikke gemmes. Prøv igen.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>Rækkefølge i sidemenuen</CardTitle>
        <CardDescription>
          Træk menupunkterne for at ændre rækkefølgen for hele organisationen. Ændringen gælder i både normal- og kiosktilstand. Brugere ser stadig kun de menupunkter, de har adgang til.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DndContext
          accessibility={{ announcements, screenReaderInstructions }}
          collisionDetection={closestCorners}
          sensors={sensors}
          onDragStart={({ active }) => setActiveId(active.id as SidebarItemId)}
          onDragCancel={() => setActiveId(null)}
          onDragEnd={({ active, over }) => {
            setActiveId(null);
            if (!over || active.id === over.id) return;
            setItemOrder((current) => {
              const from = current.indexOf(active.id as SidebarItemId);
              const to = current.indexOf(over.id as SidebarItemId);
              return from < 0 || to < 0 ? current : arrayMove(current, from, to);
            });
          }}
        >
          <SortableContext
            items={itemOrder}
            strategy={verticalListSortingStrategy}
          >
            <ol
              className={cn(
                "flex flex-col gap-2",
                activeId && "cursor-grabbing",
              )}
              aria-label="Rækkefølge i sidemenuen"
            >
              {itemOrder.map((id) => (
                <SidebarItemRow
                  key={id}
                  id={id}
                  dragActive={Boolean(activeId)}
                />
              ))}
            </ol>
          </SortableContext>
          {activeId
            ? createPortal(
                <DragOverlay dropAnimation={null} zIndex={100}>
                  <SidebarDragPreview id={activeId} />
                </DragOverlay>,
                document.body,
              )
            : null}
        </DndContext>
      </CardContent>
      <CardFooter className="justify-end">
        <Button type="button" size="lg" disabled={saving} onClick={() => void save()}>
          {saving ? <Spinner data-icon="inline-start" /> : <ListOrderedIcon data-icon="inline-start" />}
          Gem rækkefølge
        </Button>
      </CardFooter>
    </Card>
  );
}

export function SidebarSettings() {
  const access = useAccess();
  const canManage = usePermission("organization.settings");
  const itemOrder = useQuery(api.navigation.getOrder, canManage ? {} : "skip");

  if (!access) {
    return <Skeleton className="h-[36rem] w-full max-w-3xl" />;
  }

  if (!canManage) {
    return (
      <Alert variant="destructive" className="max-w-xl">
        <AlertTitle>Ingen adgang</AlertTitle>
        <AlertDescription>
          Du har ikke adgang til at ændre sidemenuens rækkefølge.
        </AlertDescription>
      </Alert>
    );
  }

  if (itemOrder === undefined) {
    return <Skeleton className="h-[36rem] w-full max-w-3xl" />;
  }

  return (
    <SidebarOrderForm
      key={itemOrder.join(":")}
      initialOrder={itemOrder as SidebarItemId[]}
    />
  );
}
