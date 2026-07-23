import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { requireActionCtx } from "@convex-dev/better-auth/utils";
import { APIError } from "better-auth/api";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { organization } from "better-auth/plugins/organization";
import {
  organizationAccessControl,
  organizationRoles,
} from "../lib/auth-permissions";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import authSchema from "./betterAuth/schema";

const siteUrl = process.env.SITE_URL!;
const allowedOrganizationRoles = new Set(["admin", "manager", "member"]);

type OrganizationMember = {
  id: string;
  organizationId: string;
  role: string;
  userId: string;
};

function getDatabaseAdapter(ctx: GenericCtx<DataModel>) {
  return authComponent.adapter(ctx)(createAuthOptions(ctx));
}

function requireAllowedOrganizationRole(role: string) {
  if (!allowedOrganizationRoles.has(role)) {
    throw new APIError("BAD_REQUEST", {
      message: "Ugyldig organisationsrolle",
    });
  }
}

async function requireNoOrganizationMembership(
  ctx: GenericCtx<DataModel>,
  userId: string,
) {
  const memberships = await getDatabaseAdapter(ctx).findMany({
    model: "member",
    where: [{ field: "userId", value: userId }],
    limit: 1,
  });
  if (memberships.length) {
    throw new APIError("BAD_REQUEST", {
      message: "Du kan kun være medlem af én organisation",
    });
  }
}

async function requireAccountCanBeDeleted(
  ctx: GenericCtx<DataModel>,
  userId: string,
) {
  const adapter = getDatabaseAdapter(ctx);
  const memberships = await adapter.findMany<OrganizationMember>({
    model: "member",
    where: [{ field: "userId", value: userId }],
    limit: 100,
  });

  for (const membership of memberships) {
    const otherAdmins = await adapter.findMany<OrganizationMember>({
      model: "member",
      where: [
        { field: "organizationId", value: membership.organizationId },
        { field: "role", value: "admin" },
      ],
      limit: 2,
    });
    if (!otherAdmins.some((member) => member.userId !== userId)) {
      throw new APIError("BAD_REQUEST", {
        message:
          "Gør en anden bruger til administrator, før du sletter din konto",
      });
    }
  }
}

async function removeDeletedUserMemberships(
  ctx: GenericCtx<DataModel>,
  user: { id: string; email: string },
) {
  const adapter = getDatabaseAdapter(ctx);
  await adapter.deleteMany({
    model: "member",
    where: [{ field: "userId", value: user.id }],
  });
  await adapter.deleteMany({
    model: "invitation",
    where: [{ field: "inviterId", value: user.id }],
  });
  await adapter.deleteMany({
    model: "invitation",
    where: [{ field: "email", value: user.email }],
  });
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]!,
  );
}

async function sendEmail(
  ctx: GenericCtx<DataModel>,
  message: { to: string; subject: string; html: string },
) {
  requireActionCtx(ctx);

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY og RESEND_FROM_EMAIL skal være sat");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, ...message }),
  });

  if (!response.ok) {
    throw new Error(`Resend afviste e-mailen med status ${response.status}`);
  }
}

export const authComponent = createClient<DataModel, typeof authSchema>(
  components.betterAuth,
  {
    local: { schema: authSchema },
  },
);

export const createAuthOptions = (ctx: GenericCtx<DataModel>) =>
  ({
    baseURL: siteUrl,
    trustedOrigins: [siteUrl, "https://engine-*-mellonn.vercel.app"],
    database: authComponent.adapter(ctx),
    advanced: {
      database: {
        generateId: false,
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 256,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(ctx, {
          to: user.email,
          subject: "Nulstil din adgangskode",
          html: `<p>Du har bedt om at nulstille din adgangskode.</p><p><a href="${escapeHtml(url)}">Vælg en ny adgangskode</a></p><p>Linket udløber om en time. Hvis du ikke har bedt om dette, kan du ignorere e-mailen.</p>`,
        });
      },
    },
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (user) => {
          await requireAccountCanBeDeleted(ctx, user.id);
        },
        afterDelete: async (user) => {
          await removeDeletedUserMemberships(ctx, user);
        },
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail(ctx, {
          to: user.email,
          subject: "Bekræft din e-mail",
          html: `<p>Bekræft din e-mail for at aktivere din konto.</p><p><a href="${escapeHtml(url)}">Bekræft e-mail</a></p>`,
        });
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    plugins: [
      organization({
        ac: organizationAccessControl,
        roles: organizationRoles,
        creatorRole: "admin",
        organizationLimit: 1,
        membershipLimit: 100,
        invitationExpiresIn: 60 * 60 * 24 * 7,
        cancelPendingInvitationsOnReInvite: true,
        requireEmailVerificationOnInvitation: true,
        organizationHooks: {
          beforeCreateOrganization: async ({ user }) => {
            await requireNoOrganizationMembership(ctx, user.id);
          },
          beforeAddMember: async ({ member }) => {
            requireAllowedOrganizationRole(member.role);
            await requireNoOrganizationMembership(ctx, member.userId);
          },
          beforeUpdateMemberRole: async ({ newRole }) => {
            requireAllowedOrganizationRole(newRole);
          },
          beforeCreateInvitation: async ({ invitation }) => {
            requireAllowedOrganizationRole(invitation.role);
          },
          beforeAcceptInvitation: async ({ user }) => {
            await requireNoOrganizationMembership(ctx, user.id);
          },
        },
        sendInvitationEmail: async (data) => {
          const invitationUrl = `${siteUrl}/invitation/${data.id}`;
          await sendEmail(ctx, {
            to: data.email,
            subject: `Invitation til ${data.organization.name}`,
            html: `<p>${escapeHtml(data.inviter.user.name)} har inviteret dig til ${escapeHtml(data.organization.name)}.</p><p>Invitationskode: <strong>${escapeHtml(data.id)}</strong></p><p><a href="${escapeHtml(invitationUrl)}">Accepter invitationen</a></p>`,
          });
        },
      }),
      convex({ authConfig }),
    ],
  }) satisfies BetterAuthOptions;

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth(createAuthOptions(ctx));

export const { getAuthUser } = authComponent.clientApi();
