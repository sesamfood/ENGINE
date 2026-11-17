import type { MetricId, WidgetInstance } from "./types";

// Widgets generated from location targets. Users may change their layout and chart type, nothing else.
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

/** What a target widget must keep: its metric, period and the location target. */
export function targetWidgetIdentity(widget: WidgetInstance) {
  return JSON.stringify([widget.metric, widget.range ?? null, widget.options?.target ?? null]);
}
