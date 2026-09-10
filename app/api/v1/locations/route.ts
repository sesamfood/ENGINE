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
