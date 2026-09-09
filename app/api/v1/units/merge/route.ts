import { api } from "@/convex/_generated/api";
import { operations } from "@/lib/api/v1/contract";
import { executeApiOperation } from "@/lib/api/v1/executor";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return await executeApiOperation({
    request,
    operation: operations.unitsMerge,
    handler: async ({ client }, input) => {
      const result = await client.mutation(api.rest.catalog.mergeUnits, {
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
