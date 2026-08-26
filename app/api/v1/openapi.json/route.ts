import { createOpenApiDocument } from "@/lib/api/v1/openapi";

export const dynamic = "force-static";

export function GET() {
  return Response.json(createOpenApiDocument(), {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
