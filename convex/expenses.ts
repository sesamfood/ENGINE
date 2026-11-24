import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { defaultExpenseCategories, MAX_EXPENSE_CATEGORIES } from "../lib/expenses";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import schema from "./schema";
import { recordAudit } from "./lib/audit";
import { requireAllLocationAccess, requireHumanPrincipal, requireKioskDestination, requireLocationAccess, requirePermission, type OrganizationAuth } from "./lib/auth";
import { validateBadDeliveryRecipients } from "./lib/badDeliverySettings";
import { requireOtherFeaturesUnlocked } from "./lib/countLock";
import { expenseCategoryOptionValidator, expenseCategoryValidator, legacyEconomicExpenseFields } from "./lib/expenseValidators";
import { requireOrganizationLocation } from "./lib/locations";
import { resolveLocationCurrency } from "./lib/masterData";
import { claimStorageForOrganization } from "./lib/storageOwnership";

type ReadCtx = QueryCtx | MutationCtx;
const MAX_LOCATIONS = 500;
const publicExpense = schema.doc("expenses").omit("to", "cc", "bcc", "requestFingerprint", ...legacyEconomicExpenseFields);
const locationOption = v.object({ id: v.id("locations"), name: v.string(), currency: v.string() });
const expenseIdArgs = { expenseId: v.id("expenses") };

async function requireExpenseAccess(ctx: ReadCtx, permission: "expenses.create" | "expenses.view") {
  const auth = requireHumanPrincipal(await requirePermission(ctx, permission));
  await requireKioskDestination(ctx, auth, permission === "expenses.create" ? "expenses.new" : "expenses.history");
  if (auth.granularity !== "detail") throw new ConvexError("Udgifter kræver adgang til detaljerede data");
  return auth;
}

async function requireSettingsAccess(ctx: ReadCtx) {
  const auth = requireHumanPrincipal(await requirePermission(ctx, "expenses.settings"));
  if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
  requireAllLocationAccess(auth);
  return auth;
}

function requireExpectedOrganization(auth: OrganizationAuth, expected: string) {
  if (auth.organizationId !== expected) throw new ConvexError("Organisationen er ændret. Indlæs siden igen");
}

function settingsFor(ctx: ReadCtx, organizationId: string) {
  return ctx.db.query("expenseSettings").withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId)).unique();
}

async function availableLocations(ctx: ReadCtx, auth: OrganizationAuth) {
  const locations = auth.locationScope.all
    ? await ctx.db.query("locations").withIndex("by_organizationId_and_normalizedName", (q) => q.eq("organizationId", auth.organizationId)).take(MAX_LOCATIONS + 1)
    : await Promise.all([...auth.locationScope.ids].slice(0, MAX_LOCATIONS + 1).map((id) => ctx.db.get("locations", id)));
  if (locations.length > MAX_LOCATIONS) throw new ConvexError("Der kan højst vises 500 lokationer");
  return locations.flatMap((location) => location !== null && location.organizationId === auth.organizationId ? [location] : []);
}

function visibleExpense(expense: Doc<"expenses">) {
  const {
    to, cc, bcc, requestFingerprint, economic, economicStatus, economicError, economicAttemptedAt,
    economicEntryNumber, economicVoucherNumber, economicDimensionAttached, economicAttachmentUploaded, ...visible
  } = expense;
  void [to, cc, bcc, requestFingerprint, economic, economicStatus, economicError, economicAttemptedAt,
    economicEntryNumber, economicVoucherNumber, economicDimensionAttached, economicAttachmentUploaded];
  return visible;
}

export const getSettings = query({
  args: {},
  returns: v.object({
    organizationId: v.string(), to: v.array(v.string()), cc: v.array(v.string()), bcc: v.array(v.string()),
    categories: v.array(expenseCategoryOptionValidator),
  }),
  handler: async (ctx) => {
    const auth = await requireSettingsAccess(ctx);
    const settings = await settingsFor(ctx, auth.organizationId);
    return {
      organizationId: auth.organizationId,
      categories: settings?.categories ?? defaultExpenseCategories,
      to: settings?.to ?? [], cc: settings?.cc ?? [], bcc: settings?.bcc ?? [],
    };
  },
});

