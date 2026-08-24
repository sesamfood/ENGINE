import { api } from "@/convex/_generated/api";
import { operations } from "@/lib/api/v1/contract";
import { executeApiOperation } from "@/lib/api/v1/executor";
import { apiProblem } from "@/lib/api/v1/problems";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.unitsGet,
    params: await context.params,
    handler: async ({ client }, { params }) => {
      const unit = await client.query(api.rest.catalog.getUnit, {
        id: params.id,
      });
      if (!unit) {
        apiProblem({
          status: 404,
          code: "unit_not_found",
          title: "Unit not found",
          detail: "The unit was not found.",
        });
      }
      return { body: { data: unit } };
    },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.unitsPatch,
    params: await context.params,
    handler: async ({ client }, { params, body }) => ({
      body: {
        data: await client.mutation(api.rest.catalog.updateUnit, {
          id: params.id,
          input: body,
        }),
      },
    }),
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.unitsDelete,
    params: await context.params,
    handler: async ({ client }, { params }) => {
      await client.mutation(api.rest.catalog.deleteUnit, { id: params.id });
      return { body: null };
    },
  });
}
