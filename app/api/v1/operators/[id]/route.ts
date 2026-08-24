import { api } from "@/convex/_generated/api";
import { operations } from "@/lib/api/v1/contract";
import { executeApiOperation } from "@/lib/api/v1/executor";
import { apiProblem } from "@/lib/api/v1/problems";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.operatorsGet,
    params: await context.params,
    handler: async ({ client }, { params }) => {
      const operator = await client.query(api.rest.masterData.getOperator, {
        id: params.id,
      });
      if (!operator) {
        apiProblem({
          status: 404,
          code: "operator_not_found",
          title: "Operator not found",
          detail: "The operator was not found.",
        });
      }
      return { body: { data: operator } };
    },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.operatorsPatch,
    params: await context.params,
    handler: async ({ client }, { params, body }) => ({
      body: {
        data: await client.mutation(api.rest.masterData.updateOperator, {
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
    operation: operations.operatorsDelete,
    params: await context.params,
    handler: async ({ client }, { params }) => {
      await client.mutation(api.rest.masterData.deleteOperator, {
        id: params.id,
      });
      return { body: null };
    },
  });
}