export const setSettings = mutation({
  args: {
    expectedOrganizationId: v.string(), to: v.array(v.string()), cc: v.array(v.string()), bcc: v.array(v.string()),
    categories: v.optional(v.array(expenseCategoryOptionValidator)),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireSettingsAccess(ctx);
    requireExpectedOrganization(auth, args.expectedOrganizationId);
    const recipients = validateBadDeliveryRecipients(args);
    if (!recipients.to.length && (recipients.cc.length || recipients.bcc.length)) throw new ConvexError("Angiv mindst én modtager i Til");
    const current = await settingsFor(ctx, auth.organizationId);
    const previousCategories = current?.categories ?? defaultExpenseCategories;
    const categories = args.categories?.map((category) => ({ ...category, label: category.label.trim() })) ?? previousCategories;
    if (!categories.length || categories.length > MAX_EXPENSE_CATEGORIES) throw new ConvexError(`Angiv mellem 1 og ${MAX_EXPENSE_CATEGORIES} udgiftskategorier`);
    if (categories.some((category) => !/^[a-zA-Z0-9_-]{1,100}$/.test(category.id))) throw new ConvexError("En udgiftskategori har en ugyldig reference");
    if (categories.some((category) => !category.label || category.label.length > 100 || /[\r\n]/.test(category.label))) throw new ConvexError("Kategorinavne skal være mellem 1 og 100 tegn på én linje");
    const categoryIds = new Set(categories.map((category) => category.id));
    if (categoryIds.size !== categories.length || new Set(categories.map((category) => category.label.toLocaleLowerCase("da-DK"))).size !== categories.length) throw new ConvexError("Udgiftskategorier skal have forskellige navne og referencer");
    if (!categories.some((category) => category.enabled)) throw new ConvexError("Mindst én udgiftskategori skal være aktiv");
    const data = { organizationId: auth.organizationId, ...recipients, categories };
    let id;
    if (current) {
      await ctx.db.patch("expenseSettings", current._id, data);
      id = current._id;
    } else {
      id = await ctx.db.insert("expenseSettings", data);
    }
    await recordAudit(ctx, auth, { action: "expenses.settings", entityTable: "expenseSettings", entityId: id, summary: "Opdaterede indstillinger for Udgift" });
    return null;
  },
});

export const getFormOptions = query({
  args: {},
  returns: v.object({ organizationId: v.string(), categories: v.array(expenseCategoryOptionValidator), locations: v.array(locationOption) }),
  handler: async (ctx) => {
    const auth = await requireExpenseAccess(ctx, "expenses.create");
    const [locations, settings] = await Promise.all([availableLocations(ctx, auth), settingsFor(ctx, auth.organizationId)]);
    return { organizationId: auth.organizationId, categories: (settings?.categories ?? defaultExpenseCategories).filter((category) => category.enabled), locations: await Promise.all(locations.map(async (location) => ({
      id: location._id, name: location.name, currency: await resolveLocationCurrency(ctx, auth.organizationId, location),
    }))) };
  },
});

export const getHistoryLocations = query({
  args: {}, returns: v.array(locationOption),
  handler: async (ctx) => {
    const auth = await requireExpenseAccess(ctx, "expenses.view");
    return await Promise.all((await availableLocations(ctx, auth)).map(async (location) => ({
      id: location._id, name: location.name, currency: await resolveLocationCurrency(ctx, auth.organizationId, location),
    })));
  },
});

