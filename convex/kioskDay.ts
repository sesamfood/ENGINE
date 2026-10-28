import { ConvexError, v, type Infer } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  requireLocationAccess,
  requireOrganization,
  requirePermission,
} from "./lib/auth";
import { getKioskDayTasks, kioskDayState } from "./lib/kioskDay";
import { getDatabaseAdapter } from "./auth";
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
  args: { now: v.number(), forceEndOfDay: v.optional(v.boolean()) }, // TEMP: testing
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
      args.forceEndOfDay,
    );
  },
});

type Member = { userId: string; kioskLocationId?: string | null };
type User = { id: string; name?: string | null; email: string };

// Organization users who can approve a run. Kiosk accounts are shared, so they are left out.
async function listOrganizationUsers(ctx: QueryCtx | MutationCtx, organizationId: string) {
  const adapter = getDatabaseAdapter(ctx);
  const members = await adapter.findMany<Member>({
    model: "member",
    where: [{ field: "organizationId", value: organizationId }],
    limit: 200,
  });
  const people = members.filter((member) => !member.kioskLocationId);
  const users = await Promise.all(
    people.map((member) =>
      adapter.findOne<User>({ model: "user", where: [{ field: "id", value: member.userId }] }),
    ),
  );
  return users
    .flatMap((user) => (user ? [{ id: user.id, name: user.name?.trim() || user.email }] : []))
    .sort((a, b) => a.name.localeCompare(b.name, "da"));
}

export const listResponsibleUsers = query({
  args: {},
  returns: v.array(v.object({ id: v.string(), name: v.string() })),
  handler: async (ctx) => {
    const { auth } = await requireKioskLocation(ctx);
    return await listOrganizationUsers(ctx, auth.organizationId);
  },
});

export const complete = mutation({
  args: {
    phase: phaseValidator,
    // Task titles as shown, so a list edited meanwhile is rejected.
    tasks: v.array(v.string()),
    responsibleUserId: v.string(),
    forceEndOfDay: v.optional(v.boolean()), // TEMP: testing
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
      args.forceEndOfDay,
    );
    if (state.phase !== args.phase) {
      throw new ConvexError(
        args.phase === "endOfDay"
          ? "Lukning er ikke tilgængelig lige nu"
          : "Åbning er ikke tilgængelig lige nu",
      );
    }
    const responsible = (await listOrganizationUsers(ctx, auth.organizationId)).find(
      (user) => user.id === args.responsibleUserId,
    );
    if (!responsible) throw new ConvexError("Vælg en godkender");
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
      responsibleUserId: responsible.id,
      responsibleName: responsible.name,
    });
    return null;
  },
});
