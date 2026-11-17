import type { MetricId, WidgetInstance } from "./types";

// Widgets generated from location targets. Users may move and resize them, nothing else.
const TARGET_WIDGET_PREFIX = "target-";

export function isTargetWidget(widget: Pick<WidgetInstance, "key">) {
  return widget.key.startsWith(TARGET_WIDGET_PREFIX);
}

export function targetWidget(metricId: MetricId): WidgetInstance {
  return {
    key: `${TARGET_WIDGET_PREFIX}${metricId}`,
    metric: { kind: "builtin", id: metricId },
    visualization: "goal",
    size: "2x1",
    options: { target: { kind: "location" } },
  };
}

/** Everything about a widget except where it sits and how big it is. */
export function widgetContent(widget: WidgetInstance) {
  return JSON.stringify([widget.metric, widget.visualization, widget.range ?? null, widget.comparison ?? null, widget.options ?? null]);
}
