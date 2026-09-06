import { z } from "zod";

export const noInputSchema = z.undefined();
export const publicIdSchema = z.string().min(1).max(200);
export const pathIdSchema = z.strictObject({ id: publicIdSchema });
export const paginationQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(2_000).optional(),
});
export const pageSchema = z.strictObject({
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

const nameSchema = z.string().trim().min(1).max(100);
const optionalTextSchema = z.string().max(500).nullable().optional();
const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .nullable()
  .optional();

export const meSchema = z.strictObject({
  keyId: z.string(),
  organization: z.strictObject({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
  }),
  role: z.string(),
  permissions: z.array(z.string()),
  locationScope: z.strictObject({
    all: z.boolean(),
    locationIds: z.array(publicIdSchema),
  }),
});

export const marketSchema = z.strictObject({
  id: publicIdSchema,
  name: z.string(),
  currency: z.string().nullable(),
  timeZone: z.string().nullable(),
});
export const marketCreateSchema = z.strictObject({
  name: nameSchema,
  currency: currencySchema,
  timeZone: optionalTextSchema,
});
export const marketPatchSchema = marketCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required.",
);

export const legalEntitySchema = z.strictObject({
  id: publicIdSchema,
  name: z.string(),
  registrationNumber: z.string().nullable(),
});
export const legalEntityCreateSchema = z.strictObject({
  name: nameSchema,
  registrationNumber: optionalTextSchema,
});
export const legalEntityPatchSchema = legalEntityCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required.",
);

export const operatorStatusSchema = z.enum(["active", "inactive"]);
export const operatorSchema = z.strictObject({
  id: publicIdSchema,
  name: z.string(),
  legalEntityId: publicIdSchema.nullable(),
  contactEmail: z.string().nullable(),
  status: operatorStatusSchema,
});
export const operatorCreateSchema = z.strictObject({
  name: nameSchema,
  legalEntityId: publicIdSchema.nullable().optional(),
  contactEmail: z.string().email().max(320).nullable().optional(),
  status: operatorStatusSchema.default("active"),
});
export const operatorPatchSchema = operatorCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required.",
);

export const ownershipTypeSchema = z.enum([
  "owned",
  "franchise",
  "jointVenture",
  "license",
]);
export const locationStatusSchema = z.enum([
  "planned",
  "open",
  "temporarilyClosed",
  "closed",
]);
export const locationSchema = z.strictObject({
  id: publicIdSchema,
  name: z.string(),
  marketId: publicIdSchema.nullable(),
  legalEntityId: publicIdSchema.nullable(),
  operatorId: publicIdSchema.nullable(),
  ownershipType: ownershipTypeSchema.nullable(),
  conceptVersion: z.string().nullable(),
  openedAt: z.iso.datetime({ offset: true }).nullable(),
  currency: z.string().nullable(),
  timeZone: z.string().nullable(),
  status: locationStatusSchema.nullable(),
});
export const locationCreateSchema = z.strictObject({
  name: nameSchema,
  marketId: publicIdSchema.nullable().optional(),
  legalEntityId: publicIdSchema.nullable().optional(),
  operatorId: publicIdSchema.nullable().optional(),
  ownershipType: ownershipTypeSchema.nullable().optional(),
  conceptVersion: z.string().max(100).nullable().optional(),
  openedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  currency: currencySchema,
  timeZone: optionalTextSchema,
  status: locationStatusSchema.nullable().optional(),
});
export const locationPatchSchema = locationCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required.",
);
const openingDaySchema = z.strictObject({
  closed: z.boolean(),
  openMinuteOfDay: z.number().int().min(0).max(1_439),
  closeMinuteOfDay: z.number().int().min(0).max(1_439),
});
const weeklyOpeningHoursSchema = openingDaySchema.extend({
  weekday: z.number().int().min(0).max(6),
});
const specialOpeningHoursSchema = openingDaySchema.extend({
  date: z.iso.date(),
});
export const openingHoursSchema = z.strictObject({
  mode: z.enum(["sameEveryDay", "byWeekday"]),
  weekly: z.array(weeklyOpeningHoursSchema).length(7),
  specials: z.array(specialOpeningHoursSchema).max(50),
});

export const categorySchema = z.strictObject({
  id: publicIdSchema,
  name: z.string(),
  parentCategoryId: publicIdSchema.nullable(),
  path: z.string(),
  depth: z.number().int().nonnegative(),
  inUse: z.boolean(),
  hasChildren: z.boolean(),
});
export const categoryCreateSchema = z.strictObject({
  name: nameSchema,
  parentCategoryId: publicIdSchema.nullable().optional(),
});
export const categoryPatchSchema = categoryCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field is required.",
);

export const unitSchema = z.strictObject({
  id: publicIdSchema,
  name: z.string(),
  inUse: z.boolean(),
});
export const unitCreateSchema = z.strictObject({ name: nameSchema });
export const unitPatchSchema = unitCreateSchema;
export const unitMergeSchema = z.strictObject({
  sourceUnitId: publicIdSchema,
  targetUnitId: publicIdSchema,
});
export const unitMergeResultSchema = z.strictObject({
  targetUnitId: publicIdSchema,
});

