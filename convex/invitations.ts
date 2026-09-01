import type { Invitation } from "better-auth/plugins/organization";
import { v } from "convex/values";
import { getDatabaseAdapter } from "./auth";
import { action } from "./_generated/server";

const invitationLinkStatusValidator = v.union(
  v.literal("pending"),
  v.literal("expired"),
  v.literal("unavailable"),
);

export const getLinkStatus = action({
  args: {
    invitationId: v.string(),
  },
  returns: invitationLinkStatusValidator,
  handler: async (ctx, args) => {
    let invitation: Invitation | null;

    try {
      invitation = await getDatabaseAdapter(ctx).findOne<Invitation>({
        model: "invitation",
        where: [{ field: "id", value: args.invitationId }],
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Unable to decode ID")
      ) {
        return "unavailable";
      }
      throw error;
    }

    if (!invitation || invitation.status !== "pending") {
      return "unavailable";
    }

    return Number(invitation.expiresAt) < Date.now() ? "expired" : "pending";
  },
});
