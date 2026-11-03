import { requireOrganizationLocation as requireLocation } from "./lib/locations";
import { ConvexError, v } from "convex/values";
import { hasPermission } from "../lib/auth-permissions";
import { kioskDestinations } from "../lib/kiosk";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { createAuth, getDatabaseAdapter } from "./auth";
import {
  requireAllLocationAccess,
  requireLocationAccess,
  requireMemberManager,
  requireOrganization,
  requireOrganizationAdmin,
} from "./lib/auth";

const pageIds = new Set<string>(kioskDestinations.map((page) => page.id));
const roleValidator = v.union(
  v.literal("admin"),
  v.literal("manager"),
  v.literal("member"),
);
const settingsValidator = v.object({
  enabledPages: v.array(v.string()),
  homePage: v.string(),
  inactivitySeconds: v.union(v.number(), v.null()),
  allowLeavingStartOfDay: v.boolean(),
  pinPages: v.array(v.string()),
  updatedAt: v.number(),
});
const accountValidator = v.object({
  memberId: v.string(),
  userId: v.string(),
  name: v.string(),
  username: v.string(),
  role: roleValidator,
  locationId: v.id("locations"),
  locationName: v.string(),
  activeSessionCount: v.number(),
});

type Member = {
  id: string;
  organizationId: string;
  userId: string;
  role: "admin" | "manager" | "member";
  kioskLocationId?: string | null;
  createdAt: Date;
};

type User = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  username?: string | null;
  displayUsername?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function validateSettings(
  enabledPages: string[],
  homePage: string,
  inactivitySeconds: number | null,
  pinPages: string[] = [],
) {
  if (!enabledPages.length) throw new ConvexError("Vælg mindst én kioskside");
  if (new Set(enabledPages).size !== enabledPages.length) {
    throw new ConvexError("En kioskside er valgt flere gange");
  }
  if (enabledPages.some((page) => !pageIds.has(page))) {
    throw new ConvexError("En valgt kioskside findes ikke");
  }
  if (!enabledPages.includes(homePage)) {
    throw new ConvexError("Startsiden skal være aktiveret");
  }
  if (pinPages.some((page) => !enabledPages.includes(page))) {
    throw new ConvexError("PIN-kode kan kun kræves på aktiverede sider");
  }
  if (
    inactivitySeconds !== null &&
    (!Number.isInteger(inactivitySeconds) ||
      inactivitySeconds < 5 ||
      inactivitySeconds > 3600)
  ) {
    throw new ConvexError("Inaktivitet skal være mellem 5 og 3600 sekunder");
  }
}

function validateUsername(value: string) {
  const username = value.trim().toLowerCase();
  if (!/^[a-z0-9_.]{3,30}$/.test(username)) {
    throw new ConvexError(
      "Brugernavnet skal have 3–30 tegn. Brug kun bogstaver, tal, punktum og understregning",
    );
  }
  return username;
}

function validatePassword(password: string) {
  if (password.length < 12 || password.length > 256) {
    throw new ConvexError("Adgangskoden skal være mellem 12 og 256 tegn");
  }
}

async function requireKioskAccountManager(ctx: QueryCtx | MutationCtx) {
  const auth = await requireMemberManager(ctx);
  requireAllLocationAccess(auth);
  if (!hasPermission(auth.role, auth.permissions, "roles.manage")) {
    throw new ConvexError("Du har ikke adgang til at administrere roller");
  }
  return auth;
}

async function requireKioskMember(
  ctx: Parameters<typeof getDatabaseAdapter>[0],
  organizationId: string,
  memberId: string,
) {
  const member = await getDatabaseAdapter(ctx).findOne<Member>({
    model: "member",
    where: [{ field: "id", value: memberId }],
  });
  if (
    !member ||
    member.organizationId !== organizationId ||
    !member.kioskLocationId
  ) {
    throw new ConvexError("Kioskkontoen blev ikke fundet");
  }
  return member;
}

export const getAdminSettings = query({
  args: {},
  returns: v.union(settingsValidator, v.null()),
  handler: async (ctx) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    const settings = await ctx.db
      .query("kioskSettings")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .unique();
    return settings
      ? {
          enabledPages: settings.enabledPages,
          homePage: settings.homePage,
          inactivitySeconds: settings.inactivitySeconds,
          allowLeavingStartOfDay: settings.allowLeavingStartOfDay ?? false,
          pinPages: settings.pinPages ?? [],
          updatedAt: settings.updatedAt,
        }
      : null;
  },
});

