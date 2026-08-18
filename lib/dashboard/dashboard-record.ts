import type { Id } from "@/convex/_generated/dataModel";
import type { DashboardRange, DashboardScope, WidgetInstance } from "./types";

export type DashboardRecord = {
  id: Id<"dashboards">;
  name: string;
  widgets: WidgetInstance[];
  defaultScope: DashboardScope;
  defaultRange: DashboardRange;
  roleIds: string[];
  defaultForRoleIds: string[];
  defaultForLocationIds: Id<"locations">[];
  isOrganizationDefault: boolean;
  sortOrder: number;
  updatedAt: number;
};
