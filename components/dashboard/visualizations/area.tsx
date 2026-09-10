"use client";

import { TimeSeriesVisualization, type TimeSeriesProps } from "./time-series";

export function AreaVisualization(props: TimeSeriesProps) {
  return <TimeSeriesVisualization variant="area" {...props} />;
}
