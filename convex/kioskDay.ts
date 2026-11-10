import { ConvexError, v, type Infer } from "convex/values";
import { env, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  requireLocationAccess,
  requireOrganization,
  requirePermission,
} from "./lib/auth";
import { closedPeriodAround } from "../lib/count-window";
import { getLocationOpeningHours } from "./lib/countWindow";
import { getKioskDayTasks, kioskDayState } from "./lib/kioskDay";
import { cashReportPeriodStart, cashReportSales, latestCashReport } from "./lib/cashReports";
import type { Id } from "./_generated/dataModel";
import {
  cashReportSalesValidator,
  cashReportValuesValidator,
  kioskDayTaskValidator,
} from "./lib/kioskDayValidators";
import { requireOrganizationLocation } from "./lib/locations";

const MAX_TASKS = 50;
const MAX_TASK_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;
const phaseValidator = v.union(v.literal("endOfDay"), v.literal("startOfDay"));
const tasksValidator = v.object({
  endOfDay: v.array(kioskDayTaskValidator),
  startOfDay: v.array(kioskDayTaskValidator),
});

function cleanTasks(tasks: Infer<typeof kioskDayTaskValidator>[], phase: "endOfDay" | "startOfDay") {
  const cashReports = tasks.filter((task) => task.kind === "cashReport").length;
  if (cashReports && phase === "startOfDay") {
    throw new ConvexError("Kasserapporten kan kun være en opgave ved lukning");
  }
  if (cashReports > 1) throw new ConvexError("Lukningen kan kun have én kasserapport");
  const cleaned = tasks.flatMap(({ title, description, icon, link, kind }) => {
    const trimmedTitle = title.trim();
    const trimmedDescription = description?.trim();
    if (!trimmedTitle) return [];
    if (trimmedTitle.length > MAX_TASK_LENGTH) {
      throw new ConvexError(`En opgave må højst have ${MAX_TASK_LENGTH} tegn`);
    }
    if (trimmedDescription && trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
      throw new ConvexError(`En beskrivelse må højst have ${MAX_DESCRIPTION_LENGTH} tegn`);
    }
    return [{
      title: trimmedTitle,
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
      ...(icon ? { icon } : {}),
      ...(kind ? { kind } : link ? { link } : {}),
    }];
  });
  if (cleaned.length > MAX_TASKS) {
    throw new ConvexError(`Der kan højst være ${MAX_TASKS} opgaver pr. liste`);
  }
  return cleaned;
}

async function requireDayTaskManager(ctx: QueryCtx | MutationCtx) {
  const auth = await requirePermission(ctx, "kiosk.dayTasks.manage");
  if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
  return auth;
}

async function requireKioskLocation(ctx: QueryCtx | MutationCtx) {
  const auth = await requireOrganization(ctx);
  if (!auth.isKioskAccount || !auth.kioskModeEnabled || !auth.kioskLocationId) {
    throw new ConvexError("Dagsopgaver kræver kiosktilstand");
  }
  return { auth, locationId: auth.kioskLocationId };
}

export const getTasks = query({
  args: { locationId: v.id("locations") },
  returns: tasksValidator,
  handler: async (ctx, args) => {
    const auth = await requireDayTaskManager(ctx);
    requireLocationAccess(auth, args.locationId);
    await requireOrganizationLocation(ctx, auth.organizationId, args.locationId);
    return await getKioskDayTasks(ctx, auth.organizationId, args.locationId);
  },
});

// Closing and opening times around `now`, for previewing the kiosk checklist.
export const getPreviewTimes = query({
  args: { locationId: v.id("locations"), now: v.number() },
  returns: v.object({ closedAt: v.number(), reopensAt: v.number(), timeZone: v.string() }),
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.now) || args.now <= 0) {
      throw new ConvexError("Tidspunktet er ugyldigt");
    }
    const auth = await requireDayTaskManager(ctx);
    requireLocationAccess(auth, args.locationId);
    const location = await requireOrganizationLocation(ctx, auth.organizationId, args.locationId);
    const { weekly, specials, timeZone } = await getLocationOpeningHours(
      ctx,
      auth.organizationId,
      location,
    );
    const { closedAt, reopensAt } = closedPeriodAround(args.now, weekly, specials, timeZone);
    return { closedAt, reopensAt, timeZone };
  },
});

// Tasks may only link to pages the kiosk can open.
export const getLinkablePages = query({
  args: {},
  returns: v.array(v.string()),
  handler: async (ctx) => {
    const auth = await requireDayTaskManager(ctx);
    const settings = await ctx.db
      .query("kioskSettings")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", auth.organizationId))
      .unique();
    return settings?.enabledPages ?? [];
  },
});

