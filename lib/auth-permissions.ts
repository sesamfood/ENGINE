import { adminAc, defaultAc } from "better-auth/plugins/organization/access";
import type { AccessControl } from "better-auth/plugins/access";

export const organizationAccessControl = defaultAc as AccessControl;

// Better Auth still needs to know which built-in roles may call its member
// endpoints. The Convex permission checks are the source of truth for whether
// the current member may actually use those endpoints.
const managerAc = defaultAc.newRole({
  organization: [],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  team: [],
  ac: ["read"],
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
    group: "Optælling",
    permissions: [
      { id: "count.register", label: "Registrere optællinger" },
      { id: "count.viewStock", label: "Se lagerbeholdning" },
      { id: "count.export", label: "Eksportere optællingsdata" },
    ],
  },
  {
    group: "Spild",
    permissions: [
      { id: "waste.register", label: "Registrere spild" },
      { id: "waste.report", label: "Se spildrapporter" },
      { id: "waste.export", label: "Eksportere spild" },
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
    group: "Flytninger",
    permissions: [
      { id: "transfers.view", label: "Se flytninger" },
      { id: "transfers.manage", label: "Administrere flytninger" },
      { id: "transfers.export", label: "Eksportere flytninger" },
    ],
  },
  {
    group: "Personalemad",
    permissions: [
      { id: "staffFood.register", label: "Registrere personalemad" },
      { id: "staffFood.manage", label: "Administrere personalemad" },
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
    group: "Organisation",
    permissions: [
      { id: "catalog.manage", label: "Administrere katalog" },
      { id: "locations.manage", label: "Administrere lokationer" },
      { id: "count.settings", label: "Administrere optællingsindstillinger" },
      { id: "waste.settings", label: "Administrere spildindstillinger" },
      { id: "ownChecks.manage", label: "Administrere egenkontroller" },
      {
        id: "organization.settings",
        label: "Administrere organisationsindstillinger",
      },
      { id: "integrations.manage", label: "Administrere integrationer" },
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
