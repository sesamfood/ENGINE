import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

export type CustomMetricDefinition = FunctionReturnType<
  typeof api.customMetrics.list
>[number];
