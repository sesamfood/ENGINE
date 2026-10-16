import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { components } from "../_generated/api";
import { query, type MutationCtx, type QueryCtx } from "../_generated/server";
import { getDatabaseAdapter } from "../auth";
import {
  getIntegrationState,
  getUnavailableIntegrations,
  integrationIdValidator,
  integrationIds,
} from "../integrations/state";
import {
  featureIdValidator,
  getEntitlements,
  getOrganizationDisabledFeatures,
  nonEntitledFeatures,
} from "../lib/features";
import { requirePlatformMember } from "../lib/platformAuth";

// Platform queries read across organizations, so they stay out of organization-scoped modules.

type AuthOrganization = {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  createdAt: Date;
};

type RawOrganization = {
  _id: string;
  name: string;
  slug: string;
  createdAt: number;
};

type AuthMember = { id: string; userId: string; role: string; createdAt: Date };
type AuthUser = { id: string; name: string; email: string };
type AuthInvitation = {
  id: string;
  email: string;
  role?: string | null;
  status: string;
  expiresAt: Date;
};

const statusValidator = v.union(v.literal("active"), v.literal("suspended"));

export async function requirePlatformOrganization(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
) {
  const organization = await getDatabaseAdapter(ctx)
    .findOne<AuthOrganization>({
      model: "organization",
      where: [{ field: "id", value: organizationId }],
    })
    .catch(() => null);
  if (!organization) throw new ConvexError("Organisationen blev ikke fundet");
  return organization;
}

function normalizeSearch(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("da")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "oe")
    .replace(/å/g, "aa")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function countLocations(ctx: QueryCtx, organizationId: string) {
  const locations = await ctx.db
    .query("locations")
    .withIndex("by_organizationId_and_normalizedName", (q) =>
      q.eq("organizationId", organizationId),
    )
    .take(201);
  return locations.length;
}

export const list = query({
  args: {
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      id: v.string(),
      name: v.string(),
      slug: v.string(),
      createdAt: v.number(),
      status: statusValidator,
      plan: v.union(v.string(), v.null()),
      memberCount: v.number(),
      locationCount: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await requirePlatformMember(ctx);
    const search = args.search ? normalizeSearch(args.search) : "";
    // The Better Auth table has no case-insensitive name index, so search filters
    // each page in memory. A page can come back short; "Vis flere" continues.
    const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "organization",
      sortBy: { field: "createdAt", direction: "desc" },
      paginationOpts: args.paginationOpts,
    });
    const organizations = (result.page as RawOrganization[]).filter(
      (organization) =>
        !search ||
        normalizeSearch(organization.name).includes(search) ||
        organization.slug.includes(search.replace(/\s+/g, "-")),
    );
    const adapter = getDatabaseAdapter(ctx);
    const page = await Promise.all(
      organizations.map(async (organization) => {
        const [entitlements, members, locationCount] = await Promise.all([
          getEntitlements(ctx, organization._id),
          adapter.findMany({
            model: "member",
            where: [{ field: "organizationId", value: organization._id }],
            limit: 100,
          }),
          countLocations(ctx, organization._id),
        ]);
        return {
          id: organization._id,
          name: organization.name,
          slug: organization.slug,
          createdAt: organization.createdAt,
          status: entitlements?.status ?? "active",
          plan: entitlements?.plan ?? null,
          memberCount: members.length,
          locationCount,
        };
      }),
    );
    return {
      page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
      splitCursor: result.splitCursor,
      pageStatus: result.pageStatus,
    };
  },
});

const auditRowValidator = v.object({
  id: v.string(),
  actorName: v.string(),
  action: v.string(),
  summary: v.string(),
  reason: v.union(v.string(), v.null()),
  at: v.number(),
});

