import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  requireLocationAccess,
  requireOrganization,
  requirePermission,
} from "./lib/auth";
import { getKioskDayTasks, kioskDayState } from "./lib/kioskDay";
import { requireOrganizationLocation } from "./lib/locations";

const MAX_TASKS = 50;
const MAX_TASK_LENGTH = 200;
const phaseValidator = v.union(v.literal("endOfDay"), v.literal("startOfDay"));
const tasksValidator = v.object({
  endOfDay: v.array(v.string()),
  startOfDay: v.array(v.string()),
});

function cleanTasks(tasks: string[]) {
  const cleaned = tasks.map((task) => task.trim()).filter(Boolean);
  if (cleaned.length > MAX_TASKS) {
    throw new ConvexError(`Der kan højst være ${MAX_TASKS} opgaver pr. liste`);
  }
  if (cleaned.some((task) => task.length > MAX_TASK_LENGTH)) {
    throw new ConvexError(`En opgave må højst have ${MAX_TASK_LENGTH} tegn`);
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

export const saveTasks = mutation({
  args: {
    locationId: v.id("locations"),
    endOfDay: v.array(v.string()),
    startOfDay: v.array(v.string()),
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
    tasks: v.array(v.string()),
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

export const complete = mutation({
  args: { phase: phaseValidator, tasks: v.array(v.string()) },
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
    if (
      state.tasks.length !== args.tasks.length ||
      state.tasks.some((task, index) => task !== args.tasks[index])
    ) {
      throw new ConvexError("Opgavelisten er ændret. Gennemgå opgaverne igen");
    }
    await ctx.db.insert("kioskDayRuns", {
      organizationId: auth.organizationId,
      locationId,
      phase: args.phase,
      tasks: state.tasks,
      completedAt: Date.now(),
      completedByUserId: auth.userId,
      completedByName: auth.userName,
    });
    return null;
  },
});