export const productStatusSchema = z.enum(["active", "archived"]);
const productUnitSchema = z.strictObject({
  id: publicIdSchema,
  name: z.string(),
  factorToDefault: z.number().positive(),
  isDefault: z.boolean(),
});
const productIngredientSchema = z.strictObject({
  productId: publicIdSchema,
  productName: z.string(),
  productStatus: productStatusSchema,
  quantity: z.number().positive(),
  unitId: publicIdSchema,
  unitName: z.string(),
  removable: z.boolean(),
});
export const productSchema = z.strictObject({
  id: publicIdSchema,
  name: z.string(),
  status: productStatusSchema,
  maxTemperatureCelsius: z.number().min(-100).max(100).nullable(),
  category: z
    .strictObject({ id: publicIdSchema, name: z.string() })
    .nullable(),
  categories: z
    .array(z.strictObject({ id: publicIdSchema, name: z.string() }))
    .min(1)
    .max(20),
  units: z.array(productUnitSchema).max(200),
  ingredients: z.array(productIngredientSchema).max(200),
  updatedAt: z.iso.datetime({ offset: true }),
  version: z.string().min(1).max(100),
});

const productUnitInputSchema = z.strictObject({
  unitId: publicIdSchema,
  factorToDefault: z.number().positive(),
  isDefault: z.boolean(),
});
const productUnitsInputSchema = z
  .array(productUnitInputSchema)
  .min(1)
  .max(200)
  .refine(
    (units) => units.filter((unit) => unit.isDefault).length === 1,
    "Exactly one default unit is required.",
  )
  .refine(
    (units) => new Set(units.map((unit) => unit.unitId)).size === units.length,
    "Each unit may only be supplied once.",
  );
const productIngredientInputSchema = z.strictObject({
  productId: publicIdSchema,
  quantity: z.number().positive(),
  unitId: publicIdSchema,
  removable: z.boolean().optional(),
});
const productIngredientsInputSchema = z
  .array(productIngredientInputSchema)
  .max(200)
  .refine(
    (ingredients) =>
      new Set(ingredients.map((ingredient) => ingredient.productId)).size ===
      ingredients.length,
    "Each ingredient product may only be supplied once.",
  );
const temperatureInputSchema = z
  .number()
  .min(-100)
  .max(100)
  .multipleOf(0.1)
  .nullable();
const productCategoryIdsInputSchema = z
  .array(publicIdSchema)
  .min(1)
  .max(20)
  .refine(
    (categoryIds) => new Set(categoryIds).size === categoryIds.length,
    "Each category may only be supplied once.",
  );
export const productCreateSchema = z
  .strictObject({
    name: nameSchema,
    categoryId: publicIdSchema.optional(),
    categoryIds: productCategoryIdsInputSchema.optional(),
    units: productUnitsInputSchema,
    ingredients: productIngredientsInputSchema,
    maxTemperatureCelsius: temperatureInputSchema.optional(),
  })
  .refine(
    (value) => Boolean(value.categoryId) !== Boolean(value.categoryIds),
    "Supply categoryIds or categoryId, not both.",
  );
