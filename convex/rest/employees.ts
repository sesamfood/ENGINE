import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { mutation, query } from "../_generated/server";
import {
  requireAllLocationAccess,
  requireIntegrationManager,
  requireLocationAccess,
  requirePermission,
  type OrganizationAuth,
} from "../lib/auth";
import { runIdempotent } from "../lib/idempotency";
import { requestWorkfeedEmployeeSync } from "../lib/workfeedSyncRequest";
import { requireRestApiMutation } from "./lib";

const MAX_PAGE_SIZE = 100;
const MAX_EMPLOYEE_LOCATIONS = 200;
const MAX_RANGE_MS = 31 * 24 * 60 * 60 * 1_000;

const employeeSummaryValidator = v.object({
  id: v.id("employees"),
  firstName: v.string(),
  lastName: v.string(),
  displayName: v.string(),
  imageUrl: v.union(v.string(), v.null()),
  active: v.boolean(),
  updatedAt: v.string(),
});

const employeeValidator = v.object({
  ...employeeSummaryValidator.fields,
  locationIds: v.array(v.id("locations")),
});

const scheduledShiftValidator = v.object({
  id: v.id("scheduledShifts"),
  employeeId: v.id("employees"),
  locationId: v.id("locations"),
  startsAt: v.string(),
  endsAt: v.string(),
  roleName: v.union(v.string(), v.null()),
  updatedAt: v.string(),
});

const idempotentResponseValidator = v.object({
  status: v.number(),
  json: v.string(),
  replayed: v.boolean(),
});

function restError(code: string, message: string): never {
  throw new ConvexError({ code, message });
}

function requireApiKeyPrincipal(auth: OrganizationAuth) {
  if (auth.principalKind !== "apiKey" || !auth.apiKeyId) {
    restError("api_key_required", "An API key is required for this operation.");
  }
}

function requireDetailedData(auth: OrganizationAuth) {
  if (auth.granularity !== "detail") {
    restError(
      "forbidden",
      "The API key role does not allow employee-level data.",
    );
  }
}

async function requireEmployeeDirectory(ctx: QueryCtx) {
  const auth = await requirePermission(ctx, "employees.directory");
  requireApiKeyPrincipal(auth);
  requireDetailedData(auth);
  return auth;
}

async function requireScheduledShiftAccess(ctx: QueryCtx) {
  const auth = await requirePermission(ctx, "employees.schedule");
  requireApiKeyPrincipal(auth);
  requireDetailedData(auth);
  return auth;
}

function requirePageSize(numItems: number) {
  if (!Number.isInteger(numItems) || numItems < 1 || numItems > MAX_PAGE_SIZE) {
    restError(
      "page_size_invalid",
      "Page size must be an integer between 1 and 100.",
    );
  }
}

function requireRange(from: number, to: number) {
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from >= to ||
    to - from > MAX_RANGE_MS
  ) {
    restError(
      "shift_range_invalid",
      "The shift range must be positive and no longer than 31 days.",
    );
  }
}

async function readLocation(
  ctx: QueryCtx,
  auth: OrganizationAuth,
  publicId: string,
) {
  const id = ctx.db.normalizeId("locations", publicId);
  const location = id ? await ctx.db.get("locations", id) : null;
  if (!location || location.organizationId !== auth.organizationId) {
    restError("location_not_found", "Location was not found.");
  }
  requireLocationAccess(auth, location._id);
  return location;
}

function employeeSummaryDto(employee: Doc<"employees">) {
  return {
    id: employee._id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    displayName: employee.displayName,
    imageUrl: employee.imageUrl,
    active: employee.active,
    updatedAt: new Date(employee.updatedAt).toISOString(),
  };
}

function scheduledShiftDto(shift: Doc<"scheduledShifts">) {
  return {
    id: shift._id,
    employeeId: shift.employeeId,
    locationId: shift.locationId,
    startsAt: new Date(shift.startsAt).toISOString(),
    endsAt: new Date(shift.endsAt).toISOString(),
    roleName: shift.roleName,
    updatedAt: new Date(shift.updatedAt).toISOString(),
  };
}

