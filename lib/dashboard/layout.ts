import type { WidgetInstance, WidgetSize } from "./types";

export const dashboardColumns = 4;

export const widgetSizeSpans: Record<WidgetSize, { columns: number; rows: number }> = {
  "1x1": { columns: 1, rows: 1 },
  "1x2": { columns: 1, rows: 2 },
  "2x1": { columns: 2, rows: 1 },
  "2x2": { columns: 2, rows: 2 },
  "4x2": { columns: 4, rows: 2 },
};

function cells(position: { column: number; row: number }, size: WidgetSize) {
  const span = widgetSizeSpans[size];
  const result: string[] = [];
  for (let row = position.row; row < position.row + span.rows; row += 1) {
    for (let column = position.column; column < position.column + span.columns; column += 1) {
      result.push(`${column}:${row}`);
    }
  }
  return result;
}

function nextAvailablePosition(
  size: WidgetSize,
  occupied: Set<string>,
  startRow = 0,
) {
  for (let row = startRow; ; row += 1) {
    for (let column = 0; column < dashboardColumns; column += 1) {
      const position = { column, row };
      if (validWidgetPosition(position, size) && cells(position, size).every((cell) => !occupied.has(cell))) {
        return position;
      }
    }
  }
}

export function validWidgetPosition(position: WidgetInstance["position"], size: WidgetSize) {
  if (!position || !Number.isInteger(position.column) || !Number.isInteger(position.row)) return false;
  const span = widgetSizeSpans[size];
  return position.column >= 0 && position.row >= 0 && position.column + span.columns <= dashboardColumns;
}

export function canPlaceWidget(
  widgets: WidgetInstance[],
  activeKey: string,
  position: { column: number; row: number },
  size: WidgetSize,
) {
  if (!validWidgetPosition(position, size)) return false;
  const occupied = new Set(
    widgets
      .filter((widget) => widget.key !== activeKey && validWidgetPosition(widget.position, widget.size))
      .flatMap((widget) => cells(widget.position!, widget.size)),
  );
  return cells(position, size).every((cell) => !occupied.has(cell));
}

export function widgetsOverlappingPosition(
  widgets: WidgetInstance[],
  activeKey: string,
  position: { column: number; row: number },
  size: WidgetSize,
) {
  const wanted = new Set(cells(position, size));
  return widgets.filter((widget) => (
    widget.key !== activeKey
    && validWidgetPosition(widget.position, widget.size)
    && cells(widget.position!, widget.size).some((cell) => wanted.has(cell))
  ));
}

export function moveDashboardWidget(
  widgets: WidgetInstance[],
  activeKey: string,
  position: { column: number; row: number },
) {
  const active = widgets.find((widget) => widget.key === activeKey);
  if (!active || !validWidgetPosition(position, active.size)) return widgets;

  const activeBottom = position.row + widgetSizeSpans[active.size].rows;
  const occupied = new Set(cells(position, active.size));
  const positions = new Map<string, { column: number; row: number }>([[activeKey, position]]);
  const displaced: WidgetInstance[] = [];

  for (const widget of widgets) {
    if (widget.key === activeKey) continue;
    const current = widget.position;
    const available = validWidgetPosition(current, widget.size)
      && cells(current!, widget.size).every((cell) => !occupied.has(cell));
    if (!available) {
      displaced.push(widget);
      continue;
    }
    positions.set(widget.key, current!);
    cells(current!, widget.size).forEach((cell) => occupied.add(cell));
  }

  for (const widget of displaced) {
    const next = nextAvailablePosition(widget.size, occupied, Math.max(widget.position?.row ?? 0, activeBottom));
    positions.set(widget.key, next);
    cells(next, widget.size).forEach((cell) => occupied.add(cell));
  }

  return widgets.map((widget) => ({ ...widget, position: positions.get(widget.key)! }));
}

export function layoutDashboardWidgets(widgets: WidgetInstance[], pinnedKey?: string) {
  const occupied = new Set<string>();
  const positions = new Map<string, { column: number; row: number }>();
  const ordered = pinnedKey
    ? [...widgets.filter((widget) => widget.key === pinnedKey), ...widgets.filter((widget) => widget.key !== pinnedKey)]
    : widgets;

  for (const widget of ordered) {
    let position = widget.position;
    const available = validWidgetPosition(position, widget.size) && cells(position!, widget.size).every((cell) => !occupied.has(cell));
    if (!available) {
      position = nextAvailablePosition(widget.size, occupied);
    }
    positions.set(widget.key, position!);
    cells(position!, widget.size).forEach((cell) => occupied.add(cell));
  }

  return widgets.map((widget) => ({ ...widget, position: positions.get(widget.key)! }));
}

export function dashboardRowCount(widgets: WidgetInstance[]) {
  return Math.max(2, ...widgets.map((widget) => (widget.position?.row ?? 0) + widgetSizeSpans[widget.size].rows));
}
