import { api } from "@/convex/_generated/api";
import { operations } from "@/lib/api/v1/contract";
import { executeApiOperation } from "@/lib/api/v1/executor";
import { apiProblem } from "@/lib/api/v1/problems";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.categoriesGet,
    params: await context.params,
    handler: async ({ client }, { params }) => {
      const category = await client.query(api.rest.catalog.getCategory, {
        id: params.id,
      });
      if (!category) {
        apiProblem({
          status: 404,
          code: "category_not_found",
          title: "Category not found",
          detail: "The category was not found.",
        });
      }
      return { body: { data: category } };
    },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.categoriesPatch,
    params: await context.params,
    handler: async ({ client }, { params, body }) => ({
      body: {
        data: await client.mutation(api.rest.catalog.updateCategory, {
          id: params.id,
          input: body,
        }),
      },
    }),
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.categoriesDelete,
    params: await context.params,
    handler: async ({ client }, { params }) => {
      await client.mutation(api.rest.catalog.deleteCategory, { id: params.id });
      return { body: null };
    },
  });
}
