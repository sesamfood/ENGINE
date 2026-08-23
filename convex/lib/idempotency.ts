import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";

const RETENTION_MS = 24 * 60 * 60 * 1_000;
const MAX_STORED_RESPONSE_BYTES = 100_000;

type ApiKeyActor = {
  organizationId: string;
  principalKind: "user" | "apiKey";
  apiKeyId: string | null;
};

type IdempotencyInput = {
  operationId: string;
  key: string;
  requestHash: string;
};

export type StoredApiResponse = {
  status: number;
  json: string;
  replayed: boolean;
};

export async function runIdempotent(
  ctx: MutationCtx,
  actor: ApiKeyActor,
  input: IdempotencyInput,
  run: () => Promise<{ status: number; json: string }>,
): Promise<StoredApiResponse> {
  if (actor.principalKind !== "apiKey" || !actor.apiKeyId) {
    throw new ConvexError("Idempotens kræver en API-nøgle");
  }
  const apiKeyId = actor.apiKeyId;
  const existing = await ctx.db
    .query("apiRequestIdempotency")
    .withIndex("by_scope", (q) =>
      q
        .eq("organizationId", actor.organizationId)
        .eq("apiKeyId", apiKeyId)
        .eq("operationId", input.operationId)
        .eq("key", input.key),
    )
    .unique();
  const now = Date.now();
  if (existing && existing.expiresAt > now) {
    if (existing.requestHash !== input.requestHash) {
      throw new ConvexError({
        code: "idempotency_key_reused",
        message: "Idempotency key was already used for another request.",
      });
    }
    return {
      status: existing.responseStatus,
      json: existing.responseJson,
      replayed: true,
    };
  }
  if (existing) await ctx.db.delete("apiRequestIdempotency", existing._id);

  const response = await run();
  if (
    !Number.isInteger(response.status) ||
    response.status < 200 ||
    response.status > 299
  ) {
    throw new ConvexError("Idempotenssvaret er ugyldigt");
  }
  if (new TextEncoder().encode(response.json).byteLength > MAX_STORED_RESPONSE_BYTES) {
    throw new ConvexError("Idempotenssvaret er for stort");
  }
  try {
    JSON.parse(response.json);
  } catch {
    throw new ConvexError("Idempotenssvaret er ikke gyldig JSON");
  }

  await ctx.db.insert("apiRequestIdempotency", {
    organizationId: actor.organizationId,
    apiKeyId,
    operationId: input.operationId,
    key: input.key,
    requestHash: input.requestHash,
    responseStatus: response.status,
    responseJson: response.json,
    createdAt: now,
    expiresAt: now + RETENTION_MS,
  });
  return { ...response, replayed: false };
}