export const get = query({
  args: { organizationId: v.string() },
  returns: v.object({
    id: v.string(),
    name: v.string(),
    slug: v.string(),
    createdAt: v.number(),
    status: statusValidator,
    plan: v.union(v.string(), v.null()),
    hasExplicitEntitlements: v.boolean(),
    members: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        email: v.string(),
        role: v.string(),
      }),
    ),
    invitations: v.array(
      v.object({
        id: v.string(),
        email: v.string(),
        role: v.string(),
        expiresAt: v.number(),
      }),
    ),
    locations: v.array(v.object({ id: v.id("locations"), name: v.string() })),
    integrations: v.array(
      v.object({
        id: integrationIdValidator,
        enabled: v.boolean(),
        entitled: v.boolean(),
      }),
    ),
    nonEntitledFeatures: v.array(featureIdValidator),
    entitledIntegrations: v.array(integrationIdValidator),
    organizationDisabledFeatures: v.array(featureIdValidator),
    platformAudit: v.array(auditRowValidator),
    organizationAudit: v.array(auditRowValidator),
    supportGrants: v.array(
      v.object({
        id: v.id("supportGrants"),
        platformUserName: v.string(),
        reason: v.string(),
        mode: v.union(v.literal("view"), v.literal("full")),
        startedAt: v.number(),
        expiresAt: v.number(),
        endedAt: v.union(v.number(), v.null()),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    await requirePlatformMember(ctx);
    const organization = await requirePlatformOrganization(
      ctx,
      args.organizationId,
    );
    const organizationId = organization.id;
    const adapter = getDatabaseAdapter(ctx);
    const [
      members,
      invitations,
      locations,
      integrationState,
      unavailableIntegrations,
      entitlements,
      organizationDisabledFeatures,
      platformAudit,
      organizationAudit,
      supportGrants,
    ] = await Promise.all([
      adapter.findMany<AuthMember>({
        model: "member",
        where: [{ field: "organizationId", value: organizationId }],
        limit: 100,
      }),
      adapter.findMany<AuthInvitation>({
        model: "invitation",
        where: [
          { field: "organizationId", value: organizationId },
          { field: "status", value: "pending" },
        ],
        limit: 50,
      }),
      ctx.db
        .query("locations")
        .withIndex("by_organizationId_and_normalizedName", (q) =>
          q.eq("organizationId", organizationId),
        )
        .take(200),
      getIntegrationState(ctx, organizationId),
      getUnavailableIntegrations(ctx, organizationId),
      getEntitlements(ctx, organizationId),
      getOrganizationDisabledFeatures(ctx, organizationId),
      ctx.db
        .query("platformAuditLog")
        .withIndex("by_organizationId_and_at", (q) =>
          q.eq("organizationId", organizationId),
        )
        .order("desc")
        .take(50),
      ctx.db
        .query("auditLog")
        .withIndex("by_organizationId_and_at", (q) =>
          q.eq("organizationId", organizationId),
        )
        .order("desc")
        .take(50),
      ctx.db
        .query("supportGrants")
        .withIndex("by_organizationId_and_startedAt", (q) =>
          q.eq("organizationId", organizationId),
        )
        .order("desc")
        .take(20),
    ]);
    const users = members.length
      ? await adapter.findMany<AuthUser>({
          model: "user",
          where: [
            {
              field: "id",
              operator: "in",
              value: members.map((member) => member.userId),
            },
          ],
          limit: members.length,
        })
      : [];
    const usersById = new Map(users.map((user) => [user.id, user]));
    const toAuditRow = (row: {
      _id: string;
      actorName: string;
      action: string;
      summary: string;
      reason?: string;
      at: number;
    }) => ({
      id: row._id,
      actorName: row.actorName,
      action: row.action,
      summary: row.summary,
      reason: row.reason ?? null,
      at: row.at,
    });
    return {
      id: organizationId,
      name: organization.name,
      slug: organization.slug,
      createdAt: new Date(organization.createdAt).getTime(),
      status: entitlements?.status ?? "active",
      plan: entitlements?.plan ?? null,
      hasExplicitEntitlements: entitlements !== null,
      members: members.map((member) => {
        const user = usersById.get(member.userId);
        return {
          id: member.id,
          name: user?.name ?? "Ukendt bruger",
          email: user?.email ?? "",
          role: member.role,
        };
      }),
      invitations: invitations
        .filter((invitation) => new Date(invitation.expiresAt).getTime() > Date.now())
        .map((invitation) => ({
          id: invitation.id,
          email: invitation.email,
          role: invitation.role ?? "member",
          expiresAt: new Date(invitation.expiresAt).getTime(),
        })),
      locations: locations.map((location) => ({
        id: location._id,
        name: location.name,
      })),
      integrations: Object.entries(integrationState).map(([id, enabled]) => ({
        id: id as keyof typeof integrationState,
        enabled,
        entitled: !unavailableIntegrations.includes(
          id as keyof typeof integrationState,
        ),
      })),
      nonEntitledFeatures: nonEntitledFeatures(entitlements),
      entitledIntegrations: entitlements?.integrations ?? [...integrationIds],
      organizationDisabledFeatures,
      platformAudit: platformAudit.map(toAuditRow),
      organizationAudit: organizationAudit.map(toAuditRow),
      supportGrants: supportGrants.map((grant) => ({
        id: grant._id,
        platformUserName: grant.platformUserName,
        reason: grant.reason,
        mode: grant.mode,
        startedAt: grant.startedAt,
        expiresAt: grant.expiresAt,
        endedAt: grant.endedAt ?? null,
      })),
    };
  },
});
