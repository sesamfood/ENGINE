import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { getDatabaseAdapter } from "./auth";
import {
  requireHumanPrincipal,
  requireOrganization,
  requireOrganizationAdmin,
} from "./lib/auth";
import { recordAudit } from "./lib/audit";
import { fetchLinearTeams, type LinearTeam } from "./lib/linear";
import { rateLimiter } from "./lib/rateLimits";
import { canReportFeedbackArea, isFeedbackType } from "../lib/feedback";

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 4_000;
const MAX_EMAIL_LENGTH = 200;
const MAX_API_KEY_LENGTH = 200;
const MAX_TEAM_LENGTH = 100;
const MAX_SCREENSHOT_SIZE = 10 * 1024 * 1024;
const RECENT_SUBMISSIONS = 10;
const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

const destinationValidator = v.union(v.literal("linear"), v.literal("email"));
const typeValidator = v.union(v.literal("bug"), v.literal("feature"));
const statusValidator = v.union(
  v.literal("pending"),
  v.literal("sent"),
  v.literal("failed"),
);

const deliveryValidator = v.union(
  v.object({
    submissionId: v.id("feedbackSubmissions"),
    organizationName: v.string(),
    userName: v.string(),
    userEmail: v.union(v.string(), v.null()),
    area: v.string(),
    type: typeValidator,
    title: v.string(),
    description: v.string(),
    createdAt: v.number(),
    screenshotUrl: v.union(v.string(), v.null()),
    screenshotStorageId: v.union(v.id("_storage"), v.null()),
    destination: destinationValidator,
    email: v.union(v.string(), v.null()),
    linearApiKey: v.union(v.string(), v.null()),
    linearTeamId: v.union(v.string(), v.null()),
  }),
  v.null(),
);

function trimmedEmail(value: string) {
  const email = value.trim();
  if (
    !email ||
    email.length > MAX_EMAIL_LENGTH ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new ConvexError("Indtast en gyldig e-mailadresse");
  }
  return email;
}

export const getSettings = query({
  args: {},
  returns: v.object({
    enabled: v.boolean(),
    destination: destinationValidator,
    email: v.union(v.string(), v.null()),
    linearTeamId: v.union(v.string(), v.null()),
    linearTeamName: v.union(v.string(), v.null()),
    linearKeyConfigured: v.boolean(),
    recent: v.array(
      v.object({
        id: v.id("feedbackSubmissions"),
        userName: v.string(),
        area: v.string(),
        type: typeValidator,
        status: statusValidator,
        reference: v.union(v.string(), v.null()),
        failureMessage: v.union(v.string(), v.null()),
        createdAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    const [settings, recent] = await Promise.all([
      ctx.db
        .query("feedbackSettings")
        .withIndex("by_organizationId", (q) =>
          q.eq("organizationId", organizationId),
        )
        .unique(),
      ctx.db
        .query("feedbackSubmissions")
        .withIndex("by_organizationId_and_createdAt", (q) =>
          q.eq("organizationId", organizationId),
        )
        .order("desc")
        .take(RECENT_SUBMISSIONS),
    ]);
    return {
      enabled: settings?.enabled ?? false,
      destination: settings?.destination ?? ("email" as const),
      email: settings?.email ?? null,
      linearTeamId: settings?.linearTeamId ?? null,
      linearTeamName: settings?.linearTeamName ?? null,
      linearKeyConfigured: Boolean(settings?.linearApiKey),
      recent: recent.map((submission) => ({
        id: submission._id,
        userName: submission.userName,
        area: submission.area,
        type: submission.type,
        status: submission.status,
        reference: submission.reference ?? null,
        failureMessage: submission.failureMessage ?? null,
        createdAt: submission.createdAt,
      })),
    };
  },
});

export const isEnabled = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const auth = await requireOrganization(ctx);
    const settings = await ctx.db
      .query("feedbackSettings")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", auth.organizationId),
      )
      .unique();
    return settings?.enabled ?? false;
  },
});

