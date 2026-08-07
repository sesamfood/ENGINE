"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  ChartNoAxesCombinedIcon,
  MinusIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { metricRegistry, visualizationLabels } from "@/lib/dashboard/registry";
import { widgetSizeSpans } from "@/lib/dashboard/layout";
import { widgetSizes, type MetricResult, type WidgetInstance, type WidgetSize, type VisualizationId } from "@/lib/dashboard/types";
import { visualizationRegistry } from "@/lib/dashboard/visualizations";
import { previousTotal, total } from "./visualizations/utils";

type ResizeSession = {
  pointerId: number;
  startX: number;
  startY: number;
  width: number;
  height: number;
  cellWidth: number;
  rowHeight: number;
  columnGap: number;
  rowGap: number;
  columns: number;
  original: WidgetSize;
  current: WidgetSize;
};

function nearestSize(session: ResizeSession, clientX: number, clientY: number) {
  const wantedWidth = Math.max(session.cellWidth, session.width + clientX - session.startX);
  const wantedHeight = Math.max(session.rowHeight, session.height + clientY - session.startY);
  return widgetSizes.reduce((best, size) => {
    const span = widgetSizeSpans[size];
    const columns = Math.min(span.columns, session.columns);
    const width = columns * session.cellWidth + (columns - 1) * session.columnGap;
    const height = span.rows * session.rowHeight + (span.rows - 1) * session.rowGap;
    const score = ((width - wantedWidth) / session.cellWidth) ** 2 + ((height - wantedHeight) / session.rowHeight) ** 2 - (size === session.current ? 0.01 : 0);
    return score < best.score ? { size, score } : best;
  }, { size: session.current, score: Number.POSITIVE_INFINITY }).size;
}

