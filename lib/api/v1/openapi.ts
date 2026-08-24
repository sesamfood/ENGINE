import { z } from "zod";
import {
  noInputSchema,
  operationList,
  problemSchema,
  type ApiOperation,
} from "./contract";

type JsonObject = Record<string, unknown>;

function jsonSchema(schema: z.ZodType): JsonObject {
  const converted = z.toJSONSchema(schema) as JsonObject;
  const result = { ...converted };
  delete result.$schema;
  return result;
}

function schemaObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function parameters(operation: ApiOperation) {
  const result: JsonObject[] = [];
  if (operation.paramsSchema !== noInputSchema) {
    const schema = jsonSchema(operation.paramsSchema);
    const properties = schemaObject(schema.properties);
    for (const token of operation.path.matchAll(/\{([^}]+)\}/g)) {
      const name = token[1];
      result.push({
        name,
        in: "path",
        required: true,
        schema: schemaObject(properties[name]),
      });
    }
  }
  if (operation.querySchema !== noInputSchema) {
    const schema = jsonSchema(operation.querySchema);
    const properties = schemaObject(schema.properties);
    const required = new Set(
      Array.isArray(schema.required)
        ? schema.required.filter((value): value is string => typeof value === "string")
        : [],
    );
    for (const [name, propertySchema] of Object.entries(properties)) {
      result.push({
        name,
        in: "query",
        required: required.has(name),
        schema: propertySchema,
      });
    }
  }
  if (operation.idempotencyRequired) {
    result.push({
      name: "Idempotency-Key",
      in: "header",
      required: true,
      description:
        "A caller-generated value of 1–255 visible ASCII characters. Reuse it only for an identical request within 24 hours.",
      schema: { type: "string", minLength: 1, maxLength: 255 },
    });
  }
  if (operation.ifMatchRequired) {
    result.push({
      name: "If-Match",
      in: "header",
      required: true,
      description:
        "The current resource version as one quoted entity tag, for example `\"1724408100000\"`.",
      schema: { type: "string", pattern: '^"[^"]{1,100}"$' },
    });
  }
  return result;
}

function problemResponse(description: string) {
  return {
    description,
    content: {
      "application/problem+json": {
        schema: jsonSchema(problemSchema),
      },
    },
  };
}

function responses(operation: ApiOperation) {
  const rateLimitHeaders = {
    "X-RateLimit-Limit": {
      description: "Credential request limit for the current key window.",
      schema: { type: "integer" },
    },
    "X-RateLimit-Remaining": {
      description: "Credential requests remaining in the current key window.",
      schema: { type: "integer" },
    },
    "X-RateLimit-Reset": {
      description: "Unix timestamp in seconds when the current key window can reset.",
      schema: { type: "integer" },
    },
    "X-Request-Id": {
      description: "Request identifier for support correlation.",
      schema: { type: "string" },
    },
  };
  const success =
    operation.successStatus === 204
      ? { description: "No content", headers: rateLimitHeaders }
      : {
          description: "Successful response",
          headers: rateLimitHeaders,
          content: {
            "application/json": {
              schema: jsonSchema(operation.responseSchema),
            },
          },
        };
  const result: Record<string, unknown> = {
    [operation.successStatus]: success,
    "401": problemResponse("Missing, invalid, expired, disabled, or revoked API key"),
    "403": problemResponse("The API key lacks the required permission or location access"),
    "405": problemResponse("The route does not support the HTTP method"),
    "422": problemResponse("Request validation failed"),
    "500": problemResponse("Unexpected server error"),
    "503": problemResponse("Authentication is temporarily unavailable"),
  };
  result["429"] = {
    ...problemResponse("API key rate limit exceeded"),
    headers: {
      "Retry-After": {
        description: "Seconds to wait before retrying.",
        schema: { type: "integer", minimum: 1 },
      },
      "X-Request-Id": rateLimitHeaders["X-Request-Id"],
    },
  };
  if (
    operation.bodySchema !== noInputSchema ||
    operation.idempotencyRequired ||
    operation.ifMatchRequired
  ) {
    result["400"] = problemResponse(
      "Malformed JSON or invalid required control header",
    );
  }
  if (operation.bodySchema !== noInputSchema) {
    result["413"] = problemResponse("JSON request body exceeds 1 MB");
    result["415"] = problemResponse("Content-Type is not application/json");
  }
  if (operation.path.includes("{")) {
    result["404"] = problemResponse("Resource not found or belongs to another organization");
  }
  if (["POST", "PATCH", "PUT", "DELETE"].includes(operation.method)) {
    result["409"] = problemResponse("The request conflicts with current resource state");
  }
  if (operation.ifMatchRequired) {
    result["412"] = problemResponse("The supplied resource version is stale");
    result["428"] = problemResponse("The If-Match header is required");
  }
  return result;
}

