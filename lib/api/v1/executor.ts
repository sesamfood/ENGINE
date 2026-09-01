import { ConvexHttpClient } from "convex/browser";
import type { z } from "zod";
import { api } from "@/convex/_generated/api";
import {
  noInputSchema,
  type ApiOperation,
  type OperationInput,
  type OperationResponse,
} from "./contract";
import {
  ApiProblem,
  apiProblem,
  createApiRequestId,
  normalizeProblem,
  problemResponse,
} from "./problems";
import {
  signApiKeyServiceToken,
  signRestGatewayToken,
} from "./service-token";
import { logApiRequest } from "./rest-request-logging";

const MAX_BODY_BYTES = 1_048_576;
const MAX_AUTHORIZATION_BYTES = 512;
const MAX_IDEMPOTENCY_KEY_BYTES = 255;

type VerifiedPrincipal = {
  apiKeyId: string;
  organizationId: string;
  name: string;
  expiresAt: number | null;
  rateLimitMax: number | null;
  rateLimitResetAt: number | null;
  requestCount: number;
};

type VerifiedGatewayResult =
  | { valid: false; rateLimited: boolean; retryAfterMs: number | null }
  | {
      valid: true;
      keyId: string;
      organizationId: string;
      name: string;
      expiresAt: number | null;
      rateLimitMax: number | null;
      rateLimitResetAt: number | null;
      requestCount: number;
    };

export type ApiExecutionContext = {
  client: ConvexHttpClient;
  principal: VerifiedPrincipal;
  requestId: string;
};

export type ApiHandlerResult<T> =
  | { body: T; status?: number; headers?: HeadersInit }
  | {
      storedJson: string;
      status: number;
      replayed: boolean;
      headers?: HeadersInit;
    };

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function convexClient(token: string) {
  return new ConvexHttpClient(requiredEnvironment("NEXT_PUBLIC_CONVEX_URL"), {
    auth: token,
    logger: false,
  });
}

function bearerKey(request: Request) {
  const value = request.headers.get("authorization");
  if (!value) {
    apiProblem({
      status: 401,
      code: "missing_api_key",
      title: "API key required",
      detail: "Provide an API key as a Bearer token.",
      headers: { "WWW-Authenticate": "Bearer" },
    });
  }
  if (new TextEncoder().encode(value).byteLength > MAX_AUTHORIZATION_BYTES) {
    apiProblem({
      status: 401,
      code: "invalid_api_key",
      title: "Invalid API key",
      detail: "The supplied API key is invalid.",
      headers: { "WWW-Authenticate": "Bearer" },
    });
  }
  const match = /^Bearer ([^\s]+)$/i.exec(value);
  if (!match) {
    apiProblem({
      status: 401,
      code: "invalid_authorization",
      title: "Invalid authorization header",
      detail: "Use the Bearer authentication scheme.",
      headers: { "WWW-Authenticate": "Bearer" },
    });
  }
  return match[1];
}

async function authenticate(request: Request, currentRequestId: string) {
  const key = bearerKey(request);
  let verified: VerifiedGatewayResult;
  try {
    const gatewayToken = await signRestGatewayToken(currentRequestId);
    verified = await convexClient(gatewayToken).action(
      api.apiKeys.verifyForRestGateway,
      { key },
    );
  } catch {
    apiProblem({
      status: 503,
      code: "authentication_unavailable",
      title: "Authentication unavailable",
      detail: "API key authentication is temporarily unavailable.",
    });
  }
  if (!verified.valid) {
    if (verified.rateLimited) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((verified.retryAfterMs ?? 60_000) / 1_000),
      );
      apiProblem({
        status: 429,
        code: "rate_limited",
        title: "Rate limit exceeded",
        detail: "The API key request limit has been exceeded.",
        headers: { "Retry-After": String(retryAfterSeconds) },
      });
    }
    apiProblem({
      status: 401,
      code: "invalid_api_key",
      title: "Invalid API key",
      detail: "The supplied API key is invalid, expired, or disabled.",
      headers: { "WWW-Authenticate": "Bearer" },
    });
  }
  const token = await signApiKeyServiceToken({
    apiKeyId: verified.keyId,
    organizationId: verified.organizationId,
    requestId: currentRequestId,
  });
  return {
    client: convexClient(token),
    principal: {
      apiKeyId: verified.keyId,
      organizationId: verified.organizationId,
      name: verified.name,
      expiresAt: verified.expiresAt,
      rateLimitMax: verified.rateLimitMax,
      rateLimitResetAt: verified.rateLimitResetAt,
      requestCount: verified.requestCount,
    },
  };
}

function queryInput(request: Request, operation: ApiOperation) {
  const searchParams = new URL(request.url).searchParams;
  if (operation.querySchema === noInputSchema) {
    if (searchParams.size > 0) {
      apiProblem({
        status: 422,
        code: "validation_error",
        title: "Request validation failed",
        detail: "This operation does not accept query parameters.",
      });
    }
    return undefined;
  }
  const values: Record<string, string> = {};
  for (const [key, value] of searchParams) {
    if (key in values) {
      apiProblem({
        status: 422,
        code: "validation_error",
        title: "Request validation failed",
        detail: `Query parameter '${key}' may only be supplied once.`,
      });
    }
    values[key] = value;
  }
  return values;
}