export const saveSettings = mutation({
  args: {
    enabledPages: v.array(v.string()),
    homePage: v.string(),
    inactivitySeconds: v.union(v.number(), v.null()),
    allowLeavingStartOfDay: v.optional(v.boolean()),
    pinPages: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    validateSettings(
      args.enabledPages,
      args.homePage,
      args.inactivitySeconds,
      args.pinPages,
    );
    const current = await ctx.db
      .query("kioskSettings")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .unique();
    const data = { ...args, updatedAt: Date.now() };
    if (current) await ctx.db.patch("kioskSettings", current._id, data);
    else await ctx.db.insert("kioskSettings", { organizationId, ...data });
    return null;
  },
});

export const listAccounts = query({
  args: {},
  returns: v.array(accountValidator),
  handler: async (ctx) => {
    const { organizationId } = await requireKioskAccountManager(ctx);
    const adapter = getDatabaseAdapter(ctx);
    const members = await adapter.findMany<Member>({
      model: "member",
      where: [{ field: "organizationId", value: organizationId }],
      limit: 100,
    });
    const result = [];
    for (const member of members) {
      if (!member.kioskLocationId) continue;
      const locationId = member.kioskLocationId as Id<"locations">;
      const [user, location, activeSessionCount] = await Promise.all([
        adapter.findOne<User>({
          model: "user",
          where: [{ field: "id", value: member.userId }],
        }),
        ctx.db.get("locations", locationId),
        adapter.count({
          model: "session",
          where: [
            { field: "userId", value: member.userId },
            { field: "expiresAt", value: Date.now(), operator: "gt" },
          ],
        }),
      ]);
      if (!user?.username || !location || location.organizationId !== organizationId) {
        continue;
      }
      result.push({
        memberId: member.id,
        userId: member.userId,
        name: user.name,
        username: user.displayUsername || user.username,
        role: member.role,
        locationId,
        locationName: location.name,
        activeSessionCount,
      });
    }
    return result;
  },
});

export const createAccount = mutation({
  args: {
    name: v.string(),
    username: v.string(),
    password: v.string(),
    locationId: v.id("locations"),
    role: roleValidator,
  },
  returns: v.object({ memberId: v.string(), userId: v.string() }),
  handler: async (ctx, args) => {
    const auth = await requireKioskAccountManager(ctx);
    const { organizationId } = auth;
    const settings = await ctx.db
      .query("kioskSettings")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .unique();
    if (!settings) {
      throw new ConvexError("Gem kioskopsætningen, før du opretter en konto");
    }
    validateSettings(
      settings.enabledPages,
      settings.homePage,
      settings.inactivitySeconds,
    );
    await requireLocation(ctx, organizationId, args.locationId);
    const name = args.name.trim();
    if (!name) throw new ConvexError("Navn er påkrævet");
    const username = validateUsername(args.username);
    validatePassword(args.password);

    const adapter = getDatabaseAdapter(ctx);
    const existing = await adapter.findOne<User>({
      model: "user",
      where: [{ field: "username", value: username }],
    });
    if (existing) throw new ConvexError("Brugernavnet er allerede i brug");

    const authContext = await createAuth(ctx).$context;
    const now = new Date();
    const user = await adapter.create<User>({
      model: "user",
      data: {
        name,
        email: `${crypto.randomUUID()}@kiosk.invalid`,
        emailVerified: true,
        username,
        displayUsername: args.username.trim(),
        createdAt: now,
        updatedAt: now,
      },
    });
    const password = await authContext.password.hash(args.password);
    await adapter.create({
      model: "account",
      data: {
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password,
        createdAt: now,
        updatedAt: now,
      },
    });
    const member = await adapter.create<Member>({
      model: "member",
      data: {
        organizationId,
        userId: user.id,
        role: args.role,
        kioskLocationId: args.locationId,
        createdAt: now,
      },
    });
    return { memberId: member.id, userId: user.id };
  },
});