export const saveTasks = mutation({
  args: {
    locationId: v.id("locations"),
    endOfDay: v.array(kioskDayTaskValidator),
    startOfDay: v.array(kioskDayTaskValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireDayTaskManager(ctx);
    const { organizationId } = auth;
    requireLocationAccess(auth, args.locationId);
    await requireOrganizationLocation(ctx, organizationId, args.locationId);
    const data = {
      endOfDay: cleanTasks(args.endOfDay, "endOfDay"),
      startOfDay: cleanTasks(args.startOfDay, "startOfDay"),
      updatedAt: Date.now(),
    };
    const current = await ctx.db
      .query("kioskDayTasks")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", organizationId).eq("locationId", args.locationId),
      )
      .unique();
    if (current) await ctx.db.patch("kioskDayTasks", current._id, data);
    else {
      await ctx.db.insert("kioskDayTasks", {
        organizationId,
        locationId: args.locationId,
        ...data,
      });
    }
    return null;
  },
});

function simulationAllowed(requested: boolean | undefined) {
  return requested === true && env.KIOSK_DAY_SIMULATION === "1";
}

export const getState = query({
  args: { now: v.number(), simulateEndOfDay: v.optional(v.boolean()) },
  returns: v.object({
    phase: v.union(phaseValidator, v.null()),
    tasks: v.array(kioskDayTaskValidator),
    scheduledAt: v.union(v.number(), v.null()),
    timeZone: v.union(v.string(), v.null()),
    nextTransitionAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.now) || args.now <= 0) {
      throw new ConvexError("Tidspunktet er ugyldigt");
    }
    const { auth, locationId } = await requireKioskLocation(ctx);
    return await kioskDayState(
      ctx,
      auth.organizationId,
      locationId,
      args.now,
      simulationAllowed(args.simulateEndOfDay),
    );
  },
});

// Start of the period a cash report covers, or null when the closing has no cash report task right now.
async function cashReportTaskPeriod(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  locationId: Id<"locations">,
  now: number,
  simulateEndOfDay: boolean | undefined,
) {
  const state = await kioskDayState(ctx, organizationId, locationId, now, simulationAllowed(simulateEndOfDay));
  if (state.phase !== "endOfDay" || !state.tasks.some((task) => task.kind === "cashReport")) return null;
  return await cashReportPeriodStart(ctx, organizationId, locationId, now);
}

