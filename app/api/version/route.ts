export const dynamic = "force-dynamic";

// Baked in at build time, so a running deployment always reports its own build.
export function GET() {
  return Response.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? "development" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
