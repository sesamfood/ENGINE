import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import {
  internalAction,
  internalQuery,
  mutation,
  type MutationCtx,
} from "../_generated/server";
import { getDatabaseAdapter } from "../auth";
import { integrationIds } from "../integrations/state";
import { createInvitationEmail } from "../lib/authEmail";
import { featureIds, getEntitlements } from "../lib/features";
import { recordPlatformAudit, requirePlatformMember } from "../lib/platformAuth";
import { sendResendEmail } from "../lib/resend";
import { requirePlatformOrganization } from "./organizations";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type AuthInvitation = {
  id: string;
  organizationId: string;
  email: string;
  status: string;
  inviterId: string;
};

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new ConvexError("Angiv en gyldig e-mailadresse");
  }
  return email;
}

// Platform staff are never members, so the invitation is written directly instead of
// through Better Auth's inviter-membership check. Acceptance still runs Better Auth's
// hooks, including the one-organization-per-user rule.
export async function createAdminInvitation(
  ctx: MutationCtx,
  actor: { userId: string; userName: string },
  organizationId: string,
  emailInput: string,
) {
  const email = normalizeEmail(emailInput);
  const adapter = getDatabaseAdapter(ctx);
  await adapter.updateMany({
    model: "invitation",
    where: [
      { field: "organizationId", value: organizationId },
      { field: "email", value: email },
      { field: "status", value: "pending" },
    ],
    update: { status: "canceled" },
  });
  const invitation = await adapter.create<{
    organizationId: string;
    email: string;
    role: string;
    status: string;
    expiresAt: Date;
    createdAt: Date;
    inviterId: string;
  }, { id: string }>({
    model: "invitation",
    data: {
      organizationId,
      email,
      role: "admin",
      status: "pending",
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      createdAt: new Date(),
      inviterId: actor.userId,
    },
  });
  const invitationId = invitation.id;
  await ctx.scheduler.runAfter(0, internal.platform.lifecycle.sendInvitation, {
    invitationId,
    inviterName: actor.userName,
  });
  return { invitationId, email };
}

async function setStatus(
  ctx: MutationCtx,
  organizationId: string,
  status: "active" | "suspended",
) {
  const current = await getEntitlements(ctx, organizationId);
  if (current) {
    await ctx.db.patch("organizationEntitlements", current._id, {
      status,
      updatedAt: Date.now(),
    });
    return;
  }
  // Creating the row keeps the implicit "everything entitled" default explicit.
  await ctx.db.insert("organizationEntitlements", {
    organizationId,
    status,
    features: [...featureIds],
    integrations: [...integrationIds],
    updatedAt: Date.now(),
  });
}

export const createOrganization = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    adminEmail: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const actor = await requirePlatformMember(ctx, "owner");
    const name = args.name.trim().replace(/\s+/g, " ");
    if (!name || name.length > 100) {
      throw new ConvexError("Navnet skal være mellem 1 og 100 tegn");
    }
    const slug = args.slug.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 60) {
      throw new ConvexError(
        "Slug må kun indeholde små bogstaver, tal og bindestreger",
      );
    }
    normalizeEmail(args.adminEmail);
    const adapter = getDatabaseAdapter(ctx);
    const existing = await adapter.findOne({
      model: "organization",
      where: [{ field: "slug", value: slug }],
    });
    if (existing) throw new ConvexError("Slug er allerede i brug");
    const organization = await adapter.create<{
      name: string;
      slug: string;
      logo: null;
      metadata: null;
      createdAt: Date;
    }, { id: string }>({
      model: "organization",
      data: { name, slug, logo: null, metadata: null, createdAt: new Date() },
    });
    const organizationId = organization.id;
    await ctx.db.insert("organizationEntitlements", {
      organizationId,
      status: "active",
      features: [...featureIds],
      integrations: [...integrationIds],
      updatedAt: Date.now(),
    });
    const { email } = await createAdminInvitation(
      ctx,
      actor,
      organizationId,
      args.adminEmail,
    );
    await recordPlatformAudit(ctx, actor, {
      organizationId,
      action: "organization.created",
      summary: `Organisationen ${name} er oprettet, og ${email} er inviteret som Administrator`,
    });
    return organizationId;
  },
});

export const inviteAdmin = mutation({
  args: { organizationId: v.string(), email: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Owner-only: an accepted invitation is permanent, so it must not outlive a support grant.
    const actor = await requirePlatformMember(ctx, "owner");
    const organization = await requirePlatformOrganization(
      ctx,
      args.organizationId,
    );
    const { email } = await createAdminInvitation(
      ctx,
      actor,
      organization.id,
      args.email,
    );
    await recordPlatformAudit(ctx, actor, {
      organizationId: organization.id,
      action: "organization.adminInvited",
      summary: `${email} er inviteret som Administrator`,
    });
    return null;
  },
});

export const suspend = mutation({
  args: { organizationId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requirePlatformMember(ctx, "owner");
    const organization = await requirePlatformOrganization(
      ctx,
      args.organizationId,
    );
    await setStatus(ctx, organization.id, "suspended");
    await recordPlatformAudit(ctx, actor, {
      organizationId: organization.id,
      action: "organization.suspended",
      summary: `Organisationen ${organization.name} er suspenderet`,
    });
    return null;
  },
});

export const reactivate = mutation({
  args: { organizationId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requirePlatformMember(ctx, "owner");
    const organization = await requirePlatformOrganization(
      ctx,
      args.organizationId,
    );
    await setStatus(ctx, organization.id, "active");
    await recordPlatformAudit(ctx, actor, {
      organizationId: organization.id,
      action: "organization.reactivated",
      summary: `Organisationen ${organization.name} er genaktiveret`,
    });
    return null;
  },
});

export const getInvitationForEmail = internalQuery({
  args: { invitationId: v.string() },
  returns: v.union(
    v.object({
      email: v.string(),
      organizationId: v.string(),
      organizationName: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const adapter = getDatabaseAdapter(ctx);
    const invitation = await adapter.findOne<AuthInvitation>({
      model: "invitation",
      where: [{ field: "id", value: args.invitationId }],
    });
    if (!invitation || invitation.status !== "pending") return null;
    const organization = await adapter.findOne<{ name: string }>({
      model: "organization",
      where: [{ field: "id", value: invitation.organizationId }],
    });
    if (!organization) return null;
    return {
      email: invitation.email,
      organizationId: invitation.organizationId,
      organizationName: organization.name,
    };
  },
});

export const sendInvitation = internalAction({
  args: { invitationId: v.string(), inviterName: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const invitation = await ctx.runQuery(
      internal.platform.lifecycle.getInvitationForEmail,
      { invitationId: args.invitationId },
    );
    if (!invitation) return null;
    const branding = await ctx.runQuery(
      internal.organization.getBrandingForEmail,
      { organizationId: invitation.organizationId },
    );
    const siteUrl = process.env.SITE_URL!;
    const email = createInvitationEmail(
      args.inviterName,
      invitation.organizationName,
      args.invitationId,
      `${siteUrl}/invitation/${args.invitationId}`,
      branding,
    );
    await sendResendEmail(
      { to: invitation.email, ...email },
      `platform-invitation-${args.invitationId}`,
    );
    return null;
  },
});
