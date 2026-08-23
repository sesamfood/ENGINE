import { api } from "@/convex/_generated/api";
import { operations } from "@/lib/api/v1/contract";
import { executeApiOperation } from "@/lib/api/v1/executor";
import { apiProblem } from "@/lib/api/v1/problems";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.productsGet,
    params: await context.params,
    handler: async ({ client }, { params }) => {
      const product = await client.query(api.rest.catalog.getProduct, {
        id: params.id,
      });
      if (!product) {
        apiProblem({
          status: 404,
          code: "product_not_found",
          title: "Product not found",
          detail: "The product was not found.",
        });
      }
      return {
        body: { data: product },
        headers: { ETag: `"${product.version}"` },
      };
    },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.productsPatch,
    params: await context.params,
    handler: async ({ client }, { params, body, ifMatch }) => {
      if (!ifMatch) {
        apiProblem({
          status: 428,
          code: "if_match_required",
          title: "Precondition required",
          detail: "Provide the current quoted resource version in If-Match.",
        });
      }
      const product = await client.mutation(api.rest.catalog.updateProduct, {
        id: params.id,
        expectedVersion: ifMatch,
        input: body,
      });
      return {
        body: { data: product },
        headers: { ETag: `"${product.version}"` },
      };
    },
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  return await executeApiOperation({
    request,
    operation: operations.productsDelete,
    params: await context.params,
    handler: async ({ client }, { params, ifMatch }) => {
      if (!ifMatch) {
        apiProblem({
          status: 428,
          code: "if_match_required",
          title: "Precondition required",
          detail: "Provide the current quoted resource version in If-Match.",
        });
      }
      await client.mutation(api.rest.catalog.deleteProduct, {
        id: params.id,
        expectedVersion: ifMatch,
      });
      return { body: null };
    },
  });
}
