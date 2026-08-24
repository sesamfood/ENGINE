import { api } from "@/convex/_generated/api";
import { operations } from "@/lib/api/v1/contract";
import { executeApiOperation } from "@/lib/api/v1/executor";
import { apiProblem } from "@/lib/api/v1/problems";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.marketsGet,
    params: await context.params,
    handler: async ({ client }, { params }) => {
      const market = await client.query(api.rest.masterData.getMarket, {
        id: params.id,
      });
      if (!market) {
        apiProblem({
          status: 404,
          code: "market_not_found",
          title: "Market not found",
          detail: "The market was not found.",
        });
      }
      return { body: { data: market } };
    },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.marketsPatch,
    params: await context.params,
    handler: async ({ client }, { params, body }) => ({
      body: {
        data: await client.mutation(api.rest.masterData.updateMarket, {
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
    operation: operations.marketsDelete,
    params: await context.params,
    handler: async ({ client }, { params }) => {
      await client.mutation(api.rest.masterData.deleteMarket, { id: params.id });
      return { body: null };
    },
  });
}
