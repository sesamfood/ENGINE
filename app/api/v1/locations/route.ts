import { api } from "@/convex/_generated/api";
import { operations } from "@/lib/api/v1/contract";
import {
  convexPage,
  executeApiOperation,
  paginationOpts,
} from "@/lib/api/v1/executor";
import {
  locationCreateInput,
  publicLocation,
} from "@/lib/api/v1/location-dto";
import { apiProblem } from "@/lib/api/v1/problems";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return await executeApiOperation({
    request,
    operation: operations.locationsList,
    handler: async ({ client }, { query }) => {
      const result = await client.query(api.rest.locations.list, {
        paginationOpts: paginationOpts(query),
      });
      return {
        body: convexPage({
          ...result,
          page: result.page.map(publicLocation),
        }),
      };
    },
  });
}

export async function POST(request: Request) {
  return await executeApiOperation({
    request,
    operation: operations.locationsCreate,
    handler: async ({ client }, input) => {
      if (!input.idempotencyKey) {
        apiProblem({
          status: 400,
          code: "missing_idempotency_key",
          title: "Idempotency key required",
          detail: "Provide an Idempotency-Key header for this operation.",
        });
      }
      const result = await client.mutation(api.rest.locations.create, {
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        input: locationCreateInput(input.body),
      });
      return {
        storedJson: result.json,
        status: result.status,
        replayed: result.replayed,
      };
    },
  });
}
