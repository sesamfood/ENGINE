import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  requireEmployeeViewer,
  requireKioskDestination,
  requireLocationAccess,
  requireNormalOrganization,
  requireOrganization,
  requireOrganizationAdmin,
} from "./lib/auth";
import { rateLimiter } from "./lib/rateLimits";
import {
  requireTimeZone,
  resolveTimeZone,
  scheduleLocationDayStartReroll,
} from "./lib/timeZone";
import { requestWorkfeedEmployeeSync } from "./lib/workfeedSyncRequest";

const MAX_WEEK_SHIFTS = 2_000;
const MAX_LOCATION_EMPLOYEES = 500;
const MAX_ASSIGNMENTS = 200;
const DAY_MS = 24 * 60 * 60 * 1_000;
const MAX_PUBLIC_PAGE_SIZE = 100;

function requirePageSize(numItems: number) {
  if (
    !Number.isInteger(numItems) ||
    numItems <= 0 ||
    numItems > MAX_PUBLIC_PAGE_SIZE
  ) {
    throw new ConvexError("Siden er for stor");
  }
}

const syncStateValidator = v.union(
  v.literal("idle"),
  v.literal("queued"),
  v.literal("running"),
  v.literal("error"),
);

const employeeSummaryValidator = v.object({
  id: v.id("employees"),
  displayName: v.string(),
  imageUrl: v.union(v.string(), v.null()),
  active: v.boolean(),
  locations: v.array(v.object({ id: v.id("locations"), name: v.string() })),
});

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new ConvexError("Ugestarten er ugyldig");
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) {
    throw new ConvexError("Ugestarten er ugyldig");
  }
  return date;
}

function dateValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dateInTimeZone(timestamp: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestamp);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

async function hydrateEmployee(
  ctx: QueryCtx,
  organizationId: string,
  employee: Doc<"employees">,
) {
  const assignments = await ctx.db
    .query("employeeLocationAssignments")
    .withIndex("by_organizationId_and_employeeId", (q) =>
      q.eq("organizationId", organizationId).eq("employeeId", employee._id),
    )
    .take(MAX_ASSIGNMENTS);
  const locations = await Promise.all(
    assignments.map((assignment) =>
      ctx.db.get("locations", assignment.locationId),
    ),
  );
  return {
    id: employee._id,
    displayName: employee.displayName,
    imageUrl: employee.imageUrl,
    active: employee.active,
    locations: locations.flatMap((location) =>
      location?.organizationId === organizationId
        ? [{ id: location._id, name: location.name }]
        : [],
    ),
  };
}

