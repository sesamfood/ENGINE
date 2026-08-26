import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { requireActionCtx } from "@convex-dev/better-auth/utils";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { apiKey } from "@better-auth/api-key";
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
const configuredTrustedOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const trustedOrigins = Array.from(
  new Set([
    siteUrl,
    ...(localLoopbackOrigin ? [localLoopbackOrigin] : []),
    ...configuredTrustedOrigins,
  ]),
);
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

async function requireAllowedOrganizationRole(
  ctx: GenericCtx<DataModel>,
  organizationId: string,
  role: string,
) {
  const allowed = await ctx.runQuery(internal.access.isRoleRegistered, {
    organizationId,
    role,
  });
  if (!allowed) {
    throw new APIError("BAD_REQUEST", {
      message: "Ugyldig organisationsrolle",
    });
  }
}

async function requireAnotherAdmin(
  ctx: GenericCtx<DataModel>,
  member: OrganizationMember,
  newRole: string,
) {
  if (member.role !== "admin" || newRole === "admin") return;
  const admins = await getDatabaseAdapter(ctx).findMany<OrganizationMember>({
    model: "member",
    where: [
      { field: "organizationId", value: member.organizationId },
      { field: "role", value: "admin" },
    ],
    limit: 2,
  });
  if (!admins.some((admin) => admin.id !== member.id)) {
    throw new APIError("BAD_REQUEST", {
      message: "Den sidste bruger med rollen Administrator kan ikke skifte rolle",
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
      message: "Din bruger kan kun tilhøre én organisation",
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
          "Giv en anden bruger rollen Administrator, før du sletter din konto",
      });
    }
  }
}

async function removeDeletedUserMemberships(
  ctx: GenericCtx<DataModel>,
  user: { id: string; email: string },
) {
  const adapter = getDatabaseAdapter(ctx);
  const memberships = await adapter.findMany<OrganizationMember>({
    model: "member",
    where: [{ field: "userId", value: user.id }],
    limit: 100,
  });
  const actionCtx = requireActionCtx(ctx);
  await Promise.all(
    memberships.map((membership) =>
      actionCtx.runMutation(internal.access.removeMemberLocationAccess, {
        organizationId: membership.organizationId,
        userId: membership.userId,
      }),
    ),
  );
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
    trustedOrigins,
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
    hooks: {
      before: createAuthMiddleware(async (authCtx) => {
        const roleManagementPaths = new Set([
          "/organization/invite-member",
          "/organization/add-member",
          "/organization/update-member-role",
        ]);
        const memberApiPaths = new Set([
          "/organization/list-members",
          "/organization/list-invitations",
          "/organization/invite-member",
          "/organization/add-member",
          "/organization/update-member-role",
          "/organization/remove-member",
          "/organization/cancel-invitation",
        ]);
        const apiKeyManagementPaths = new Set([
          "/api-key/create",
          "/api-key/get",
          "/api-key/update",
          "/api-key/delete",
          "/api-key/list",
        ]);
        if (
          !authCtx.path ||
          (!memberApiPaths.has(authCtx.path) &&
            !apiKeyManagementPaths.has(authCtx.path))
        ) {
          return;
        }
        const session = await getSessionFromCtx(authCtx).catch(() => null);
        if (!session) return;
        if (session.session.kioskModeEnabled) {
          throw new APIError("FORBIDDEN", {
            message: "Du har ikke adgang til at administrere brugere",
          });
        }
        const input = (authCtx.body ?? authCtx.query) as
          | { organizationId?: string }
          | undefined;
        const organizationId =
          input?.organizationId ?? session.session.activeOrganizationId;
        if (!organizationId) {
          throw new APIError("FORBIDDEN", {
            message: "Ingen aktiv organisation",
          });
        }
        const roleContext = await ctx.runQuery(
          internal.access.getMemberPermissionContext,
          { organizationId, userId: session.user.id },
        );
        const needsRoleManagement = roleManagementPaths.has(authCtx.path);
        const requiredPermissions = apiKeyManagementPaths.has(authCtx.path)
          ? ["apiKeys.manage"]
          : needsRoleManagement
            ? ["members.manage", "roles.manage"]
            : ["members.manage"];
        if (
          requiredPermissions.some(
            (permission) => !roleContext.permissions.includes(permission),
          )
        ) {
          throw new APIError("FORBIDDEN", {
            message: apiKeyManagementPaths.has(authCtx.path)
              ? "Du har ikke adgang til at administrere API-nøgler"
              : needsRoleManagement
                ? "Du har ikke adgang til at administrere roller"
              : "Du har ikke adgang til at administrere brugere",
          });
        }
      }),
      after: createAuthMiddleware(async (authCtx) => {
        if (authCtx.path !== "/organization/leave") return;
        const member = authCtx.context.returned as
          | { organizationId?: unknown; userId?: unknown }
          | undefined;
        if (
          typeof member?.organizationId !== "string" ||
          typeof member.userId !== "string"
        ) {
          return;
        }
        await requireActionCtx(ctx).runMutation(
          internal.access.removeMemberLocationAccess,
          {
            organizationId: member.organizationId,
            userId: member.userId,
          },
        );
      }),
    },
    plugins: [
      username(),
      organization({
        ac: organizationAccessControl,
        roles: organizationRoles,
        dynamicAccessControl: { enabled: true },
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
            await requireAllowedOrganizationRole(
              ctx,
              member.organizationId,
              member.role,
            );
            await requireNoOrganizationMembership(ctx, member.userId);
          },
          beforeUpdateMemberRole: async ({ member, newRole }) => {
            await requireAllowedOrganizationRole(
              ctx,
              member.organizationId,
              newRole,
            );
            await requireAnotherAdmin(ctx, member, newRole);
          },
          beforeCreateInvitation: async ({ invitation }) => {
            await requireAllowedOrganizationRole(
              ctx,
              invitation.organizationId,
              invitation.role,
            );
          },
          beforeAcceptInvitation: async ({ user }) => {
            await requireNoOrganizationMembership(ctx, user.id);
          },
          afterRemoveMember: async ({ member }) => {
            await requireActionCtx(ctx).runMutation(
              internal.access.removeMemberLocationAccess,
              {
                organizationId: member.organizationId,
                userId: member.userId,
              },
            );
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
      apiKey({
        configId: "rest-api-v1",
        references: "organization",
        defaultPrefix: "eng_",
        defaultKeyLength: 64,
        requireName: true,
        minimumNameLength: 1,
        maximumNameLength: 100,
        enableMetadata: false,
        enableSessionForAPIKeys: false,
        startingCharactersConfig: {
          shouldStore: true,
          charactersLength: 12,
        },
        keyExpiration: {
          defaultExpiresIn: 90 * 24 * 60 * 60,
          minExpiresIn: 1,
          maxExpiresIn: 365,
        },
        rateLimit: {
          enabled: true,
          timeWindow: 60_000,
          maxRequests: 120,
        },
      }),
      convex({ authConfig }),
    ],
  }) satisfies BetterAuthOptions;

export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth(createAuthOptions(ctx));

export const { getAuthUser } = authComponent.clientApi();
