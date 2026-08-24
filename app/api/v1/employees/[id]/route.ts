import { api } from "@/convex/_generated/api";
import { operations } from "@/lib/api/v1/contract";
import { executeApiOperation } from "@/lib/api/v1/executor";
import { apiProblem } from "@/lib/api/v1/problems";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.employeesGet,
    params: await context.params,
    handler: async ({ client }, { params }) => {
      const employee = await client.query(api.rest.employees.get, {
        id: params.id,
      });
      if (!employee) {
        apiProblem({
          status: 404,
          code: "employee_not_found",
          title: "Employee not found",
          detail: "The employee was not found.",
        });
      }
      return { body: { data: employee } };
    },
  });
}
