import type { Invitation } from "better-auth/plugins/organization";
import type { User } from "better-auth";
import { v } from "convex/values";
import { getDatabaseAdapter } from "./auth";
import { action } from "./_generated/server";

const invitationLinkStatusValidator = v.union(
  v.object({
    status: v.literal("pending"),
    email: v.string(),
    hasAccount: v.boolean(),
  }),
  v.object({ status: v.literal("expired") }),
  v.object({ status: v.literal("unavailable") }),
);

export const getLinkStatus = action({
  args: {
    invitationId: v.string(),
  },
  returns: invitationLinkStatusValidator,
  handler: async (ctx, args) => {
    const adapter = getDatabaseAdapter(ctx);
    let invitation: Invitation | null;

    try {
      invitation = await adapter.findOne<Invitation>({
        model: "invitation",
        where: [{ field: "id", value: args.invitationId }],
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("Unable to decode ID")
      ) {
        return { status: "unavailable" as const };
      }
      throw error;
    }

    if (!invitation || invitation.status !== "pending") {
      return { status: "unavailable" as const };
    }

    if (Number(invitation.expiresAt) < Date.now()) {
      return { status: "expired" as const };
    }

    // The invitation link proves the holder received mail at this address.
    const user = await adapter.findOne<User>({
      model: "user",
      where: [{ field: "email", value: invitation.email.toLowerCase() }],
    });

    return {
      status: "pending" as const,
      email: invitation.email,
      hasAccount: user !== null,
    };
  },
});
