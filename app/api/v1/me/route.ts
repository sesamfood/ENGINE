import { api } from "@/convex/_generated/api";
import { operations } from "@/lib/api/v1/contract";
import { executeApiOperation } from "@/lib/api/v1/executor";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return await executeApiOperation({
    request,
    operation: operations.me,
    handler: async ({ client }) => ({
      body: { data: await client.query(api.rest.me.get, {}) },
    }),
  });
}