export const getUploadUrl = mutation({
  args: { expectedOrganizationId: v.string() }, returns: v.string(),
  handler: async (ctx, args) => {
    const auth = await requireExpenseAccess(ctx, "expenses.create");
    requireExpectedOrganization(auth, args.expectedOrganizationId);
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    requestId: v.string(), expectedOrganizationId: v.string(), locationId: v.id("locations"), categoryId: expenseCategoryValidator,
    supplier: v.string(), netAmount: v.number(), vatRate: v.number(), date: v.string(), period: v.string(), comment: v.string(),
    attachment: v.optional(v.object({ storageId: v.id("_storage"), fileName: v.string() })),
  },
  returns: v.id("expenses"),
  handler: async (ctx, args) => {
    const auth = await requireExpenseAccess(ctx, "expenses.create");
    requireExpectedOrganization(auth, args.expectedOrganizationId);
    requireLocationAccess(auth, args.locationId);
    const supplier = args.supplier.trim();
    const comment = args.comment.trim();
    if (args.requestId.length < 16 || args.requestId.length > 100) throw new ConvexError("Registreringen har en ugyldig reference");
    if (!supplier || supplier.length > 200 || /[\r\n]/.test(supplier)) throw new ConvexError("Leverandør / modtager skal være mellem 1 og 200 tegn på én linje");
    if (comment.length > 2_000) throw new ConvexError("Kommentaren må højst være 2.000 tegn");
    if (!Number.isSafeInteger(args.netAmount) || args.netAmount <= 0 || args.netAmount > 1_000_000_000) throw new ConvexError("Beløbet skal være større end 0 og højst 10.000.000");
    if (args.vatRate !== 0 && args.vatRate !== 25) throw new ConvexError("Vælg 0 % eller 25 % moms");
    if (!/^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(args.date) || !Number.isFinite(Date.parse(`${args.date}T00:00:00Z`)) || new Date(`${args.date}T00:00:00Z`).toISOString().slice(0, 10) !== args.date) throw new ConvexError("Angiv en gyldig dato");
    if (!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(args.period)) throw new ConvexError("Angiv en gyldig periode");
    const requestFingerprint = JSON.stringify([args.locationId, args.categoryId, supplier, args.netAmount, args.vatRate, args.date, args.period, comment, args.attachment?.storageId, args.attachment?.fileName]);
    const existing = await ctx.db.query("expenses").withIndex("by_organizationId_and_requestId", (q) => q.eq("organizationId", auth.organizationId).eq("requestId", args.requestId)).unique();
    if (existing) {
      if (existing.registeredBy !== auth.userIdentifier || existing.requestFingerprint !== requestFingerprint) throw new ConvexError("Referencen er allerede brugt. Se den gemte udgift i historikken, og opret en ny registrering");
      return existing._id;
    }
    const settings = await settingsFor(ctx, auth.organizationId);
    const category = (settings?.categories ?? defaultExpenseCategories).find((item) => item.id === args.categoryId && item.enabled);
    if (!category) throw new ConvexError("Kategorien er ikke længere tilgængelig. Vælg en anden kategori");
    const location = await requireOrganizationLocation(ctx, auth.organizationId, args.locationId);
    await requireOtherFeaturesUnlocked(ctx, auth.organizationId, args.locationId);
    const currency = await resolveLocationCurrency(ctx, auth.organizationId, location);
    let attachment: Doc<"expenses">["attachment"];
    if (args.attachment) {
      const file = await ctx.db.system.get("_storage", args.attachment.storageId);
      if (!file || !file.contentType || !["application/pdf", "image/jpeg", "image/png"].includes(file.contentType) || file.size <= 0 || file.size > 10 * 1024 * 1024) throw new ConvexError("Bilaget skal være PDF, JPG eller PNG og højst 10 MB");
      const fileName = args.attachment.fileName.trim();
      if (!fileName || fileName.length > 200 || /[\x00-\x1f/\\]/.test(fileName)) throw new ConvexError("Bilaget har et ugyldigt filnavn");
      await claimStorageForOrganization(ctx, auth.organizationId, file._id);
      attachment = { storageId: file._id, fileName, contentType: file.contentType, fileSize: file.size };
    }
    const base = { organizationId: auth.organizationId, locationId: location._id, currency, categoryId: args.categoryId, vatRate: args.vatRate };
    const to = settings?.to ?? [];
    const vatAmount = Math.round(args.netAmount * args.vatRate / 100);
    const expenseId = await ctx.db.insert("expenses", {
      ...base, categoryLabel: category.label, requestId: args.requestId, requestFingerprint, locationName: location.name, supplier,
      netAmount: args.netAmount, vatAmount, grossAmount: args.netAmount + vatAmount, date: args.date, period: args.period, comment,
      ...(attachment ? { attachment } : {}), registeredAt: Date.now(), registeredBy: auth.userIdentifier, registeredByName: auth.userName,
      to, cc: settings?.cc ?? [], bcc: settings?.bcc ?? [], noticeStatus: to.length ? "pending" : "notConfigured",
    });
    await recordAudit(ctx, auth, { action: "expenses.create", entityTable: "expenses", entityId: expenseId, locationId: location._id, summary: `Registrerede udgift til ${supplier}` });
    if (to.length) await ctx.scheduler.runAfter(0, internal.expenseNotices.sendNotice, { expenseId });
    return expenseId;
  },
});

