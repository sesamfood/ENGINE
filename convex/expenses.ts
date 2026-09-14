import { isIntegrationEnabled, requireIntegrationEnabled } from "./integrations/state";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import schema from "./schema";
import { recordAudit } from "./lib/audit";
import { requireAllLocationAccess, requireHumanPrincipal, requireLocationAccess, requirePermission, type OrganizationAuth } from "./lib/auth";
import { validateBadDeliveryRecipients } from "./lib/badDeliverySettings";
import { requireOtherFeaturesUnlocked } from "./lib/countLock";
import { expenseCategoryValidator, expenseEconomicMappingValidator } from "./lib/expenseValidators";
import { getDisabledFeatures } from "./lib/features";
import { requireOrganizationLocation } from "./lib/locations";
import { resolveLocationCurrency } from "./lib/masterData";
import { claimStorageForOrganization } from "./lib/storageOwnership";

type ReadCtx = QueryCtx | MutationCtx;
const MAX_LOCATIONS = 500;
const publicExpense = schema.doc("expenses").omit("to", "cc", "bcc", "economic", "requestFingerprint");
const locationOption = v.object({ id: v.id("locations"), name: v.string(), currency: v.string(), economicConfigured: v.boolean() });
const expenseIdArgs = { expenseId: v.id("expenses") };