export function WidgetCard({
  widget,
  result,
  editable,
  resizing = false,
  onVisualizationChange,
  onResize,
  onRemove,
  children,
}: {
  widget: WidgetInstance;
  result?: MetricResult;
  editable: boolean;
  resizing?: boolean;
  onVisualizationChange?: (visualization: VisualizationId) => void;
  onResize?: (size: WidgetSize, complete: boolean) => void;
  onRemove?: () => void;
  children: ReactNode;
}) {
  const definition = metricRegistry[widget.metricId];
  const current = result ? total(result) : null;
  const previous = result ? previousTotal(result) : null;
  const change = current !== null && previous !== null && previous !== 0
    ? ((current - previous) / Math.abs(previous)) * 100
    : null;
  const [visualizationOpen, setVisualizationOpen] = useState(false);
  const [resizeActive, setResizeActive] = useState(false);
  const resizeSession = useRef<ResizeSession | null>(null);

  function startResize(event: PointerEvent<HTMLSpanElement>) {
    const card = event.currentTarget.closest<HTMLElement>("[data-dashboard-widget]");
    const grid = event.currentTarget.closest<HTMLElement>("[data-dashboard-grid]");
    if (!card || !grid) return;
    event.preventDefault();
    event.stopPropagation();
    const gridStyle = window.getComputedStyle(grid);
    const columns = Math.max(1, gridStyle.gridTemplateColumns.split(" ").filter(Boolean).length);
    const columnGap = Number.parseFloat(gridStyle.columnGap) || 0;
    const rowGap = Number.parseFloat(gridStyle.rowGap) || 0;
    const cellWidth = (grid.clientWidth - columnGap * (columns - 1)) / columns;
    const rowHeight = Number.parseFloat(gridStyle.gridAutoRows) || 192;
    const rect = card.getBoundingClientRect();
    resizeSession.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
      height: rect.height,
      cellWidth,
      rowHeight,
      columnGap,
      rowGap,
      columns,
      original: widget.size,
      current: widget.size,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setResizeActive(true);
    onResize?.(widget.size, false);
  }

  function moveResize(event: PointerEvent<HTMLSpanElement>) {
    const session = resizeSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const size = nearestSize(session, event.clientX, event.clientY);
    if (size === session.current) return;
    session.current = size;
    onResize?.(size, false);
  }

  function finishResize(event: PointerEvent<HTMLSpanElement>, cancelled = false) {
    const session = resizeSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    resizeSession.current = null;
    setResizeActive(false);
    onResize?.(cancelled ? session.original : session.current, true);
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLSpanElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const direction = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const index = widgetSizes.indexOf(widget.size);
    const size = widgetSizes[Math.max(0, Math.min(widgetSizes.length - 1, index + direction))];
    if (size !== widget.size) onResize?.(size, true);
  }

  function chooseVisualization(visualization: VisualizationId) {
    if (widget.visualization === visualization) return;
    onVisualizationChange?.(visualization);
    setVisualizationOpen(false);
  }

  return (
    <Card className={cn(
      "relative h-full gap-2 overflow-hidden border-border/70 shadow-sm transition-[box-shadow,border-color] duration-150",
      editable && "select-none",
      (resizing || resizeActive) && "border-primary shadow-md ring-2 ring-primary/20",
    )}>
      <CardHeader className="gap-0 pb-1">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <CardTitle className="min-w-0 flex-1 truncate text-base">{definition.label}</CardTitle>
            <CardDescription className="flex shrink-0 items-center gap-1">
                {change !== null ? (
                  <Badge
                    variant="secondary"
                    className={cn(
                      change >= 0
                        ? "bg-primary/10 text-primary"
                        : "bg-destructive/10 text-destructive",
                    )}
                  >
                    {change >= 0 ? <ArrowUpRightIcon /> : <ArrowDownRightIcon />}
                    {new Intl.NumberFormat("da-DK", { maximumFractionDigits: 1 }).format(Math.abs(change))} %
                  </Badge>
                ) : null}
                {result?.truncated ? <Badge variant="outline">Begrænset data</Badge> : null}
                {definition.live ? <Badge variant="outline">Live</Badge> : null}
            </CardDescription>
          </div>
          {editable ? (
            <div data-dashboard-no-drag className="flex items-center gap-1" onPointerDown={(event) => event.stopPropagation()}>
              <Dialog open={visualizationOpen} onOpenChange={setVisualizationOpen}>
                <DialogTrigger render={<Button type="button" variant="ghost" size="icon" aria-label={`Skift visualisering for ${definition.label}`} />}>
                  <ChartNoAxesCombinedIcon />
                </DialogTrigger>
                <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-5xl">
                  <DialogHeader>
                    <DialogTitle>Vælg visualisering</DialogTitle>
                    <DialogDescription>Samme data vist med alle kompatible visualiseringer.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-3 md:grid-cols-2">
                    {definition.visualizations.map((visualization) => {
                      const Visualization = visualizationRegistry[visualization];
                      return (
                        <Card
                          key={visualization}
                          size="sm"
                          role="button"
                          tabIndex={0}
                          aria-pressed={widget.visualization === visualization}
                          className={cn(
                            "cursor-pointer outline-none transition-[box-shadow] focus-visible:ring-3 focus-visible:ring-ring/50",
                            widget.visualization === visualization && "ring-2 ring-primary/30",
                          )}
                          onClick={() => chooseVisualization(visualization)}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            chooseVisualization(visualization);
                          }}
                        >
                          <CardHeader>
                            <CardTitle>{visualizationLabels[visualization]}</CardTitle>
                          </CardHeader>
                          <CardContent className="h-52 min-h-0 overflow-hidden">
                            {result ? <Visualization result={result} /> : <Skeleton className="size-full" />}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </DialogContent>
              </Dialog>
              <Button type="button" variant="destructive" size="icon" aria-label={`Fjern ${definition.label}`} onClick={onRemove}>
                <MinusIcon />
              </Button>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent data-widget-size={widget.size} className={cn("min-h-0 flex-1 overflow-hidden pb-4", editable && "pb-8")}>{children}</CardContent>
      {editable ? (
        <span
          data-dashboard-no-drag
          role="slider"
          tabIndex={0}
          aria-label={`Tilpas størrelsen på ${definition.label}`}
          aria-valuemin={0}
          aria-valuemax={widgetSizes.length - 1}
          aria-valuenow={widgetSizes.indexOf(widget.size)}
          aria-valuetext={widget.size}
          className="absolute right-0 bottom-0 size-7 touch-none cursor-nwse-resize rounded-br-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={(event) => finishResize(event)}
          onPointerCancel={(event) => finishResize(event, true)}
          onKeyDown={resizeWithKeyboard}
        >
          <span aria-hidden="true" className="absolute right-0 bottom-0 size-5 rounded-br-xl border-r-2 border-b-2 border-muted-foreground/60" />
          <span aria-hidden="true" className="absolute right-1.5 bottom-1.5 size-2 rounded-br-sm border-r border-b border-muted-foreground/45" />
        </span>
      ) : null}
    </Card>
  );
}
