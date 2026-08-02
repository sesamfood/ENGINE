import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import {
  parseEmployees,
  parseRoles,
  parseShifts,
  requestWorkfeed,
  workfeedErrorMessage,
  type WorkfeedSettings,
} from "./lib/workfeedApi";

const DAY_MS = 24 * 60 * 60 * 1_000;
const HOUR_MS = 60 * 60 * 1_000;
const HISTORY_MS = 30 * DAY_MS;
const FORECAST_MS = 60 * DAY_MS;
const CHUNK_MS = 7 * DAY_MS;
const SHIFT_CHUNK_COUNT = Math.ceil((HISTORY_MS + FORECAST_MS) / CHUNK_MS);
const STUCK_MS = 30 * 60 * 1_000;
const MAX_LOCATIONS = 200;
const MAX_ROLES = 1_000;
const EMPLOYEE_BATCH_SIZE = 25;
const SHIFT_BATCH_SIZE = 100;

const settingsValidator = v.object({
  apiKey: v.string(),
  companyId: v.string(),
  enabled: v.boolean(),
});

const locationMappingValidator = v.object({
  locationId: v.id("locations"),
  departmentId: v.string(),
});

const employeeSyncContextValidator = v.union(
  v.object({
    settings: settingsValidator,
    locations: v.array(locationMappingValidator),
  }),
  v.null(),
);

const shiftSyncContextValidator = v.union(
  v.object({
    settings: settingsValidator,
    runToken: v.union(v.string(), v.null()),
    lastEmployeeCompanyId: v.union(v.string(), v.null()),
    locations: v.array(locationMappingValidator),
    roles: v.array(
      v.object({
        externalRoleId: v.string(),
        externalDepartmentId: v.string(),
        name: v.string(),
        active: v.boolean(),
      }),
    ),
  }),
  v.null(),
);

const shiftRequestContextValidator = v.union(
  v.object({
    settings: settingsValidator,
    runToken: v.union(v.string(), v.null()),
    lastEmployeeCompanyId: v.union(v.string(), v.null()),
    lastEmployeeSuccessAt: v.union(v.number(), v.null()),
    shiftChunkHashes: v.array(v.string()),
  }),
  v.null(),
);

type EmployeeSyncContext = {
  settings: WorkfeedSettings;
  locations: Array<{
    locationId: Id<"locations">;
    departmentId: string;
  }>;
};

type ShiftSyncContext = EmployeeSyncContext & {
  runToken: string | null;
  lastEmployeeCompanyId: string | null;
  roles: Array<{
    externalRoleId: string;
    externalDepartmentId: string;
    name: string;
    active: boolean;
  }>;
};

type ShiftRequestContext = {
  settings: WorkfeedSettings;
  runToken: string | null;
  lastEmployeeCompanyId: string | null;
  lastEmployeeSuccessAt: number | null;
  shiftChunkHashes: string[];
};

type ShiftChunkCompletion = {
  organizationId: string;
  companyId: string;
  runToken: string;
  windowStart: number;
  windowEnd: number;
  from: number;
  to: number;
  sourceHash?: string;
  chunkIndex?: number;
};

function runToken(kind: "employees" | "shifts", now: number) {
  return `${kind}:${now}`;
}

function shiftWindow(now: number) {
  const anchor = Math.floor(now / HOUR_MS) * HOUR_MS;
  return {
    windowStart: anchor - HISTORY_MS,
    windowEnd: anchor + FORECAST_MS,
  };
}

async function shiftSourceHash(
  shifts: ReturnType<typeof parseShifts>,
  companyId: string,
  lastEmployeeSuccessAt: number | null,
) {
  const serializedShifts = shifts
    .map((shift) =>
      JSON.stringify([
        shift.id,
        shift.employeeId,
        shift.departmentId,
        shift.roleId,
        shift.start,
        shift.end,
      ]),
    )
    .sort();
  const value = JSON.stringify([
    1,
    companyId,
    lastEmployeeSuccessAt,
    serializedShifts,
  ]);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `v1:${hex}`;
}

async function finishShiftChunk(
  ctx: MutationCtx,
  status: Doc<"workfeedSyncStatus">,
  args: ShiftChunkCompletion,
) {
  const pendingShiftChunks = Math.max(
    0,
    (status.pendingShiftChunks ?? 1) - 1,
  );
  const shiftChunkHashes = [...(status.shiftChunkHashes ?? [])];
  if (args.sourceHash !== undefined && args.chunkIndex !== undefined) {
    shiftChunkHashes[args.chunkIndex] = args.sourceHash;
  }
  const hashPatch =
    args.sourceHash !== undefined && args.chunkIndex !== undefined
      ? { shiftChunkHashes }
      : {};
  const nextFrom = args.to;
  const now = Date.now();
  if (nextFrom < args.windowEnd) {
    await ctx.db.patch(status._id, {
      pendingShiftChunks,
      state: "queued",
      updatedAt: now,
      ...hashPatch,
    });
    await ctx.scheduler.runAfter(0, internal.workfeedSync.syncShiftChunk, {
      organizationId: args.organizationId,
      runToken: args.runToken,
      windowStart: args.windowStart,
      windowEnd: args.windowEnd,
      from: nextFrom,
      to: Math.min(nextFrom + CHUNK_MS, args.windowEnd),
    });
    return;
  }

  await ctx.db.patch(status._id, {
    state: "idle",
    pendingShiftChunks: 0,
    lastShiftSuccessAt: now,
    lastError: undefined,
    updatedAt: now,
    ...hashPatch,
  });
  await ctx.scheduler.runAfter(0, internal.workfeedSync.pruneShifts, {
    organizationId: args.organizationId,
    companyId: args.companyId,
    windowStart: args.windowStart,
    windowEnd: args.windowEnd,
    phase: "before",
  });
}