export const saveSettings = mutation({
  args: {
    enabled: v.boolean(),
    destination: destinationValidator,
    email: v.optional(v.string()),
    linearApiKey: v.optional(v.string()),
    linearTeamId: v.optional(v.string()),
    linearTeamName: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireOrganizationAdmin(ctx);
    const { organizationId } = auth;
    const current = await ctx.db
      .query("feedbackSettings")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .unique();

    const emailProvided = args.email !== undefined;
    const email = args.email?.trim() ? trimmedEmail(args.email) : undefined;
    const linearApiKey = args.linearApiKey?.trim()
      ? args.linearApiKey.trim()
      : current?.linearApiKey;
    if (linearApiKey && linearApiKey.length > MAX_API_KEY_LENGTH) {
      throw new ConvexError("API-nøglen er for lang");
    }
    const linearTeamId = args.linearTeamId?.trim() || undefined;
    const linearTeamName = args.linearTeamName?.trim() || undefined;
    if (
      (linearTeamId && linearTeamId.length > MAX_TEAM_LENGTH) ||
      (linearTeamName && linearTeamName.length > MAX_TEAM_LENGTH)
    ) {
      throw new ConvexError("Teamnavnet er for langt");
    }

    if (args.enabled) {
      if (args.destination === "email" && !email) {
        throw new ConvexError(
          "Indtast e-mailadressen, feedback skal sendes til",
        );
      }
      if (args.destination === "linear" && (!linearApiKey || !linearTeamId)) {
        throw new ConvexError("Tilføj Linear API-nøgle, og vælg et team");
      }
    }

    const fields = {
      organizationId,
      enabled: args.enabled,
      destination: args.destination,
      updatedAt: Date.now(),
      ...(linearApiKey ? { linearApiKey } : {}),
      ...(linearTeamId ? { linearTeamId } : {}),
      ...(linearTeamName ? { linearTeamName } : {}),
    };
    const settingsId = current
      ? current._id
      : await ctx.db.insert("feedbackSettings", {
          ...fields,
          ...(email ? { email } : {}),
        });
    if (current) {
      await ctx.db.patch("feedbackSettings", current._id, {
        ...fields,
        ...(emailProvided ? { email } : {}),
      });
    }

    await recordAudit(ctx, auth, {
      action: "feedback.settingsUpdated",
      entityTable: "feedbackSettings",
      entityId: settingsId,
      summary: args.enabled
        ? `Feedback blev slået til med ${
            args.destination === "linear" ? "Linear" : "e-mail"
          }`
        : "Feedback blev slået fra",
    });
    return null;
  },
});

export const getLinearKey = internalQuery({
  args: { organizationId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("feedbackSettings")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .unique();
    return settings?.linearApiKey ?? null;
  },
});

export const listLinearTeams = action({
  args: { apiKey: v.optional(v.string()) },
  returns: v.array(
    v.object({ id: v.string(), key: v.string(), name: v.string() }),
  ),
  handler: async (ctx, args): Promise<LinearTeam[]> => {
    const { organizationId } = await requireOrganizationAdmin(ctx);
    const apiKey =
      args.apiKey?.trim() ||
      (await ctx.runQuery(internal.feedback.getLinearKey, { organizationId }));
    if (!apiKey) throw new ConvexError("Indtast Linear API-nøglen");
    return await fetchLinearTeams(apiKey);
  },
});

