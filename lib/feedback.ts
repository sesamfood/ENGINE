import type { PermissionId } from "./auth-permissions";

export const feedbackTypes = [
  { id: "bug", label: "Fejl", englishLabel: "Bug" },
  { id: "feature", label: "Forslag", englishLabel: "Feature request" },
] as const;

export type FeedbackType = (typeof feedbackTypes)[number]["id"];

// `permissions` lists the permissions that give access to the area. An empty
// list means every member may report on it.
export const feedbackAreas = [
  {
    id: "dashboard",
    englishLabel: "Dashboard",
    label: "Dashboard",
    pathPrefix: "/dashboard",
    permissions: ["dashboard.view"],
  },
  {
    id: "transfers",
    englishLabel: "Transfers",
    label: "Transfer",
    pathPrefix: "/transfers",
    permissions: ["transfers.view", "transfers.manage"],
  },
  {
    id: "waste",
    englishLabel: "Waste",
    label: "Waste",
    pathPrefix: "/waste",
    permissions: ["waste.register", "waste.report"],
  },
  {
    id: "ownChecks",
    englishLabel: "Own checks",
    label: "Egenkontrol",
    pathPrefix: "/own-checks",
    permissions: ["ownChecks.perform", "ownChecks.view", "ownChecks.export"],
  },
  {
    id: "staffFood",
    englishLabel: "Staff food",
    label: "Staff food",
    pathPrefix: "/staff-food",
    permissions: ["staffFood.register"],
  },
  {
    id: "count",
    englishLabel: "Count",
    label: "Count",
    pathPrefix: "/count",
    permissions: ["count.register", "count.viewStock"],
  },
  {
    id: "employees",
    englishLabel: "Employees",
    label: "Medarbejdere",
    pathPrefix: "/employees",
    permissions: ["employees.schedule", "employees.directory"],
  },
  {
    id: "organization",
    englishLabel: "Administration",
    label: "Administration",
    pathPrefix: "/organization",
    permissions: [
      "catalog.manage",
      "locations.manage",
      "organization.settings",
      "count.settings",
      "waste.settings",
      "ownChecks.manage",
      "staffFood.manage",
      "integrations.manage",
      "members.manage",
      "roles.manage",
      "dashboard.manage",
    ],
  },
  {
    id: "account",
    englishLabel: "Profile and settings",
    label: "Profil og indstillinger",
    pathPrefix: "/profile",
    permissions: [],
  },
  {
    id: "other",
    englishLabel: "Other",
    label: "Andet",
    pathPrefix: null,
    permissions: [],
  },
] as const satisfies ReadonlyArray<{
  id: string;
  englishLabel: string;
  label: string;
  pathPrefix: string | null;
  permissions: readonly PermissionId[];
}>;

export type FeedbackAreaId = (typeof feedbackAreas)[number]["id"];

export function isFeedbackType(value: string): value is FeedbackType {
  return feedbackTypes.some((type) => type.id === value);
}

export function feedbackAreaLabel(id: string) {
  return feedbackAreas.find((area) => area.id === id)?.label ?? id;
}

export function feedbackTypeLabel(type: FeedbackType) {
  return feedbackTypes.find((item) => item.id === type)!.label;
}

// The English labels go to Linear and the feedback mails, which the product
// team reads in English.
export function feedbackAreaEnglishLabel(id: string) {
  return feedbackAreas.find((area) => area.id === id)?.englishLabel ?? id;
}

export function feedbackTypeEnglishLabel(type: FeedbackType) {
  return feedbackTypes.find((item) => item.id === type)!.englishLabel;
}

export function accessibleFeedbackAreas(
  permissions: ReadonlySet<string> | readonly string[],
) {
  const held =
    "has" in permissions ? permissions : new Set<string>(permissions);
  return feedbackAreas.filter(
    (area) =>
      area.permissions.length === 0 ||
      area.permissions.some((permission) => held.has(permission)),
  );
}

export function canReportFeedbackArea(
  permissions: ReadonlySet<string> | readonly string[],
  areaId: string,
) {
  return accessibleFeedbackAreas(permissions).some(
    (area) => area.id === areaId,
  );
}

export function feedbackAreaForPath(
  pathname: string,
  available: ReadonlyArray<{ id: FeedbackAreaId }>,
): FeedbackAreaId {
  const match = feedbackAreas.find(
    (area) =>
      area.pathPrefix &&
      (pathname === area.pathPrefix ||
        pathname.startsWith(`${area.pathPrefix}/`)),
  );
  const id = match?.id ?? (pathname === "/settings" ? "account" : "other");
  return available.some((area) => area.id === id) ? id : "other";
}