async function readBody(request: Request) {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength) {
    const length = Number(declaredLength);
    if (!Number.isSafeInteger(length) || length < 0) {
      apiProblem({
        status: 400,
        code: "invalid_content_length",
        title: "Invalid Content-Length",
        detail: "The Content-Length header is invalid.",
      });
    }
    if (length > MAX_BODY_BYTES) {
      apiProblem({
        status: 413,
        code: "request_too_large",
        title: "Request body too large",
        detail: "JSON request bodies may not exceed 1 MB.",
      });
    }
  }
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      apiProblem({
        status: 413,
        code: "request_too_large",
        title: "Request body too large",
        detail: "JSON request bodies may not exceed 1 MB.",
      });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    apiProblem({
      status: 400,
      code: "invalid_json_encoding",
      title: "Invalid JSON encoding",
      detail: "JSON request bodies must use UTF-8.",
    });
  }
}

async function bodyInput(request: Request, operation: ApiOperation) {
  if (operation.bodySchema === noInputSchema) {
    if (request.body) {
      const text = await readBody(request);
      if (text.length > 0) {
        apiProblem({
          status: 422,
          code: "unexpected_body",
          title: "Request body not allowed",
          detail: "This operation does not accept a request body.",
        });
      }
    }
    return undefined;
  }
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/json") {
    apiProblem({
      status: 415,
      code: "unsupported_media_type",
      title: "Unsupported media type",
      detail: "Set Content-Type to application/json.",
    });
  }
  const text = await readBody(request);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    apiProblem({
      status: 400,
      code: "invalid_json",
      title: "Invalid JSON",
      detail: "The request body is not valid JSON.",
    });
  }
}

function idempotencyKey(request: Request, required: boolean) {
  const key = request.headers.get("idempotency-key");
  if (!required) return null;
  if (!key) {
    apiProblem({
      status: 400,
      code: "missing_idempotency_key",
      title: "Idempotency key required",
      detail: "Provide an Idempotency-Key header for this operation.",
    });
  }
  const bytes = new TextEncoder().encode(key);
  if (
    bytes.byteLength > MAX_IDEMPOTENCY_KEY_BYTES ||
    !/^[\x21-\x7E]+$/.test(key)
  ) {
    apiProblem({
      status: 400,
      code: "invalid_idempotency_key",
      title: "Invalid idempotency key",
      detail: "Use 1 to 255 visible ASCII characters without spaces.",
    });
  }
  return key;
}

