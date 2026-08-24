import { api } from "@/convex/_generated/api";
import { operations } from "@/lib/api/v1/contract";
import { executeApiOperation } from "@/lib/api/v1/executor";
import { apiProblem } from "@/lib/api/v1/problems";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.salesLinesGet,
    params: await context.params,
    handler: async ({ client }, { params }) => {
      const line = await client.query(api.rest.sales.getLine, {
        id: params.id,
      });
      if (!line) {
        apiProblem({
          status: 404,
          code: "sales_line_not_found",
          title: "Sales line not found",
          detail: "The sales line was not found.",
        });
      }
      return { body: { data: line } };
    },
  });
}
