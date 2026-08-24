import { api } from "@/convex/_generated/api";
import { operations } from "@/lib/api/v1/contract";
import { executeApiOperation } from "@/lib/api/v1/executor";
import { apiProblem } from "@/lib/api/v1/problems";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.salesOrdersGet,
    params: await context.params,
    handler: async ({ client }, { params }) => {
      const order = await client.query(api.rest.sales.getOrder, {
        id: params.id,
      });
      if (!order) {
        apiProblem({
          status: 404,
          code: "sales_order_not_found",
          title: "Sales order not found",
          detail: "The sales order was not found.",
        });
      }
      return { body: { data: order } };
    },
  });
}