export const list = query({
  args: {
    locationId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(employeeSummaryValidator),
  handler: async (ctx, args) => {
    const auth = await requireEmployeeDirectory(ctx);
    requirePageSize(args.paginationOpts.numItems);
    const location = await readLocation(ctx, auth, args.locationId);
    const result = await ctx.db
      .query("employeeLocationAssignments")
      .withIndex("by_organizationId_and_locationId_and_employeeId", (q) =>
        q
          .eq("organizationId", auth.organizationId)
          .eq("locationId", location._id),
      )
      .paginate(args.paginationOpts);
    const employees = await Promise.all(
      result.page.map((assignment) =>
        ctx.db.get("employees", assignment.employeeId),
      ),
    );
    return {
      ...result,
      page: employees.flatMap((employee) =>
        employee?.organizationId === auth.organizationId
          ? [employeeSummaryDto(employee)]
          : [],
      ),
    };
  },
});

export const get = query({
  args: { id: v.string() },
  returns: v.union(employeeValidator, v.null()),
  handler: async (ctx, args) => {
    const auth = await requireEmployeeDirectory(ctx);
    const id = ctx.db.normalizeId("employees", args.id);
    const employee = id ? await ctx.db.get("employees", id) : null;
    if (!employee || employee.organizationId !== auth.organizationId) return null;
    const assignments = await ctx.db
      .query("employeeLocationAssignments")
      .withIndex("by_organizationId_and_employeeId", (q) =>
        q
          .eq("organizationId", auth.organizationId)
          .eq("employeeId", employee._id),
      )
      .take(MAX_EMPLOYEE_LOCATIONS + 1);
    if (assignments.length > MAX_EMPLOYEE_LOCATIONS) {
      restError(
        "too_many_resources",
        "The employee has too many location assignments to expose safely.",
      );
    }
    const locationIds = assignments
      .map((assignment) => assignment.locationId)
      .filter(
        (locationId) =>
          auth.locationScope.all || auth.locationScope.ids.has(locationId),
      );
    if (!auth.locationScope.all && locationIds.length === 0) return null;
    return { ...employeeSummaryDto(employee), locationIds };
  },
});

export const listScheduledShifts = query({
  args: {
    locationId: v.string(),
    from: v.number(),
    to: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(scheduledShiftValidator),
  handler: async (ctx, args) => {
    const auth = await requireScheduledShiftAccess(ctx);
    requirePageSize(args.paginationOpts.numItems);
    requireRange(args.from, args.to);
    const location = await readLocation(ctx, auth, args.locationId);
    const result = await ctx.db
      .query("scheduledShifts")
      .withIndex("by_organizationId_and_locationId_and_startsAt", (q) =>
        q
          .eq("organizationId", auth.organizationId)
          .eq("locationId", location._id)
          .gte("startsAt", args.from)
          .lt("startsAt", args.to),
      )
      .order("asc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map(scheduledShiftDto),
    };
  },
});

export const getScheduledShift = query({
  args: { id: v.string() },
  returns: v.union(scheduledShiftValidator, v.null()),
  handler: async (ctx, args) => {
    const auth = await requireScheduledShiftAccess(ctx);
    const id = ctx.db.normalizeId("scheduledShifts", args.id);
    const shift = id ? await ctx.db.get("scheduledShifts", id) : null;
    if (!shift || shift.organizationId !== auth.organizationId) return null;
    requireLocationAccess(auth, shift.locationId);
    return scheduledShiftDto(shift);
  },
});

export const requestSync = mutation({
  args: {
    idempotencyKey: v.string(),
    requestHash: v.string(),
  },
  returns: idempotentResponseValidator,
  handler: async (ctx, args) => {
    const auth = await requireIntegrationManager(ctx);
    requireApiKeyPrincipal(auth);
    requireAllLocationAccess(auth);
    await requireRestApiMutation(ctx, auth);
    return await runIdempotent(
      ctx,
      auth,
      {
        operationId: "employees.sync",
        key: args.idempotencyKey,
        requestHash: args.requestHash,
      },
      async () => {
        const result = await requestWorkfeedEmployeeSync(
          ctx,
          auth.organizationId,
        );
        if (result.state === "rateLimited") {
          throw new ConvexError({
            code: "workfeed_sync_rate_limited",
            message: "The employee sync rate limit has been exceeded.",
            retryAfterMs:
              result.retryAt === null
                ? 60_000
                : Math.max(1_000, result.retryAt - Date.now()),
          });
        }
        if (result.state === "unavailable") {
          restError(
            "workfeed_sync_unavailable",
            "The Workfeed integration is not enabled.",
          );
        }
        return {
          status: 202,
          json: JSON.stringify({
            data: {
              accepted: result.accepted,
              state: result.state,
              retryAt: null,
            },
          }),
        };
      },
    );
  },
});
