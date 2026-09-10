import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { OrganizationAuth } from "../lib/auth";
import { requireLocationAccess } from "../lib/auth";
import { rateLimiter } from "../lib/rateLimits";

export function restError(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

export function requireApiKeyPrincipal(auth: OrganizationAuth) {
  if (auth.principalKind !== "apiKey" || !auth.apiKeyId) {
    restError("api_key_required", "An API key is required for this operation.");
  }
}

export function requirePageSize(numItems: number) {
  if (!Number.isInteger(numItems) || numItems < 1 || numItems > 100) {
    restError("page_size_invalid", "Page size must be an integer between 1 and 100.");
  }
}

export async function readLocation(ctx: QueryCtx, auth: OrganizationAuth, publicId: string) {
  const id = ctx.db.normalizeId("locations", publicId);
  const location = id ? await ctx.db.get("locations", id) : null;
  if (!location || location.organizationId !== auth.organizationId) {
    restError("location_not_found", "Location was not found.");
  }
  requireLocationAccess(auth, location._id);
  return location;
}

export async function requireRestApiMutation(
  ctx: MutationCtx,
  auth: OrganizationAuth,
) {
  requireApiKeyPrincipal(auth);
  const limit = await rateLimiter.limit(ctx, "restApiMutation", {
    key: `${auth.organizationId}:${auth.apiKeyId}`,
  });
  if (!limit.ok) {
    throw new ConvexError({
      code: "mutation_rate_limited",
      message: "The API key mutation rate limit has been exceeded.",
      retryAfterMs: limit.retryAfter ?? 60_000,
    });
  }
}
