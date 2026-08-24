import { api } from "@/convex/_generated/api";
import { operations } from "@/lib/api/v1/contract";
import {
  convexPage,
  executeApiOperation,
  paginationOpts,
} from "@/lib/api/v1/executor";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return await executeApiOperation({
    request,
    operation: operations.salesOrdersList,
    handler: async ({ client }, { query }) => ({
      body: convexPage(
        await client.query(api.rest.sales.listOrders, {
          locationId: query.locationId,
          from: Date.parse(query.from),
          to: Date.parse(query.to),
          paginationOpts: paginationOpts(query),
        }),
      ),
    }),
  });
}
