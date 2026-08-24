import { ConvexError } from "convex/values";
import { ZodError } from "zod";

export type ProblemFieldError = {
  pointer: string;
  code: string;
};

export type ProblemDocument = {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  requestId: string;
  errors?: ProblemFieldError[];
};

type ProblemOptions = {
  status: number;
  code: string;
  title: string;
  detail: string;
  errors?: ProblemFieldError[];
  headers?: HeadersInit;
};

export function createApiRequestId() {
  return `req_${crypto.randomUUID().replaceAll("-", "")}`;
}

export class ApiProblem extends Error {
  readonly options: ProblemOptions;

  constructor(options: ProblemOptions) {
    super(options.detail);
    this.name = "ApiProblem";
    this.options = options;
  }
}

const domainProblems: Record<
  string,
  { status: number; title: string; detail?: string }
> = {
  forbidden: { status: 403, title: "Permission denied" },
  location_forbidden: { status: 403, title: "Location access denied" },
  invalid_api_identity: { status: 401, title: "Invalid API identity" },
  invalid_api_key_policy: { status: 401, title: "API key is not authorized" },
  api_key_required: { status: 401, title: "API key required" },
  mutation_rate_limited: { status: 429, title: "Mutation rate limit exceeded" },
  workfeed_sync_rate_limited: {
    status: 429,
    title: "Employee sync rate limit exceeded",
  },
  workfeed_sync_unavailable: {
    status: 409,
    title: "Employee sync unavailable",
  },
  not_found: { status: 404, title: "Resource not found" },
  duplicate: { status: 409, title: "Resource already exists" },
  in_use: { status: 409, title: "Resource is in use" },
  conflict: { status: 409, title: "Request conflicts with current state" },
  idempotency_key_reused: {
    status: 409,
    title: "Idempotency key conflict",
  },
  precondition_failed: { status: 412, title: "Precondition failed" },
  invalid_reference: { status: 422, title: "Invalid reference" },
  validation_error: { status: 422, title: "Request validation failed" },
  too_many_resources: { status: 422, title: "Resource limit exceeded" },
  category_hierarchy_invalid: {
    status: 409,
    title: "Category hierarchy conflict",
  },
  market_has_too_many_locations: {
    status: 409,
    title: "Market update conflict",
  },
  operator_access_cleanup_too_large: {
    status: 409,
    title: "Operator deletion conflict",
  },
};

const problemFragments: Record<number, string> = {
  400: "bad-request",
  401: "authentication",
  403: "authorization",
  404: "not-found",
  405: "method-not-allowed",
  409: "conflict",
  412: "precondition-failed",
  413: "request-too-large",
  415: "unsupported-media-type",
  422: "validation",
  428: "precondition-required",
  429: "rate-limit",
  500: "internal-error",
  503: "unavailable",
};

function problemType(status: number) {
  return `/api/v1/docs#problem-${problemFragments[status] ?? "error"}`;
}

function domainProblem(code: string) {
  const exact = domainProblems[code];
  if (exact) return exact;
  if (code.endsWith("_not_found")) {
    return { status: 404, title: "Resource not found" };
  }
  if (
    code.endsWith("_name_taken") ||
    code.endsWith("_already_exists") ||
    code.endsWith("_in_use") ||
    code.endsWith("_dependency")
  ) {
    return { status: 409, title: "Request conflicts with current state" };
  }
  if (
    code.includes("invalid") ||
    code.endsWith("_too_large") ||
    code.includes("too_many") ||
    code.endsWith("_limit_reached") ||
    code.startsWith("page_size_")
  ) {
    return { status: 422, title: "Request validation failed" };
  }
  return null;
}

function pointer(path: PropertyKey[]) {
  if (path.length === 0) return "/";
  return `/${path
    .map((segment) => String(segment).replaceAll("~", "~0").replaceAll("/", "~1"))
    .join("/")}`;
}

function structuredConvexError(error: unknown) {
  if (!(error instanceof ConvexError)) return null;
  const data: unknown = error.data;
  if (!data || typeof data !== "object") return null;
  const code = "code" in data && typeof data.code === "string" ? data.code : null;
  const message =
    "message" in data && typeof data.message === "string" ? data.message : null;
  if (!code || !message) return null;
  const retryAfterMs =
    "retryAfterMs" in data &&
    typeof data.retryAfterMs === "number" &&
    Number.isFinite(data.retryAfterMs) &&
    data.retryAfterMs > 0
      ? data.retryAfterMs
      : null;
  return { code, message, retryAfterMs };
}

export function normalizeProblem(error: unknown): ProblemOptions {
  if (error instanceof ApiProblem) return error.options;
  if (error instanceof ZodError) {
    return {
      status: 422,
      code: "validation_error",
      title: "Request validation failed",
      detail: "One or more fields are invalid.",
      errors: error.issues.map((issue) => ({
        pointer: pointer(issue.path),
        code: issue.code,
      })),
    };
  }
  const domain = structuredConvexError(error);
  if (domain) {
    const mapping = domainProblem(domain.code);
    if (mapping) {
      return {
        status: mapping.status,
        code: domain.code,
        title: mapping.title,
        detail: mapping.detail ?? domain.message,
        ...(mapping.status === 429
          ? {
              headers: {
                "Retry-After": String(
                  Math.max(1, Math.ceil((domain.retryAfterMs ?? 60_000) / 1_000)),
                ),
              },
            }
          : {}),
      };
    }
  }
  return {
    status: 500,
    code: "internal_error",
    title: "Internal server error",
    detail: "The request could not be completed.",
  };
}

export function problemResponse(input: {
  error: unknown;
  requestId: string;
  instance: string;
}) {
  const problem = normalizeProblem(input.error);
  const body: ProblemDocument = {
    type: problemType(problem.status),
    title: problem.title,
    status: problem.status,
    detail: problem.detail,
    instance: input.instance,
    code: problem.code,
    requestId: input.requestId,
    ...(problem.errors ? { errors: problem.errors } : {}),
  };
  const json = JSON.stringify(body);
  const headers = new Headers(problem.headers);
  headers.set("Content-Type", "application/problem+json");
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Request-Id", input.requestId);
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(json, {
    status: problem.status,
    headers,
  });
}

export function apiProblem(options: ProblemOptions): never {
  throw new ApiProblem(options);
}
