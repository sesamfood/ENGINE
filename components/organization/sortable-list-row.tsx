"use client";

import type { ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVerticalIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const sortableListInstructions = {
  draggable:
    "Tryk på mellemrum for at vælge rækken. Flyt den med piletasterne. Tryk på mellemrum igen for at placere den, eller Escape for at annullere.",
};

export function SortableListRow({
  id,
  label,
  disabled = false,
  position,
  actions,
  className,
  handleClassName,
  roleDescription = "række, der kan flyttes",
}: {
  id: string;
  label: string;
  disabled?: boolean;
  position?: number;
  actions?: ReactNode;
  className?: string;
  handleClassName?: string;
  roleDescription?: string;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 1 : undefined,
      }}
      className={cn(
        "flex min-h-14 items-center gap-2 rounded-lg border bg-background p-1 transition-[box-shadow,border-color] duration-150",
        isDragging && "opacity-30",
        isOver &&
          !isDragging &&
          "border-primary bg-primary/5 ring-2 ring-primary/20",
        className,
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        disabled={disabled}
        {...attributes}
        {...listeners}
        aria-label={`Flyt ${label}`}
        aria-roledescription={roleDescription}
        className={cn(
          "flex min-h-12 min-w-0 flex-1 touch-none cursor-grab items-center gap-2 rounded-md px-1 py-0 text-left outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing disabled:pointer-events-none disabled:cursor-default disabled:opacity-50",
          handleClassName,
        )}
      >
        <span className="flex size-11 shrink-0 items-center justify-center text-muted-foreground">
          <GripVerticalIcon aria-hidden="true" />
        </span>
        {position !== undefined ? (
          <span className="w-6 shrink-0 text-center text-sm text-muted-foreground">
            {position}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      </button>
      {actions}
    </li>
  );
}
