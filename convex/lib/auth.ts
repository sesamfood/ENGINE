import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type AuthContext = QueryCtx | MutationCtx;

type OrganizationClaim = {
  id: string;
  rol?: string;
};

function readOrganizationClaim(value: unknown): OrganizationClaim | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const claim = value as Record<string, unknown>;
  if (typeof claim.id !== "string") return null;

  return {
    id: claim.id,
    rol: typeof claim.rol === "string" ? claim.rol : undefined,
  };
}

export async function requireOrganization(ctx: AuthContext) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Du er ikke logget ind");

  const currentClaim = readOrganizationClaim(identity.o);
  const legacyOrganizationId =
    typeof identity.org_id === "string" ? identity.org_id : undefined;
  const organizationId = currentClaim?.id ?? legacyOrganizationId;

  if (!organizationId) throw new ConvexError("Ingen aktiv organisation");

  const role =
    currentClaim?.rol ??
    (typeof identity.org_role === "string" ? identity.org_role : undefined);

  return {
    organizationId,
    role,
    userIdentifier: identity.tokenIdentifier,
  };
}

export async function requireOrganizationAdmin(ctx: AuthContext) {
  const auth = await requireOrganization(ctx);
  if (auth.role !== "admin" && auth.role !== "org:admin") {
    throw new ConvexError("Du har ikke adgang");
  }
  return auth;
}
