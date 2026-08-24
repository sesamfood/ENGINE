import { api } from "@/convex/_generated/api";
import { operations } from "@/lib/api/v1/contract";
import { executeApiOperation } from "@/lib/api/v1/executor";
import { apiProblem } from "@/lib/api/v1/problems";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.salesDailyGet,
    params: await context.params,
    handler: async ({ client }, { params }) => {
      const daily = await client.query(api.rest.sales.getDaily, {
        id: params.id,
      });
      if (!daily) {
        apiProblem({
          status: 404,
          code: "sales_daily_not_found",
          title: "Daily sales not found",
          detail: "The daily sales aggregate was not found.",
        });
      }
      return { body: { data: daily } };
    },
  });
}
