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
    operation: operations.employeesList,
    handler: async ({ client }, { query }) => ({
      body: convexPage(
        await client.query(api.rest.employees.list, {
          locationId: query.locationId,
          paginationOpts: paginationOpts(query),
        }),
      ),
    }),
  });
}
