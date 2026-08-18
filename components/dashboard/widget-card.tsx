"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  ChartNoAxesCombinedIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  MinusIcon,
  PencilIcon,
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
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { metricRegistry, visualizationLabels } from "@/lib/dashboard/registry";
import { widgetSizeSpans } from "@/lib/dashboard/layout";
import { widgetSizes, type DashboardRange, type MetricResult, type WidgetInstance, type WidgetRangePreset, type WidgetSize, type VisualizationId } from "@/lib/dashboard/types";
import { visualizationRegistry } from "@/lib/dashboard/visualizations";
import { visualizationHasYAxis, YAxisSettings, type YAxisValues } from "./y-axis-settings";
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

const widgetRangeOptions = [
  { value: "board", label: "Følg dashboard" },
  { value: "today", label: "I dag" },
  { value: "yesterday", label: "I går" },
  { value: "7days", label: "7 dage" },
  { value: "30days", label: "30 dage" },
  { value: "thisMonth", label: "Denne måned" },
];

function FreshnessNotice({
  freshness,
}: {
  freshness: NonNullable<MetricResult["freshness"]>;
}) {
  const hasError = freshness.errorLocationCount > 0;
  const isStale = freshness.staleLocationCount > 0;
  const label = hasError
    ? "Synkroniseringsfejl"
    : isStale
      ? "Data kan være forældede"
      : "Data opdateret";
  const affected = freshness.affectedLocationNames ?? [];
  const formatter = new Intl.DateTimeFormat("da-DK", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            aria-label={label}
          />
        }
      >
        {hasError || isStale ? (
          <CircleAlertIcon className={hasError ? "text-destructive" : "text-muted-foreground"} />
        ) : (
          <CircleCheckIcon className="text-primary" />
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <PopoverHeader>
          <PopoverTitle>{label}</PopoverTitle>
          <PopoverDescription>
            Senest gennemført: {freshness.lastSuccessAt === null ? "Aldrig" : formatter.format(freshness.lastSuccessAt)}
          </PopoverDescription>
        </PopoverHeader>
        {isStale ? (
          <p className="text-sm text-muted-foreground">
            {freshness.staleLocationCount} {freshness.staleLocationCount === 1 ? "lokation har" : "lokationer har"} data, der kan være forældede.
          </p>
        ) : null}
        {freshness.errorLocationCount > 0 ? (
          <p className="text-sm text-destructive">
            {freshness.errorLocationCount} {freshness.errorLocationCount === 1 ? "lokation" : "lokationer"} har synkroniseringsfejl.
          </p>
        ) : null}
        {affected.length > 0 ? (
          <div className="text-sm">
            <p className="font-medium">Berørte lokationer</p>
            <ul className="mt-1 list-disc pl-5 text-muted-foreground">
              {affected.slice(0, 10).map((name) => <li key={name}>{name}</li>)}
            </ul>
            {affected.length > 10 ? <p className="mt-1 text-muted-foreground">+ {affected.length - 10} flere</p> : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

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
  metricLabel: customMetricLabel,
  range,
  editable,
  resizing = false,
  onVisualizationChange,
  visualizations,
  onRangeChange,
  onYAxisChange,
  onEditCustomMetric,
  onResize,
  onRemove,
  children,
}: {
  widget: WidgetInstance;
  result?: MetricResult;
  metricLabel?: string;
  range?: DashboardRange;
  editable: boolean;
  resizing?: boolean;
  onVisualizationChange?: (visualization: VisualizationId) => void;
  visualizations?: readonly VisualizationId[];
  onRangeChange?: (range: WidgetRangePreset | undefined) => void;
  onYAxisChange?: (axis: YAxisValues) => void;
  onEditCustomMetric?: () => void;
  onResize?: (size: WidgetSize, complete: boolean) => void;
  onRemove?: () => void;
  children: ReactNode;
}) {
  const definition = widget.metric.kind === "builtin"
    ? metricRegistry[widget.metric.id]
    : undefined;
  const metricLabel = customMetricLabel ?? definition?.label ?? "Tilpasset måling";
  const availableVisualizations = definition?.visualizations ?? visualizations ?? [];
  const current = result ? total(result) : null;
  const previous = result ? previousTotal(result) : null;
  const freshness = result?.freshness;
  const hasFreshness = Boolean(freshness);
  const change = current !== null && previous !== null && previous !== 0
    ? ((current - previous) / Math.abs(previous)) * 100
    : null;

  const comparisonLabel = range?.preset === "today"
    ? "i går"
    : range?.preset === "yesterday"
      ? "dagen før"
      : range?.preset === "7days"
        ? "de foregående 7 dage"
        : range?.preset === "30days"
          ? "de foregående 30 dage"
          : range?.preset === "thisMonth"
            ? "den foregående måned"
            : "den foregående tilsvarende periode";
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
            <CardTitle className="min-w-0 flex-1 truncate text-base">{metricLabel}</CardTitle>
            {change !== null || result?.truncated || hasFreshness ? (
              <CardDescription className="flex min-w-0 max-w-full shrink-0 items-center gap-1 overflow-hidden">
                {change !== null ? (
                  <Tooltip>
                    <TooltipTrigger render={<span className="inline-flex min-w-0" />}>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "max-w-full",
                          change >= 0
                            ? "bg-primary/10 text-primary"
                            : "bg-destructive/10 text-destructive",
                        )}
                      >
                        {change >= 0 ? <ArrowUpRightIcon /> : <ArrowDownRightIcon />}
                        <span className="truncate">{new Intl.NumberFormat("da-DK", { maximumFractionDigits: 1 }).format(Math.abs(change))} %</span>
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>Sammenlignet med {comparisonLabel}</TooltipContent>
                  </Tooltip>
                ) : null}
                {result?.truncated ? <Badge variant="outline" className="max-w-full"><span className="truncate">Begrænset data</span></Badge> : null}
                {hasFreshness ? <FreshnessNotice freshness={freshness!} /> : null}
              </CardDescription>
            ) : null}
          </div>
          {editable ? (
            <div data-dashboard-no-drag className="flex items-center gap-1" onPointerDown={(event) => event.stopPropagation()}>
              {availableVisualizations.length ? (
                <Dialog open={visualizationOpen} onOpenChange={setVisualizationOpen}>
                  <DialogTrigger render={<Button type="button" variant="ghost" size="icon-lg" className="size-11" aria-label={`Skift visualisering for ${metricLabel}`} />}>
                    <ChartNoAxesCombinedIcon />
                  </DialogTrigger>
                  <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-5xl">
                    <DialogHeader>
                      <DialogTitle>Vælg visualisering</DialogTitle>
                      <DialogDescription>Samme data vist med alle kompatible visualiseringer.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-3 md:grid-cols-2">
                      {availableVisualizations.map((visualization) => {
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
                              {result ? <Visualization result={result} yAxisMin={widget.options?.yAxisMin} yAxisMax={widget.options?.yAxisMax} /> : <Skeleton className="size-full" />}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                    {visualizationHasYAxis(widget.visualization) && onYAxisChange ? (
                      <div className="mt-4 flex flex-col gap-3 border-t pt-4">
                        <div>
                          <h3 className="text-sm font-medium">Y-akse</h3>
                          <p className="text-sm text-muted-foreground">Angiv grænser eller brug automatisk skala.</p>
                        </div>
                        <YAxisSettings
                          idPrefix={`widget-${widget.key}-y-axis`}
                          min={widget.options?.yAxisMin}
                          max={widget.options?.yAxisMax}
                          onChange={onYAxisChange}
                        />
                      </div>
                    ) : null}
                  </DialogContent>
                </Dialog>
              ) : null}
              {onEditCustomMetric ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  className="size-11"
                  aria-label={`Rediger ${metricLabel}`}
                  onClick={onEditCustomMetric}
                >
                  <PencilIcon />
                </Button>
              ) : null}
              <Select
                items={widgetRangeOptions}
                value={widget.range ?? "board"}
                onValueChange={(value) => onRangeChange?.(value === "board" ? undefined : value as WidgetRangePreset)}
              >
                <SelectTrigger className="h-11 w-36" aria-label={`Periode for ${metricLabel}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {widgetRangeOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Button type="button" variant="destructive" size="icon-lg" className="size-11" aria-label={`Fjern ${metricLabel}`} onClick={onRemove}>
                <MinusIcon />
              </Button>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent data-widget-size={widget.size} className={cn("min-h-0 min-w-0 flex-1 overflow-hidden pb-4", editable && "pb-8")}>{children}</CardContent>
      {editable ? (
        <span
          data-dashboard-no-drag
          role="slider"
          tabIndex={0}
          aria-label={`Tilpas størrelsen på ${metricLabel}`}
          aria-valuemin={0}
          aria-valuemax={widgetSizes.length - 1}
          aria-valuenow={widgetSizes.indexOf(widget.size)}
          aria-valuetext={widget.size}
          className="absolute right-0 bottom-0 size-11 touch-none cursor-nwse-resize rounded-br-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
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
