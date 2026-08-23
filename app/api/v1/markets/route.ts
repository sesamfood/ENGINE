import { api } from "@/convex/_generated/api";
import { operations } from "@/lib/api/v1/contract";
import {
  convexPage,
  executeApiOperation,
  paginationOpts,
} from "@/lib/api/v1/executor";
import { apiProblem } from "@/lib/api/v1/problems";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return await executeApiOperation({
    request,
    operation: operations.marketsList,
    handler: async ({ client }, { query }) => ({
      body: convexPage(
        await client.query(api.rest.masterData.listMarkets, {
          paginationOpts: paginationOpts(query),
        }),
      ),
    }),
  });
}

export async function POST(request: Request) {
  return await executeApiOperation({
    request,
    operation: operations.marketsCreate,
    handler: async ({ client }, input) => {
      if (!input.idempotencyKey) {
        apiProblem({
          status: 400,
          code: "missing_idempotency_key",
          title: "Idempotency key required",
          detail: "Provide an Idempotency-Key header for this operation.",
        });
      }
      const result = await client.mutation(api.rest.masterData.createMarket, {
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
