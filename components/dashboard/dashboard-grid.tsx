"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { createPortal } from "react-dom";
import { useMemo, useState, type CSSProperties } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { metricRegistry } from "@/lib/dashboard/registry";
import {
  dashboardColumns,
  dashboardRowCount,
  layoutDashboardWidgets,
  moveDashboardWidget,
  widgetsOverlappingPosition,
  widgetSizeSpans,
} from "@/lib/dashboard/layout";
import type { DashboardRange, DashboardScope, WidgetInstance, WidgetSize, VisualizationId } from "@/lib/dashboard/types";
import { DashboardWidget } from "./dashboard-widget";

const sizeClasses: Record<WidgetSize, string> = {
  "1x1": "col-span-1 row-span-1",
  "1x2": "col-span-1 row-span-2",
  "2x1": "col-span-1 row-span-1 sm:col-span-2",
  "2x2": "col-span-1 row-span-2 sm:col-span-2",
  "4x2": "col-span-1 row-span-2 sm:col-span-2 xl:col-span-4",
};

function dashboardCollision(widgets: WidgetInstance[]): CollisionDetection {
  return (args) => {
    const collisions = pointerWithin(args);
    const slot = collisions.find((collision) => String(collision.id).startsWith("dashboard-slot:"));
    const active = widgets.find((widget) => widget.key === args.active.id);
    const position = slot
      ? args.droppableContainers.find((container) => container.id === slot.id)?.data.current?.position as { column: number; row: number } | undefined
      : undefined;

    if (slot && active && position) {
      const overlapping = widgetsOverlappingPosition(widgets, active.key, position, active.size);
      if (overlapping.length !== 1) return [slot];
      const widget = collisions.find((collision) => collision.id === overlapping[0].key);
      if (widget) return [widget];
    }

    const widget = collisions.find((collision) => !String(collision.id).startsWith("dashboard-slot:"));
    return widget ? [widget] : collisions.length ? collisions : closestCenter(args);
  };
}

function positionStyle(widget: WidgetInstance) {
  const span = widgetSizeSpans[widget.size];
  return {
    "--dashboard-column-start": (widget.position?.column ?? 0) + 1,
    "--dashboard-column-span": span.columns,
    "--dashboard-row-start": (widget.position?.row ?? 0) + 1,
    "--dashboard-row-span": span.rows,
  } as CSSProperties;
}

function DragPreview({ widget }: { widget: WidgetInstance }) {
  return (
    <Card className="h-full border-primary/50 bg-card/95 shadow-xl ring-2 ring-primary/20">
      <CardHeader>
        <CardTitle className="truncate text-base">{metricRegistry[widget.metricId].label}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function GridSlot({
  column,
  row,
  disabled,
}: {
  column: number;
  row: number;
  disabled: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `dashboard-slot:${column}:${row}`,
    data: { kind: "slot", position: { column, row } },
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      aria-hidden="true"
      className={cn(
        "dashboard-grid-slot rounded-xl border border-dashed border-border bg-muted/25 transition-[background-color,border-color,box-shadow] duration-150",
        isOver && "border-primary bg-primary/10 ring-2 ring-primary/20",
      )}
      style={{
        "--dashboard-column-start": column + 1,
        "--dashboard-row-start": row + 1,
      } as CSSProperties}
    />
  );
}

function GridSlots({
  rows,
  activeWidget,
}: {
  rows: number;
  activeWidget?: WidgetInstance;
}) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none col-start-1 row-start-1 hidden grid-cols-4 auto-rows-[12rem] gap-4 xl:grid"
    >
      {Array.from({ length: rows * dashboardColumns }, (_, index) => {
        const column = index % dashboardColumns;
        const row = Math.floor(index / dashboardColumns);
        return (
          <GridSlot
            key={`${column}:${row}`}
            column={column}
            row={row}
            disabled={!activeWidget}
          />
        );
      })}
    </div>
  );
}