export const list = query({
  args: { locationId: v.id("locations"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(publicExpense),
  handler: async (ctx, args) => {
    const auth = await requireExpenseAccess(ctx, "expenses.view");
    requireLocationAccess(auth, args.locationId);
    await requireOrganizationLocation(ctx, auth.organizationId, args.locationId);
    if (!Number.isInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 100) throw new ConvexError("Siden er for stor");
    const page = await ctx.db.query("expenses").withIndex("by_organizationId_and_locationId_and_date", (q) => q.eq("organizationId", auth.organizationId).eq("locationId", args.locationId)).order("desc").paginate(args.paginationOpts);
    return { ...page, page: page.page.map(visibleExpense) };
  },
});

export const get = query({
  args: expenseIdArgs,
  returns: v.union(v.null(), publicExpense.extend({ attachmentUrl: v.union(v.string(), v.null()) })),
  handler: async (ctx, args) => {
    const auth = await requireExpenseAccess(ctx, "expenses.view");
    const expense = await ctx.db.get("expenses", args.expenseId);
    if (!expense || expense.organizationId !== auth.organizationId) return null;
    requireLocationAccess(auth, expense.locationId);
    return {
      ...visibleExpense(expense),
      attachmentUrl: expense.attachment ? await ctx.storage.getUrl(expense.attachment.storageId) : null,
    };
  },
});

export const claimNotice = internalMutation({
  args: expenseIdArgs, returns: v.union(v.null(), schema.doc("expenses")),
  handler: async (ctx, args) => {
    const expense = await ctx.db.get("expenses", args.expenseId);
    if (!expense || expense.noticeStatus !== "pending") return null;
    const attemptedAt = Date.now();
    await ctx.db.patch("expenses", expense._id, { noticeStatus: "sending", noticeAttemptedAt: attemptedAt, noticeFirstAttemptedAt: expense.noticeFirstAttemptedAt ?? attemptedAt, noticeError: undefined });
    await ctx.scheduler.runAfter(10 * 60 * 1000, internal.expenses.expireDelivery, { expenseId: expense._id, kind: "notice", attemptedAt });
    return expense;
  },
});

export const completeNotice = internalMutation({
  args: { ...expenseIdArgs, providerId: v.optional(v.string()), error: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const expense = await ctx.db.get("expenses", args.expenseId);
    if (!expense || expense.noticeStatus !== "sending") return null;
    await ctx.db.patch("expenses", expense._id, { noticeStatus: args.providerId ? "sent" : "failed", noticeProviderId: args.providerId, noticeError: args.error?.slice(0, 1_000) });
    return null;
  },
});

export const retryNotice = mutation({
  args: expenseIdArgs, returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireExpenseAccess(ctx, "expenses.create");
    const expense = await ctx.db.get("expenses", args.expenseId);
    if (!expense || expense.organizationId !== auth.organizationId) throw new ConvexError("Udgiften blev ikke fundet");
    requireLocationAccess(auth, expense.locationId);
    if (expense.noticeStatus !== "failed") return null;
    if (!expense.noticeFirstAttemptedAt || Date.now() - expense.noticeFirstAttemptedAt > 23 * 60 * 60 * 1000) throw new ConvexError("E-mailen kan ikke gensendes automatisk efter 23 timer. Kontrollér først, om modtageren har fået den");
    await ctx.db.patch("expenses", expense._id, { noticeStatus: "pending", noticeError: undefined });
    await ctx.scheduler.runAfter(0, internal.expenseNotices.sendNotice, args);
    return null;
  },
});

export const expireDelivery = internalMutation({
  // "economic" stays accepted for jobs queued before e-conomic expense export was removed.
  args: { ...expenseIdArgs, kind: v.union(v.literal("notice"), v.literal("economic")), attemptedAt: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const expense = await ctx.db.get("expenses", args.expenseId);
    if (!expense) return null;
    if (args.kind === "notice" && expense.noticeStatus === "sending" && expense.noticeAttemptedAt === args.attemptedAt) {
      await ctx.db.patch("expenses", expense._id, { noticeStatus: "failed", noticeError: "Svaret fra e-mailtjenesten mangler" });
    }
    return null;
  },
});
