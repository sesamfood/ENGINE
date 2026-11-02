import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";

const MAX_ROLE_NAMES = 20;
const MAX_ROLE_SHIFTS = 1_000;
const MAX_ROLE_EMPLOYEES = 2_000;
const MAX_ROLE_TIERS = 10;

export function roleKey(roleName: string) {
  return roleName.trim().toLocaleLowerCase("da");
}

export function uniqueRoleNames(roleNames: string[]) {
  const byKey = new Map<string, string>();
  for (const name of roleNames) {
    const trimmed = name.trim();
    if (trimmed && !byKey.has(roleKey(trimmed))) {
      byKey.set(roleKey(trimmed), trimmed);
    }
  }
  return [...byKey.values()].sort((left, right) =>
    left.localeCompare(right, "da"),
  );
}

export function requireRoleNames(roleNames: string[]) {
  const names = uniqueRoleNames(roleNames);
  if (
    names.length > MAX_ROLE_NAMES ||
    names.some((name) => name.length > 100)
  ) {
    throw new ConvexError("Vælg højst 20 roller med højst 100 tegn hver");
  }
  return names;
}

// Role names in use across shifts, employees, and Staff food rules.
export async function knownRoleNames(ctx: QueryCtx, organizationId: string) {
  const [shifts, employees, tiers] = await Promise.all([
    ctx.db
      .query("scheduledShifts")
      .withIndex("by_organizationId_and_startsAt", (q) =>
        q.eq("organizationId", organizationId),
      )
      .order("desc")
      .take(MAX_ROLE_SHIFTS),
    ctx.db
      .query("employees")
      .withIndex("by_organizationId_and_active_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId).eq("active", true),
      )
      .take(MAX_ROLE_EMPLOYEES),
    ctx.db
      .query("staffFoodRuleTiers")
      .withIndex("by_organizationId_and_minimumShiftMinutes", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(MAX_ROLE_TIERS),
  ]);
  return uniqueRoleNames([
    ...shifts.flatMap((shift) => (shift.roleName ? [shift.roleName] : [])),
    ...employees.flatMap((employee) => employee.roleNames ?? []),
    ...tiers.flatMap((tier) => tier.roleNames ?? []),
  ]);
}
