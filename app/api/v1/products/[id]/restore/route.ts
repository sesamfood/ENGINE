import { api } from "@/convex/_generated/api";
import { operations } from "@/lib/api/v1/contract";
import { executeApiOperation } from "@/lib/api/v1/executor";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.productsRestore,
    params: await context.params,
    handler: async ({ client }, input) => {
      const result = await client.mutation(api.rest.catalog.restoreProduct, {
        id: input.params.id,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        expectedVersion: input.ifMatch,
      });
      return {
        storedJson: result.json,
        status: result.status,
        replayed: result.replayed,
      };
    },
  });
}