async function startSync(
  ctx: MutationCtx,
  organizationId: string,
  requestedKind: "employees" | "shifts",
  force = false,
) {
  const settings = await ctx.db
    .query("workfeedIntegrations")
    .withIndex("by_organizationId", (q) =>
      q.eq("organizationId", organizationId),
    )
    .unique();
  if (!settings?.enabled) return false;

  const status = await ctx.db
    .query("workfeedSyncStatus")
    .withIndex("by_organizationId", (q) =>
      q.eq("organizationId", organizationId),
    )
    .unique();
  const now = Date.now();
  if (
    !force &&
    status &&
    (status.state === "queued" || status.state === "running") &&
    now - status.updatedAt < STUCK_MS
  ) {
    return false;
  }

  const kind: "employees" | "shifts" =
    requestedKind === "shifts" &&
    status?.lastEmployeeCompanyId === settings.companyId
      ? "shifts"
      : "employees";
  const token = runToken(kind, now);
  if (status) {
    await ctx.db.patch(status._id, {
      state: "queued",
      runKind: kind,
      runToken: token,
      pendingShiftChunks:
        kind === "shifts"
          ? SHIFT_CHUNK_COUNT
          : undefined,
      ...(kind === "employees"
        ? { lastEmployeeAttemptAt: now }
        : { lastShiftAttemptAt: now }),
      lastError: undefined,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("workfeedSyncStatus", {
      organizationId,
      state: "queued",
      runKind: kind,
      runToken: token,
      ...(kind === "employees"
        ? { lastEmployeeAttemptAt: now }
        : {
            pendingShiftChunks: SHIFT_CHUNK_COUNT,
            lastShiftAttemptAt: now,
          }),
      updatedAt: now,
    });
  }

  if (kind === "employees") {
    await ctx.scheduler.runAfter(0, internal.workfeedSync.syncEmployees, {
      organizationId,
      runToken: token,
    });
  } else {
    const { windowStart, windowEnd } = shiftWindow(now);
    await ctx.scheduler.runAfter(0, internal.workfeedSync.syncShiftChunk, {
      organizationId,
      runToken: token,
      windowStart,
      windowEnd,
      from: windowStart,
      to: Math.min(windowStart + CHUNK_MS, windowEnd),
    });
  }
  return true;
}

export const getEmployeeSyncContext = internalQuery({
  args: { organizationId: v.string() },
  returns: employeeSyncContextValidator,
  handler: async (ctx, args): Promise<EmployeeSyncContext | null> => {
    const settings = await ctx.db
      .query("workfeedIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    if (!settings?.enabled) return null;
    const locations = await ctx.db
      .query("workfeedLocationMappings")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .take(MAX_LOCATIONS + 1);
    if (locations.length > MAX_LOCATIONS) {
      throw new Error("Der er for mange Workfeed-koblinger");
    }
    return {
      settings: {
        apiKey: settings.apiKey,
        companyId: settings.companyId,
        enabled: settings.enabled,
      },
      locations: locations.map((mapping) => ({
        locationId: mapping.locationId,
        departmentId: mapping.departmentId,
      })),
    };
  },
});

export const getShiftSyncContext = internalQuery({
  args: { organizationId: v.string(), companyId: v.string() },
  returns: shiftSyncContextValidator,
  handler: async (ctx, args): Promise<ShiftSyncContext | null> => {
    const [settings, status, locations, roles] = await Promise.all([
      ctx.db
        .query("workfeedIntegrations")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", args.organizationId),
        )
        .unique(),
      ctx.db
        .query("workfeedSyncStatus")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", args.organizationId),
        )
        .unique(),
      ctx.db
        .query("workfeedLocationMappings")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", args.organizationId),
        )
        .take(MAX_LOCATIONS + 1),
      ctx.db
        .query("workfeedRoles")
        .withIndex(
          "by_organizationId_and_companyId_and_externalRoleId",
          (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("companyId", args.companyId),
        )
        .take(MAX_ROLES + 1),
    ]);
    if (!settings?.enabled || settings.companyId !== args.companyId) return null;
    if (
      locations.length > MAX_LOCATIONS ||
      roles.length > MAX_ROLES
    ) {
      throw new Error("Workfeed-data overskrider grænsen");
    }
    return {
      settings: {
        apiKey: settings.apiKey,
        companyId: settings.companyId,
        enabled: settings.enabled,
      },
      runToken: status?.runToken ?? null,
      lastEmployeeCompanyId: status?.lastEmployeeCompanyId ?? null,
      locations: locations.map((mapping) => ({
        locationId: mapping.locationId,
        departmentId: mapping.departmentId,
      })),
      roles: roles.map((role) => ({
        externalRoleId: role.externalRoleId,
        externalDepartmentId: role.externalDepartmentId,
        name: role.name,
        active: role.active,
      })),
    };
  },
});

export const getShiftRequestContext = internalQuery({
  args: { organizationId: v.string() },
  returns: shiftRequestContextValidator,
  handler: async (ctx, args): Promise<ShiftRequestContext | null> => {
    const [settings, status] = await Promise.all([
      ctx.db
        .query("workfeedIntegrations")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", args.organizationId),
        )
        .unique(),
      ctx.db
        .query("workfeedSyncStatus")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", args.organizationId),
        )
        .unique(),
    ]);
    if (!settings?.enabled) return null;
    return {
      settings: {
        apiKey: settings.apiKey,
        companyId: settings.companyId,
        enabled: settings.enabled,
      },
      runToken: status?.runToken ?? null,
      lastEmployeeCompanyId: status?.lastEmployeeCompanyId ?? null,
      lastEmployeeSuccessAt: status?.lastEmployeeSuccessAt ?? null,
      shiftChunkHashes: status?.shiftChunkHashes ?? [],
    };
  },
});

