import { ApiReference } from "@scalar/nextjs-api-reference";

export const dynamic = "force-dynamic";

export function GET() {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const response = ApiReference({
    url: "/api/v1/openapi.json",
    pageTitle: "REST API reference",
    cdn: "https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.66.1",
    nonce,
  })();

  response.headers.set("Cache-Control", "no-store");
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      `script-src 'nonce-${nonce}'`,
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'none'",
    ].join("; "),
  );
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
