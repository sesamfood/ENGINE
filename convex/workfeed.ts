import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireOrganization, requireOrganizationAdmin } from "./lib/auth";

const API_URL =
  "https://europe-west1-production-eu-327a3.cloudfunctions.net/api";
const MAX_LOCATIONS = 200;
const MAX_DEPARTMENTS = 500;
const MAX_EMPLOYEES = 5_000;
const MAX_SHIFTS = 10_000;
const MAX_DAY_MS = 27 * 60 * 60 * 1_000;

const privateSettingsValidator = v.union(
  v.object({
    apiKey: v.string(),
    companyId: v.string(),
    enabled: v.boolean(),
  }),
  v.null(),
);

const departmentValidator = v.object({
  id: v.string(),
  name: v.string(),
});

const dailyContextValidator = v.union(
  v.object({
    apiKey: v.string(),
    companyId: v.string(),
    enabled: v.boolean(),
    locations: v.array(
      v.object({
        locationId: v.id("locations"),
        locationName: v.string(),
        departmentId: v.string(),
        departmentName: v.string(),
      }),
    ),
  }),
  v.null(),
);

const shiftResultValidator = v.object({
  id: v.string(),
  employeeId: v.string(),
  employeeName: v.string(),
  imageUrl: v.union(v.string(), v.null()),
  start: v.number(),
  end: v.number(),
});

type WorkfeedSettings = {
  apiKey: string;
  companyId: string;
  enabled: boolean;
};

type WorkfeedDepartment = {
  id: string;
  name: string;
};

type WorkfeedEmployee = {
  id: string;
  name: string;
  imageUrl: string | null;
};

type WorkfeedShift = {
  id: string;
  employeeId: string;
  departmentId: string;
  start: number;
  end: number;
};

type DailyContext = WorkfeedSettings & {
  locations: Array<{
    locationId: Id<"locations">;
    locationName: string;
    departmentId: string;
    departmentName: string;
  }>;
};

type DailyEmployeesResult = {
  locations: Array<{
    locationId: Id<"locations">;
    locationName: string;
    departmentName: string;
    shifts: Array<{
      id: string;
      employeeId: string;
      employeeName: string;
      imageUrl: string | null;
      start: number;
      end: number;
    }>;
  }>;
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function string(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function requireCredential(value: string, label: string, maxLength: number) {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) {
    throw new ConvexError(`Indtast et gyldigt ${label}`);
  }
  return trimmed;
}

async function requestWorkfeed(
  path: string,
  settings: Pick<WorkfeedSettings, "apiKey" | "companyId">,
  query?: Record<string, string>,
) {
  const url = new URL(
    `${API_URL}/companies/${encodeURIComponent(settings.companyId)}${path}`,
  );
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: settings.apiKey,
      },
    });
  } catch {
    throw new ConvexError("Workfeed kunne ikke kontaktes");
  }

  if (response.status === 401 || response.status === 403) {
    throw new ConvexError("Workfeed afviste firma-id eller API-nøgle");
  }
  if (!response.ok) {
    throw new ConvexError(`Workfeed svarede med status ${response.status}`);
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ConvexError("Workfeed returnerede et ugyldigt svar");
  }
}

function parseDepartments(payload: unknown): WorkfeedDepartment[] {
  if (!Array.isArray(payload)) {
    throw new ConvexError("Workfeed returnerede en ugyldig afdelingsliste");
  }
  if (payload.length > MAX_DEPARTMENTS) {
    throw new ConvexError("Workfeed-kontoen har for mange afdelinger");
  }

  return payload.flatMap((value) => {
    const department = object(value);
    const id = string(department?.id);
    const name = string(department?.name);
    if (!id || !name || department?.isDeleted === true) return [];
    return [{ id, name }];
  });
}

function parseEmployees(payload: unknown): WorkfeedEmployee[] {
  if (!Array.isArray(payload)) {
    throw new ConvexError("Workfeed returnerede en ugyldig medarbejderliste");
  }
  if (payload.length > MAX_EMPLOYEES) {
    throw new ConvexError("Workfeed-kontoen har for mange medarbejdere");
  }

  return payload.flatMap((value) => {
    const employee = object(value);
    const id = string(employee?.id);
    if (!id || employee?.isDeleted === true) return [];
    const name = [string(employee?.firstname), string(employee?.lastname)]
      .filter(Boolean)
      .join(" ");
    const imageUrl = string(employee?.imageURL);
    return [
      {
        id,
        name: name || "Ukendt medarbejder",
        imageUrl: imageUrl.startsWith("https://") ? imageUrl : null,
      },
    ];
  });
}