function ifMatchVersion(request: Request, required: boolean) {
  if (!required) return null;
  const value = request.headers.get("if-match");
  if (!value) {
    apiProblem({
      status: 428,
      code: "if_match_required",
      title: "Precondition required",
      detail: "Provide the current quoted resource version in If-Match.",
    });
  }
  const match = /^"([\x21\x23-\x7E]{1,100})"$/.exec(value);
  if (!match) {
    apiProblem({
      status: 400,
      code: "invalid_if_match",
      title: "Invalid If-Match header",
      detail: "If-Match must contain one quoted resource version.",
    });
  }
  return match[1];
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(",")}}`;
}

async function requestHash(input: {
  params: unknown;
  query: unknown;
  body: unknown;
  ifMatch: string | null;
}) {
  const bytes = new TextEncoder().encode(canonicalize(input));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function successHeaders(
  requestIdentifier: string,
  principal: VerifiedPrincipal,
  custom?: HeadersInit,
) {
  const headers = new Headers(custom);
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Request-Id", requestIdentifier);
  headers.set("X-Content-Type-Options", "nosniff");
  if (principal.rateLimitMax !== null) {
    headers.set("X-RateLimit-Limit", String(principal.rateLimitMax));
    headers.set(
      "X-RateLimit-Remaining",
      String(Math.max(0, principal.rateLimitMax - principal.requestCount)),
    );
  }
  if (principal.rateLimitResetAt !== null) {
    headers.set(
      "X-RateLimit-Reset",
      String(Math.ceil(principal.rateLimitResetAt / 1_000)),
    );
  }
  return headers;
}

function isStoredResult<T>(
  result: ApiHandlerResult<T>,
): result is Extract<ApiHandlerResult<T>, { storedJson: string }> {
  return "storedJson" in result;
}

async function validateServerResponse<TSchema extends z.ZodType>(
  schema: TSchema,
  value: unknown,
): Promise<z.output<TSchema>> {
  const result = await schema.safeParseAsync(value);
  if (!result.success) {
    apiProblem({
      status: 500,
      code: "invalid_server_response",
      title: "Internal server error",
      detail: "The operation produced an invalid response.",
    });
  }
  return result.data;
}

export async function executeApiOperation<T extends ApiOperation>(input: {
  request: Request;
  operation: T;
  params?: Record<string, string>;
  handler: (
    context: ApiExecutionContext,
    parsed: OperationInput<T>,
  ) => Promise<ApiHandlerResult<OperationResponse<T>>>;
}) {
  const startedAt = performance.now();
  const currentRequestId = createApiRequestId();
  const instance = new URL(input.request.url).pathname;
  let logPrincipal: VerifiedPrincipal | null = null;
  function logResult(
    status: number,
    replayed = false,
    problemCode: string | null = null,
    responseBytes: number | null = null,
  ) {
    const rateLimitRemaining =
      logPrincipal?.rateLimitMax === null || !logPrincipal
        ? null
        : Math.max(
            0,
            logPrincipal.rateLimitMax - logPrincipal.requestCount,
          );
    const details = {
      requestId: currentRequestId,
      operationId: input.operation.id,
      status,
      latencyMs: Math.round(performance.now() - startedAt),
      organizationId: logPrincipal?.organizationId ?? null,
      apiKeyId: logPrincipal?.apiKeyId ?? null,
      replayed,
      problemCode,
      responseBytes,
      rateLimited: status === 429,
      rateLimitRemaining,
    };
    logApiRequest(details);
  }
  try {
    const methodAllowed =
      input.request.method === input.operation.method ||
      (input.request.method === "HEAD" && input.operation.method === "GET");
    if (!methodAllowed) {
      throw new ApiProblem({
        status: 405,
        code: "method_not_allowed",
        title: "Method not allowed",
        detail: "The HTTP method is not supported for this operation.",
        headers: { Allow: input.operation.method },
      });
    }
    const authenticated = await authenticate(
      input.request,
      currentRequestId,
    );
    logPrincipal = authenticated.principal;
    const rawParams =
      input.operation.paramsSchema === noInputSchema ? undefined : input.params ?? {};
    const rawQuery = queryInput(input.request, input.operation);
    const rawBody = await bodyInput(input.request, input.operation);
    const [params, query, body] = await Promise.all([
      input.operation.paramsSchema.parseAsync(rawParams),
      input.operation.querySchema.parseAsync(rawQuery),
      input.operation.bodySchema.parseAsync(rawBody),
    ]);
    const key = idempotencyKey(
      input.request,
      input.operation.idempotencyRequired,
    );
    const ifMatch = ifMatchVersion(
      input.request,
      input.operation.ifMatchRequired === true,
    );
    const hash = await requestHash({ params, query, body, ifMatch });
    const result = await input.handler(
      {
        client: authenticated.client,
        principal: authenticated.principal,
        requestId: currentRequestId,
      },
      {
        params,
        query,
        body,
        idempotencyKey: key,
        ifMatch,
        requestHash: hash,
      } as OperationInput<T>,
    );
    const headers = successHeaders(
      currentRequestId,
      authenticated.principal,
      result.headers,
    );
    if (isStoredResult(result)) {
      if (result.status !== input.operation.successStatus) {
        apiProblem({
          status: 500,
          code: "invalid_server_response",
          title: "Internal server error",
          detail: "The operation produced an undocumented response status.",
        });
      }
      let decoded: unknown;
      try {
        decoded = JSON.parse(result.storedJson) as unknown;
      } catch {
        apiProblem({
          status: 500,
          code: "invalid_server_response",
          title: "Internal server error",
          detail: "The operation produced invalid response JSON.",
        });
      }
      const validated = await validateServerResponse(
        input.operation.responseSchema,
        decoded,
      );
      headers.set("Content-Type", "application/json");
      headers.set("Idempotency-Replayed", String(result.replayed));
      const json = JSON.stringify(validated);
      const responseBytes = new TextEncoder().encode(json).byteLength;
      logResult(result.status, result.replayed, null, responseBytes);
      return new Response(json, {
        status: result.status,
        headers,
      });
    }
    const status = result.status ?? input.operation.successStatus;
    if (status !== input.operation.successStatus) {
      apiProblem({
        status: 500,
        code: "invalid_server_response",
        title: "Internal server error",
        detail: "The operation produced an undocumented response status.",
      });
    }
    if (status === 204) {
      logResult(status, false, null, 0);
      return new Response(null, { status, headers });
    }
    const validated = await validateServerResponse(
      input.operation.responseSchema,
      result.body,
    );
    headers.set("Content-Type", "application/json");
    const json = JSON.stringify(validated);
    const responseBytes = new TextEncoder().encode(json).byteLength;
    logResult(status, false, null, responseBytes);
    return new Response(json, { status, headers });
  } catch (error) {
    const problem = normalizeProblem(error);
    const response = problemResponse({
      error,
      requestId: currentRequestId,
      instance,
    });
    const responseBytes = (await response.clone().arrayBuffer()).byteLength;
    logResult(
      problem.status,
      false,
      problem.code,
      responseBytes,
    );
    return response;
  }
}

export function convexPage<T>(result: {
  page: T[];
  isDone: boolean;
  continueCursor: string;
}) {
  return {
    data: result.page,
    page: {
      nextCursor: result.isDone ? null : result.continueCursor,
      hasMore: !result.isDone,
    },
  };
}

export function paginationOpts(query: { limit: number; cursor?: string }) {
  return {
    numItems: query.limit,
    cursor: query.cursor ?? null,
  };
}

export type InferSchema<T extends z.ZodType> = z.output<T>;