export const productPatchSchema = z
  .strictObject({
    name: nameSchema.optional(),
    categoryId: publicIdSchema.optional(),
    categoryIds: productCategoryIdsInputSchema.optional(),
    units: productUnitsInputSchema.optional(),
    ingredients: productIngredientsInputSchema.optional(),
    maxTemperatureCelsius: temperatureInputSchema.optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one field is required.",
  )
  .refine(
    (value) => !(value.categoryId && value.categoryIds),
    "Supply categoryIds or categoryId, not both.",
  );
export const productPaginationQuerySchema = paginationQuerySchema.extend({
  status: productStatusSchema.optional(),
});

const MAX_DATA_RANGE_MS = 31 * 24 * 60 * 60 * 1_000;
const dateTimeSchema = z.iso.datetime({ offset: true });

function validDataRange(value: { from: string; to: string }) {
  const from = Date.parse(value.from);
  const to = Date.parse(value.to);
  return from < to && to - from <= MAX_DATA_RANGE_MS;
}

export const locationDateRangeQuerySchema = paginationQuerySchema
  .extend({
    locationId: publicIdSchema,
    from: dateTimeSchema,
    to: dateTimeSchema,
  })
  .refine(validDataRange, {
    message: "The range must be positive and no longer than 31 days.",
    path: ["to"],
  });

export const employeePaginationQuerySchema = paginationQuerySchema.extend({
  locationId: publicIdSchema,
});

export const salesOrderSchema = z.strictObject({
  id: publicIdSchema,
  locationId: publicIdSchema,
  occurredAt: dateTimeSchema,
  dayStart: dateTimeSchema,
  orderNumber: z.number(),
  revenueMinor: z.number(),
  itemCount: z.number(),
  paymentType: z.string(),
  department: z.string(),
  source: z.string(),
  currency: z.string(),
  updatedAt: dateTimeSchema,
});

export const salesLineSchema = z.strictObject({
  id: publicIdSchema,
  orderId: publicIdSchema,
  locationId: publicIdSchema,
  occurredAt: dateTimeSchema,
  sourceProductId: z.string(),
  productName: z.string(),
  quantity: z.number(),
  unitPriceMinor: z.number(),
  revenueMinor: z.number(),
  source: z.string(),
  clerkName: z.string().nullable(),
  currency: z.string(),
});

export const salesDailySchema = z.strictObject({
  id: publicIdSchema,
  locationId: publicIdSchema,
  dayStart: dateTimeSchema,
  date: z.iso.date(),
  revenueMinor: z.number(),
  orderCount: z.number(),
  itemCount: z.number(),
  currency: z.string(),
  updatedAt: dateTimeSchema,
});

export const employeeSummarySchema = z.strictObject({
  id: publicIdSchema,
  firstName: z.string(),
  lastName: z.string(),
  displayName: z.string(),
  imageUrl: z.string().nullable(),
  active: z.boolean(),
  updatedAt: dateTimeSchema,
});

export const employeeSchema = employeeSummarySchema.extend({
  locationIds: z.array(publicIdSchema).max(200),
});

export const scheduledShiftSchema = z.strictObject({
  id: publicIdSchema,
  employeeId: publicIdSchema,
  locationId: publicIdSchema,
  startsAt: dateTimeSchema,
  endsAt: dateTimeSchema,
  roleName: z.string().nullable(),
  updatedAt: dateTimeSchema,
});

export const employeeSyncSchema = z.strictObject({
  accepted: z.boolean(),
  state: z.enum(["queued", "alreadyQueued"]),
  retryAt: dateTimeSchema.nullable(),
});

export const problemSchema = z.strictObject({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  instance: z.string(),
  code: z.string(),
  requestId: z.string(),
  errors: z
    .array(
      z.strictObject({
        pointer: z.string(),
        code: z.string(),
      }),
    )
    .optional(),
});

export function dataResponseSchema<T extends z.ZodType>(data: T) {
  return z.strictObject({ data });
}

export function collectionResponseSchema<T extends z.ZodType>(item: T) {
  return z.strictObject({ data: z.array(item), page: pageSchema });
}

type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type ApiOperation<
  TParams extends z.ZodType = z.ZodType,
  TQuery extends z.ZodType = z.ZodType,
  TBody extends z.ZodType = z.ZodType,
  TResponse extends z.ZodType = z.ZodType,
> = {
  id: string;
  method: HttpMethod;
  path: string;
  summary: string;
  description: string;
  tags: readonly string[];
  permission: string | null;
  locationBehavior: string;
  authenticated: boolean;
  idempotencyRequired: boolean;
  ifMatchRequired?: boolean;
  successStatus: number;
  paramsSchema: TParams;
  querySchema: TQuery;
  bodySchema: TBody;
  responseSchema: TResponse;
};

export function defineOperation<
  TParams extends z.ZodType,
  TQuery extends z.ZodType,
  TBody extends z.ZodType,
  TResponse extends z.ZodType,
>(operation: ApiOperation<TParams, TQuery, TBody, TResponse>) {
  return operation;
}

const meResponseSchema = dataResponseSchema(meSchema);
const marketResponseSchema = dataResponseSchema(marketSchema);
const marketCollectionSchema = collectionResponseSchema(marketSchema);
const legalEntityResponseSchema = dataResponseSchema(legalEntitySchema);
const legalEntityCollectionSchema = collectionResponseSchema(legalEntitySchema);
const operatorResponseSchema = dataResponseSchema(operatorSchema);
const operatorCollectionSchema = collectionResponseSchema(operatorSchema);
const locationResponseSchema = dataResponseSchema(locationSchema);
const locationCollectionSchema = collectionResponseSchema(locationSchema);
const openingHoursResponseSchema = dataResponseSchema(openingHoursSchema);
const categoryResponseSchema = dataResponseSchema(categorySchema);
const categoryCollectionSchema = collectionResponseSchema(categorySchema);
const unitResponseSchema = dataResponseSchema(unitSchema);
const unitCollectionSchema = collectionResponseSchema(unitSchema);
const unitMergeResponseSchema = dataResponseSchema(unitMergeResultSchema);
const productResponseSchema = dataResponseSchema(productSchema);
const productCollectionSchema = collectionResponseSchema(productSchema);
const salesOrderResponseSchema = dataResponseSchema(salesOrderSchema);
const salesOrderCollectionSchema = collectionResponseSchema(salesOrderSchema);
const salesLineResponseSchema = dataResponseSchema(salesLineSchema);
const salesLineCollectionSchema = collectionResponseSchema(salesLineSchema);
const salesDailyResponseSchema = dataResponseSchema(salesDailySchema);
const salesDailyCollectionSchema = collectionResponseSchema(salesDailySchema);
const employeeResponseSchema = dataResponseSchema(employeeSchema);
const employeeCollectionSchema = collectionResponseSchema(employeeSummarySchema);
const scheduledShiftResponseSchema = dataResponseSchema(scheduledShiftSchema);
const scheduledShiftCollectionSchema = collectionResponseSchema(scheduledShiftSchema);
const employeeSyncResponseSchema = dataResponseSchema(employeeSyncSchema);

export const operations = {
  me: defineOperation({
    id: "getCapabilities",
    method: "GET",
    path: "/api/v1/me",
    summary: "Get API key capabilities",
    description: "Returns the current key, organization, effective permissions, and location scope.",
    tags: ["Capabilities"],
    permission: null,
    locationBehavior: "Returns the effective location scope.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: noInputSchema,
    querySchema: noInputSchema,
    bodySchema: noInputSchema,
    responseSchema: meResponseSchema,
  }),
  marketsList: defineOperation({
    id: "listMarkets",
    method: "GET",
    path: "/api/v1/markets",
    summary: "List markets",
    description: "Returns a complete cursor page of organization markets.",
    tags: ["Markets"],
    permission: "locations.manage",
    locationBehavior: "Organization-wide master data.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: noInputSchema,
    querySchema: paginationQuerySchema,
    bodySchema: noInputSchema,
    responseSchema: marketCollectionSchema,
  }),
  marketsCreate: defineOperation({
    id: "createMarket",
    method: "POST",
    path: "/api/v1/markets",
    summary: "Create a market",
    description: "Creates one market. Retries with the same idempotency key return the first response.",
    tags: ["Markets"],
    permission: "locations.manage",
    locationBehavior: "Organization-wide master data. Writes require all-location access.",
    authenticated: true,
    idempotencyRequired: true,
    successStatus: 201,
    paramsSchema: noInputSchema,
    querySchema: noInputSchema,
    bodySchema: marketCreateSchema,
    responseSchema: marketResponseSchema,
  }),
  marketsGet: defineOperation({
    id: "getMarket",
    method: "GET",
    path: "/api/v1/markets/{id}",
    summary: "Get a market",
    description: "Returns one organization-owned market.",
    tags: ["Markets"],
    permission: "locations.manage",
    locationBehavior: "Organization-wide master data.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: noInputSchema,
    responseSchema: marketResponseSchema,
  }),
  marketsPatch: defineOperation({
    id: "updateMarket",
    method: "PATCH",
    path: "/api/v1/markets/{id}",
    summary: "Update a market",
    description: "Updates supplied fields and leaves omitted fields unchanged.",
    tags: ["Markets"],
    permission: "locations.manage",
    locationBehavior: "Organization-wide master data. Writes require all-location access.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: marketPatchSchema,
    responseSchema: marketResponseSchema,
  }),
  marketsDelete: defineOperation({
    id: "deleteMarket",
    method: "DELETE",
    path: "/api/v1/markets/{id}",
    summary: "Delete a market",
    description: "Deletes an unused market.",
    tags: ["Markets"],
    permission: "locations.manage",
    locationBehavior: "Organization-wide master data. Writes require all-location access.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 204,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: noInputSchema,
    responseSchema: z.null(),
  }),
  legalEntitiesList: defineOperation({
    id: "listLegalEntities",
    method: "GET",
    path: "/api/v1/legal-entities",
    summary: "List legal entities",
    description: "Returns a complete cursor page of legal entities.",
    tags: ["Legal entities"],
    permission: "locations.manage",
    locationBehavior: "Organization-wide master data.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: noInputSchema,
    querySchema: paginationQuerySchema,
    bodySchema: noInputSchema,
    responseSchema: legalEntityCollectionSchema,
  }),
  legalEntitiesCreate: defineOperation({
    id: "createLegalEntity",
    method: "POST",
    path: "/api/v1/legal-entities",
    summary: "Create a legal entity",
    description: "Creates one legal entity idempotently.",
    tags: ["Legal entities"],
    permission: "locations.manage",
    locationBehavior: "Organization-wide master data. Writes require all-location access.",
    authenticated: true,
    idempotencyRequired: true,
    successStatus: 201,
    paramsSchema: noInputSchema,
    querySchema: noInputSchema,
    bodySchema: legalEntityCreateSchema,
    responseSchema: legalEntityResponseSchema,
  }),
  legalEntitiesGet: defineOperation({
    id: "getLegalEntity",
    method: "GET",
    path: "/api/v1/legal-entities/{id}",
    summary: "Get a legal entity",
    description: "Returns one organization-owned legal entity.",
    tags: ["Legal entities"],
    permission: "locations.manage",
    locationBehavior: "Organization-wide master data.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: noInputSchema,
    responseSchema: legalEntityResponseSchema,
  }),
  legalEntitiesPatch: defineOperation({
    id: "updateLegalEntity",
    method: "PATCH",
    path: "/api/v1/legal-entities/{id}",
    summary: "Update a legal entity",
    description: "Updates supplied fields and leaves omitted fields unchanged.",
    tags: ["Legal entities"],
    permission: "locations.manage",
    locationBehavior: "Organization-wide master data. Writes require all-location access.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: legalEntityPatchSchema,
    responseSchema: legalEntityResponseSchema,
  }),
  legalEntitiesDelete: defineOperation({
    id: "deleteLegalEntity",
    method: "DELETE",
    path: "/api/v1/legal-entities/{id}",
    summary: "Delete a legal entity",
    description: "Deletes an unused legal entity.",
    tags: ["Legal entities"],
    permission: "locations.manage",
    locationBehavior: "Organization-wide master data. Writes require all-location access.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 204,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: noInputSchema,
    responseSchema: z.null(),
  }),
  operatorsList: defineOperation({
    id: "listOperators",
    method: "GET",
    path: "/api/v1/operators",
    summary: "List operators",
    description: "Returns a complete cursor page of operators.",
    tags: ["Operators"],
    permission: "locations.manage",
    locationBehavior: "Organization-wide master data.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: noInputSchema,
    querySchema: paginationQuerySchema,
    bodySchema: noInputSchema,
    responseSchema: operatorCollectionSchema,
  }),
  operatorsCreate: defineOperation({
    id: "createOperator",
    method: "POST",
    path: "/api/v1/operators",
    summary: "Create an operator",
    description: "Creates one operator idempotently.",
    tags: ["Operators"],
    permission: "locations.manage",
    locationBehavior: "Organization-wide master data. Writes require all-location access.",
    authenticated: true,
    idempotencyRequired: true,
    successStatus: 201,
    paramsSchema: noInputSchema,
    querySchema: noInputSchema,
    bodySchema: operatorCreateSchema,
    responseSchema: operatorResponseSchema,
  }),
  operatorsGet: defineOperation({
    id: "getOperator",
    method: "GET",
    path: "/api/v1/operators/{id}",
    summary: "Get an operator",
    description: "Returns one organization-owned operator.",
    tags: ["Operators"],
    permission: "locations.manage",
    locationBehavior: "Organization-wide master data.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: noInputSchema,
    responseSchema: operatorResponseSchema,
  }),
  operatorsPatch: defineOperation({
    id: "updateOperator",
    method: "PATCH",
    path: "/api/v1/operators/{id}",
    summary: "Update an operator",
    description: "Updates supplied fields and leaves omitted fields unchanged.",
    tags: ["Operators"],
    permission: "locations.manage",
    locationBehavior: "Organization-wide master data. Writes require all-location access.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: operatorPatchSchema,
    responseSchema: operatorResponseSchema,
  }),
  operatorsDelete: defineOperation({
    id: "deleteOperator",
    method: "DELETE",
    path: "/api/v1/operators/{id}",
    summary: "Delete an operator",
    description: "Deletes an unused operator and clears matching human location policies.",
    tags: ["Operators"],
    permission: "locations.manage",
    locationBehavior: "Organization-wide master data. Writes require all-location access.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 204,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: noInputSchema,
    responseSchema: z.null(),
  }),
  locationsList: defineOperation({
    id: "listLocations",
    method: "GET",
    path: "/api/v1/locations",
    summary: "List locations",
    description: "Returns a cursor page filtered to the API key's effective location scope.",
    tags: ["Locations"],
    permission: "locations.manage",
    locationBehavior: "Only locations inside the current key policy are returned.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: noInputSchema,
    querySchema: paginationQuerySchema,
    bodySchema: noInputSchema,
    responseSchema: locationCollectionSchema,
  }),
  locationsCreate: defineOperation({
    id: "createLocation",
    method: "POST",
    path: "/api/v1/locations",
    summary: "Create a location",
    description: "Creates one location idempotently. The key must have access to all locations.",
    tags: ["Locations"],
    permission: "locations.manage",
    locationBehavior: "Requires all-location access because creation expands organization data.",
    authenticated: true,
    idempotencyRequired: true,
    successStatus: 201,
    paramsSchema: noInputSchema,
    querySchema: noInputSchema,
    bodySchema: locationCreateSchema,
    responseSchema: locationResponseSchema,
  }),
  locationsGet: defineOperation({
    id: "getLocation",
    method: "GET",
    path: "/api/v1/locations/{id}",
    summary: "Get a location",
    description: "Returns one organization-owned location inside the key's location scope.",
    tags: ["Locations"],
    permission: "locations.manage",
    locationBehavior: "The location must be inside the current key policy.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: noInputSchema,
    responseSchema: locationResponseSchema,
  }),
  locationsPatch: defineOperation({
    id: "updateLocation",
    method: "PATCH",
    path: "/api/v1/locations/{id}",
    summary: "Update a location",
    description: "Updates supplied fields and leaves omitted fields unchanged.",
    tags: ["Locations"],
    permission: "locations.manage",
    locationBehavior: "The location must be inside the current key policy.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: locationPatchSchema,
    responseSchema: locationResponseSchema,
  }),
  locationsDelete: defineOperation({
    id: "deleteLocation",
    method: "DELETE",
    path: "/api/v1/locations/{id}",
    summary: "Delete a location",
    description: "Deletes a location only when no operational history, stock, employees, kiosk accounts, or integrations depend on it.",
    tags: ["Locations"],
    permission: "locations.manage",
    locationBehavior: "The location must be inside the current key policy.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 204,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: noInputSchema,
    responseSchema: z.null(),
  }),
  locationsOpeningHoursGet: defineOperation({
    id: "getLocationOpeningHours",
    method: "GET",
    path: "/api/v1/locations/{id}/opening-hours",
    summary: "Get location opening hours",
    description: "Returns the complete weekly and special-date opening-hours configuration.",
    tags: ["Locations"],
    permission: "locations.manage",
    locationBehavior: "The location must be inside the current key policy.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: noInputSchema,
    responseSchema: openingHoursResponseSchema,
  }),
  locationsOpeningHoursPut: defineOperation({
    id: "replaceLocationOpeningHours",
    method: "PUT",
    path: "/api/v1/locations/{id}/opening-hours",
    summary: "Replace location opening hours",
    description: "Replaces the full weekly and special-date configuration.",
    tags: ["Locations"],
    permission: "locations.manage",
    locationBehavior: "The location must be inside the current key policy.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: openingHoursSchema,
    responseSchema: openingHoursResponseSchema,
  }),
  categoriesList: defineOperation({
    id: "listCategories",
    method: "GET",
    path: "/api/v1/categories",
    summary: "List categories",
    description: "Returns a cursor page of organization categories with hierarchy metadata.",
    tags: ["Categories"],
    permission: "catalog.manage",
    locationBehavior: "Catalog data is organization-wide and is not filtered by location policy.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: noInputSchema,
    querySchema: paginationQuerySchema,
    bodySchema: noInputSchema,
    responseSchema: categoryCollectionSchema,
  }),
  categoriesCreate: defineOperation({
    id: "createCategory",
    method: "POST",
    path: "/api/v1/categories",
    summary: "Create a category",
    description: "Creates a root category or a child of an existing category idempotently.",
    tags: ["Categories"],
    permission: "catalog.manage",
    locationBehavior: "Catalog data is organization-wide and is not filtered by location policy.",
    authenticated: true,
    idempotencyRequired: true,
    successStatus: 201,
    paramsSchema: noInputSchema,
    querySchema: noInputSchema,
    bodySchema: categoryCreateSchema,
    responseSchema: categoryResponseSchema,
  }),
  categoriesGet: defineOperation({
    id: "getCategory",
    method: "GET",
    path: "/api/v1/categories/{id}",
    summary: "Get a category",
    description: "Returns one organization-owned category with hierarchy metadata.",
    tags: ["Categories"],
    permission: "catalog.manage",
    locationBehavior: "Catalog data is organization-wide and is not filtered by location policy.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: noInputSchema,
    responseSchema: categoryResponseSchema,
  }),
  categoriesPatch: defineOperation({
    id: "updateCategory",
    method: "PATCH",
    path: "/api/v1/categories/{id}",
    summary: "Update a category",
    description: "Renames or moves a category while preserving hierarchy rules.",
    tags: ["Categories"],
    permission: "catalog.manage",
    locationBehavior: "Catalog data is organization-wide and is not filtered by location policy.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: categoryPatchSchema,
    responseSchema: categoryResponseSchema,
  }),
  categoriesDelete: defineOperation({
    id: "deleteCategory",
    method: "DELETE",
    path: "/api/v1/categories/{id}",
    summary: "Delete a category",
    description: "Deletes a category only when hierarchy and dependency checks allow it.",
    tags: ["Categories"],
    permission: "catalog.manage",
    locationBehavior: "Catalog data is organization-wide and is not filtered by location policy.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 204,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: noInputSchema,
    responseSchema: z.null(),
  }),
  unitsList: defineOperation({
    id: "listUnits",
    method: "GET",
    path: "/api/v1/units",
    summary: "List units",
    description: "Returns a cursor page of organization units.",
    tags: ["Units"],
    permission: "catalog.manage",
    locationBehavior: "Catalog data is organization-wide and is not filtered by location policy.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: noInputSchema,
    querySchema: paginationQuerySchema,
    bodySchema: noInputSchema,
    responseSchema: unitCollectionSchema,
  }),
  unitsCreate: defineOperation({
    id: "createUnit",
    method: "POST",
    path: "/api/v1/units",
    summary: "Create a unit",
    description: "Creates one unit idempotently.",
    tags: ["Units"],
    permission: "catalog.manage",
    locationBehavior: "Catalog data is organization-wide and is not filtered by location policy.",
    authenticated: true,
    idempotencyRequired: true,
    successStatus: 201,
    paramsSchema: noInputSchema,
    querySchema: noInputSchema,
    bodySchema: unitCreateSchema,
    responseSchema: unitResponseSchema,
  }),
  unitsGet: defineOperation({
    id: "getUnit",
    method: "GET",
    path: "/api/v1/units/{id}",
    summary: "Get a unit",
    description: "Returns one organization-owned unit.",
    tags: ["Units"],
    permission: "catalog.manage",
    locationBehavior: "Catalog data is organization-wide and is not filtered by location policy.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: noInputSchema,
    responseSchema: unitResponseSchema,
  }),
  unitsPatch: defineOperation({
    id: "updateUnit",
    method: "PATCH",
    path: "/api/v1/units/{id}",
    summary: "Update a unit",
    description: "Renames one organization-owned unit.",
    tags: ["Units"],
    permission: "catalog.manage",
    locationBehavior: "Catalog data is organization-wide and is not filtered by location policy.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: unitPatchSchema,
    responseSchema: unitResponseSchema,
  }),
  unitsDelete: defineOperation({
    id: "deleteUnit",
    method: "DELETE",
    path: "/api/v1/units/{id}",
    summary: "Delete a unit",
    description: "Deletes a unit only when no catalog data depends on it.",
    tags: ["Units"],
    permission: "catalog.manage",
    locationBehavior: "Catalog data is organization-wide and is not filtered by location policy.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 204,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: noInputSchema,
    responseSchema: z.null(),
  }),
  unitsMerge: defineOperation({
    id: "mergeUnits",
    method: "POST",
    path: "/api/v1/units/merge",
    summary: "Merge units",
    description: "Replaces every use of the source unit with the target unit in one idempotent transaction.",
    tags: ["Units"],
    permission: "catalog.manage",
    locationBehavior: "Catalog data is organization-wide and is not filtered by location policy.",
    authenticated: true,
    idempotencyRequired: true,
    successStatus: 200,
    paramsSchema: noInputSchema,
    querySchema: noInputSchema,
    bodySchema: unitMergeSchema,
    responseSchema: unitMergeResponseSchema,
  }),
  productsList: defineOperation({
    id: "listProducts",
    method: "GET",
    path: "/api/v1/products",
    summary: "List products",
    description: "Returns a cursor page of products, optionally filtered by lifecycle status.",
    tags: ["Products"],
    permission: "catalog.manage",
    locationBehavior: "Catalog data is organization-wide and is not filtered by location policy.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: noInputSchema,
    querySchema: productPaginationQuerySchema,
    bodySchema: noInputSchema,
    responseSchema: productCollectionSchema,
  }),
  productsCreate: defineOperation({
    id: "createProduct",
    method: "POST",
    path: "/api/v1/products",
    summary: "Create a product",
    description: "Creates a product, units, and recipe relationships idempotently.",
    tags: ["Products"],
    permission: "catalog.manage",
    locationBehavior: "Catalog data is organization-wide and is not filtered by location policy.",
    authenticated: true,
    idempotencyRequired: true,
    successStatus: 201,
    paramsSchema: noInputSchema,
    querySchema: noInputSchema,
    bodySchema: productCreateSchema,
    responseSchema: productResponseSchema,
  }),
  productsGet: defineOperation({
    id: "getProduct",
    method: "GET",
    path: "/api/v1/products/{id}",
    summary: "Get a product",
    description: "Returns one organization-owned product with units and recipe relationships.",
    tags: ["Products"],
    permission: "catalog.manage",
    locationBehavior: "Catalog data is organization-wide and is not filtered by location policy.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: noInputSchema,
    responseSchema: productResponseSchema,
  }),
  productsPatch: defineOperation({
    id: "updateProduct",
    method: "PATCH",
    path: "/api/v1/products/{id}",
    summary: "Update a product",
    description: "Updates supplied fields while preserving stock conversion and recipe-cycle rules.",
    tags: ["Products"],
    permission: "catalog.manage",
    locationBehavior: "Catalog data is organization-wide and is not filtered by location policy.",
    authenticated: true,
    idempotencyRequired: false,
    ifMatchRequired: true,
    successStatus: 200,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: productPatchSchema,
    responseSchema: productResponseSchema,
  }),
  productsArchive: defineOperation({
    id: "archiveProduct",
    method: "POST",
    path: "/api/v1/products/{id}/archive",
    summary: "Archive a product",
    description: "Archives a product and schedules retention cleanup idempotently.",
    tags: ["Products"],
    permission: "catalog.manage",
    locationBehavior: "Catalog data is organization-wide and is not filtered by location policy.",
    authenticated: true,
    idempotencyRequired: true,
    ifMatchRequired: true,
    successStatus: 200,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: noInputSchema,
    responseSchema: productResponseSchema,
  }),
  productsRestore: defineOperation({
    id: "restoreProduct",
    method: "POST",
    path: "/api/v1/products/{id}/restore",
    summary: "Restore a product",
    description: "Restores an archived product idempotently.",
    tags: ["Products"],
    permission: "catalog.manage",
    locationBehavior: "Catalog data is organization-wide and is not filtered by location policy.",
    authenticated: true,
    idempotencyRequired: true,
    ifMatchRequired: true,
    successStatus: 200,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: noInputSchema,
    responseSchema: productResponseSchema,
  }),
  productsDelete: defineOperation({
    id: "deleteProduct",
    method: "DELETE",
    path: "/api/v1/products/{id}",
    summary: "Delete a product",
    description: "Permanently deletes only an archived product that passes every dependency check.",
    tags: ["Products"],
    permission: "catalog.manage",
    locationBehavior: "Catalog data is organization-wide and is not filtered by location policy.",
    authenticated: true,
    idempotencyRequired: false,
    ifMatchRequired: true,
    successStatus: 204,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: noInputSchema,
    responseSchema: z.null(),
  }),
  salesDailyList: defineOperation({
    id: "listDailySales",
    method: "GET",
    path: "/api/v1/sales/daily",
    summary: "List daily sales",
    description: "Returns stored daily sales aggregates for one location and a range of at most 31 days. The range includes `from` and excludes `to`. Revenue uses integer minor units. Anonymous-granularity roles cannot use this resource.",
    tags: ["Sales"],
    permission: "sales.viewAggregate",
    locationBehavior: "The requested location must be inside the current key policy.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: noInputSchema,
    querySchema: locationDateRangeQuerySchema,
    bodySchema: noInputSchema,
    responseSchema: salesDailyCollectionSchema,
  }),
  salesDailyGet: defineOperation({
    id: "getDailySales",
    method: "GET",
    path: "/api/v1/sales/daily/{id}",
    summary: "Get daily sales",
    description: "Returns one stored daily sales aggregate. Revenue uses integer minor units. Anonymous-granularity roles cannot use this resource.",
    tags: ["Sales"],
    permission: "sales.viewAggregate",
    locationBehavior: "The aggregate's location must be inside the current key policy.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: noInputSchema,
    responseSchema: salesDailyResponseSchema,
  }),
  salesOrdersList: defineOperation({
    id: "listSalesOrders",
    method: "GET",
    path: "/api/v1/sales/orders",
    summary: "List sales orders",
    description: "Returns stored orders starting within the requested range of at most 31 days. The range includes `from` and excludes `to`. Money uses integer minor units. Detailed role granularity is required.",
    tags: ["Sales"],
    permission: "sales.viewDetail",
    locationBehavior: "The requested location must be inside the current key policy.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: noInputSchema,
    querySchema: locationDateRangeQuerySchema,
    bodySchema: noInputSchema,
    responseSchema: salesOrderCollectionSchema,
  }),
  salesOrdersGet: defineOperation({
    id: "getSalesOrder",
    method: "GET",
    path: "/api/v1/sales/orders/{id}",
    summary: "Get a sales order",
    description: "Returns one stored sales order. Money uses integer minor units. Detailed role granularity is required.",
    tags: ["Sales"],
    permission: "sales.viewDetail",
    locationBehavior: "The order's location must be inside the current key policy.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: noInputSchema,
    responseSchema: salesOrderResponseSchema,
  }),
  salesLinesList: defineOperation({
    id: "listSalesLines",
    method: "GET",
    path: "/api/v1/sales/lines",
    summary: "List sales lines",
    description: "Returns stored sales lines starting within the requested range of at most 31 days. The range includes `from` and excludes `to`. Money uses integer minor units. Detailed role granularity is required.",
    tags: ["Sales"],
    permission: "sales.viewDetail",
    locationBehavior: "The requested location must be inside the current key policy.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: noInputSchema,
    querySchema: locationDateRangeQuerySchema,
    bodySchema: noInputSchema,
    responseSchema: salesLineCollectionSchema,
  }),
  salesLinesGet: defineOperation({
    id: "getSalesLine",
    method: "GET",
    path: "/api/v1/sales/lines/{id}",
    summary: "Get a sales line",
    description: "Returns one stored sales line. Money uses integer minor units. Detailed role granularity is required.",
    tags: ["Sales"],
    permission: "sales.viewDetail",
    locationBehavior: "The line's location must be inside the current key policy.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: noInputSchema,
    responseSchema: salesLineResponseSchema,
  }),
  employeesList: defineOperation({
    id: "listEmployees",
    method: "GET",
    path: "/api/v1/employees",
    summary: "List employees",
    description: "Returns cached Workfeed-owned employees assigned to one location. Detailed role granularity is required.",
    tags: ["Employees"],
    permission: "employees.directory",
    locationBehavior: "The requested location must be inside the current key policy.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: noInputSchema,
    querySchema: employeePaginationQuerySchema,
    bodySchema: noInputSchema,
    responseSchema: employeeCollectionSchema,
  }),
  employeesGet: defineOperation({
    id: "getEmployee",
    method: "GET",
    path: "/api/v1/employees/{id}",
    summary: "Get an employee",
    description: "Returns one cached Workfeed-owned employee and the locations visible to the current key. Detailed role granularity is required.",
    tags: ["Employees"],
    permission: "employees.directory",
    locationBehavior: "Restricted keys can read an employee assigned to at least one accessible location.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: noInputSchema,
    responseSchema: employeeResponseSchema,
  }),
  employeesSync: defineOperation({
    id: "syncEmployees",
    method: "POST",
    path: "/api/v1/employees/sync",
    summary: "Request an employee sync",
    description: "Queues an idempotent Workfeed employee sync. A successful employee sync queues the cached shift refresh. This command never returns provider payloads.",
    tags: ["Employees"],
    permission: "integrations.manage",
    locationBehavior: "Requires all-location access because the sync refreshes the organization.",
    authenticated: true,
    idempotencyRequired: true,
    successStatus: 202,
    paramsSchema: noInputSchema,
    querySchema: noInputSchema,
    bodySchema: noInputSchema,
    responseSchema: employeeSyncResponseSchema,
  }),
  scheduledShiftsList: defineOperation({
    id: "listScheduledShifts",
    method: "GET",
    path: "/api/v1/scheduled-shifts",
    summary: "List scheduled shifts",
    description: "Returns cached Workfeed-owned shifts starting within the requested range of at most 31 days. The range includes `from` and excludes `to`. Detailed role granularity is required.",
    tags: ["Employees"],
    permission: "employees.schedule",
    locationBehavior: "The requested location must be inside the current key policy.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: noInputSchema,
    querySchema: locationDateRangeQuerySchema,
    bodySchema: noInputSchema,
    responseSchema: scheduledShiftCollectionSchema,
  }),
  scheduledShiftsGet: defineOperation({
    id: "getScheduledShift",
    method: "GET",
    path: "/api/v1/scheduled-shifts/{id}",
    summary: "Get a scheduled shift",
    description: "Returns one cached Workfeed-owned shift. Detailed role granularity is required.",
    tags: ["Employees"],
    permission: "employees.schedule",
    locationBehavior: "The shift's location must be inside the current key policy.",
    authenticated: true,
    idempotencyRequired: false,
    successStatus: 200,
    paramsSchema: pathIdSchema,
    querySchema: noInputSchema,
    bodySchema: noInputSchema,
    responseSchema: scheduledShiftResponseSchema,
  }),
} as const;

export const operationList: readonly ApiOperation[] = Object.values(operations);

export type OperationInput<T extends ApiOperation> = {
  params: z.output<T["paramsSchema"]>;
  query: z.output<T["querySchema"]>;
  body: z.output<T["bodySchema"]>;
  idempotencyKey: string | null;
  ifMatch: string | null;
  requestHash: string;
};

export type OperationResponse<T extends ApiOperation> = z.output<
  T["responseSchema"]
>;