export const resolveEmployeeMappings = internalQuery({
  args: {
    organizationId: v.string(),
    companyId: v.string(),
    externalEmployeeIds: v.array(v.string()),
  },
  returns: v.array(
    v.object({
      externalEmployeeId: v.string(),
      employeeId: v.id("employees"),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.externalEmployeeIds.length > 100) {
      throw new Error("For mange medarbejdere i vagtsynkroniseringen");
    }
    const mappings = await Promise.all(
      args.externalEmployeeIds.map((externalEmployeeId) =>
        ctx.db
          .query("workfeedEmployeeMappings")
          .withIndex(
            "by_organizationId_and_companyId_and_externalEmployeeId",
            (q) =>
              q
                .eq("organizationId", args.organizationId)
                .eq("companyId", args.companyId)
                .eq("externalEmployeeId", externalEmployeeId),
          )
          .unique(),
      ),
    );
    return mappings.flatMap((mapping) =>
      mapping
        ? [{
            externalEmployeeId: mapping.externalEmployeeId,
            employeeId: mapping.employeeId,
          }]
        : [],
    );
  },
});

export const enqueueOrganizationSync = internalMutation({
  args: {
    organizationId: v.string(),
    kind: v.union(v.literal("employees"), v.literal("shifts")),
    force: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await startSync(ctx, args.organizationId, args.kind, args.force);
    return null;
  },
});

export const dispatchEnabledIntegrations = internalMutation({
  args: {
    kind: v.union(v.literal("employees"), v.literal("shifts")),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("workfeedIntegrations")
      .withIndex("by_enabled_and_organizationId", (q) => q.eq("enabled", true))
      .paginate({ numItems: 25, cursor: args.cursor });
    for (const integration of result.page) {
      await ctx.scheduler.runAfter(
        0,
        internal.workfeedSync.enqueueOrganizationSync,
        { organizationId: integration.organizationId, kind: args.kind },
      );
    }
    if (!result.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.workfeedSync.dispatchEnabledIntegrations,
        { kind: args.kind, cursor: result.continueCursor },
      );
    }
    return null;
  },
});

export const markRunning = internalMutation({
  args: { organizationId: v.string(), runToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = await ctx.db
      .query("workfeedSyncStatus")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    if (status?.runToken === args.runToken) {
      await ctx.db.patch(status._id, { state: "running", updatedAt: Date.now() });
    }
    return null;
  },
});

