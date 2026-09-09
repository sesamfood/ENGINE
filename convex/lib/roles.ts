import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  permissionsForRole,
  systemRoleKeys,
  systemRoleNames,
} from "../../lib/auth-permissions";

const systemRoles: ReadonlySet<string> = new Set(systemRoleKeys);
const MAX_ROLE_ROWS = 2_000;

export async function organizationRoleCatalog(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
) {
  const [roles, permissionRows] = await Promise.all([
    ctx.db
      .query("roles")
      .withIndex("by_organizationId_and_key", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_ROLE_ROWS + 1),
    ctx.db
      .query("rolePermissions")
      .withIndex("by_organizationId_and_role", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_ROLE_ROWS + 1),
  ]);
  if (roles.length > MAX_ROLE_ROWS || permissionRows.length > MAX_ROLE_ROWS)
    throw new ConvexError("Organisationen har for mange roller");
  const configured = new Map(
    permissionRows.map((row) => [row.role, row.permissions]),
  );
  const byKey = new Map(roles.map((role) => [role.key, role]));
  const builtins = systemRoleKeys.map((key) => ({
    key,
    name: byKey.get(key)?.name ?? systemRoleNames[key],
    isSystem: true,
    granularity: byKey.get(key)?.granularity ?? ("detail" as const),
    permissions: [...permissionsForRole(key, configured.get(key))],
  }));
  const custom = roles
    .filter((role) => !systemRoles.has(role.key))
    .map((role) => ({
      key: role.key,
      name: role.name,
      isSystem: false,
      granularity: role.granularity ?? ("detail" as const),
      permissions: [...permissionsForRole(role.key, configured.get(role.key))],
    }));
  return {
    roles,
    permissionRows,
    configured,
    catalog: [...builtins, ...custom],
  };
}