function parseShifts(payload: unknown): WorkfeedShift[] {
  if (!Array.isArray(payload)) {
    throw new ConvexError("Workfeed returnerede en ugyldig vagtliste");
  }
  if (payload.length > MAX_SHIFTS) {
    throw new ConvexError("Der er for mange Workfeed-vagter i perioden");
  }

  return payload.flatMap((value) => {
    const shift = object(value);
    const id = string(shift?.id);
    const employeeId = string(shift?.employeeID);
    const departmentId = string(shift?.departmentID);
    const start = Date.parse(string(shift?.start));
    const end = Date.parse(string(shift?.end));
    if (
      !id ||
      !employeeId ||
      !departmentId ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start
    ) {
      return [];
    }
    return [{ id, employeeId, departmentId, start, end }];
  });
}

async function requireConnectedSettings(
  ctx: ActionCtx,
): Promise<{ organizationId: string; settings: WorkfeedSettings }> {
  const { organizationId } = await requireOrganizationAdmin(ctx);
  const settings: WorkfeedSettings | null = await ctx.runQuery(
    internal.workfeed.getPrivateSettings,
    { organizationId },
  );
  if (!settings) throw new ConvexError("Workfeed er ikke forbundet");
  return { organizationId, settings };
}

export const getSettings = query({
  args: {},
  returns: v.object({
    connected: v.boolean(),
    enabled: v.boolean(),
    companyId: v.union(v.string(), v.null()),
    connectedAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    const settings = await ctx.db
      .query("workfeedIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .unique();
    return {
      connected: Boolean(settings),
      enabled: settings?.enabled ?? false,
      companyId: settings?.companyId ?? null,
      connectedAt: settings?.connectedAt ?? null,
    };
  },
});

export const isEnabled = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const { organizationId } = await requireOrganization(ctx);
    const settings = await ctx.db
      .query("workfeedIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .unique();
    return settings?.enabled ?? false;
  },
});

export const listLocationMappings = query({
  args: {},
  returns: v.object({
    locations: v.array(
      v.object({
        id: v.id("locations"),
        name: v.string(),
        departmentId: v.union(v.string(), v.null()),
        departmentName: v.union(v.string(), v.null()),
      }),
    ),
    limitReached: v.boolean(),
  }),
  handler: async (ctx) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    const [locations, mappings] = await Promise.all([
      ctx.db
        .query("locations")
        .withIndex("by_organizationId_and_normalizedName", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_LOCATIONS + 1),
      ctx.db
        .query("workfeedLocationMappings")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_LOCATIONS + 1),
    ]);
    if (mappings.length > MAX_LOCATIONS) {
      throw new ConvexError("Der er for mange Workfeed-koblinger");
    }
    const byLocationId = new Map(
      mappings.map((mapping) => [mapping.locationId, mapping]),
    );

    return {
      locations: locations.slice(0, MAX_LOCATIONS).map((location) => {
        const mapping = byLocationId.get(location._id);
        return {
          id: location._id,
          name: location.name,
          departmentId: mapping?.departmentId ?? null,
          departmentName: mapping?.departmentName ?? null,
        };
      }),
      limitReached: locations.length > MAX_LOCATIONS,
    };
  },
});

export const getPrivateSettings = internalQuery({
  args: { organizationId: v.string() },
  returns: privateSettingsValidator,
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("workfeedIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    return settings
      ? {
          apiKey: settings.apiKey,
          companyId: settings.companyId,
          enabled: settings.enabled,
        }
      : null;
  },
});