export const upsertRoleBatch = internalMutation({
  args: {
    organizationId: v.string(),
    companyId: v.string(),
    syncToken: v.string(),
    roles: v.array(
      v.object({
        id: v.string(),
        departmentId: v.string(),
        name: v.string(),
        active: v.boolean(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = await ctx.db
      .query("workfeedSyncStatus")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    if (status?.runToken !== args.syncToken) return null;
    const now = Date.now();
    for (const role of args.roles) {
      const current = await ctx.db
        .query("workfeedRoles")
        .withIndex(
          "by_organizationId_and_companyId_and_externalRoleId",
          (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("companyId", args.companyId)
              .eq("externalRoleId", role.id),
        )
        .unique();
      const value = {
        externalDepartmentId: role.departmentId,
        name: role.name,
        active: role.active,
        syncToken: args.syncToken,
        updatedAt: now,
      };
      if (current) {
        await ctx.db.patch(current._id, value);
      } else {
        await ctx.db.insert("workfeedRoles", {
          organizationId: args.organizationId,
          companyId: args.companyId,
          externalRoleId: role.id,
          ...value,
        });
      }
    }
    return null;
  },
});

export const upsertEmployeeBatch = internalMutation({
  args: {
    organizationId: v.string(),
    companyId: v.string(),
    syncToken: v.string(),
    employees: v.array(
      v.object({
        id: v.string(),
        firstName: v.string(),
        lastName: v.string(),
        imageUrl: v.union(v.string(), v.null()),
        active: v.boolean(),
        locationIds: v.array(v.id("locations")),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = await ctx.db
      .query("workfeedSyncStatus")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    if (status?.runToken !== args.syncToken) return null;
    const now = Date.now();
    for (const source of args.employees) {
      const mapping = await ctx.db
        .query("workfeedEmployeeMappings")
        .withIndex(
          "by_organizationId_and_companyId_and_externalEmployeeId",
          (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("companyId", args.companyId)
              .eq("externalEmployeeId", source.id),
        )
        .unique();
      const displayName =
        [source.firstName, source.lastName].filter(Boolean).join(" ") ||
        "Ukendt medarbejder";
      const employeeValue = {
        firstName: source.firstName,
        lastName: source.lastName,
        displayName,
        normalizedName: displayName.toLocaleLowerCase("da"),
        imageUrl: source.imageUrl,
        active:
          status.lastEmployeeCompanyId &&
          status.lastEmployeeCompanyId !== args.companyId
            ? false
            : source.active,
        updatedAt: now,
      };
      let employeeId: Id<"employees">;
      const currentEmployee = mapping
        ? await ctx.db.get("employees", mapping.employeeId)
        : null;
      if (currentEmployee?.organizationId === args.organizationId) {
        employeeId = currentEmployee._id;
        await ctx.db.patch(employeeId, employeeValue);
      } else {
        employeeId = await ctx.db.insert("employees", {
          organizationId: args.organizationId,
          ...employeeValue,
        });
      }

      if (mapping) {
        await ctx.db.patch(mapping._id, {
          employeeId,
          syncToken: args.syncToken,
          lastSeenAt: now,
          pendingLocationIds: source.active ? source.locationIds : [],
          pendingActive: source.active,
        });
      } else {
        await ctx.db.insert("workfeedEmployeeMappings", {
          organizationId: args.organizationId,
          companyId: args.companyId,
          externalEmployeeId: source.id,
          employeeId,
          syncToken: args.syncToken,
          lastSeenAt: now,
          pendingLocationIds: source.active ? source.locationIds : [],
          pendingActive: source.active,
        });
      }
    }
    return null;
  },
});

export const completeEmployeeSnapshot = internalMutation({
  args: {
    organizationId: v.string(),
    companyId: v.string(),
    runToken: v.string(),
    phase: v.union(v.literal("employees"), v.literal("roles")),
    cursor: v.union(v.string(), v.null()),
    previousCompanyRetired: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = await ctx.db
      .query("workfeedSyncStatus")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    if (status?.runToken !== args.runToken) return null;

    if (
      args.phase === "employees" &&
      args.cursor === null &&
      !args.previousCompanyRetired &&
      status.lastEmployeeCompanyId &&
      status.lastEmployeeCompanyId !== args.companyId
    ) {
      await ctx.scheduler.runAfter(
        0,
        internal.workfeedSync.retireCompanyData,
        {
          organizationId: args.organizationId,
          companyId: status.lastEmployeeCompanyId,
          phase: "shifts",
          resumeEmployeeCompletion: { ...args, previousCompanyRetired: true },
        },
      );
      return null;
    }

    if (args.phase === "employees") {
      const result = await ctx.db
        .query("workfeedEmployeeMappings")
        .withIndex(
          "by_organizationId_and_companyId_and_externalEmployeeId",
          (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("companyId", args.companyId),
        )
        .paginate({ numItems: 10, cursor: args.cursor });
      const now = Date.now();
      for (const mapping of result.page) {
        const seen = mapping.syncToken === args.runToken;
        const employee = await ctx.db.get("employees", mapping.employeeId);
        if (
          !seen &&
          employee?.organizationId === args.organizationId &&
          employee.active
        ) {
          await ctx.db.patch(employee._id, { active: false, updatedAt: now });
        } else if (
          seen &&
          employee?.organizationId === args.organizationId &&
          mapping.pendingActive !== undefined &&
          employee.active !== mapping.pendingActive
        ) {
          await ctx.db.patch(employee._id, {
            active: mapping.pendingActive,
            updatedAt: now,
          });
        }
        const assignments = await ctx.db
          .query("employeeLocationAssignments")
          .withIndex("by_organizationId_and_employeeId", (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("employeeId", mapping.employeeId),
          )
          .take(MAX_LOCATIONS + 1);
        const desired = new Set(seen ? (mapping.pendingLocationIds ?? []) : []);
        for (const assignment of assignments) {
          if (!desired.has(assignment.locationId)) {
            await ctx.db.delete(assignment._id);
          } else {
            desired.delete(assignment.locationId);
          }
        }
        for (const locationId of desired) {
          await ctx.db.insert("employeeLocationAssignments", {
            organizationId: args.organizationId,
            employeeId: mapping.employeeId,
            locationId,
            updatedAt: now,
          });
        }
        if (
          mapping.pendingLocationIds !== undefined ||
          mapping.pendingActive !== undefined
        ) {
          await ctx.db.patch(mapping._id, {
            pendingLocationIds: undefined,
            pendingActive: undefined,
          });
        }
      }
      await ctx.scheduler.runAfter(
        0,
        internal.workfeedSync.completeEmployeeSnapshot,
        {
          organizationId: args.organizationId,
          companyId: args.companyId,
          runToken: args.runToken,
          phase: result.isDone ? "roles" : "employees",
          cursor: result.isDone ? null : result.continueCursor,
          previousCompanyRetired: args.previousCompanyRetired,
        },
      );
      return null;
    }

    const roles = await ctx.db
      .query("workfeedRoles")
      .withIndex(
        "by_organizationId_and_companyId_and_externalRoleId",
        (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("companyId", args.companyId),
      )
      .paginate({ numItems: 100, cursor: args.cursor });
    for (const role of roles.page) {
      if (role.syncToken !== args.runToken && role.active) {
        await ctx.db.patch(role._id, { active: false, updatedAt: Date.now() });
      }
    }
    if (!roles.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.workfeedSync.completeEmployeeSnapshot,
        { ...args, cursor: roles.continueCursor },
      );
      return null;
    }

    const now = Date.now();
    const shiftToken = runToken("shifts", now);
    const { windowStart, windowEnd } = shiftWindow(now);
    await ctx.db.patch(status._id, {
      state: "queued",
      runKind: "shifts",
      runToken: shiftToken,
      pendingShiftChunks: SHIFT_CHUNK_COUNT,
      lastEmployeeSuccessAt: now,
      lastEmployeeCompanyId: args.companyId,
      lastShiftAttemptAt: now,
      lastError: undefined,
      updatedAt: now,
    });
    const shiftRun = {
      organizationId: args.organizationId,
      runToken: shiftToken,
      windowStart,
      windowEnd,
      from: windowStart,
      to: Math.min(windowStart + CHUNK_MS, windowEnd),
    };
    await ctx.scheduler.runAfter(
      0,
      internal.workfeedSync.syncShiftChunk,
      shiftRun,
    );
    return null;
  },
});

export const syncEmployees = internalAction({
  args: { organizationId: v.string(), runToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.workfeedSync.markRunning, args);
    try {
      const context: EmployeeSyncContext | null = await ctx.runQuery(
        internal.workfeedSync.getEmployeeSyncContext,
        { organizationId: args.organizationId },
      );
      if (!context) throw new Error("Workfeed-integrationen er ikke aktiv");
      const [employeePayload, rolePayload] = await Promise.all([
        requestWorkfeed("/employees", context.settings),
        requestWorkfeed("/roles", context.settings),
      ]);
      const roles = parseRoles(rolePayload);
      for (let index = 0; index < roles.length; index += 100) {
        await ctx.runMutation(internal.workfeedSync.upsertRoleBatch, {
          organizationId: args.organizationId,
          companyId: context.settings.companyId,
          syncToken: args.runToken,
          roles: roles.slice(index, index + 100),
        });
      }

      const locationByDepartment = new Map(
        context.locations.map((location) => [
          location.departmentId,
          location.locationId,
        ]),
      );
      const employees = parseEmployees(employeePayload).map((employee) => ({
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        imageUrl: employee.imageUrl,
        active: employee.active,
        locationIds: employee.departmentIds.flatMap((departmentId) => {
          const locationId = locationByDepartment.get(departmentId);
          return locationId ? [locationId] : [];
        }),
      }));
      for (
        let index = 0;
        index < employees.length;
        index += EMPLOYEE_BATCH_SIZE
      ) {
        await ctx.runMutation(internal.workfeedSync.upsertEmployeeBatch, {
          organizationId: args.organizationId,
          companyId: context.settings.companyId,
          syncToken: args.runToken,
          employees: employees.slice(index, index + EMPLOYEE_BATCH_SIZE),
        });
      }
      await ctx.runMutation(internal.workfeedSync.completeEmployeeSnapshot, {
        organizationId: args.organizationId,
        companyId: context.settings.companyId,
        runToken: args.runToken,
        phase: "employees",
        cursor: null,
        previousCompanyRetired: false,
      });
    } catch (error) {
      await ctx.runMutation(internal.workfeedSync.failSync, {
        organizationId: args.organizationId,
        runToken: args.runToken,
        message: workfeedErrorMessage(error),
      });
    }
    return null;
  },
});

export const upsertShiftBatch = internalMutation({
  args: {
    organizationId: v.string(),
    companyId: v.string(),
    syncToken: v.string(),
    shifts: v.array(
      v.object({
        id: v.string(),
        employeeId: v.id("employees"),
        locationId: v.id("locations"),
        externalDepartmentId: v.string(),
        startsAt: v.number(),
        endsAt: v.number(),
        roleName: v.union(v.string(), v.null()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = await ctx.db
      .query("workfeedSyncStatus")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    if (status?.runToken !== args.syncToken) return null;
    const now = Date.now();
    for (const source of args.shifts) {
      const mapping = await ctx.db
        .query("workfeedShiftMappings")
        .withIndex(
          "by_organizationId_and_companyId_and_externalShiftId",
          (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("companyId", args.companyId)
              .eq("externalShiftId", source.id),
        )
        .unique();
      const value = {
        employeeId: source.employeeId,
        locationId: source.locationId,
        startsAt: source.startsAt,
        endsAt: source.endsAt,
        roleName: source.roleName,
        updatedAt: now,
      };
      let shiftId: Id<"scheduledShifts">;
      const currentShift = mapping
        ? await ctx.db.get("scheduledShifts", mapping.shiftId)
        : null;
      if (currentShift?.organizationId === args.organizationId) {
        shiftId = currentShift._id;
        if (
          currentShift.employeeId !== value.employeeId ||
          currentShift.locationId !== value.locationId ||
          currentShift.startsAt !== value.startsAt ||
          currentShift.endsAt !== value.endsAt ||
          currentShift.roleName !== value.roleName
        ) {
          await ctx.db.patch(shiftId, value);
        }
      } else {
        shiftId = await ctx.db.insert("scheduledShifts", {
          organizationId: args.organizationId,
          ...value,
        });
      }
      if (mapping) {
        await ctx.db.patch(mapping._id, {
          shiftId,
          externalDepartmentId: source.externalDepartmentId,
          startsAt: source.startsAt,
          syncToken: args.syncToken,
          lastSeenAt: now,
        });
      } else {
        await ctx.db.insert("workfeedShiftMappings", {
          organizationId: args.organizationId,
          companyId: args.companyId,
          externalShiftId: source.id,
          shiftId,
          externalDepartmentId: source.externalDepartmentId,
          startsAt: source.startsAt,
          syncToken: args.syncToken,
          lastSeenAt: now,
        });
      }
    }
    return null;
  },
});

export const syncShiftChunk = internalAction({
  args: {
    organizationId: v.string(),
    runToken: v.string(),
    windowStart: v.number(),
    windowEnd: v.number(),
    from: v.number(),
    to: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.workfeedSync.markRunning, {
      organizationId: args.organizationId,
      runToken: args.runToken,
    });
    try {
      const requestContext: ShiftRequestContext | null = await ctx.runQuery(
        internal.workfeedSync.getShiftRequestContext,
        { organizationId: args.organizationId },
      );
      if (
        !requestContext ||
        requestContext.runToken !== args.runToken ||
        requestContext.lastEmployeeCompanyId !==
          requestContext.settings.companyId
      ) {
        throw new Error("Medarbejderdata skal synkroniseres først");
      }
      const payload = await requestWorkfeed("/shifts", requestContext.settings, {
        startFrom: new Date(args.from).toISOString(),
        startTo: new Date(args.to).toISOString(),
        released: "true",
      });
      const sourceShifts = parseShifts(payload);
      const sourceHash = await shiftSourceHash(
        sourceShifts,
        requestContext.settings.companyId,
        requestContext.lastEmployeeSuccessAt,
      );
      const chunkIndex = Math.round((args.from - args.windowStart) / CHUNK_MS);
      if (
        chunkIndex < 0 ||
        chunkIndex >= SHIFT_CHUNK_COUNT ||
        !Number.isInteger(chunkIndex)
      ) {
        throw new Error("Ugyldigt interval i vagtsynkroniseringen");
      }
      if (requestContext.shiftChunkHashes[chunkIndex] === sourceHash) {
        await ctx.runMutation(
          internal.workfeedSync.skipUnchangedShiftChunk,
          {
            ...args,
            companyId: requestContext.settings.companyId,
            sourceHash,
            chunkIndex,
          },
        );
        return null;
      }
      const context: ShiftSyncContext | null = await ctx.runQuery(
        internal.workfeedSync.getShiftSyncContext,
        {
          organizationId: args.organizationId,
          companyId: requestContext.settings.companyId,
        },
      );
      if (
        !context ||
        context.runToken !== args.runToken ||
        context.lastEmployeeCompanyId !== context.settings.companyId
      ) {
        throw new Error("Medarbejderdata skal synkroniseres først");
      }
      const externalEmployeeIds = [...new Set(
        sourceShifts.map((shift) => shift.employeeId),
      )];
      const resolvedEmployees: Array<{
        externalEmployeeId: string;
        employeeId: Id<"employees">;
      }> = [];
      for (let index = 0; index < externalEmployeeIds.length; index += 100) {
        resolvedEmployees.push(
          ...await ctx.runQuery(
            internal.workfeedSync.resolveEmployeeMappings,
            {
              organizationId: args.organizationId,
              companyId: context.settings.companyId,
              externalEmployeeIds: externalEmployeeIds.slice(index, index + 100),
            },
          ),
        );
      }
      const employeeByExternalId = new Map(
        resolvedEmployees.map((employee) => [
          employee.externalEmployeeId,
          employee.employeeId,
        ]),
      );
      const locationByDepartment = new Map(
        context.locations.map((location) => [
          location.departmentId,
          location.locationId,
        ]),
      );
      const roleByExternalId = new Map(
        context.roles
          .filter((role) => role.active)
          .map((role) => [
            `${role.externalDepartmentId}:${role.externalRoleId}`,
            role.name,
          ]),
      );
      const shifts = sourceShifts.flatMap((shift) => {
        const employeeId = employeeByExternalId.get(shift.employeeId);
        const locationId = locationByDepartment.get(shift.departmentId);
        if (!employeeId || !locationId) return [];
        return [
          {
            id: shift.id,
            employeeId,
            locationId,
            externalDepartmentId: shift.departmentId,
            startsAt: shift.start,
            endsAt: shift.end,
            roleName: shift.roleId
              ? (roleByExternalId.get(
                  `${shift.departmentId}:${shift.roleId}`,
                ) ?? null)
              : null,
          },
        ];
      });
      for (let index = 0; index < shifts.length; index += SHIFT_BATCH_SIZE) {
        await ctx.runMutation(internal.workfeedSync.upsertShiftBatch, {
          organizationId: args.organizationId,
          companyId: context.settings.companyId,
          syncToken: args.runToken,
          shifts: shifts.slice(index, index + SHIFT_BATCH_SIZE),
        });
      }
      await ctx.runMutation(internal.workfeedSync.cleanupShiftChunk, {
        organizationId: args.organizationId,
        companyId: context.settings.companyId,
        runToken: args.runToken,
        windowStart: args.windowStart,
        windowEnd: args.windowEnd,
        from: args.from,
        to: args.to,
        cursor: null,
        sourceHash,
        chunkIndex,
      });
    } catch (error) {
      await ctx.runMutation(internal.workfeedSync.failSync, {
        organizationId: args.organizationId,
        runToken: args.runToken,
        message: workfeedErrorMessage(error),
      });
    }
    return null;
  },
});

export const skipUnchangedShiftChunk = internalMutation({
  args: {
    organizationId: v.string(),
    companyId: v.string(),
    runToken: v.string(),
    windowStart: v.number(),
    windowEnd: v.number(),
    from: v.number(),
    to: v.number(),
    sourceHash: v.string(),
    chunkIndex: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = await ctx.db
      .query("workfeedSyncStatus")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    if (status?.runToken !== args.runToken) return null;
    if (status.shiftChunkHashes?.[args.chunkIndex] !== args.sourceHash) {
      throw new Error("Vagtdata ændrede sig under synkroniseringen");
    }
    await finishShiftChunk(ctx, status, args);
    return null;
  },
});

export const cleanupShiftChunk = internalMutation({
  args: {
    organizationId: v.string(),
    companyId: v.string(),
    runToken: v.string(),
    windowStart: v.number(),
    windowEnd: v.number(),
    from: v.number(),
    to: v.number(),
    cursor: v.union(v.string(), v.null()),
    sourceHash: v.optional(v.string()),
    chunkIndex: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = await ctx.db
      .query("workfeedSyncStatus")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    if (status?.runToken !== args.runToken) return null;
    const result = await ctx.db
      .query("workfeedShiftMappings")
      .withIndex("by_organizationId_and_companyId_and_startsAt", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("companyId", args.companyId)
          .gte("startsAt", args.from)
          .lt("startsAt", args.to),
      )
      .paginate({ numItems: 200, cursor: args.cursor });
    for (const mapping of result.page) {
      if (mapping.syncToken === args.runToken) continue;
      const shift = await ctx.db.get("scheduledShifts", mapping.shiftId);
      if (shift?.organizationId === args.organizationId) {
        await ctx.db.delete(shift._id);
      }
      await ctx.db.delete(mapping._id);
    }
    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal.workfeedSync.cleanupShiftChunk, {
        ...args,
        cursor: result.continueCursor,
      });
      return null;
    }

    await finishShiftChunk(ctx, status, args);
    return null;
  },
});

export const pruneShifts = internalMutation({
  args: {
    organizationId: v.string(),
    companyId: v.string(),
    windowStart: v.number(),
    windowEnd: v.number(),
    phase: v.union(v.literal("before"), v.literal("after")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const base = ctx.db
      .query("workfeedShiftMappings")
      .withIndex("by_organizationId_and_companyId_and_startsAt", (q) => {
        const company = q
          .eq("organizationId", args.organizationId)
          .eq("companyId", args.companyId);
        return args.phase === "before"
          ? company.lt("startsAt", args.windowStart)
          : company.gte("startsAt", args.windowEnd);
      });
    const mappings = await base.take(100);
    for (const mapping of mappings) {
      const shift = await ctx.db.get("scheduledShifts", mapping.shiftId);
      if (shift?.organizationId === args.organizationId) {
        await ctx.db.delete(shift._id);
      }
      await ctx.db.delete(mapping._id);
    }
    if (mappings.length === 100) {
      await ctx.scheduler.runAfter(0, internal.workfeedSync.pruneShifts, args);
    } else if (args.phase === "before") {
      await ctx.scheduler.runAfter(0, internal.workfeedSync.pruneShifts, {
        ...args,
        phase: "after",
      });
    }
    return null;
  },
});

export const failSync = internalMutation({
  args: {
    organizationId: v.string(),
    runToken: v.string(),
    message: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const status = await ctx.db
      .query("workfeedSyncStatus")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    if (status?.runToken === args.runToken) {
      await ctx.db.patch(status._id, {
        state: "error",
        lastError: args.message.slice(0, 300),
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const retireCompanyData = internalMutation({
  args: {
    organizationId: v.string(),
    companyId: v.string(),
    phase: v.union(
      v.literal("shifts"),
      v.literal("employees"),
      v.literal("roles"),
    ),
    resumeShiftRun: v.optional(
      v.object({
        organizationId: v.string(),
        runToken: v.string(),
        windowStart: v.number(),
        windowEnd: v.number(),
        from: v.number(),
        to: v.number(),
      }),
    ),
    resumeEmployeeCompletion: v.optional(
      v.object({
        organizationId: v.string(),
        companyId: v.string(),
        runToken: v.string(),
        phase: v.union(v.literal("employees"), v.literal("roles")),
        cursor: v.union(v.string(), v.null()),
        previousCompanyRetired: v.boolean(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.phase === "shifts") {
      const mappings = await ctx.db
        .query("workfeedShiftMappings")
        .withIndex("by_organizationId_and_companyId_and_startsAt", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("companyId", args.companyId),
        )
        .take(100);
      for (const mapping of mappings) {
        const shift = await ctx.db.get("scheduledShifts", mapping.shiftId);
        if (shift?.organizationId === args.organizationId) {
          await ctx.db.delete(shift._id);
        }
        await ctx.db.delete(mapping._id);
      }
      await ctx.scheduler.runAfter(0, internal.workfeedSync.retireCompanyData, {
        ...args,
        phase: mappings.length === 100 ? "shifts" : "employees",
      });
      return null;
    }

    if (args.phase === "employees") {
      const mappings = await ctx.db
        .query("workfeedEmployeeMappings")
        .withIndex(
          "by_organizationId_and_companyId_and_externalEmployeeId",
          (q) =>
            q
              .eq("organizationId", args.organizationId)
              .eq("companyId", args.companyId),
        )
        .take(50);
      for (const mapping of mappings) {
        const employee = await ctx.db.get("employees", mapping.employeeId);
        if (employee?.organizationId === args.organizationId) {
          await ctx.db.patch(employee._id, {
            active: false,
            updatedAt: Date.now(),
          });
          const assignments = await ctx.db
            .query("employeeLocationAssignments")
            .withIndex("by_organizationId_and_employeeId", (q) =>
              q
                .eq("organizationId", args.organizationId)
                .eq("employeeId", employee._id),
            )
            .take(MAX_LOCATIONS + 1);
          for (const assignment of assignments) {
            await ctx.db.delete(assignment._id);
          }
        }
        await ctx.db.delete(mapping._id);
      }
      await ctx.scheduler.runAfter(0, internal.workfeedSync.retireCompanyData, {
        ...args,
        phase: mappings.length === 50 ? "employees" : "roles",
      });
      return null;
    }

    const roles = await ctx.db
      .query("workfeedRoles")
      .withIndex(
        "by_organizationId_and_companyId_and_externalRoleId",
        (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("companyId", args.companyId),
      )
      .take(100);
    for (const role of roles) await ctx.db.delete(role._id);
    if (roles.length === 100) {
      await ctx.scheduler.runAfter(
        0,
        internal.workfeedSync.retireCompanyData,
        args,
      );
    } else if (args.resumeEmployeeCompletion) {
      await ctx.scheduler.runAfter(
        0,
        internal.workfeedSync.completeEmployeeSnapshot,
        args.resumeEmployeeCompletion,
      );
    } else if (args.resumeShiftRun) {
      await ctx.scheduler.runAfter(
        0,
        internal.workfeedSync.syncShiftChunk,
        args.resumeShiftRun,
      );
    }
    return null;
  },
});