export const generateScreenshotUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireOrganization(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const submit = mutation({
  args: {
    area: v.string(),
    type: typeValidator,
    title: v.string(),
    description: v.optional(v.string()),
    screenshotStorageId: v.optional(v.id("_storage")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireOrganization(ctx);
    const human = requireHumanPrincipal(auth);
    const { organizationId } = auth;

    const settings = await ctx.db
      .query("feedbackSettings")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", organizationId),
      )
      .unique();
    if (!settings?.enabled) {
      throw new ConvexError("Feedback er ikke slået til");
    }
    if (!canReportFeedbackArea(auth.permissions, args.area)) {
      throw new ConvexError("Vælg et område, du har adgang til");
    }
    if (!isFeedbackType(args.type)) {
      throw new ConvexError("Vælg om det er en fejl eller et forslag");
    }
    const title = args.title.trim();
    if (!title) throw new ConvexError("Skriv en titel");
    if (title.length > MAX_TITLE_LENGTH) {
      throw new ConvexError(`Titlen må højst være ${MAX_TITLE_LENGTH} tegn`);
    }
    const description = args.description?.trim() ?? "";
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      throw new ConvexError(
        `Beskrivelsen må højst være ${MAX_DESCRIPTION_LENGTH} tegn`,
      );
    }

    const limit = await rateLimiter.limit(ctx, "feedbackSubmit", {
      key: human.userId,
    });
    if (!limit.ok) {
      throw new ConvexError(
        "Du har sendt feedback for nylig. Prøv igen senere",
      );
    }

    if (args.screenshotStorageId) {
      const [metadata, existing] = await Promise.all([
        ctx.db.system.get("_storage", args.screenshotStorageId),
        ctx.db
          .query("feedbackSubmissions")
          .withIndex("by_screenshotStorageId", (q) =>
            q.eq("screenshotStorageId", args.screenshotStorageId),
          )
          .first(),
      ]);
      if (existing) {
        throw new ConvexError("Billedet er allerede brugt");
      }
      if (
        !metadata?.contentType ||
        !IMAGE_TYPES.has(metadata.contentType) ||
        metadata.size > MAX_SCREENSHOT_SIZE
      ) {
        throw new ConvexError(
          "Billedet skal være et JPEG, PNG, WebP eller AVIF på højst 10 MB",
        );
      }
    }

    const identity = await ctx.auth.getUserIdentity();
    const organization = await getDatabaseAdapter(ctx).findOne<{
      id: string;
      name: string;
    }>({
      model: "organization",
      where: [{ field: "id", value: organizationId }],
    });

    const submissionId = await ctx.db.insert("feedbackSubmissions", {
      organizationId,
      organizationName: organization?.name ?? organizationId,
      userId: human.userId,
      userName: auth.userName,
      area: args.area,
      type: args.type,
      title,
      destination: settings.destination,
      status: "pending",
      createdAt: Date.now(),
      ...(description ? { description } : {}),
      ...(identity?.email ? { userEmail: identity.email } : {}),
      ...(args.screenshotStorageId
        ? { screenshotStorageId: args.screenshotStorageId }
        : {}),
    });
    await ctx.scheduler.runAfter(0, internal.feedbackDelivery.deliver, {
      submissionId,
    });
    return null;
  },
});

export const getDelivery = internalQuery({
  args: { submissionId: v.id("feedbackSubmissions") },
  returns: deliveryValidator,
  handler: async (ctx, args) => {
    const submission = await ctx.db.get(
      "feedbackSubmissions",
      args.submissionId,
    );
    if (!submission || submission.status === "sent") return null;
    const settings = await ctx.db
      .query("feedbackSettings")
      .withIndex("by_organizationId", (q) =>
        q.eq("organizationId", submission.organizationId),
      )
      .unique();
    if (!settings) return null;
    return {
      submissionId: submission._id,
      organizationName: submission.organizationName,
      userName: submission.userName,
      userEmail: submission.userEmail ?? null,
      area: submission.area,
      type: submission.type,
      title: submission.title ?? "",
      description: submission.description ?? "",
      createdAt: submission.createdAt,
      screenshotUrl: submission.screenshotStorageId
        ? await ctx.storage.getUrl(submission.screenshotStorageId)
        : null,
      screenshotStorageId: submission.screenshotStorageId ?? null,
      destination: settings.destination,
      email: settings.email ?? null,
      linearApiKey: settings.linearApiKey ?? null,
      linearTeamId: settings.linearTeamId ?? null,
    };
  },
});

export const completeDelivery = internalMutation({
  args: {
    submissionId: v.id("feedbackSubmissions"),
    reference: v.optional(v.string()),
    failureMessage: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const submission = await ctx.db.get(
      "feedbackSubmissions",
      args.submissionId,
    );
    if (!submission) return null;
    await ctx.db.patch("feedbackSubmissions", args.submissionId, {
      status: args.failureMessage ? "failed" : "sent",
      ...(args.reference ? { reference: args.reference } : {}),
      ...(args.failureMessage ? { failureMessage: args.failureMessage } : {}),
    });
    return null;
  },
});
