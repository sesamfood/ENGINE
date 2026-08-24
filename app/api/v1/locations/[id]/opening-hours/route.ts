import { api } from "@/convex/_generated/api";
import { operations } from "@/lib/api/v1/contract";
import { executeApiOperation } from "@/lib/api/v1/executor";
import { apiProblem } from "@/lib/api/v1/problems";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.locationsOpeningHoursGet,
    params: await context.params,
    handler: async ({ client }, { params }) => {
      const openingHours = await client.query(
        api.rest.locations.getOpeningHours,
        { id: params.id },
      );
      if (!openingHours) {
        apiProblem({
          status: 404,
          code: "location_not_found",
          title: "Location not found",
          detail: "The location was not found.",
        });
      }
      return { body: { data: openingHours } };
    },
  });
}

export async function PUT(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.locationsOpeningHoursPut,
    params: await context.params,
    handler: async ({ client }, { params, body }) => ({
      body: {
        data: await client.mutation(api.rest.locations.replaceOpeningHours, {
          id: params.id,
          input: body,
        }),
      },
    }),
  });
}