export const updateAccount = mutation({
  args: {
    memberId: v.string(),
    name: v.string(),
    locationId: v.id("locations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireKioskAccountManager(ctx);
    const { organizationId } = auth;
    const member = await requireKioskMember(ctx, organizationId, args.memberId);
    await requireLocation(ctx, organizationId, args.locationId);
    const name = args.name.trim();
    if (!name) throw new ConvexError("Navn er påkrævet");
    const adapter = getDatabaseAdapter(ctx);
    await Promise.all([
      adapter.update({
        model: "user",
        where: [{ field: "id", value: member.userId }],
        update: { name, updatedAt: new Date() },
      }),
      adapter.update({
        model: "member",
        where: [{ field: "id", value: member.id }],
        update: { kioskLocationId: args.locationId },
      }),
    ]);
    return null;
  },
});

export const setPassword = mutation({
  args: { memberId: v.string(), password: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireKioskAccountManager(ctx);
    const member = await requireKioskMember(ctx, organizationId, args.memberId);
    validatePassword(args.password);
    const password = await (await createAuth(ctx).$context).password.hash(
      args.password,
    );
    await getDatabaseAdapter(ctx).update({
      model: "account",
      where: [
        { field: "userId", value: member.userId },
        { field: "providerId", value: "credential" },
      ],
      update: { password, updatedAt: new Date() },
    });
    return null;
  },
});

export const revokeAccountSessions = mutation({
  args: { memberId: v.string() },
  returns: v.object({ revokedSessions: v.number() }),
  handler: async (ctx, args) => {
    const { organizationId } = await requireKioskAccountManager(ctx);
    const member = await requireKioskMember(ctx, organizationId, args.memberId);
    const adapter = getDatabaseAdapter(ctx);
    const revokedSessions = await adapter.count({
      model: "session",
      where: [
        { field: "userId", value: member.userId },
        { field: "expiresAt", value: Date.now(), operator: "gt" },
      ],
    });
    await adapter.deleteMany({
      model: "session",
      where: [{ field: "userId", value: member.userId }],
    });
    return { revokedSessions };
  },
});

export const deleteAccount = mutation({
  args: { memberId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { organizationId } = await requireKioskAccountManager(ctx);
    const member = await requireKioskMember(ctx, organizationId, args.memberId);
    const adapter = getDatabaseAdapter(ctx);
    await adapter.deleteMany({
      model: "session",
      where: [{ field: "userId", value: member.userId }],
    });
    await adapter.deleteMany({
      model: "account",
      where: [{ field: "userId", value: member.userId }],
    });
    await adapter.delete({
      model: "member",
      where: [{ field: "id", value: member.id }],
    });
    const locationAccess = await ctx.db
      .query("memberLocationAccess")
      .withIndex("by_organizationId_and_userId", (q) =>
        q.eq("organizationId", organizationId).eq("userId", member.userId),
      )
      .unique();
    if (locationAccess) {
      await ctx.db.delete("memberLocationAccess", locationAccess._id);
    }
    await adapter.delete({
      model: "user",
      where: [{ field: "id", value: member.userId }],
    });
    return null;
  },
});

export const enterSessionKiosk = mutation({
  args: { locationId: v.id("locations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireOrganizationAdmin(ctx);
    if (auth.isKioskAccount || !auth.sessionId || auth.principalKind !== "user") {
      throw new ConvexError("Kiosktilstand kan ikke startes for denne konto");
    }
    requireLocationAccess(auth, args.locationId);
    await requireLocation(ctx, auth.organizationId, args.locationId);
    const settings = await ctx.db
      .query("kioskSettings")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", auth.organizationId))
      .unique();
    if (!settings) throw new ConvexError("Gem kioskopsætningen, før du starter kiosktilstand");
    const sessionId = auth.sessionId;
    const current = await ctx.db
      .query("kioskSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .unique();
    const data = { sessionId, organizationId: auth.organizationId, locationId: args.locationId };
    if (current) await ctx.db.replace("kioskSessions", current._id, data);
    else await ctx.db.insert("kioskSessions", data);
    await getDatabaseAdapter(ctx).update({
      model: "session",
      where: [{ field: "id", value: sessionId }],
      update: { kioskModeEnabled: true, updatedAt: new Date() },
    });
    return null;
  },
});

export const setMode = mutation({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    if (!auth.isKioskAccount) throw new ConvexError("Kontoen er ikke en kiosk");
    const sessionId = auth.sessionId;
    const kioskSession = sessionId
      ? await ctx.db
          .query("kioskSessions")
          .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
          .unique()
      : null;
    // A regular user's session leaves kiosk mode completely.
    if (kioskSession && !args.enabled) {
      await ctx.db.delete("kioskSessions", kioskSession._id);
    }
    await getDatabaseAdapter(ctx).update({
      model: "session",
      where: [{ field: "id", value: auth.sessionId }],
      update: { kioskModeEnabled: args.enabled, updatedAt: new Date() },
    });
    return null;
  },
});

export const listPinLocations = query({
  args: {},
  returns: v.array(v.id("locations")),
  handler: async (ctx) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    const pins = await ctx.db
      .query("kioskPins")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .take(500);
    return pins.map((pin) => pin.locationId);
  },
});

export const setLocationPin = mutation({
  args: { locationId: v.id("locations"), pin: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireOrganizationAdmin(ctx);
    const { organizationId } = auth;
    requireLocationAccess(auth, args.locationId);
    await requireLocation(ctx, organizationId, args.locationId);
    if (args.pin !== null && !/^\d{4,8}$/.test(args.pin)) {
      throw new ConvexError("PIN-koden skal være 4–8 cifre");
    }
    const current = await ctx.db
      .query("kioskPins")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", organizationId).eq("locationId", args.locationId),
      )
      .unique();
    if (args.pin === null) {
      if (current) await ctx.db.delete("kioskPins", current._id);
      return null;
    }
    const pinHash = await (await createAuth(ctx).$context).password.hash(args.pin);
    const data = { pinHash, updatedAt: Date.now() };
    if (current) await ctx.db.patch("kioskPins", current._id, data);
    else {
      await ctx.db.insert("kioskPins", {
        organizationId,
        locationId: args.locationId,
        ...data,
      });
    }
    return null;
  },
});

