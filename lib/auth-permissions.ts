import { defaultStatements } from "better-auth/plugins/organization/access";
import { createAccessControl } from "better-auth/plugins/access";

const apiKeyActions = ["create", "read", "update", "delete"] as const;

export const organizationAccessControl = createAccessControl({
  ...defaultStatements,
  apiKey: apiKeyActions,
});

// Better Auth still needs to know which built-in roles may call its member
// endpoints. The Convex permission checks are the source of truth for whether
// the current member may actually use those endpoints.
const adminAc = organizationAccessControl.newRole({
  organization: ["update"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: ["create", "update", "delete"],
  ac: ["create", "read", "update", "delete"],
  apiKey: apiKeyActions,
});

const managerAc = organizationAccessControl.newRole({
  organization: [],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: [],
  ac: ["read"],
  apiKey: apiKeyActions,
});

export const organizationRoles = {
  admin: adminAc,
  manager: managerAc,
  member: managerAc,
};

export const systemRoleKeys = ["admin", "manager", "member"] as const;
export type SystemOrganizationRole = (typeof systemRoleKeys)[number];
export type OrganizationRole = string;
export const systemRoleNames: Record<SystemOrganizationRole, string> = {
  admin: "Administrator",
  manager: "Manager",
  member: "Medlem",
};

export const dataGranularities = ["detail", "aggregate", "anonymous"] as const;
export type DataGranularity = (typeof dataGranularities)[number];

export const permissionCatalog = [
  {
    group: "Count",
    permissions: [
      { id: "count.register", label: "Registrere Counts" },
      { id: "count.viewStock", label: "Se lagerbeholdning" },
      { id: "count.export", label: "Eksportere Count-data" },
    ],
  },
  {
    group: "Waste",
    permissions: [
      { id: "waste.register", label: "Registrere Waste" },
      { id: "waste.report", label: "Se Waste-rapporter" },
      { id: "waste.export", label: "Eksportere Waste" },
    ],
  },
  {
    group: "Egenkontrol",
    permissions: [
      { id: "ownChecks.perform", label: "Udføre egenkontroller" },
      { id: "ownChecks.correct", label: "Registrere korrigerende handlinger" },
      { id: "ownChecks.view", label: "Se tidligere egenkontroller" },
      { id: "ownChecks.approve", label: "Godkende egenkontroller" },
      { id: "ownChecks.edit", label: "Rette indsendte egenkontroller" },
      { id: "ownChecks.export", label: "Eksportere kontroldokumentation" },
    ],
  },
  {
    group: "Transfer",
    permissions: [
      { id: "transfers.view", label: "Se transfers" },
      { id: "transfers.manage", label: "Administrere transfers" },
      { id: "transfers.export", label: "Eksportere transfers" },
    ],
  },
  {
    group: "Varemodtagelse",
    permissions: [
      {
        id: "goodsReceipts.register",
        label: "Registrere varemodtagelser",
      },
      {
        id: "goodsReceipts.settings",
        label: "Administrere indstillinger for varemodtagelse",
      },
    ],
  },
  {
    group: "Staff food",
    permissions: [
      { id: "staffFood.register", label: "Registrere Staff food" },
      { id: "staffFood.manage", label: "Administrere Staff food" },
    ],
  },
  {
    group: "Dashboard",
    permissions: [
      { id: "dashboard.view", label: "Se dashboard" },
      { id: "dashboard.manage", label: "Administrere dashboards" },
      { id: "dashboard.share", label: "Dele dashboard" },
      { id: "dashboard.viewSales", label: "Se salgstal" },
      { id: "sales.viewAggregate", label: "Se aggregerede salgstal" },
      { id: "sales.viewDetail", label: "Se detaljerede salgstal" },
    ],
  },
  {
    group: "Medarbejdere",
    permissions: [
      { id: "employees.schedule", label: "Se vagtplan" },
      { id: "employees.directory", label: "Se medarbejderkartotek" },
    ],
  },
  {
    group: "Administration",
    permissions: [
      { id: "catalog.manage", label: "Administrere katalog" },
      { id: "locations.manage", label: "Administrere lokationer" },
      { id: "count.settings", label: "Administrere Count-indstillinger" },
      { id: "waste.settings", label: "Administrere Waste-indstillinger" },
      { id: "ownChecks.manage", label: "Administrere egenkontroller" },
      {
        id: "organization.settings",
        label: "Administrere organisationsindstillinger",
      },
      { id: "integrations.manage", label: "Administrere integrationer" },
      { id: "apiKeys.manage", label: "Administrere API-nøgler" },
    ],
  },
  {
    group: "Brugere",
    permissions: [
      { id: "members.manage", label: "Administrere brugere" },
      { id: "roles.manage", label: "Administrere roller og adgang" },
    ],
  },
] as const;

export type PermissionId =
  (typeof permissionCatalog)[number]["permissions"][number]["id"];

export const permissionIds = permissionCatalog.flatMap((group) =>
  group.permissions.map((permission) => permission.id),
) as PermissionId[];

const permissionIdSet = new Set<string>(permissionIds);

export const defaultRolePermissions: Record<
  SystemOrganizationRole,
  readonly PermissionId[]
> = {
  admin: permissionIds,
  manager: permissionIds.filter(
    (id) =>
      !id.endsWith(".settings") &&
      id !== "integrations.manage" &&
      id !== "apiKeys.manage" &&
      id !== "locations.manage" &&
      id !== "ownChecks.manage" &&
      id !== "members.manage" &&
      id !== "roles.manage" &&
      id !== "staffFood.manage" &&
      id !== "dashboard.share" &&
      id !== "dashboard.manage" &&
      id !== "dashboard.viewSales" &&
      id !== "sales.viewAggregate" &&
      id !== "sales.viewDetail",
  ),
  member: [
    "count.register",
    "count.viewStock",
    "waste.register",
    "goodsReceipts.register",
    "ownChecks.perform",
    "staffFood.register",
    "employees.schedule",
    "employees.directory",
  ],
};

export function permissionsForRole(
  role: string,
  configured?: readonly string[],
) {
  return (
    configured ?? defaultRolePermissions[role as SystemOrganizationRole] ?? []
  );
}

export function isPermissionId(value: string): value is PermissionId {
  return permissionIdSet.has(value);
}

export function hasPermission(
  _role: string | null | undefined,
  permissions: ReadonlySet<string> | readonly string[] | undefined,
  permission: PermissionId | string,
) {
  if (!permissions) return false;
  return "has" in permissions
    ? permissions.has(permission)
    : permissions.includes(permission);
}