export const getDailyContext = internalQuery({
  args: { organizationId: v.string() },
  returns: dailyContextValidator,
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("workfeedIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    if (!settings) return null;
    const mappings = await ctx.db
      .query("workfeedLocationMappings")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .take(MAX_LOCATIONS + 1);
    if (mappings.length > MAX_LOCATIONS) {
      throw new ConvexError("Der er for mange Workfeed-koblinger");
    }
    const locations = await Promise.all(
      mappings.map(async (mapping) => {
        const location = await ctx.db.get("locations", mapping.locationId);
        return location?.organizationId === args.organizationId
          ? {
              locationId: location._id,
              locationName: location.name,
              departmentId: mapping.departmentId,
              departmentName: mapping.departmentName,
            }
          : null;
      }),
    );
    return {
      apiKey: settings.apiKey,
      companyId: settings.companyId,
      enabled: settings.enabled,
      locations: locations.filter((location) => location !== null),
    };
  },
});

export const saveConnection = internalMutation({
  args: {
    organizationId: v.string(),
    apiKey: v.string(),
    companyId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const current = await ctx.db
      .query("workfeedIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    const now = Date.now();
    if (current && current.companyId !== args.companyId) {
      const mappings = await ctx.db
        .query("workfeedLocationMappings")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", args.organizationId),
        )
        .take(MAX_LOCATIONS + 1);
      if (mappings.length > MAX_LOCATIONS) {
        throw new ConvexError("Der er for mange Workfeed-koblinger");
      }
      for (const mapping of mappings) await ctx.db.delete(mapping._id);
    }
    if (current) {
      await ctx.db.patch(current._id, {
        apiKey: args.apiKey,
        companyId: args.companyId,
        enabled: true,
        connectedAt: now,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("workfeedIntegrations", {
        organizationId: args.organizationId,
        apiKey: args.apiKey,
        companyId: args.companyId,
        enabled: true,
        connectedAt: now,
        updatedAt: now,
      });
    }
    return null;
  },
});

export const setEnabledInternal = internalMutation({
  args: { organizationId: v.string(), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("workfeedIntegrations")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    if (!settings) throw new ConvexError("Workfeed er ikke forbundet");
    await ctx.db.patch(settings._id, {
      enabled: args.enabled,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const saveLocationMappingInternal = internalMutation({
  args: {
    organizationId: v.string(),
    locationId: v.id("locations"),
    departmentId: v.string(),
    departmentName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [location, current, departmentMapping] = await Promise.all([
      ctx.db.get("locations", args.locationId),
      ctx.db
        .query("workfeedLocationMappings")
        .withIndex("by_organizationId_and_locationId", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("locationId", args.locationId),
        )
        .unique(),
      ctx.db
        .query("workfeedLocationMappings")
        .withIndex("by_organizationId_and_departmentId", (q) =>
          q
            .eq("organizationId", args.organizationId)
            .eq("departmentId", args.departmentId),
        )
        .unique(),
    ]);
    if (!location || location.organizationId !== args.organizationId) {
      throw new ConvexError("Lokationen blev ikke fundet");
    }
    if (departmentMapping && departmentMapping.locationId !== args.locationId) {
      throw new ConvexError(
        "Workfeed-afdelingen er allerede koblet til en lokation",
      );
    }
    if (current) {
      await ctx.db.patch(current._id, {
        departmentId: args.departmentId,
        departmentName: args.departmentName,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("workfeedLocationMappings", {
        organizationId: args.organizationId,
        locationId: args.locationId,
        departmentId: args.departmentId,
        departmentName: args.departmentName,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
});

export const connect = action({
  args: { apiKey: v.string(), companyId: v.string() },
  returns: v.object({ departmentCount: v.number() }),
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    const apiKey = requireCredential(args.apiKey, "Workfeed API-nøgle", 500);
    const companyId = requireCredential(
      args.companyId,
      "Workfeed firma-id",
      200,
    );
    const departments = parseDepartments(
      await requestWorkfeed("/departments", { apiKey, companyId }),
    );
    await ctx.runMutation(internal.workfeed.saveConnection, {
      organizationId,
      apiKey,
      companyId,
    });
    return { departmentCount: departments.length };
  },
});

export const setEnabled = action({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId, settings } = await requireConnectedSettings(ctx);
    if (args.enabled) {
      parseDepartments(await requestWorkfeed("/departments", settings));
    }
    await ctx.runMutation(internal.workfeed.setEnabledInternal, {
      organizationId,
      enabled: args.enabled,
    });
    return null;
  },
});

export const listDepartments = action({
  args: {},
  returns: v.array(departmentValidator),
  handler: async (ctx): Promise<WorkfeedDepartment[]> => {
    const { settings } = await requireConnectedSettings(ctx);
    return parseDepartments(await requestWorkfeed("/departments", settings));
  },
});

export const saveLocationMapping = action({
  args: {
    locationId: v.id("locations"),
    departmentId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId, settings } = await requireConnectedSettings(ctx);
    const departmentId = requireCredential(
      args.departmentId,
      "Workfeed-afdeling",
      200,
    );
    const department = parseDepartments(
      await requestWorkfeed("/departments", settings),
    ).find((item) => item.id === departmentId);
    if (!department) {
      throw new ConvexError("Workfeed-afdelingen blev ikke fundet");
    }
    await ctx.runMutation(internal.workfeed.saveLocationMappingInternal, {
      organizationId,
      locationId: args.locationId,
      departmentId: department.id,
      departmentName: department.name,
    });
    return null;
  },
});

export const removeLocationMapping = mutation({
  args: { locationId: v.id("locations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    const mapping = await ctx.db
      .query("workfeedLocationMappings")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q
          .eq("organizationId", organizationId)
          .eq("locationId", args.locationId),
      )
      .unique();
    if (mapping) await ctx.db.delete(mapping._id);
    return null;
  },
});

export const disconnect = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    const [settings, mappings] = await Promise.all([
      ctx.db
        .query("workfeedIntegrations")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .unique(),
      ctx.db
        .query("workfeedLocationMappings")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(MAX_LOCATIONS + 1),
    ]);
    if (mappings.length > MAX_LOCATIONS) {
      throw new ConvexError("Der er for mange Workfeed-koblinger");
    }
    for (const mapping of mappings) await ctx.db.delete(mapping._id);
    if (settings) await ctx.db.delete(settings._id);
    return null;
  },
});

export const listDailyEmployees = action({
  args: { from: v.number(), to: v.number() },
  returns: v.object({
    locations: v.array(
      v.object({
        locationId: v.id("locations"),
        locationName: v.string(),
        departmentName: v.string(),
        shifts: v.array(shiftResultValidator),
      }),
    ),
  }),
  handler: async (ctx, args): Promise<DailyEmployeesResult> => {
    const { organizationId } = await requireOrganization(ctx);
    if (
      !Number.isSafeInteger(args.from) ||
      !Number.isSafeInteger(args.to) ||
      args.to <= args.from ||
      args.to - args.from > MAX_DAY_MS
    ) {
      throw new ConvexError("Datoen er ugyldig");
    }
    const context: DailyContext | null = await ctx.runQuery(
      internal.workfeed.getDailyContext,
      {
        organizationId,
      },
    );
    if (!context?.enabled) {
      throw new ConvexError("Workfeed-integrationen er ikke aktiv");
    }
    if (context.locations.length === 0) return { locations: [] };

    const [shiftPayload, employeePayload] = await Promise.all([
      requestWorkfeed("/shifts", context, {
        startFrom: new Date(args.from - 24 * 60 * 60 * 1_000).toISOString(),
        startTo: new Date(args.to).toISOString(),
        released: "true",
      }),
      requestWorkfeed("/employees", context),
    ]);
    const shifts = parseShifts(shiftPayload).filter(
      (shift) => shift.start < args.to && shift.end > args.from,
    );
    const employees = new Map(
      parseEmployees(employeePayload).map((employee) => [
        employee.id,
        employee,
      ]),
    );

    return {
      locations: context.locations.map((location) => ({
        locationId: location.locationId,
        locationName: location.locationName,
        departmentName: location.departmentName,
        shifts: shifts
          .filter((shift) => shift.departmentId === location.departmentId)
          .map((shift) => {
            const employee = employees.get(shift.employeeId);
            return {
              id: shift.id,
              employeeId: shift.employeeId,
              employeeName: employee?.name ?? "Ukendt medarbejder",
              imageUrl: employee?.imageUrl ?? null,
              start: shift.start,
              end: shift.end,
            };
          })
          .sort((a, b) => a.start - b.start),
      })),
    };
  },
});
