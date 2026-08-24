import { api } from "@/convex/_generated/api";
import { operations } from "@/lib/api/v1/contract";
import { executeApiOperation } from "@/lib/api/v1/executor";
import { apiProblem } from "@/lib/api/v1/problems";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.productsRestore,
    params: await context.params,
    handler: async ({ client }, input) => {
      if (!input.idempotencyKey) {
        apiProblem({
          status: 400,
          code: "missing_idempotency_key",
          title: "Idempotency key required",
          detail: "Provide an Idempotency-Key header for this operation.",
        });
      }
      if (!input.ifMatch) {
        apiProblem({
          status: 428,
          code: "if_match_required",
          title: "Precondition required",
          detail: "Provide the current quoted resource version in If-Match.",
        });
      }
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