function operationObject(operation: ApiOperation) {
  const params = parameters(operation);
  return {
    operationId: operation.id,
    summary: operation.summary,
    description: operation.description,
    tags: operation.tags,
    ...(operation.authenticated ? { security: [{ apiKey: [] }] } : {}),
    ...(params.length > 0 ? { parameters: params } : {}),
    ...(operation.bodySchema !== noInputSchema
      ? {
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: jsonSchema(operation.bodySchema),
              },
            },
          },
        }
      : {}),
    responses: responses(operation),
    "x-required-permission": operation.permission,
    "x-location-behavior": operation.locationBehavior,
    "x-idempotency-required": operation.idempotencyRequired,
    "x-if-match-required": operation.ifMatchRequired === true,
  };
}

export function createOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const operation of operationList) {
    const path = (paths[operation.path] ??= {});
    path[operation.method.toLowerCase()] = operationObject(operation);
  }
  return {
    openapi: "3.1.0",
    jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
    info: {
      title: "Organization REST API",
      version: "1.0.0",
      summary: "Public organization API for supported restaurant-chain operations.",
      description: [
        "A versioned, organization-scoped API. Version 1 is additive: breaking changes are published under a new major URL.",
        "",
        "## Authentication",
        "Create an API key in **Administration → API**, then send it as `Authorization: Bearer eng_…`. Keys belong to one organization and carry a role, a reduced permission set, a location policy, and an expiry. Keep keys in server-side secret storage; never embed them in browser or mobile application code.",
        "",
        "## Requests and synchronization",
        "Send JSON request bodies with `Content-Type: application/json`. Bodies are limited to 1 MB and unknown fields are rejected. Collections use opaque cursors, default to 50 records, and accept at most 100. Follow `page.nextCursor` until `page.hasMore` is false. Full cursor reconciliation is the supported synchronization contract; `updatedAfter` is not supported.",
        "",
        "## Safe writes",
        "Creating and side-effecting POST operations require `Idempotency-Key`. Identical retries replay the first response for 24 hours; reusing the key with changed input returns 409. Product updates, archive, restore, and deletion require `If-Match` with the current quoted `version`. A stale version returns 412 and a missing header returns 428.",
        "",
        "## Errors and limits",
        "Failures use `application/problem+json` with a stable `code` and `requestId`. Use `code` for program logic and include the request ID in support reports. Organization keys allow 120 requests per 60-second key window and 30 mutations per minute. A 429 response includes `Retry-After`.",
        "",
        "## Compatibility",
        "Version 1 receives additive endpoints and optional fields. Breaking request or response changes move to a new major URL. Published operations receive at least 12 months' notice before removal.",
      ].join("\n"),
      contact: {
        name: "API support",
        ...(process.env.REST_API_SUPPORT_EMAIL
          ? { email: process.env.REST_API_SUPPORT_EMAIL }
          : {}),
      },
    },
    servers: [{ url: "/", description: "Current deployment" }],
    tags: [
      { name: "Capabilities", description: "Current key and authorization context" },
      { name: "Markets", description: "Market master data" },
      { name: "Legal entities", description: "Legal-entity master data" },
      { name: "Operators", description: "Operator master data" },
      { name: "Locations", description: "Locations and opening hours" },
      { name: "Categories", description: "Catalog category hierarchy" },
      { name: "Units", description: "Catalog units and unit merge" },
      { name: "Products", description: "Products, units, recipes, and lifecycle" },
    ],
    paths,
    components: {
      securitySchemes: {
        apiKey: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "Organization API key",
          description: "Send the organization API key as `Authorization: Bearer eng_…`.",
        },
      },
    },
  };
}
