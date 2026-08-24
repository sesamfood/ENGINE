import { api } from "@/convex/_generated/api";
import { operations } from "@/lib/api/v1/contract";
import { executeApiOperation } from "@/lib/api/v1/executor";
import { apiProblem } from "@/lib/api/v1/problems";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.scheduledShiftsGet,
    params: await context.params,
    handler: async ({ client }, { params }) => {
      const shift = await client.query(api.rest.employees.getScheduledShift, {
        id: params.id,
      });
      if (!shift) {
        apiProblem({
          status: 404,
          code: "scheduled_shift_not_found",
          title: "Scheduled shift not found",
          detail: "The scheduled shift was not found.",
        });
      }
      return { body: { data: shift } };
    },
  });
}
