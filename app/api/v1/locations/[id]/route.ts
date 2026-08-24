import { api } from "@/convex/_generated/api";
import { operations } from "@/lib/api/v1/contract";
import { executeApiOperation } from "@/lib/api/v1/executor";
import {
  locationPatchInput,
  publicLocation,
} from "@/lib/api/v1/location-dto";
import { apiProblem } from "@/lib/api/v1/problems";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.locationsGet,
    params: await context.params,
    handler: async ({ client }, { params }) => {
      const location = await client.query(api.rest.locations.get, {
        id: params.id,
      });
      if (!location) {
        apiProblem({
          status: 404,
          code: "location_not_found",
          title: "Location not found",
          detail: "The location was not found.",
        });
      }
      return { body: { data: publicLocation(location) } };
    },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.locationsPatch,
    params: await context.params,
    handler: async ({ client }, { params, body }) => ({
      body: {
        data: publicLocation(
          await client.mutation(api.rest.locations.update, {
            id: params.id,
            input: locationPatchInput(body),
          }),
        ),
      },
    }),
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.locationsDelete,
    params: await context.params,
    handler: async ({ client }, { params }) => {
      await client.mutation(api.rest.locations.deleteLocation, { id: params.id });
      return { body: null };
    },
  });
}