export const getCashReport = query({
  args: { now: v.number(), simulateEndOfDay: v.optional(v.boolean()) },
  returns: v.union(
    v.object({
      saved: v.union(v.object({ values: cashReportValuesValidator, createdAt: v.number() }), v.null()),
      sales: v.union(cashReportSalesValidator, v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.now) || args.now <= 0) {
      throw new ConvexError("Tidspunktet er ugyldigt");
    }
    const { auth, locationId } = await requireKioskLocation(ctx);
    const { organizationId } = auth;
    // The closing may just have been registered while the checklist is still open.
    const since = await cashReportTaskPeriod(ctx, organizationId, locationId, args.now, args.simulateEndOfDay);
    if (since === null) return null;
    const [saved, sales] = await Promise.all([
      latestCashReport(ctx, organizationId, locationId, since),
      cashReportSales(ctx, organizationId, locationId, since, args.now),
    ]);
    return { saved: saved && { values: saved.values, createdAt: saved.createdAt }, sales };
  },
});

const MAX_CASH_REPORT_VALUE = 1e11;

export const saveCashReport = mutation({
  args: { values: cashReportValuesValidator, simulateEndOfDay: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { auth, locationId } = await requireKioskLocation(ctx);
    if (auth.readOnly || !auth.userId) throw new ConvexError("Du har ikke adgang");
    const values = Object.values(args.values);
    if (values.some((value) => value !== null && (!Number.isInteger(value) || Math.abs(value) > MAX_CASH_REPORT_VALUE))) {
      throw new ConvexError("Et beløb i kasserapporten er ugyldigt");
    }
    if (args.values.total === null) throw new ConvexError("Udfyld Total");
    const now = Date.now();
    const since = await cashReportTaskPeriod(ctx, auth.organizationId, locationId, now, args.simulateEndOfDay);
    if (since === null) throw new ConvexError("Kasserapporten er ikke en del af lukningen lige nu");
    await ctx.db.insert("cashReports", {
      organizationId: auth.organizationId,
      locationId,
      values: args.values,
      sales: await cashReportSales(ctx, auth.organizationId, locationId, since, now),
      createdAt: now,
      createdByUserId: auth.userId,
      createdByName: auth.userName,
    });
    return null;
  },
});

const MAX_LOCATION_EMPLOYEES = 500;
const SHIFT_WINDOW_MS = 3 * 60 * 60 * 1000;
const SHIFT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

// Active employees assigned to the kiosk location, and who is on shift near `now`.
export const listResponsibleEmployees = query({
  args: { now: v.number() },
  returns: v.object({
    employees: v.array(v.object({ id: v.id("employees"), name: v.string() })),
    onShift: v.array(
      v.object({
        id: v.id("employees"),
        name: v.string(),
        startsAt: v.number(),
        endsAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const { auth, locationId } = await requireKioskLocation(ctx);
    const { organizationId } = auth;
    const [assignments, shifts] = await Promise.all([
      ctx.db
        .query("employeeLocationAssignments")
        .withIndex("by_organizationId_and_locationId_and_employeeId", (q) =>
          q.eq("organizationId", organizationId).eq("locationId", locationId),
        )
        .take(MAX_LOCATION_EMPLOYEES),
      ctx.db
        .query("scheduledShifts")
        .withIndex("by_organizationId_and_locationId_and_startsAt", (q) =>
          q
            .eq("organizationId", organizationId)
            .eq("locationId", locationId)
            .gte("startsAt", args.now - SHIFT_LOOKBACK_MS)
            .lte("startsAt", args.now + SHIFT_WINDOW_MS),
        )
        .take(200),
    ]);
    // Closing staff may just have ended their shift; opening staff may not have started yet.
    const nearby = shifts.filter((shift) => shift.endsAt >= args.now - SHIFT_WINDOW_MS);
    const ids = new Set([
      ...assignments.map((row) => row.employeeId),
      ...nearby.map((shift) => shift.employeeId),
    ]);
    const employees = (await Promise.all([...ids].map((id) => ctx.db.get("employees", id))))
      .flatMap((employee) =>
        employee?.organizationId === organizationId && employee.active
          ? [{ id: employee._id, name: employee.displayName }]
          : [],
      )
      .sort((a, b) => a.name.localeCompare(b.name, "da"));
    const names = new Map(employees.map((employee) => [employee.id, employee.name]));
    const onShift = new Map<Id<"employees">, { startsAt: number; endsAt: number }>();
    for (const shift of nearby.sort((a, b) => a.startsAt - b.startsAt)) {
      if (names.has(shift.employeeId) && !onShift.has(shift.employeeId)) {
        onShift.set(shift.employeeId, shift);
      }
    }
    return {
      employees,
      onShift: [...onShift].map(([id, shift]) => ({
        id,
        name: names.get(id)!,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
      })),
    };
  },
});

export const complete = mutation({
  args: {
    phase: phaseValidator,
    // Task titles as shown, so a list edited meanwhile is rejected.
    tasks: v.array(v.string()),
    // An employee from the worker list, or a typed name when the list has no match.
    responsible: v.union(
      v.object({ employeeId: v.id("employees") }),
      v.object({ name: v.string() }),
    ),
    simulateEndOfDay: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { auth, locationId } = await requireKioskLocation(ctx);
    if (auth.readOnly || !auth.userId) throw new ConvexError("Du har ikke adgang");
    const state = await kioskDayState(
      ctx,
      auth.organizationId,
      locationId,
      Date.now(),
      simulationAllowed(args.simulateEndOfDay),
    );
    if (state.phase !== args.phase) {
      throw new ConvexError(
        args.phase === "endOfDay"
          ? "Lukning er ikke tilgængelig lige nu"
          : "Åbning er ikke tilgængelig lige nu",
      );
    }
    let responsible: { employeeId?: Id<"employees">; name: string };
    if ("employeeId" in args.responsible) {
      const employee = await ctx.db.get("employees", args.responsible.employeeId);
      if (!employee || employee.organizationId !== auth.organizationId) {
        throw new ConvexError("Medarbejderen blev ikke fundet");
      }
      responsible = { employeeId: employee._id, name: employee.displayName };
    } else {
      const name = args.responsible.name.trim();
      if (!name || name.length > 100) throw new ConvexError("Vælg en godkender");
      responsible = { name };
    }
    const titles = state.tasks.map((task) => task.title);
    if (
      titles.length !== args.tasks.length ||
      titles.some((title, index) => title !== args.tasks[index])
    ) {
      throw new ConvexError("Opgavelisten er ændret. Gennemgå opgaverne igen");
    }
    let cashReportId: Id<"cashReports"> | undefined;
    if (state.tasks.some((task) => task.kind === "cashReport")) {
      const since = await cashReportPeriodStart(ctx, auth.organizationId, locationId, Date.now());
      const report = await latestCashReport(ctx, auth.organizationId, locationId, since);
      if (!report) throw new ConvexError("Gem kasserapporten, før lukningen registreres");
      cashReportId = report._id;
    }
    await ctx.db.insert("kioskDayRuns", {
      organizationId: auth.organizationId,
      locationId,
      phase: args.phase,
      tasks: titles,
      completedAt: Date.now(),
      completedByUserId: auth.userId,
      completedByName: auth.userName,
      responsibleEmployeeId: responsible.employeeId,
      responsibleName: responsible.name,
      cashReportId,
    });
    return null;
  },
});
