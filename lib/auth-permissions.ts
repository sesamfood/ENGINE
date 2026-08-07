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

export const canViewWasteReports = canManageCatalog;

export function canCountStock(role: string | null | undefined) {
  return role === "admin" || role === "manager" || role === "member";
}

export const canRegisterWaste = canCountStock;

export const canRegisterStaffFood = canCountStock;

export function canManageMembers(role: string | null | undefined) {
  return role === "admin";
}

export const canManageOrganization = canManageMembers;

export const canManageWasteSettings = canManageOrganization;

export const canManageStaffFood = canManageOrganization;

export const canViewDashboard = canManageCatalog;

export const canShareDashboard = canManageOrganization;
