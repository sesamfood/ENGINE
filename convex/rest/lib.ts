import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { OrganizationAuth } from "../lib/auth";
import { rateLimiter } from "../lib/rateLimits";

export async function requireRestApiMutation(
  ctx: MutationCtx,
  auth: OrganizationAuth,
) {
  if (auth.principalKind !== "apiKey" || !auth.apiKeyId) {
    throw new ConvexError({
      code: "api_key_required",
      message: "An API key is required for this operation.",
    });
  }
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
