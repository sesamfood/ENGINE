import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth-server";
import { operationList } from "@/lib/api/v1/contract";
import {
  ApiProblem,
  createApiRequestId,
  problemResponse,
} from "@/lib/api/v1/problems";
import { logApiRequest } from "@/lib/api/v1/rest-request-logging";

const publicPaths = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/invitation",
  "/share",
  "/help",
];

const methodOrder = ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"];

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function routePattern(template: string) {
  const source = template
    .split(/(\{[^}]+\})/)
    .map((part) => (part.startsWith("{") ? "[^/]+" : escapePattern(part)))
    .join("");
  return new RegExp(`^${source}$`);
}

const methodsByTemplate = new Map<string, Set<string>>([
  ["/api/v1/docs", new Set(["GET"])],
  ["/api/v1/openapi.json", new Set(["GET"])],
]);

for (const operation of operationList) {
  const methods = methodsByTemplate.get(operation.path) ?? new Set<string>();
  methods.add(operation.method);
  methodsByTemplate.set(operation.path, methods);
}

const apiRoutes = [...methodsByTemplate]
  .map(([template, methods]) => ({
    template,
    methods,
    pattern: routePattern(template),
    dynamicSegments: [...template.matchAll(/\{[^}]+\}/g)].length,
  }))
  .sort(
    (left, right) =>
      left.dynamicSegments - right.dynamicSegments ||
      right.template.length - left.template.length,
  );

async function routingProblem(input: {
  request: NextRequest;
  startedAt: number;
  operationId: string;
  problem: ApiProblem;
}) {
  const requestId = createApiRequestId();
  const response = problemResponse({
    error: input.problem,
    requestId,
    instance: input.request.nextUrl.pathname,
  });
  const responseBytes = (await response.clone().arrayBuffer()).byteLength;
  logApiRequest({
    requestId,
    operationId: input.operationId,
    status: input.problem.options.status,
    latencyMs: Math.round(performance.now() - input.startedAt),
    organizationId: null,
    apiKeyId: null,
    replayed: false,
    problemCode: input.problem.options.code,
    responseBytes,
    rateLimited: false,
    rateLimitRemaining: null,
  });
  return response;
}

async function apiRoutingResponse(request: NextRequest) {
  const startedAt = performance.now();
  const route = apiRoutes.find(({ pattern }) =>
    pattern.test(request.nextUrl.pathname),
  );
  if (!route) {
    return await routingProblem({
      request,
      startedAt,
      operationId: "routeNotFound",
      problem: new ApiProblem({
        status: 404,
        code: "route_not_found",
        title: "Route not found",
        detail: "The requested API route does not exist.",
      }),
    });
  }
  const allowed = new Set(route.methods);
  if (allowed.has("GET")) allowed.add("HEAD");
  if (allowed.has(request.method)) return null;
  const allow = methodOrder.filter((method) => allowed.has(method)).join(", ");
  return await routingProblem({
    request,
    startedAt,
    operationId: "methodNotAllowed",
    problem: new ApiProblem({
      status: 405,
      code: "method_not_allowed",
      title: "Method not allowed",
      detail: "The HTTP method is not supported for this route.",
      headers: { Allow: allow },
    }),
  });
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/api/v1" || pathname.startsWith("/api/v1/")) {
    return (await apiRoutingResponse(request)) ?? NextResponse.next();
  }

  if (
    pathname.startsWith("/api/auth") ||
    pathname === "/.well-known/rest-api-jwks.json"
  ) {
    return NextResponse.next();
  }

  const publicPath = publicPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const authenticated = await isAuthenticated();

  if (!authenticated && !publicPath) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "redirect",
      `${pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(loginUrl);
  }

  if (authenticated && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