function DropFootprint({
  widget,
  position,
}: {
  widget: WidgetInstance;
  position: { column: number; row: number };
}) {
  return (
    <div className="pointer-events-none relative z-10 col-start-1 row-start-1 hidden grid-cols-4 auto-rows-[12rem] gap-4 xl:grid">
      <div
        aria-hidden="true"
        className="dashboard-grid-drop-preview rounded-xl border-2 border-primary bg-primary/15 shadow-sm ring-2 ring-primary/25"
        style={positionStyle({ ...widget, position })}
      />
    </div>
  );
}

function DraggableWidget({
  widget,
  sourceSize,
  scope,
  range,
  now,
  editable,
  publicAccess,
  onChange,
  onResize,
  onRemove,
}: {
  widget: WidgetInstance;
  sourceSize: WidgetSize;
  scope: DashboardScope;
  range: DashboardRange;
  now: number;
  editable: boolean;
  publicAccess?: { token: string; accessKey: string };
  onChange: (widget: WidgetInstance) => void;
  onResize: (size: WidgetSize, complete: boolean) => void;
  onRemove: () => void;
}) {
  const draggable = useDraggable({ id: widget.key, disabled: !editable, data: { kind: "widget" } });
  const droppable = useDroppable({ id: widget.key, disabled: !editable, data: { kind: "widget" } });
  const dragProps = editable
    ? { ...draggable.attributes, ...draggable.listeners }
    : {};

  return (
    <div
      ref={(node) => {
        draggable.setNodeRef(node);
        draggable.setActivatorNodeRef(node);
        droppable.setNodeRef(node);
      }}
      data-dashboard-widget
      style={positionStyle(widget)}
      className={cn(
        "dashboard-grid-item min-w-0 rounded-xl transition-[opacity,box-shadow,background-color] duration-150",
        sizeClasses[widget.size],
        editable && "touch-none cursor-grab active:cursor-grabbing",
        draggable.isDragging && "opacity-20",
        droppable.isOver && !draggable.isDragging && "bg-primary/5 ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
      {...dragProps}
    >
      <DashboardWidget
        widget={widget}
        scope={scope}
        range={range}
        now={now}
        editable={editable}
        resizing={widget.size !== sourceSize}
        publicAccess={publicAccess}
        onVisualizationChange={(visualization: VisualizationId) => onChange({ ...widget, visualization })}
        onResize={onResize}
        onRemove={onRemove}
      />
    </div>
  );
}

export function DashboardGrid({
  widgets,
  scope,
  range,
  now,
  editable = false,
  publicAccess,
  onChange,
}: {
  widgets: WidgetInstance[];
  scope: DashboardScope;
  range: DashboardRange;
  now: number;
  editable?: boolean;
  publicAccess?: { token: string; accessKey: string };
  onChange?: (widgets: WidgetInstance[]) => void;
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    behavior: "move" | "swap";
    position: { column: number; row: number };
    targetKey?: string;
  } | null>(null);
  const [resizePreview, setResizePreview] = useState<{ key: string; size: WidgetSize } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const layout = useMemo(() => layoutDashboardWidgets(widgets), [widgets]);
  const resizedLayout = useMemo(() => {
    if (!resizePreview) return layout;
    return layoutDashboardWidgets(
      layout.map((widget) => widget.key === resizePreview.key ? { ...widget, size: resizePreview.size } : widget),
      resizePreview.key,
    );
  }, [layout, resizePreview]);
  const projectedWidgets = useMemo(() => {
    if (!activeKey || !dropTarget) return resizedLayout;
    if (dropTarget.behavior === "move") {
      return moveDashboardWidget(resizedLayout, activeKey, dropTarget.position);
    }
    const active = resizedLayout.find((widget) => widget.key === activeKey);
    const target = resizedLayout.find((widget) => widget.key === dropTarget.targetKey);
    if (!active || !target) return resizedLayout;
    return resizedLayout.map((widget) => {
      if (widget.key === active.key) return { ...widget, position: target.position, size: target.size };
      if (widget.key === target.key) return { ...widget, position: active.position, size: active.size };
      return widget;
    });
  }, [activeKey, dropTarget, resizedLayout]);
  const displayedWidgets = useMemo(() => {
    if (!activeKey) return projectedWidgets;
    const active = resizedLayout.find((widget) => widget.key === activeKey);
    return projectedWidgets.map((widget) => widget.key === activeKey && active ? active : widget);
  }, [activeKey, projectedWidgets, resizedLayout]);
  const activeWidget = resizedLayout.find((widget) => widget.key === activeKey);
  const rows = dashboardRowCount(displayedWidgets) + (editable ? 2 : 0);

  function setTargetFromOver(event: DragOverEvent) {
    const over = event.over;
    if (!over) {
      setDropTarget(null);
      return;
    }
    const data = over.data.current;
    if (data?.kind === "slot") {
      setDropTarget({ behavior: "move", position: data.position as { column: number; row: number } });
      return;
    }
    const target = resizedLayout.find((widget) => widget.key === over.id);
    if (target?.position) {
      setDropTarget({ behavior: "swap", position: target.position, targetKey: target.key });
    }
  }

  function dragEnd(event: DragEndEvent) {
    setActiveKey(null);
    setDropTarget(null);
    if (!event.over || event.active.id === event.over.id) return;
    const active = layout.find((widget) => widget.key === event.active.id);
    if (!active) return;
    const over = event.over.data.current;
    if (over?.kind === "slot") {
      const position = over.position as { column: number; row: number };
      onChange?.(moveDashboardWidget(layout, active.key, position));
      return;
    }
    const target = layout.find((widget) => widget.key === event.over?.id);
    if (!target || !active.position || !target.position) return;
    onChange?.(layout.map((widget) => {
      if (widget.key === active.key) return { ...widget, position: target.position, size: target.size };
      if (widget.key === target.key) return { ...widget, position: active.position, size: active.size };
      return widget;
    }));
  }

  const content = (
    <div className="grid">
      {editable ? <GridSlots rows={rows} activeWidget={activeWidget} /> : null}
      <div
        data-dashboard-grid
        className={cn(
          "col-start-1 row-start-1 grid auto-rows-[12rem] grid-cols-1 grid-flow-dense gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:grid-flow-row",
          activeKey && "cursor-grabbing",
        )}
      >
        {displayedWidgets.map((widget) => {
          const source = layout.find((item) => item.key === widget.key) ?? widget;
          return (
            <DraggableWidget
              key={widget.key}
              widget={widget}
              sourceSize={source.size}
              scope={scope}
              range={range}
              now={now}
              editable={editable}
              publicAccess={publicAccess}
              onChange={(next) => onChange?.(layout.map((item) => item.key === widget.key ? next : item))}
              onResize={(size, complete) => {
                if (!complete) {
                  setResizePreview({ key: widget.key, size });
                  return;
                }
                setResizePreview(null);
                if (size !== source.size) {
                  onChange?.(layoutDashboardWidgets(layout.map((item) => item.key === widget.key ? { ...item, size } : item), widget.key));
                }
              }}
              onRemove={() => onChange?.(layout.filter((item) => item.key !== widget.key))}
            />
          );
        })}
      </div>
      {editable && activeWidget && dropTarget ? <DropFootprint widget={activeWidget} position={dropTarget.position} /> : null}
    </div>
  );

  return editable ? (
    <DndContext
      sensors={sensors}
      collisionDetection={dashboardCollision(resizedLayout)}
      onDragStart={({ active }) => {
        setActiveKey(String(active.id));
        setDropTarget(null);
      }}
      onDragOver={setTargetFromOver}
      onDragCancel={() => {
        setActiveKey(null);
        setDropTarget(null);
      }}
      onDragEnd={dragEnd}
    >
      {content}
      {activeWidget && typeof document !== "undefined"
        ? createPortal(
            <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
              <DragPreview widget={activeWidget} />
            </DragOverlay>,
            document.body,
          )
        : null}
    </DndContext>
  ) : content;
}
