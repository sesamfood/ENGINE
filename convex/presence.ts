import { Presence } from "@convex-dev/presence";
import { ConvexError, v } from "convex/values";
import { components } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  requireCounter,
  requireLocationAccess,
} from "./lib/auth";
import { MAX_COUNT_AREAS } from "./lib/countAreas";

const CLIENT_USER_ID = "counter";
const HEARTBEAT_INTERVAL_MS = 10_000;

const countAreaPresence = new Presence<Id<"countAreas">, string>(
  components.presence,
);

const presenceStateValidator = v.object({
  userId: v.string(),
  online: v.boolean(),
  lastDisconnected: v.number(),
});

function locationPresenceUserId(
  organizationId: string,
  locationId: Id<"locations">,
) {
  return `count-area:${organizationId}:${locationId}`;
}

export const heartbeat = mutation({
  args: {
    roomId: v.string(),
    userId: v.string(),
    sessionId: v.string(),
    interval: v.number(),
  },
  returns: v.object({
    roomToken: v.string(),
    sessionToken: v.string(),
  }),
  handler: async (ctx, args) => {
    const auth = await requireCounter(ctx, "count.register");
    if (
      args.userId !== CLIENT_USER_ID ||
      args.interval !== HEARTBEAT_INTERVAL_MS ||
      !args.sessionId ||
      args.sessionId.length > 500
    ) {
      throw new ConvexError("Presence-sessionen er ugyldig");
    }
    const countAreaId = ctx.db.normalizeId("countAreas", args.roomId);
    if (!countAreaId) throw new ConvexError("Baren blev ikke fundet");
    const countArea = await ctx.db.get("countAreas", countAreaId);
    if (!countArea || countArea.organizationId !== auth.organizationId) {
      throw new ConvexError("Baren blev ikke fundet");
    }
    requireLocationAccess(auth, countArea.locationId);
    return await countAreaPresence.heartbeat(
      ctx,
      countArea._id,
      locationPresenceUserId(auth.organizationId, countArea.locationId),
      args.sessionId,
      args.interval,
    );
  },
});

export const list = query({
  args: { roomToken: v.string() },
  returns: v.array(presenceStateValidator),
  handler: async (ctx, args) => {
    const entries = await countAreaPresence.list(ctx, args.roomToken, 1);
    return entries.map((entry) => ({
      userId: CLIENT_USER_ID,
      online: entry.online,
      lastDisconnected: entry.lastDisconnected,
    }));
  },
});

export const disconnect = mutation({
  args: { sessionToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    return await countAreaPresence.disconnect(ctx, args.sessionToken);
  },
});

export const listActiveCountAreas = query({
  args: { locationId: v.id("locations") },
  returns: v.array(v.id("countAreas")),
  handler: async (ctx, args) => {
    const auth = await requireCounter(ctx, "count.register");
    requireLocationAccess(auth, args.locationId);
    const location = await ctx.db.get("locations", args.locationId);
    if (!location || location.organizationId !== auth.organizationId) {
      throw new ConvexError("Lokationen blev ikke fundet");
    }
    const entries = await countAreaPresence.listUser(
      ctx,
      locationPresenceUserId(auth.organizationId, location._id),
      true,
      MAX_COUNT_AREAS,
    );
    return entries.map((entry) => entry.roomId);
  },
});