async function requireExpenseAccess(ctx: ReadCtx, permission: "expenses.create" | "expenses.view" | "expenses.exportEconomic") {
  const auth = requireHumanPrincipal(await requirePermission(ctx, permission));
  if (auth.kioskModeEnabled) throw new ConvexError("Du har ikke adgang");
  if (auth.granularity !== "detail") throw new ConvexError("Udgifter kræver adgang til detaljerede data");
  if ((await getDisabledFeatures(ctx, auth.organizationId)).includes("expenses")) {
    throw new ConvexError("Udgift er slået fra i organisationen");
  }
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

async function economicForLocation(ctx: ReadCtx, organizationId: string, locationId: Id<"locations">) {
  if (!await isIntegrationEnabled(ctx, organizationId, "economic")) return null;
  const link = await ctx.db.query("economicLocationMappings")
    .withIndex("by_organizationId_and_locationId", (q) => q.eq("organizationId", organizationId).eq("locationId", locationId)).unique();
  if (!link) return null;
  const connection = await ctx.db.get("economicConnections", link.connectionId);
  if (!connection || connection.organizationId !== organizationId || !connection.enabled || !connection.encryptedAppSecretToken) return null;
  if (connection.dimensionNumber !== null && link.dimensionKey === null) return null;
  return { connection, link };
}

async function economicSnapshot(ctx: ReadCtx, expense: Pick<Doc<"expenses">, "organizationId" | "locationId" | "currency" | "categoryId" | "vatRate">) {
  const [linked, settings] = await Promise.all([
    economicForLocation(ctx, expense.organizationId, expense.locationId),
    settingsFor(ctx, expense.organizationId),
  ]);
  const mapping = settings?.economicMappings.find((item) => item.connectionId === linked?.connection._id);
  const account = mapping?.accountMappings.find((item) => item.categoryId === expense.categoryId);
  if (!linked || !mapping || !account) throw new ConvexError("Konfigurér e-conomic for lokationen og udgiftskategorien i Administration");
  if (linked.connection.currency !== expense.currency) throw new ConvexError("Lokationen og e-conomic-aftalen skal bruge samme valuta");
  return {
    connectionId: linked.connection._id,
    connectionRevision: linked.connection.revision,
    journalNumber: mapping.journalNumber,
    accountNumber: account.accountNumber,
    contraAccountNumber: mapping.contraAccountNumber,
    ...(expense.vatRate === 25 ? { vatCode: mapping.vatCode25 } : {}),
    dimensionNumber: linked.connection.dimensionNumber,
    dimensionKey: linked.link.dimensionKey,
  };
}

function visibleExpense(expense: Doc<"expenses">) {
  const { to, cc, bcc, economic, requestFingerprint, ...visible } = expense;
  void to; void cc; void bcc; void economic; void requestFingerprint;
  return visible;
}

async function canExportExpense(ctx: ReadCtx, expense: Doc<"expenses">) {
  try {
    await economicSnapshot(ctx, expense);
    return !expense.attachment || expense.attachment.fileSize <= 9_000_000;
  } catch (error) {
    if (error instanceof ConvexError) return false;
    throw error;
  }
}

export const getSettings = query({
  args: {},
  returns: v.object({
    organizationId: v.string(), to: v.array(v.string()), cc: v.array(v.string()), bcc: v.array(v.string()),
    economicMappings: v.array(expenseEconomicMappingValidator),
    connections: v.array(v.object({ id: v.id("economicConnections"), name: v.string(), agreementNumber: v.number(), enabled: v.boolean(), requiresReconnect: v.boolean() })),
  }),
  handler: async (ctx) => {
    const auth = await requireSettingsAccess(ctx);
    const enabled = await isIntegrationEnabled(ctx, auth.organizationId, "economic");
    const [settings, connections] = await Promise.all([
      settingsFor(ctx, auth.organizationId),
      ctx.db.query("economicConnections").withIndex("by_organizationId", (q) => q.eq("organizationId", auth.organizationId)).take(201),
    ]);
    if (connections.length > 200) throw new ConvexError("Der kan højst konfigureres 200 e-conomic-aftaler");
    return {
      organizationId: auth.organizationId,
      to: settings?.to ?? [], cc: settings?.cc ?? [], bcc: settings?.bcc ?? [],
      economicMappings: enabled ? settings?.economicMappings ?? [] : [],
      connections: (enabled ? connections : []).map((connection) => ({
        id: connection._id, name: connection.name, agreementNumber: connection.agreementNumber,
        enabled: connection.enabled, requiresReconnect: !connection.encryptedAppSecretToken,
      })),
    };
  },
});

export const setSettings = mutation({
  args: {
    expectedOrganizationId: v.string(), to: v.array(v.string()), cc: v.array(v.string()), bcc: v.array(v.string()),
    economicMappings: v.array(expenseEconomicMappingValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireSettingsAccess(ctx);
    requireExpectedOrganization(auth, args.expectedOrganizationId);
    const recipients = validateBadDeliveryRecipients(args);
    if (!recipients.to.length && (recipients.cc.length || recipients.bcc.length)) throw new ConvexError("Angiv mindst én modtager i Til");
    const current = await settingsFor(ctx, auth.organizationId);
    const enabled = await isIntegrationEnabled(ctx, auth.organizationId, "economic");
    const economicMappings = !enabled ? current?.economicMappings ?? [] : args.economicMappings.map((mapping) => ({
      ...mapping, vatCode25: mapping.vatCode25.trim(),
      accountMappings: [...mapping.accountMappings].sort((a, b) => a.categoryId.localeCompare(b.categoryId)),
    })).sort((a, b) => a.connectionId.localeCompare(b.connectionId));
    if (JSON.stringify(current?.economicMappings ?? []) !== JSON.stringify(economicMappings)) {
      await requirePermission(ctx, "integrations.manage");
      if (economicMappings.length > 200 || new Set(economicMappings.map((item) => item.connectionId)).size !== economicMappings.length) {
        throw new ConvexError("Vælg højst 200 forskellige e-conomic-aftaler");
      }
      for (const mapping of economicMappings) {
        const connection = await ctx.db.get("economicConnections", mapping.connectionId);
        if (!connection || connection.organizationId !== auth.organizationId) throw new ConvexError("e-conomic-aftalen blev ikke fundet");
        const numbers = [mapping.journalNumber, mapping.contraAccountNumber, ...mapping.accountMappings.map((item) => item.accountNumber)];
        if (numbers.some((value) => !Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647)) throw new ConvexError("Kassekladde og kontonumre skal være positive heltal");
        if (!mapping.vatCode25 || mapping.vatCode25.length > 20 || /\s/.test(mapping.vatCode25)) throw new ConvexError("Angiv en gyldig momskode for 25 % købsmoms");
        if (!mapping.accountMappings.length || mapping.accountMappings.length > 6 || new Set(mapping.accountMappings.map((item) => item.categoryId)).size !== mapping.accountMappings.length) throw new ConvexError("Angiv én konto pr. valgt udgiftskategori");
        if (mapping.accountMappings.some((item) => item.accountNumber === mapping.contraAccountNumber)) throw new ConvexError("Udgiftskonto og modkonto skal være forskellige");
      }
    }
    const data = { organizationId: auth.organizationId, ...recipients, economicMappings };
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
  returns: v.object({ organizationId: v.string(), locations: v.array(locationOption.extend({ economicAvailable: v.boolean(), economicCategoryIds: v.array(expenseCategoryValidator) })) }),
  handler: async (ctx) => {
    const auth = await requireExpenseAccess(ctx, "expenses.create");
    const [locations, settings] = await Promise.all([availableLocations(ctx, auth), settingsFor(ctx, auth.organizationId)]);
    return { organizationId: auth.organizationId, locations: await Promise.all(locations.map(async (location) => {
      const currency = await resolveLocationCurrency(ctx, auth.organizationId, location);
      const linked = await economicForLocation(ctx, auth.organizationId, location._id);
      const mapping = linked && linked.connection.currency === currency
        ? settings?.economicMappings.find((item) => item.connectionId === linked.connection._id)
        : undefined;
      return {
        id: location._id, name: location.name, currency, economicConfigured: Boolean(linked),
        economicAvailable: Boolean(mapping?.accountMappings.length),
        economicCategoryIds: mapping?.accountMappings.map((item) => item.categoryId) ?? [],
      };
    })) };
  },
});

export const getHistoryLocations = query({
  args: {}, returns: v.array(locationOption),
  handler: async (ctx) => {
    const auth = await requireExpenseAccess(ctx, "expenses.view");
    return await Promise.all((await availableLocations(ctx, auth)).map(async (location) => ({
      id: location._id, name: location.name, currency: await resolveLocationCurrency(ctx, auth.organizationId, location),
      economicConfigured: Boolean(await economicForLocation(ctx, auth.organizationId, location._id)),
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
    attachment: v.optional(v.object({ storageId: v.id("_storage"), fileName: v.string() })), sendToEconomic: v.boolean(),
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
    const requestFingerprint = JSON.stringify([args.locationId, args.categoryId, supplier, args.netAmount, args.vatRate, args.date, args.period, comment, args.attachment?.storageId, args.attachment?.fileName, args.sendToEconomic]);
    const existing = await ctx.db.query("expenses").withIndex("by_organizationId_and_requestId", (q) => q.eq("organizationId", auth.organizationId).eq("requestId", args.requestId)).unique();
    if (existing) {
      if (existing.registeredBy !== auth.userIdentifier || existing.requestFingerprint !== requestFingerprint) throw new ConvexError("Referencen er allerede brugt. Se den gemte udgift i historikken, og opret en ny registrering");
      return existing._id;
    }
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
    let economic: Doc<"expenses">["economic"];
    if (args.sendToEconomic) {
      await requirePermission(ctx, "expenses.exportEconomic");
      if (attachment && attachment.fileSize > 9_000_000) throw new ConvexError("e-conomic understøtter bilag på højst 9 MB");
      economic = await economicSnapshot(ctx, base);
    }
    const settings = await settingsFor(ctx, auth.organizationId);
    const to = settings?.to ?? [];
    const vatAmount = Math.round(args.netAmount * args.vatRate / 100);
    const expenseId = await ctx.db.insert("expenses", {
      ...base, requestId: args.requestId, requestFingerprint, locationName: location.name, supplier,
      netAmount: args.netAmount, vatAmount, grossAmount: args.netAmount + vatAmount, date: args.date, period: args.period, comment,
      ...(attachment ? { attachment } : {}), registeredAt: Date.now(), registeredBy: auth.userIdentifier, registeredByName: auth.userName,
      to, cc: settings?.cc ?? [], bcc: settings?.bcc ?? [], noticeStatus: to.length ? "pending" : "notConfigured",
      ...(economic ? { economic } : {}), economicStatus: economic ? "pending" : "notRequested",
    });
    await recordAudit(ctx, auth, { action: "expenses.create", entityTable: "expenses", entityId: expenseId, locationId: location._id, summary: `Registrerede udgift til ${supplier}` });
    if (to.length) await ctx.scheduler.runAfter(0, internal.expenseNotices.sendNotice, { expenseId });
    if (economic) await ctx.scheduler.runAfter(0, internal.expenseEconomic.exportExpense, { expenseId });
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
  returns: v.union(v.null(), publicExpense.extend({ attachmentUrl: v.union(v.string(), v.null()), economicAvailable: v.boolean(), economicConfigured: v.boolean() })),
  handler: async (ctx, args) => {
    const auth = await requireExpenseAccess(ctx, "expenses.view");
    const expense = await ctx.db.get("expenses", args.expenseId);
    if (!expense || expense.organizationId !== auth.organizationId) return null;
    requireLocationAccess(auth, expense.locationId);
    return {
      ...visibleExpense(expense),
      attachmentUrl: expense.attachment ? await ctx.storage.getUrl(expense.attachment.storageId) : null,
      economicAvailable: await canExportExpense(ctx, expense),
      economicConfigured: Boolean(await economicForLocation(ctx, auth.organizationId, expense.locationId)),
    };
  },
});

export const requestEconomicExport = mutation({
  args: expenseIdArgs, returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await requireExpenseAccess(ctx, "expenses.exportEconomic");
    await requireIntegrationEnabled(ctx, auth.organizationId, "economic");
    const expense = await ctx.db.get("expenses", args.expenseId);
    if (!expense || expense.organizationId !== auth.organizationId) throw new ConvexError("Udgiften blev ikke fundet");
    requireLocationAccess(auth, expense.locationId);
    await requireOtherFeaturesUnlocked(ctx, auth.organizationId, expense.locationId);
    if (expense.economicStatus === "created" || expense.economicStatus === "pending" || expense.economicStatus === "sending") return null;
    if (expense.economicStatus === "uncertain") throw new ConvexError("Kontrollér kladden i e-conomic. Resultatet af den tidligere oprettelse er ukendt");
    if (expense.attachment && expense.attachment.fileSize > 9_000_000) throw new ConvexError("e-conomic understøtter bilag på højst 9 MB");
    const economic = expense.economicEntryNumber ? expense.economic : await economicSnapshot(ctx, expense);
    await ctx.db.patch("expenses", expense._id, { economic, economicStatus: "pending", economicError: undefined });
    await recordAudit(ctx, auth, { action: "expenses.exportEconomic", entityTable: "expenses", entityId: expense._id, locationId: expense.locationId, summary: "Anmodede om udgiftskladde i e-conomic" });
    await ctx.scheduler.runAfter(0, internal.expenseEconomic.exportExpense, args);
    return null;
  },
});

export const claimEconomic = internalMutation({
  args: expenseIdArgs,
  returns: v.union(v.null(), v.object({ expense: schema.doc("expenses"), connection: schema.doc("economicConnections") })),
  handler: async (ctx, args) => {
    const expense = await ctx.db.get("expenses", args.expenseId);
    if (!expense || expense.economicStatus !== "pending" || !expense.economic) return null;
    const connection = await ctx.db.get("economicConnections", expense.economic.connectionId);
    const linked = await economicForLocation(ctx, expense.organizationId, expense.locationId);
    const disabled = (await getDisabledFeatures(ctx, expense.organizationId)).includes("expenses");
    if (disabled || !connection || !connection.enabled || !connection.encryptedAppSecretToken || connection.organizationId !== expense.organizationId || (!expense.economicEntryNumber && connection.revision !== expense.economic.connectionRevision) || linked?.connection._id !== connection._id) {
      await ctx.db.patch("expenses", expense._id, { economicStatus: "failed", economicError: "Udgift eller e-conomic-opsætningen er ændret eller deaktiveret. Kontrollér opsætningen" });
      return null;
    }
    const attemptedAt = Date.now();
    await ctx.db.patch("expenses", expense._id, { economicStatus: "sending", economicAttemptedAt: attemptedAt, economicError: undefined });
    await ctx.scheduler.runAfter(10 * 60 * 1000, internal.expenses.expireDelivery, { expenseId: expense._id, kind: "economic", attemptedAt });
    return { expense: { ...expense, economicAttemptedAt: attemptedAt }, connection };
  },
});

export const recordEconomicEntry = internalMutation({
  args: { ...expenseIdArgs, entryNumber: v.number(), voucherNumber: v.optional(v.number()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const expense = await ctx.db.get("expenses", args.expenseId);
    if (!expense || !["sending", "uncertain"].includes(expense.economicStatus)) throw new ConvexError("Udgiftseksporten er ikke aktiv");
    if (!Number.isSafeInteger(args.entryNumber) || args.entryNumber <= 0 || (expense.economicEntryNumber !== undefined && expense.economicEntryNumber !== args.entryNumber)) throw new ConvexError("e-conomic returnerede en ugyldig kladdereference");
    await ctx.db.patch("expenses", expense._id, { economicEntryNumber: args.entryNumber, ...(args.voucherNumber !== undefined ? { economicVoucherNumber: args.voucherNumber } : {}) });
    return null;
  },
});

export const completeEconomic = internalMutation({
  args: { ...expenseIdArgs, status: v.union(v.literal("created"), v.literal("failed"), v.literal("uncertain")), error: v.optional(v.string()), dimensionAttached: v.optional(v.boolean()), attachmentUploaded: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const expense = await ctx.db.get("expenses", args.expenseId);
    if (!expense || !["sending", "uncertain"].includes(expense.economicStatus)) return null;
    await ctx.db.patch("expenses", expense._id, {
      economicStatus: args.status, economicError: args.error?.slice(0, 1_000),
      ...(args.dimensionAttached !== undefined ? { economicDimensionAttached: args.dimensionAttached } : {}),
      ...(args.attachmentUploaded !== undefined ? { economicAttachmentUploaded: args.attachmentUploaded } : {}),
    });
    return null;
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
  args: { ...expenseIdArgs, kind: v.union(v.literal("notice"), v.literal("economic")), attemptedAt: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const expense = await ctx.db.get("expenses", args.expenseId);
    if (!expense) return null;
    if (args.kind === "economic" && expense.economicStatus === "sending" && expense.economicAttemptedAt === args.attemptedAt) {
      await ctx.db.patch("expenses", expense._id, { economicStatus: expense.economicEntryNumber ? "failed" : "uncertain", economicError: "Svaret fra e-conomic mangler. Kontrollér kladden i e-conomic" });
    }
    if (args.kind === "notice" && expense.noticeStatus === "sending" && expense.noticeAttemptedAt === args.attemptedAt) {
      await ctx.db.patch("expenses", expense._id, { noticeStatus: "failed", noticeError: "Svaret fra e-mailtjenesten mangler" });
    }
    return null;
  },
});