const MAX_PIN_ATTEMPTS = 5;
const PIN_BLOCK_MS = 5 * 60_000;

// Returns an error message instead of throwing so failed attempts are saved.
export const unlockPinPages = mutation({
  args: { pin: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const sessionId = auth.sessionId;
    if (!auth.kioskModeEnabled || !auth.kioskLocationId || !sessionId) {
      throw new ConvexError("Kiosktilstand er ikke aktiv");
    }
    const kioskLocationId = auth.kioskLocationId;
    const pin = await ctx.db
      .query("kioskPins")
      .withIndex("by_organizationId_and_locationId", (q) =>
        q.eq("organizationId", auth.organizationId).eq("locationId", kioskLocationId),
      )
      .unique();
    if (!pin) return null;
    const current = await ctx.db
      .query("kioskPinUnlocks")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .unique();
    const now = Date.now();
    if (current?.blockedUntil && current.blockedUntil > now) {
      return "For mange forkerte forsøg. Prøv igen om et par minutter";
    }
    const valid = await (await createAuth(ctx).$context).password.verify({
      password: args.pin,
      hash: pin.pinHash,
    });
    const failedAttempts = valid ? 0 : (current?.failedAttempts ?? 0) + 1;
    const blocked = failedAttempts >= MAX_PIN_ATTEMPTS;
    const data = {
      sessionId,
      unlocked: valid,
      failedAttempts: blocked ? 0 : failedAttempts,
      blockedUntil: blocked ? now + PIN_BLOCK_MS : null,
    };
    if (current) await ctx.db.replace("kioskPinUnlocks", current._id, data);
    else await ctx.db.insert("kioskPinUnlocks", data);
    if (valid) return null;
    return blocked
      ? "For mange forkerte forsøg. Prøv igen om et par minutter"
      : "Forkert PIN-kode";
  },
});

export const lockPinPages = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { sessionId } = await requireOrganization(ctx);
    if (!sessionId) return null;
    const current = await ctx.db
      .query("kioskPinUnlocks")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", sessionId))
      .unique();
    if (current?.unlocked) {
      await ctx.db.patch("kioskPinUnlocks", current._id, { unlocked: false });
    }
    return null;
  },
});
