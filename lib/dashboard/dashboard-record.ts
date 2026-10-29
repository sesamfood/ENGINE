import type { Id } from "@/convex/_generated/dataModel";
import type { ComparisonPeriod, DashboardRange, DashboardScope, WidgetInstance } from "./types";

export type DashboardRecord = {
  id: Id<"dashboards">;
  name: string;
  widgets: WidgetInstance[];
  defaultScope: DashboardScope;
  defaultRange: DashboardRange;
  defaultComparison?: ComparisonPeriod;
  roleIds: string[];
  defaultForRoleIds: string[];
  defaultForLocationIds: Id<"locations">[];
  isOrganizationDefault: boolean;
  sortOrder: number;
  updatedAt: number;
};
