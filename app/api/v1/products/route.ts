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
    operation: operations.productsList,
    handler: async ({ client }, { query }) => ({
      body: convexPage(
        await client.query(api.rest.catalog.listProducts, {
          paginationOpts: paginationOpts(query),
          status: query.status,
        }),
      ),
    }),
  });
}

export async function POST(request: Request) {
  return await executeApiOperation({
    request,
    operation: operations.productsCreate,
    handler: async ({ client }, input) => {
      const result = await client.mutation(api.rest.catalog.createProduct, {
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        input: input.body,
      });
      return {
        storedJson: result.json,
        status: result.status,
        replayed: result.replayed,
      };
    },
  });
}
