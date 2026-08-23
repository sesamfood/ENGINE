import { getRestApiJwks } from "@/lib/api/v1/service-token";

export const runtime = "nodejs";

export async function GET() {
  try {
    return Response.json(await getRestApiJwks(), {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "REST API signing keys are not configured." },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  }
}
