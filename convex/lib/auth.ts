import { ConvexError } from "convex/values";
import {
  canCountStock,
  canManageCatalog,
  canManageOrganization,
  canManageTransfers,
} from "../../lib/auth-permissions";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { authComponent, createAuth } from "../auth";

type AuthContext = QueryCtx | MutationCtx | ActionCtx;

export async function requireOrganization(ctx: AuthContext) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Du er ikke logget ind");

  const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
  const member = await auth.api.getActiveMember({ headers }).catch(() => null);
  if (!member) throw new ConvexError("Ingen aktiv organisation");

  return {
    organizationId: member.organizationId,
    role: member.role,
    userIdentifier: identity.tokenIdentifier,
    userName: identity.name?.trim() || identity.email || "Ukendt bruger",
  };
}

export async function requireCatalogManager(ctx: AuthContext) {
  const auth = await requireOrganization(ctx);
  if (!canManageCatalog(auth.role)) {
    throw new ConvexError("Du har ikke adgang");
  }
  return auth;
}

export async function requireTransferManager(ctx: AuthContext) {
  const auth = await requireOrganization(ctx);
  if (!canManageTransfers(auth.role)) {
    throw new ConvexError("Du har ikke adgang");
  }
  return auth;
}

export async function requireCounter(ctx: AuthContext) {
  const auth = await requireOrganization(ctx);
  if (!canCountStock(auth.role)) {
    throw new ConvexError("Du har ikke adgang");
  }
  return auth;
}

export async function requireOrganizationAdmin(ctx: AuthContext) {
  const auth = await requireOrganization(ctx);
  if (!canManageOrganization(auth.role)) {
    throw new ConvexError("Kun administratorer kan ændre organisationen");
  }
  return auth;
}
