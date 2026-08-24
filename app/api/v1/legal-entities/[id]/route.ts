import { api } from "@/convex/_generated/api";
import { operations } from "@/lib/api/v1/contract";
import { executeApiOperation } from "@/lib/api/v1/executor";
import { apiProblem } from "@/lib/api/v1/problems";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.legalEntitiesGet,
    params: await context.params,
    handler: async ({ client }, { params }) => {
      const legalEntity = await client.query(
        api.rest.masterData.getLegalEntity,
        { id: params.id },
      );
      if (!legalEntity) {
        apiProblem({
          status: 404,
          code: "legal_entity_not_found",
          title: "Legal entity not found",
          detail: "The legal entity was not found.",
        });
      }
      return { body: { data: legalEntity } };
    },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.legalEntitiesPatch,
    params: await context.params,
    handler: async ({ client }, { params, body }) => ({
      body: {
        data: await client.mutation(api.rest.masterData.updateLegalEntity, {
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
    operation: operations.legalEntitiesDelete,
    params: await context.params,
    handler: async ({ client }, { params }) => {
      await client.mutation(api.rest.masterData.deleteLegalEntity, {
        id: params.id,
      });
      return { body: null };
    },
  });
}
