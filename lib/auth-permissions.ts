import {
  adminAc,
  defaultAc,
  memberAc,
} from "better-auth/plugins/organization/access";
import type { AccessControl } from "better-auth/plugins/access";

export const organizationAccessControl = defaultAc as AccessControl;

export const organizationRoles = {
  admin: adminAc,
  manager: memberAc,
  member: memberAc,
};

export type OrganizationRole = keyof typeof organizationRoles;

export function canManageCatalog(role: string | null | undefined) {
  return role === "admin" || role === "manager";
}

export const canManageTransfers = canManageCatalog;

export function canManageMembers(role: string | null | undefined) {
  return role === "admin";
}

export const canManageOrganization = canManageMembers;