export const getContext = query({
  args: {},
  returns: v.object({
    timeZone: v.string(),
    usesDefaultTimeZone: v.boolean(),
    workfeedConnected: v.boolean(),
    workfeedEnabled: v.boolean(),
    syncState: syncStateValidator,
    lastEmployeeSyncAt: v.union(v.number(), v.null()),
    lastShiftSyncAt: v.union(v.number(), v.null()),
    lastError: v.union(v.string(), v.null()),
    hasCachedEmployees: v.boolean(),
    hasCachedShifts: v.boolean(),
    manualSyncRetryAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx) => {
    const auth = await requireOrganization(ctx);
    await requireKioskDestination(ctx, auth, [
      "employees.schedule",
      "employees.directory",
      "waste.report",
    ]);
    const { organizationId } = auth;
    const [
      timeZone,
      settings,
      integration,
      status,
      employee,
      shift,
      manualLimit,
    ] = await Promise.all([
      resolveTimeZone(ctx, organizationId),
      ctx.db
        .query("organizationScheduleSettings")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .unique(),
      ctx.db
        .query("workfeedIntegrations")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .unique(),
      ctx.db
        .query("workfeedSyncStatus")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .unique(),
      ctx.db
        .query("employees")
        .withIndex("by_organizationId_and_normalizedName", (q) =>
          q.eq("organizationId", organizationId),
        )
        .first(),
      ctx.db
        .query("scheduledShifts")
        .withIndex("by_organizationId_and_startsAt", (q) =>
          q.eq("organizationId", organizationId),
        )
        .first(),
      rateLimiter.check(ctx, "manualWorkfeedSync", { key: organizationId }),
    ]);
    return {
      timeZone,
      usesDefaultTimeZone: !settings,
      workfeedConnected: Boolean(integration),
      workfeedEnabled: Boolean(integration?.enabled),
      syncState: status?.state ?? "idle",
      lastEmployeeSyncAt: status?.lastEmployeeSuccessAt ?? null,
      lastShiftSyncAt: status?.lastShiftSuccessAt ?? null,
      lastError: status?.lastError ?? null,
      hasCachedEmployees: Boolean(employee),
      hasCachedShifts: Boolean(shift),
      manualSyncRetryAt: manualLimit.ok
        ? null
        : Date.now() + (manualLimit.retryAfter ?? 0),
    };
  },
});

export const listWeek = query({
  args: { locationId: v.id("locations"), weekStart: v.string() },
  returns: v.object({
    location: v.object({ id: v.id("locations"), name: v.string() }),
    dates: v.array(v.string()),
    employees: v.array(
      v.object({
        id: v.id("employees"),
        displayName: v.string(),
        imageUrl: v.union(v.string(), v.null()),
        active: v.boolean(),
        shifts: v.array(
          v.object({
            id: v.id("scheduledShifts"),
            startsAt: v.number(),
            endsAt: v.number(),
            roleName: v.union(v.string(), v.null()),
            date: v.string(),
          }),
        ),
      }),
    ),
    limitReached: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const auth = await requireEmployeeViewer(ctx, "employees.schedule");
    const { organizationId } = auth;
    requireLocationAccess(auth, args.locationId);
    const monday = parseDate(args.weekStart);
    if (monday.getUTCDay() !== 1) {
      throw new ConvexError("Ugestarten skal være en mandag");
    }
    const location = await ctx.db.get("locations", args.locationId);
    if (location?.organizationId !== organizationId) {
      throw new ConvexError("Lokationen blev ikke fundet");
    }
    const timeZone = await resolveTimeZone(
      ctx,
      organizationId,
      args.locationId,
    );
    const dates = Array.from({ length: 7 }, (_, index) =>
      dateValue(new Date(monday.getTime() + index * DAY_MS)),
    );
    const [shiftRows, assignments] = await Promise.all([
      ctx.db
        .query("scheduledShifts")
        .withIndex("by_organizationId_and_locationId_and_startsAt", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("locationId", args.locationId)
            .gte("startsAt", monday.getTime() - 2 * DAY_MS)
            .lt("startsAt", monday.getTime() + 9 * DAY_MS),
        )
        .take(MAX_WEEK_SHIFTS + 1),
      ctx.db
        .query("employeeLocationAssignments")
        .withIndex("by_organizationId_and_locationId_and_employeeId", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("locationId", args.locationId),
        )
        .take(MAX_LOCATION_EMPLOYEES + 1),
    ]);
    const dateSet = new Set(dates);
    const shifts = shiftRows.slice(0, MAX_WEEK_SHIFTS).flatMap((shift) => {
      const date = dateInTimeZone(shift.startsAt, timeZone);
      return dateSet.has(date) ? [{ ...shift, date }] : [];
    });
    const shiftsByEmployee = new Map<Id<"employees">, typeof shifts>();
    for (const shift of shifts) {
      const current = shiftsByEmployee.get(shift.employeeId) ?? [];
      current.push(shift);
      shiftsByEmployee.set(shift.employeeId, current);
    }
    const employeeIds = new Set(
      assignments.slice(0, MAX_LOCATION_EMPLOYEES).map((row) => row.employeeId),
    );
    for (const shift of shifts) employeeIds.add(shift.employeeId);
    const employees = await Promise.all(
      [...employeeIds].map((employeeId) => ctx.db.get("employees", employeeId)),
    );
    return {
      location: { id: location._id, name: location.name },
      dates,
      employees: employees
        .flatMap((employee) => {
          if (!employee || employee.organizationId !== organizationId)
            return [];
          const employeeShifts = shiftsByEmployee.get(employee._id) ?? [];
          if (!employee.active && employeeShifts.length === 0) return [];
          return [
            {
              id: employee._id,
              displayName: employee.displayName,
              imageUrl: employee.imageUrl,
              active: employee.active,
              shifts: employeeShifts
                .sort((left, right) => left.startsAt - right.startsAt)
                .map((shift) => ({
                  id: shift._id,
                  startsAt: shift.startsAt,
                  endsAt: shift.endsAt,
                  roleName: shift.roleName,
                  date: shift.date,
                })),
            },
          ];
        })
        .sort((left, right) =>
          left.displayName.localeCompare(right.displayName, "da"),
        ),
      limitReached:
        shiftRows.length > MAX_WEEK_SHIFTS ||
        assignments.length > MAX_LOCATION_EMPLOYEES,
    };
  },
});

export const listDirectory = query({
  args: {
    paginationOpts: paginationOptsValidator,
    locationId: v.id("locations"),
    search: v.string(),
    activeOnly: v.boolean(),
  },
  returns: paginationResultValidator(employeeSummaryValidator),
  handler: async (ctx, args) => {
    const auth = await requireEmployeeViewer(ctx, "employees.directory");
    const { organizationId } = auth;
    requirePageSize(args.paginationOpts.numItems);
    requireLocationAccess(auth, args.locationId);
    const location = await ctx.db.get("locations", args.locationId);
    if (location?.organizationId !== organizationId) {
      throw new ConvexError("Lokationen blev ikke fundet");
    }
    const search = args.search.trim().slice(0, 100);
    let result;
    if (search) {
      result = args.activeOnly
        ? await ctx.db
            .query("employees")
            .withSearchIndex("search_displayName", (q) =>
              q
                .search("displayName", search)
                .eq("organizationId", organizationId)
                .eq("active", true),
            )
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("employees")
            .withSearchIndex("search_displayName", (q) =>
              q
                .search("displayName", search)
                .eq("organizationId", organizationId),
            )
            .paginate(args.paginationOpts);
    } else {
      result = args.activeOnly
        ? await ctx.db
            .query("employees")
            .withIndex("by_organizationId_and_active_and_normalizedName", (q) =>
              q.eq("organizationId", organizationId).eq("active", true),
            )
            .paginate(args.paginationOpts)
        : await ctx.db
            .query("employees")
            .withIndex("by_organizationId_and_normalizedName", (q) =>
              q.eq("organizationId", organizationId),
            )
            .paginate(args.paginationOpts);
    }
    const page = await Promise.all(
      result.page.map(async (employee) => {
        const assignment = await ctx.db
          .query("employeeLocationAssignments")
          .withIndex("by_organizationId_and_locationId_and_employeeId", (q) =>
            q
              .eq("organizationId", organizationId)
              .eq("locationId", args.locationId)
              .eq("employeeId", employee._id),
          )
          .unique();
        if (!assignment) return null;
        const hydrated = await hydrateEmployee(ctx, organizationId, employee);
        const visibleLocations = auth.isKioskAccount
          ? hydrated.locations.filter((item) => item.id === args.locationId)
          : auth.locationScope.all
            ? hydrated.locations
            : hydrated.locations.filter((item) =>
                auth.locationScope.ids.has(item.id),
              );
        return { ...hydrated, locations: visibleLocations };
      }),
    );
    return { ...result, page: page.filter((employee) => employee !== null) };
  },
});

export const setTimeZone = mutation({
  args: { timeZone: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    const timeZone = requireTimeZone(args.timeZone);
    const locations = await ctx.db
      .query("locations")
      .withIndex("by_organizationId_and_normalizedName", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(201);
    if (locations.length > 200) {
      throw new ConvexError("Organisationen har for mange lokationer");
    }
    const inheritedLocations = locations.filter(
      (location) => !location.timeZone,
    );
    const previousTimeZones = await Promise.all(
      inheritedLocations.map((location) =>
        resolveTimeZone(ctx, organizationId, location._id),
      ),
    );
    const current = await ctx.db
      .query("organizationScheduleSettings")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .unique();
    const previousOrganizationTimeZone =
      current?.timeZone ?? "Europe/Copenhagen";
    if (current) {
      await ctx.db.patch(current._id, { timeZone, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("organizationScheduleSettings", {
        organizationId,
        timeZone,
        updatedAt: Date.now(),
      });
    }
    const summaryStatuses = await ctx.db
      .query("dashboardSummaryStatuses")
      .withIndex("by_organizationId_and_source", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(10);
    if (previousOrganizationTimeZone !== timeZone) {
      for (const status of summaryStatuses) {
        await ctx.db.patch(status._id, {
          state: "stale",
          runToken: undefined,
          updatedAt: Date.now(),
        });
      }
    }
    for (const [index, location] of inheritedLocations.entries()) {
      const nextTimeZone = await resolveTimeZone(
        ctx,
        organizationId,
        location._id,
      );
      if (nextTimeZone !== previousTimeZones[index]) {
        await scheduleLocationDayStartReroll(
          ctx,
          organizationId,
          location._id,
          nextTimeZone,
        );
      }
    }
    return null;
  },
});

export const requestWorkfeedSync = mutation({
  args: {},
  returns: v.object({
    accepted: v.boolean(),
    state: v.union(
      v.literal("queued"),
      v.literal("alreadyQueued"),
      v.literal("rateLimited"),
      v.literal("unavailable"),
    ),
    retryAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx) => {
    const { organizationId } = await requireNormalOrganization(ctx);
    return await requestWorkfeedEmployeeSync(ctx, organizationId);
  },
});
