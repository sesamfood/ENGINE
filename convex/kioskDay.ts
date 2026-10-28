import { ConvexError, v, type Infer } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  requireLocationAccess,
  requireOrganization,
  requirePermission,
} from "./lib/auth";
import { getKioskDayTasks, kioskDayState } from "./lib/kioskDay";
import type { Id } from "./_generated/dataModel";
import { kioskDayTaskValidator } from "./lib/kioskDayValidators";
import { requireOrganizationLocation } from "./lib/locations";

const MAX_TASKS = 50;
const MAX_TASK_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;
const phaseValidator = v.union(v.literal("endOfDay"), v.literal("startOfDay"));
const tasksValidator = v.object({
  endOfDay: v.array(kioskDayTaskValidator),
  startOfDay: v.array(kioskDayTaskValidator),
});

function cleanTasks(tasks: Infer<typeof kioskDayTaskValidator>[]) {
  const cleaned = tasks.flatMap(({ title, description, icon, link }) => {
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
      ...(link ? { link } : {}),
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
      endOfDay: cleanTasks(args.endOfDay),
      startOfDay: cleanTasks(args.startOfDay),
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

export const getState = query({
  args: { now: v.number() },
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
    return await kioskDayState(ctx, auth.organizationId, locationId, args.now);
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { auth, locationId } = await requireKioskLocation(ctx);
    if (auth.readOnly || !auth.userId) throw new ConvexError("Du har ikke adgang");
    const state = await kioskDayState(ctx, auth.organizationId, locationId, Date.now());
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
    });
    return null;
  },
});
