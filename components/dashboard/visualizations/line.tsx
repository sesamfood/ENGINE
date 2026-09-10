"use client";

import { TimeSeriesVisualization, type TimeSeriesProps } from "./time-series";

export function LineVisualization(props: TimeSeriesProps) {
  return <TimeSeriesVisualization variant="line" {...props} />;
}
