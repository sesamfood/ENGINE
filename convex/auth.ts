import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { requireActionCtx } from "@convex-dev/better-auth/utils";
import { APIError } from "better-auth/api";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { organization } from "better-auth/plugins/organization";
import { username } from "better-auth/plugins/username";
import {
  organizationAccessControl,
  organizationRoles,
} from "../lib/auth-permissions";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import authSchema from "./betterAuth/schema";
import {
  type AuthEmailBranding,
  createInvitationEmail,
  createPasswordResetEmail,
  createVerificationEmail,
} from "./lib/authEmail";
import { sendResendEmail } from "./lib/resend";

const siteUrl = process.env.SITE_URL!;
const localLoopbackOrigin = siteUrl?.startsWith("http://localhost:")
  ? siteUrl.replace("localhost", "127.0.0.1")
  : null;
const allowedOrganizationRoles = new Set(["admin", "manager", "member"]);

type OrganizationMember = {
  id: string;
  organizationId: string;
  role: string;
  userId: string;
  kioskLocationId?: string | null;
};

export function getDatabaseAdapter(
  ctx: GenericCtx<DataModel>,
): ReturnType<ReturnType<typeof authComponent.adapter>> {
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

async function sendEmail(
  ctx: GenericCtx<DataModel>,
  message: { to: string; subject: string; html: string; text: string },
) {
  requireActionCtx(ctx);
  await sendResendEmail(message);
}

async function getOrganizationEmailBranding(
  ctx: GenericCtx<DataModel>,
  organizationId: string,
) {
  const actionCtx = requireActionCtx(ctx);
  return await actionCtx.runQuery(
    internal.organization.getBrandingForEmail,
    { organizationId },
  );
}

async function getUserEmailBranding(
  ctx: GenericCtx<DataModel>,
  userId: string,
): Promise<AuthEmailBranding | null> {
  const memberships = await getDatabaseAdapter(ctx).findMany<OrganizationMember>(
    {
      model: "member",
      where: [{ field: "userId", value: userId }],
      limit: 1,
    },
  );
  const organizationId = memberships[0]?.organizationId;
  return organizationId
    ? await getOrganizationEmailBranding(ctx, organizationId)
    : null;
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
    trustedOrigins: [
      siteUrl,
      ...(localLoopbackOrigin ? [localLoopbackOrigin] : []),
    ],
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
        const branding = await getUserEmailBranding(ctx, user.id);
        const email = createPasswordResetEmail(url, branding);
        await sendEmail(ctx, {
          to: user.email,
          ...email,
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
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      additionalFields: {
        isKioskAccount: {
          type: "boolean",
          required: false,
          input: false,
        },
        kioskModeEnabled: {
          type: "boolean",
          required: false,
          input: false,
        },
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const memberships = await getDatabaseAdapter(
              ctx,
            ).findMany<OrganizationMember>({
              model: "member",
              where: [{ field: "userId", value: session.userId }],
              limit: 1,
            });
            const membership = memberships[0];
            if (!membership?.kioskLocationId) return;
            return {
              data: {
                ...session,
                activeOrganizationId: membership.organizationId,
                isKioskAccount: true,
                kioskModeEnabled: true,
              },
            };
          },
        },
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        const branding = await getUserEmailBranding(ctx, user.id);
        const email = createVerificationEmail(url, branding);
        await sendEmail(ctx, {
          to: user.email,
          ...email,
        });
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      customRules: {
        "/convex/token": false,
        "/get-session": false,
        "/organization/list": false,
        "/organization/get-full-organization": false,
        "/organization/get-active-member": false,
        "/organization/get-active-member-role": false,
      },
    },
    plugins: [
      username(),
      organization({
        ac: organizationAccessControl,
        roles: organizationRoles,
        creatorRole: "admin",
        organizationLimit: 1,
        membershipLimit: 100,
        invitationExpiresIn: 60 * 60 * 24 * 7,
        cancelPendingInvitationsOnReInvite: true,
        requireEmailVerificationOnInvitation: true,
        schema: {
          member: {
            additionalFields: {
              kioskLocationId: {
                type: "string",
                required: false,
                input: false,
              },
            },
          },
        },
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
          const branding = await getOrganizationEmailBranding(
            ctx,
            data.organization.id,
          );
          const email = createInvitationEmail(
            data.inviter.user.name,
            data.organization.name,
            data.id,
            invitationUrl,
            branding,
          );
          await sendEmail(ctx, {
            to: data.email,
            ...email,
          });
        },
      }),
      convex({ authConfig }),
    ],
  }) satisfies BetterAuthOptions;

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth(createAuthOptions(ctx));

export const { getAuthUser } = authComponent.clientApi();
