/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { expect, test } from "vitest";
import { api, components } from "./_generated/api";
import schema from "./schema";
import betterAuthSchema from "./betterAuth/schema";
import type { Id } from "./_generated/dataModel";
import { addDateKey, dateKeyInZone, zonedTimestamp } from "../lib/own-checks";

const modules = import.meta.glob("./**/*.ts");
const betterAuthModules = import.meta.glob("./betterAuth/**/*.ts");

async function baCreate(t: ReturnType<typeof convexTest>, model: string, data: Record<string, unknown>) {
  return await t.mutation(components.betterAuth.adapter.create, { input: { model, data } } as never);
}

async function setupAuthOrg(t: ReturnType<typeof convexTest>) {
  process.env.SITE_URL = "http://localhost:3000";
  t.registerComponent("betterAuth", betterAuthSchema, betterAuthModules);
  rateLimiterTest.register(t);
  const now = Date.now();
  const user = await baCreate(t, "user", { name: "Ada Lovelace", email: `ada-${now}@example.com`, emailVerified: true, createdAt: now, updatedAt: now });
  const org = await baCreate(t, "organization", { name: "Chain", slug: `chain-${now}`, createdAt: now });
  await baCreate(t, "member", { organizationId: org._id, userId: user._id, role: "admin", createdAt: now });
  const session = await baCreate(t, "session", { expiresAt: now + 3_600_000, token: `token-${now}`, createdAt: now, updatedAt: now, userId: user._id, activeOrganizationId: org._id });
  const asUser = t.withIdentity({ subject: user._id, issuer: "http://localhost:3000", tokenIdentifier: `http://localhost:3000|${user._id}`, sessionId: session._id } as never);
  return { now, user, org, asUser };
}

async function createUser(t: ReturnType<typeof convexTest>, organizationId: string, role: "admin" | "manager" | "member", index: number, options?: { kioskLocationId?: Id<"locations">; isKioskAccount?: boolean }) {
  const now = Date.now();
  const user = await baCreate(t, "user", { name: `Bruger ${index}`, email: `user-${index}-${now}@example.com`, emailVerified: true, createdAt: now, updatedAt: now });
  await baCreate(t, "member", { organizationId, userId: user._id, role, kioskLocationId: options?.kioskLocationId, createdAt: now });
  const session = await baCreate(t, "session", { expiresAt: now + 3_600_000, token: `user-token-${index}-${now}`, createdAt: now, updatedAt: now, userId: user._id, activeOrganizationId: organizationId, isKioskAccount: options?.isKioskAccount ?? false, kioskModeEnabled: options?.isKioskAccount ?? false });
  const asUser = t.withIdentity({ subject: user._id, issuer: "http://localhost:3000", tokenIdentifier: `http://localhost:3000|${user._id}`, sessionId: session._id } as never);
  return { user, asUser };
}

async function seedLocations(t: ReturnType<typeof convexTest>, organizationId: string) {
  return await t.run(async (ctx) => {
    const north = await ctx.db.insert("locations", { organizationId, name: "Nord", normalizedName: "nord" });
    const south = await ctx.db.insert("locations", { organizationId, name: "Syd", normalizedName: "syd" });
    return { north, south };
  });
}

async function seedTemplate(t: ReturnType<typeof convexTest>, organizationId: string, locationId: Id<"locations">, options?: { name?: string; max?: number; allLocations?: boolean; schedule?: { type: "daily" } | { type: "weekly"; weekdays: number[] }; validFrom?: number; dueMinuteOfDay?: number; attachment?: boolean }) {
  const now = Date.now();
  return await t.run(async (ctx) => {
    const templateId = await ctx.db.insert("ownCheckTemplates", { organizationId, name: options?.name ?? "Kølekontrol", normalizedName: (options?.name ?? "Kølekontrol").toLocaleLowerCase("da"), currentVersion: 1, status: "active", createdBy: "test", updatedAt: now });
    const fields = options?.attachment
      ? [{ key: "temperature", label: "Temperatur", type: "number" as const, required: true, min: 0, max: options?.max ?? 5, unit: "°C", decimals: 1 }, { key: "evidence", label: "Dokumentation", type: "attachment" as const, required: false, maxFiles: 1 }]
      : [{ key: "temperature", label: "Temperatur", type: "number" as const, required: true, min: 0, max: options?.max ?? 5, unit: "°C", decimals: 1 }];
    const versionId = await ctx.db.insert("ownCheckTemplateVersions", { organizationId, templateId, version: 1, name: options?.name ?? "Kølekontrol", description: "Daglig kontrol", controlType: "temperature", schedule: options?.schedule ?? { type: "daily" }, dueMinuteOfDay: options?.dueMinuteOfDay ?? 1_439, fields, allLocations: options?.allLocations ?? false, locationIds: options?.allLocations ? [] : [locationId], validFrom: options?.validFrom ?? now - 86_400_000, createdAt: now, createdBy: "test", createdByName: "Test" });
    return { templateId, versionId };
  });
}

function values(number: number) {
  return [{ key: "temperature", type: "number" as const, number }];
}

function today() {
  return dateKeyInZone(Date.now(), "Europe/Copenhagen");
}

test("et medlem kan indsende, men ikke læse historik, godkende, rette eller eksportere", async () => {
  const t = convexTest(schema, modules);
  const { org } = await setupAuthOrg(t);
  const { north } = await seedLocations(t, org._id);
  const member = await createUser(t, org._id, "member", 1);
  const { templateId } = await seedTemplate(t, org._id, north);
  const dateKey = today();
  const submitted = await member.asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: north, templateId, dueDateKey: dateKey, values: values(4), clientRequestId: "same-request" });
  await expect(member.asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: north, templateId, dueDateKey: dateKey, values: values(4), clientRequestId: "same-request" })).resolves.toEqual(submitted);
  await expect(member.asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: north, templateId, dueDateKey: dateKey, values: values(4), clientRequestId: "another-request" })).rejects.toThrowError("allerede registreret");
  await expect(member.asUser.query(api.ownChecks.listOwnCheckPlan, { fromDateKey: dateKey, toDateKey: dateKey, locationId: north })).rejects.toThrowError("Du har ikke adgang");
  await expect(member.asUser.mutation(api.ownChecks.approveOwnCheck, { entryId: submitted.entryId })).rejects.toThrowError("Du har ikke adgang");
  await expect(member.asUser.mutation(api.ownChecks.editOwnCheck, { entryId: submitted.entryId, values: values(3), reason: "Rettelse" })).rejects.toThrowError("Du har ikke adgang");
  await expect(member.asUser.query(api.ownCheckDocumentation.buildDocumentation, { paginationOpts: { numItems: 25, cursor: null }, fromDateKey: dateKey, toDateKey: dateKey, locationId: north, generatedAt: Date.now() })).rejects.toThrowError("Du har ikke adgang");
});

test("lokationsscope gælder for både udførte og afledte manglende kontroller", async () => {
  const t = convexTest(schema, modules);
  const { org, user, asUser } = await setupAuthOrg(t);
  const { north, south } = await seedLocations(t, org._id);
  const { templateId } = await seedTemplate(t, org._id, north, { allLocations: true });
  await asUser.mutation(api.access.setMemberLocationAccess, { userId: user._id, reason: "Kun Nord", scope: "selected", locationIds: [north] });
  const dateKey = today();
  const overview = await asUser.query(api.ownChecks.listOwnCheckPlan, { fromDateKey: dateKey, toDateKey: dateKey });
  expect(overview.rows.every((row) => row.locationId === north)).toBe(true);
  await expect(asUser.query(api.ownChecks.listOwnCheckPlan, { fromDateKey: dateKey, toDateKey: dateKey, locationId: south })).rejects.toThrowError("Du har ikke adgang til denne lokation");
  await expect(asUser.query(api.ownChecks.listToday, { locationId: south, dateKey })).rejects.toThrowError("Du har ikke adgang til denne lokation");
  await expect(asUser.query(api.ownCheckDocumentation.listMissingOwnChecks, { fromDateKey: dateKey, toDateKey: dateKey, locationId: south, generatedAt: Date.now() })).rejects.toThrowError("Du har ikke adgang til denne lokation");
  await expect(asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: south, templateId, dueDateKey: dateKey, values: values(4) })).rejects.toThrowError("Du har ikke adgang til denne lokation");
  await expect(asUser.query(api.ownCheckDocumentation.buildDocumentation, { paginationOpts: { numItems: 25, cursor: null }, fromDateKey: dateKey, toDateKey: dateKey, locationId: south, generatedAt: Date.now() })).rejects.toThrowError("Du har ikke adgang til denne lokation");
});

test("kiosk kan bruge aktiverede egenkontroldestinationer uden den normale eksporttilladelse", async () => {
  const t = convexTest(schema, modules);
  const { org } = await setupAuthOrg(t);
  const { north, south } = await seedLocations(t, org._id);
  const { templateId } = await seedTemplate(t, org._id, north, { allLocations: true });
  await t.run(async (ctx) => {
    await ctx.db.insert("kioskSettings", { organizationId: org._id, enabledPages: ["ownChecks.today", "ownChecks.documentation"], homePage: "ownChecks.today", inactivitySeconds: null, updatedAt: Date.now() });
  });
  const kiosk = await createUser(t, org._id, "member", 2, { kioskLocationId: north, isKioskAccount: true });
  const dateKey = today();
  await expect(kiosk.asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: north, templateId, dueDateKey: dateKey, values: values(4) })).resolves.toMatchObject({ status: "completed" });
  const generatedAt = Date.now();
  await expect(kiosk.asUser.mutation(api.ownCheckDocumentation.prepareDocumentation, { fromDateKey: dateKey, toDateKey: dateKey, locationId: north })).resolves.toMatchObject({ header: { locationId: north }, missing: { truncated: false } });
  await expect(kiosk.asUser.query(api.ownCheckDocumentation.buildDocumentation, { paginationOpts: { numItems: 25, cursor: null }, fromDateKey: dateKey, toDateKey: dateKey, locationId: north, generatedAt })).resolves.toMatchObject({ page: expect.any(Array) });
  await expect(kiosk.asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: south, templateId, dueDateKey: dateKey, values: values(4) })).rejects.toThrowError("Kioskkontoen har ikke adgang");
  await t.run(async (ctx) => {
    const settings = await ctx.db.query("kioskSettings").withIndex("by_organizationId", (q) => q.eq("organizationId", org._id)).unique();
    if (settings) await ctx.db.patch(settings._id, { enabledPages: [] });
  });
  await expect(kiosk.asUser.query(api.ownChecks.listToday, { locationId: north, dateKey })).rejects.toThrowError("Siden er ikke aktiveret");
  await expect(kiosk.asUser.mutation(api.ownCheckDocumentation.prepareDocumentation, { fromDateKey: dateKey, toDateKey: dateKey, locationId: north })).rejects.toThrowError("Siden er ikke aktiveret");
  const another = await seedTemplate(t, org._id, north, { name: "Modtagekontrol", allLocations: true });
  await expect(kiosk.asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: north, templateId: another.templateId, dueDateKey: dateKey, values: values(4) })).rejects.toThrowError("Siden er ikke aktiveret");
});

test("dokumentation bruger en stabil forberedelsessnapshot og respekterer midnatsgrænsen", async () => {
  const t = convexTest(schema, modules);
  const { org, asUser } = await setupAuthOrg(t);
  const { north } = await seedLocations(t, org._id);
  const dateKey = today();
  const earlyTemplate = await seedTemplate(t, org._id, north, { name: "Tidlig udført", dueMinuteOfDay: 1_439 });
  const lateTemplate = await seedTemplate(t, org._id, north, { name: "Efter snapshot", dueMinuteOfDay: 60 });
  const earlyEntry = await asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: north, templateId: earlyTemplate.templateId, dueDateKey: dateKey, values: values(4) });
  const lateEntry = await asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: north, templateId: lateTemplate.templateId, dueDateKey: dateKey, values: values(4) });
  const dueTimes = await t.run(async (ctx) => {
    const early = await ctx.db.get("ownCheckEntries", earlyEntry.entryId);
    const late = await ctx.db.get("ownCheckEntries", lateEntry.entryId);
    return { earlyDueAt: early!.dueAt, lateDueAt: late!.dueAt };
  });
  const generatedAt = Math.floor((dueTimes.lateDueAt + dueTimes.earlyDueAt) / 2);
  await t.run(async (ctx) => {
    await ctx.db.patch("ownCheckEntries", earlyEntry.entryId, { performedAt: generatedAt - 1 });
    await ctx.db.patch("ownCheckEntries", lateEntry.entryId, { performedAt: generatedAt + 1 });
    const earlyRevision = await ctx.db.query("ownCheckEntryRevisions").withIndex("by_organizationId_and_entryId_and_revision", (q) => q.eq("organizationId", org._id).eq("entryId", earlyEntry.entryId).eq("revision", 1)).unique();
    const lateRevision = await ctx.db.query("ownCheckEntryRevisions").withIndex("by_organizationId_and_entryId_and_revision", (q) => q.eq("organizationId", org._id).eq("entryId", lateEntry.entryId).eq("revision", 1)).unique();
    if (!earlyRevision || !lateRevision) throw new Error("Testrevisionen blev ikke fundet");
    await ctx.db.patch("ownCheckEntryRevisions", earlyRevision._id, { at: generatedAt - 1 });
    await ctx.db.patch("ownCheckEntryRevisions", lateRevision._id, { at: generatedAt + 1 });
    const nextDay = addDateKey(dateKey, 1);
    const dueAt = zonedTimestamp(nextDay, 0, "Europe/Copenhagen");
    const entryId = await ctx.db.insert("ownCheckEntries", {
      organizationId: org._id,
      locationId: north,
      locationName: "Nord",
      templateId: earlyTemplate.templateId,
      templateVersionId: earlyTemplate.versionId,
      templateVersion: 1,
      name: "Midnatsgrænse",
      controlType: "temperature",
      dueDateKey: nextDay,
      dueAt,
      status: "completed",
      hasDeviation: false,
      followUp: "none",
      compliant: true,
      values: values(4),
      performedAt: generatedAt - 1,
      performedBy: "snapshot-user",
      performedByName: "Snapshot",
      revision: 1,
      updatedAt: generatedAt - 1,
    });
    await ctx.db.insert("ownCheckEntryRevisions", {
      organizationId: org._id,
      entryId,
      revision: 1,
      kind: "submitted",
      values: values(4),
      status: "completed",
      hasDeviation: false,
      followUp: "none",
      compliant: true,
      changes: [],
      at: generatedAt - 1,
      actorUserId: "snapshot-user",
      actorName: "Snapshot",
    });
  });
  await asUser.mutation(api.ownChecks.editOwnCheck, { entryId: earlyEntry.entryId, values: values(3), reason: "Rettelse efter forberedelse" });
  await t.run(async (ctx) => {
    const revision = await ctx.db.query("ownCheckEntryRevisions").withIndex("by_organizationId_and_entryId_and_revision", (q) => q.eq("organizationId", org._id).eq("entryId", earlyEntry.entryId).eq("revision", 2)).unique();
    if (!revision) throw new Error("Testrevisionen blev ikke fundet");
    await ctx.db.patch("ownCheckEntryRevisions", revision._id, { at: generatedAt + 1 });
  });
  const documentation = await asUser.query(api.ownCheckDocumentation.buildDocumentation, { paginationOpts: { numItems: 100, cursor: null }, fromDateKey: dateKey, toDateKey: dateKey, locationId: north, generatedAt });
  expect(documentation.page.map((record) => record.name)).toEqual(["Tidlig udført"]);
  expect(documentation.page[0]?.values).toEqual(values(4));
  expect(documentation.page[0]?.revisions.map((revision) => revision.revision)).toEqual([1]);
  const missing = await asUser.query(api.ownCheckDocumentation.listMissingOwnChecks, { fromDateKey: dateKey, toDateKey: dateKey, locationId: north, generatedAt });
  expect(missing.items.map((item) => item.name)).toEqual(["Efter snapshot"]);
});

test("et afkoblet bilag kræver en ny fil i en ny livscyklus på samme registrering", async () => {
  const t = convexTest(schema, modules);
  const { org, asUser } = await setupAuthOrg(t);
  const { north } = await seedLocations(t, org._id);
  const template = await seedTemplate(t, org._id, north, { name: "Bilagskontrol", attachment: true });
  const storageId = await t.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob(["bilag"], { type: "application/pdf" }));
    const systemWriter = ctx.db as unknown as { patch(table: string, id: Id<"_storage">, value: { contentType: string }): Promise<void> };
    await systemWriter.patch("_storage", id, { contentType: "application/pdf" });
    return id;
  });
  const submitted = await asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: north, templateId: template.templateId, dueDateKey: today(), values: [...values(4), { key: "evidence", type: "attachment", storageIds: [storageId] }] });
  const generatedAt = await t.run(async (ctx) => {
    const revision = await ctx.db.query("ownCheckEntryRevisions").withIndex("by_organizationId_and_entryId_and_revision", (q) => q.eq("organizationId", org._id).eq("entryId", submitted.entryId).eq("revision", 1)).unique();
    if (!revision) throw new Error("Testrevisionen blev ikke fundet");
    return revision.at;
  });
  await asUser.mutation(api.ownChecks.editOwnCheck, { entryId: submitted.entryId, values: values(4), reason: "Bilaget blev fjernet" });
  await expect(asUser.mutation(api.ownChecks.editOwnCheck, { entryId: submitted.entryId, values: [...values(4), { key: "evidence", type: "attachment", storageIds: [storageId] }], reason: "Bilaget blev genindsat" })).rejects.toThrowError("Filen blev fjernet fra en tidligere rettelse. Upload filen igen");
  const replacementStorageId = await t.run(async (ctx) => {
    const id = await ctx.storage.store(new Blob(["nyt bilag"], { type: "application/pdf" }));
    const systemWriter = ctx.db as unknown as { patch(table: string, id: Id<"_storage">, value: { contentType: string }): Promise<void> };
    await systemWriter.patch("_storage", id, { contentType: "application/pdf" });
    return id;
  });
  await asUser.mutation(api.ownChecks.editOwnCheck, { entryId: submitted.entryId, values: [...values(4), { key: "evidence", type: "attachment", storageIds: [replacementStorageId] }], reason: "Bilaget blev genindsat" });
  await t.run(async (ctx) => {
    const revisions = await ctx.db.query("ownCheckEntryRevisions").withIndex("by_organizationId_and_entryId_and_revision", (q) => q.eq("organizationId", org._id).eq("entryId", submitted.entryId)).collect();
    for (const revision of revisions.filter((revision) => revision.revision > 1)) await ctx.db.patch("ownCheckEntryRevisions", revision._id, { at: generatedAt + 1 });
  });
  const attachments = await t.run(async (ctx) => await ctx.db.query("ownCheckAttachments").withIndex("by_organizationId_and_entryId", (q) => q.eq("organizationId", org._id).eq("entryId", submitted.entryId)).collect());
  expect(attachments).toHaveLength(2);
  expect(attachments.sort((a, b) => a.addedAtRevision - b.addedAtRevision).map((attachment) => ({ addedAtRevision: attachment.addedAtRevision, removedAtRevision: attachment.removedAtRevision }))).toEqual([
    { addedAtRevision: 1, removedAtRevision: 2 },
    { addedAtRevision: 3, removedAtRevision: undefined },
  ]);
  const documentation = await asUser.query(api.ownCheckDocumentation.buildDocumentation, { paginationOpts: { numItems: 25, cursor: null }, fromDateKey: today(), toDateKey: today(), locationId: north, generatedAt });
  expect(documentation.page[0]?.revisions.map((revision) => revision.revision)).toEqual([1]);
  expect(documentation.page[0]?.attachments.map((attachment) => ({ addedAtRevision: attachment.addedAtRevision, removedAtRevision: attachment.removedAtRevision }))).toEqual([{ addedAtRevision: 1, removedAtRevision: null }]);
});

test("serveren håndhæver afvigelser, immutable revisioner og fire øjne", async () => {
  const t = convexTest(schema, modules);
  const { org, asUser } = await setupAuthOrg(t);
  const { north } = await seedLocations(t, org._id);
  const performer = await createUser(t, org._id, "manager", 3);
  const approver = await createUser(t, org._id, "manager", 4);
  const deviationTemplate = await seedTemplate(t, org._id, north, { name: "Afvigende temperatur", max: 5 });
  const dateKey = today();
  await expect(performer.asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: north, templateId: deviationTemplate.templateId, dueDateKey: dateKey, values: values(6) })).rejects.toThrowError("Beskriv afvigelsen");
  const deviation = await performer.asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: north, templateId: deviationTemplate.templateId, dueDateKey: dateKey, values: values(6), deviationDescription: "For varm", clientRequestId: "deviation" });
  await expect(approver.asUser.mutation(api.ownChecks.approveOwnCheck, { entryId: deviation.entryId })).rejects.toThrowError("følges op");
  await performer.asUser.mutation(api.ownChecks.recordCorrectiveAction, { entryId: deviation.entryId, description: "Produktet blev kasseret" });
  await approver.asUser.mutation(api.ownChecks.approveOwnCheck, { entryId: deviation.entryId });
  await expect(performer.asUser.mutation(api.ownChecks.editOwnCheck, { entryId: deviation.entryId, values: values(5), reason: "Forsøg på rettelse" })).rejects.toThrowError("godkendt");
  await expect(performer.asUser.mutation(api.ownChecks.recordCorrectiveAction, { entryId: deviation.entryId, description: "Ny handling" })).rejects.toThrowError("godkendt");
  const compliantTemplate = await seedTemplate(t, org._id, north, { name: "Godkendelig temperatur" });
  const completed = await performer.asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: north, templateId: compliantTemplate.templateId, dueDateKey: dateKey, values: values(4), clientRequestId: "completed" });
  await expect(performer.asUser.mutation(api.ownChecks.approveOwnCheck, { entryId: completed.entryId })).rejects.toThrowError("anden person");
  await expect(performer.asUser.mutation(api.ownChecks.editOwnCheck, { entryId: completed.entryId, values: values(3), reason: "" })).rejects.toThrowError("begrundelse");
  await performer.asUser.mutation(api.ownChecks.editOwnCheck, { entryId: completed.entryId, values: values(3), reason: "Målingen blev aflæst igen" });
  const revisions = await t.run(async (ctx) => ctx.db.query("ownCheckEntryRevisions").withIndex("by_organizationId_and_entryId_and_revision", (q) => q.eq("organizationId", org._id).eq("entryId", completed.entryId)).collect());
  expect(revisions.map((revision) => revision.revision)).toEqual([1, 2]);
  expect((revisions[0]?.values[0] as { number: number }).number).toBe(4);
  const attributionTemplate = await seedTemplate(t, org._id, north, { name: "Attributionstest", max: 5 });
  const attribution = await performer.asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: north, templateId: attributionTemplate.templateId, dueDateKey: dateKey, values: values(6), deviationDescription: "Original afvigelse", correctiveAction: "Original handling" });
  await performer.asUser.mutation(api.ownChecks.editOwnCheck, { entryId: attribution.entryId, values: values(5), reason: "Ny måling" });
  const attributionState = await t.run(async (ctx) => {
    const entry = await ctx.db.get("ownCheckEntries", attribution.entryId);
    const entryRevisions = await ctx.db.query("ownCheckEntryRevisions").withIndex("by_organizationId_and_entryId_and_revision", (q) => q.eq("organizationId", org._id).eq("entryId", attribution.entryId)).collect();
    return { entry, entryRevisions };
  });
  expect(attributionState.entry?.deviation?.description).toBe("Original afvigelse");
  expect(attributionState.entry?.correctiveAction?.description).toBe("Original handling");
  expect(attributionState.entryRevisions[1]?.deviation?.recordedBy).toBe(attributionState.entryRevisions[0]?.deviation?.recordedBy);
  expect(attributionState.entryRevisions[1]?.correctiveAction?.recordedAt).toBe(attributionState.entryRevisions[0]?.correctiveAction?.recordedAt);
  await approver.asUser.mutation(api.ownChecks.approveOwnCheck, { entryId: completed.entryId });
  const selfTemplate = await seedTemplate(t, org._id, north, { name: "Selvgodkendelig temperatur" });
  const selfEntry = await asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: north, templateId: selfTemplate.templateId, dueDateKey: dateKey, values: values(4), clientRequestId: "self" });
  await expect(asUser.mutation(api.ownChecks.approveOwnCheck, { entryId: selfEntry.entryId })).resolves.toBeNull();
});

test("indstillinger uden række bruger standarderne og kan lukke for sene registreringer", async () => {
  const t = convexTest(schema, modules);
  const { org, asUser } = await setupAuthOrg(t);
  const { north } = await seedLocations(t, org._id);
  const settings = await asUser.query(api.ownCheckTemplates.getSettings, {});
  expect(settings).toEqual({ lateSubmissionDays: 7, requireSecondPersonApproval: true, blockDuringCount: false });
  const member = await createUser(t, org._id, "member", 5);
  const template = await seedTemplate(t, org._id, north, { name: "Gammel temperatur" });
  const yesterday = addDateKey(today(), -1);
  await asUser.mutation(api.ownCheckTemplates.saveSettings, { lateSubmissionDays: 0, requireSecondPersonApproval: true, blockDuringCount: false, reason: "Ingen sene registreringer i testen" });
  await expect(member.asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: north, templateId: template.templateId, dueDateKey: yesterday, values: values(4) })).rejects.toThrowError("op til 0 dage tilbage");
});

test("standardfristen accepterer syv dage og afviser otte dage", async () => {
  const t = convexTest(schema, modules);
  const { org, asUser } = await setupAuthOrg(t);
  const { north } = await seedLocations(t, org._id);
  const template = await seedTemplate(t, org._id, north, { name: "Syv dages frist", validFrom: Date.now() - 10 * 86_400_000 });
  const dateKey = today();
  await expect(asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: north, templateId: template.templateId, dueDateKey: addDateKey(dateKey, -7), values: values(4) })).resolves.toMatchObject({ status: "completed" });
  await expect(asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: north, templateId: template.templateId, dueDateKey: addDateKey(dateKey, -8), values: values(4) })).rejects.toThrowError("op til 7 dage tilbage");
});

test("den aktive egenkontrolgrænse afviser kontrol nummer 201", async () => {
  const t = convexTest(schema, modules);
  const { org, asUser } = await setupAuthOrg(t);
  await t.run(async (ctx) => {
    for (let index = 0; index < 200; index += 1) {
      await ctx.db.insert("ownCheckTemplates", { organizationId: org._id, name: `Kontrol ${index}`, normalizedName: `kontrol-${index}`, currentVersion: 1, status: "active", createdBy: "test", updatedAt: Date.now() });
    }
  });
  await expect(asUser.mutation(api.ownCheckTemplates.createTemplate, {
    name: "Kontrol 201",
    description: "",
    controlType: "temperature",
    schedule: { type: "daily" },
    fields: [{ key: "field-initial", label: "Temperatur", type: "number", required: true, min: 0, max: 5, decimals: 1 }],
    allLocations: true,
    locationIds: [],
  })).rejects.toThrowError("højst have 200 aktive");
});

test("et felts nøgle overlever en labelændring", async () => {
  const t = convexTest(schema, modules);
  const { org, asUser } = await setupAuthOrg(t);
  const { north } = await seedLocations(t, org._id);
  const templateId = await asUser.mutation(api.ownCheckTemplates.createTemplate, {
    name: "Stabil nøgle",
    description: "",
    controlType: "temperature",
    schedule: { type: "daily" },
    fields: [{ key: "field-temperature", label: "Temperatur", type: "number", required: true, min: 0, max: 5, decimals: 1 }],
    allLocations: false,
    locationIds: [north],
  });
  await asUser.mutation(api.ownCheckTemplates.updateTemplate, {
    templateId,
    name: "Stabil nøgle",
    description: "",
    controlType: "temperature",
    schedule: { type: "daily" },
    fields: [{ key: "field-temperature", label: "Ny temperatur", type: "number", required: true, min: 0, max: 5, decimals: 1 }],
    allLocations: false,
    locationIds: [north],
    reason: "Klarere feltnavn",
  });
  const template = await asUser.query(api.ownCheckTemplates.getTemplate, { templateId });
  expect(template?.versions[0]?.fields[0]?.key).toBe("field-temperature");
  expect(template?.versions[0]?.fields[0]?.label).toBe("Ny temperatur");
  await expect(asUser.mutation(api.ownCheckTemplates.updateTemplate, {
    templateId,
    name: "Stabil nøgle",
    description: "",
    controlType: "temperature",
    schedule: { type: "daily" },
    fields: [{ key: "field-renamed", label: "Endnu en temperatur", type: "number", required: true, min: 0, max: 5, decimals: 1 }],
    allLocations: false,
    locationIds: [north],
    reason: "Forsøg på at omgå nøglestabilitet",
  })).rejects.toThrowError("felternes nøgler");
});

test("en afgrænset backlog returnerer ingen delvise manglende rækker", async () => {
  const t = convexTest(schema, modules);
  const { org, asUser } = await setupAuthOrg(t);
  const { north } = await seedLocations(t, org._id);
  const template = await seedTemplate(t, org._id, north, { name: "Stor backlog", validFrom: Date.now() - 10 * 86_400_000 });
  const oldDate = addDateKey(today(), -1);
  await t.run(async (ctx) => {
    for (let index = 0; index < 2_001; index += 1) {
      await ctx.db.insert("ownCheckEntries", {
        organizationId: org._id,
        locationId: north,
        locationName: "Nord",
        templateId: template.templateId,
        templateVersionId: template.versionId,
        templateVersion: 1,
        name: "Stor backlog",
        controlType: "temperature",
        dueDateKey: oldDate,
        dueAt: Date.parse(`${oldDate}T12:00:00Z`) + index,
        status: "completed",
        hasDeviation: false,
        followUp: "none",
        compliant: true,
        values: values(4),
        performedAt: Date.parse(`${oldDate}T12:00:00Z`),
        performedBy: "test",
        performedByName: "Test",
        revision: 1,
        updatedAt: Date.parse(`${oldDate}T12:00:00Z`),
      });
    }
  });
  const result = await asUser.query(api.ownChecks.listToday, { locationId: north, dateKey: today() });
  expect(result.truncated).toBe(true);
  expect(result.backlog).toEqual([]);
});

test("statuspagination filtrerer før cursoren og holder lokationsscope", async () => {
  const t = convexTest(schema, modules);
  const { org, user, asUser } = await setupAuthOrg(t);
  const { north, south } = await seedLocations(t, org._id);
  const west = await t.run(async (ctx) => await ctx.db.insert("locations", { organizationId: org._id, name: "Vest", normalizedName: "vest" }));
  const performer = await createUser(t, org._id, "manager", 6);
  const template = await seedTemplate(t, org._id, north, { name: "Flere lokationer", allLocations: true });
  const dateKey = today();
  await asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: north, templateId: template.templateId, dueDateKey: dateKey, values: values(4), clientRequestId: "north-status" });
  await performer.asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: south, templateId: template.templateId, dueDateKey: dateKey, values: values(4), clientRequestId: "south-status" });
  await asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: west, templateId: template.templateId, dueDateKey: dateKey, values: values(4), clientRequestId: "west-status" });
  await asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: south, templateId: template.templateId, dueDateKey: addDateKey(dateKey, -1), values: values(4), clientRequestId: "south-old-status" });
  await asUser.mutation(api.access.setMemberLocationAccess, { userId: user._id, reason: "To valgte lokationer", scope: "selected", locationIds: [north, south] });
  const filtered = await asUser.query(api.ownChecks.listOwnCheckEntries, { paginationOpts: { numItems: 1, cursor: null }, fromDateKey: dateKey, toDateKey: dateKey, status: "completed", performedBy: performer.user._id });
  expect(filtered.page).toHaveLength(1);
  expect(filtered.page[0]?.locationId).toBe(south);
  const firstPage = await asUser.query(api.ownChecks.listOwnCheckEntries, { paginationOpts: { numItems: 1, cursor: null }, fromDateKey: dateKey, toDateKey: dateKey, status: "completed" });
  expect(firstPage.page).toHaveLength(1);
  expect(firstPage.page[0]?.locationId).toBe(north);
  expect(firstPage.truncated).toBe(false);
  if (!firstPage.isDone) {
    const secondPage = await asUser.query(api.ownChecks.listOwnCheckEntries, { paginationOpts: { numItems: 1, cursor: firstPage.continueCursor }, fromDateKey: dateKey, toDateKey: dateKey, status: "completed" });
    expect(secondPage.page).toHaveLength(1);
    expect(secondPage.page[0]?.locationId).toBe(south);
  }
});

test("en templateændring ændrer ikke den første registrering eller dens revision", async () => {
  const t = convexTest(schema, modules);
  const { org, asUser } = await setupAuthOrg(t);
  const { north } = await seedLocations(t, org._id);
  const template = await seedTemplate(t, org._id, north, { name: "Historisk temperatur" });
  const dateKey = today();
  const submitted = await asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: north, templateId: template.templateId, dueDateKey: addDateKey(dateKey, -1), values: values(4) });
  await asUser.mutation(api.ownCheckTemplates.updateTemplate, {
    templateId: template.templateId,
    name: "Historisk temperatur ny",
    description: "Ny beskrivelse",
    controlType: "temperature",
    schedule: { type: "daily" },
    dueMinuteOfDay: 1_438,
    fields: [{ key: "temperature", label: "Ny temperatur", type: "number", required: true, min: 0, max: 4, unit: "°C", decimals: 1 }],
    allLocations: false,
    locationIds: [north],
    reason: "Opdaterede grænser",
  });
  const record = await asUser.query(api.ownChecks.getOwnCheckRecord, { entryId: submitted.entryId });
  expect(record?.entry.name).toBe("Historisk temperatur");
  expect(record?.entry.templateVersion).toBe(1);
  expect(record?.fields[0]?.label).toBe("Temperatur");
  expect(record?.revisions).toHaveLength(1);
  expect((record?.revisions[0]?.values[0] as { number: number }).number).toBe(4);
  const second = await asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: north, templateId: template.templateId, dueDateKey: dateKey, values: values(3) });
  const secondRecord = await asUser.query(api.ownChecks.getOwnCheckRecord, { entryId: second.entryId });
  expect(secondRecord?.entry.templateVersion).toBe(2);
  expect(secondRecord?.fields[0]?.label).toBe("Ny temperatur");
});

test("count lock følger egenkontrolindstillingen i begge retninger", async () => {
  const t = convexTest(schema, modules);
  const { org, asUser } = await setupAuthOrg(t);
  const { north } = await seedLocations(t, org._id);
  const { templateId } = await seedTemplate(t, org._id, north);
  const now = Date.now();
  const dateKey = today();
  const currentParts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  const currentMinute = currentParts.hour * 60 + currentParts.minute;
  const weeklyOpeningHours = Array.from({ length: 7 }, (_, weekday) => ({ weekday, closed: false, openMinuteOfDay: 0, closeMinuteOfDay: Math.max(0, currentMinute - 5) }));
  await t.run(async (ctx) => {
    await ctx.db.patch("locations", north, { weeklyOpeningHours });
    await ctx.db.insert("countSettings", { organizationId: org._id, lockOtherFeaturesDuringCount: true, requireCountBeforeOpening: true, countSchedule: { type: "monthly", day: Number(dateKey.slice(8)) } });
    await ctx.db.insert("counts", { organizationId: org._id, locationId: north, periodKey: dateKey.slice(0, 7), status: "open", createdBy: "test" });
  });
  await asUser.mutation(api.ownCheckTemplates.saveSettings, { lateSubmissionDays: 7, requireSecondPersonApproval: true, blockDuringCount: false, reason: "Egenkontrol skal være tilgængelig" });
  await expect(asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: north, templateId, dueDateKey: dateKey, values: values(4), clientRequestId: "count-unlocked" })).resolves.toMatchObject({ status: "completed" });
  const secondTemplate = await seedTemplate(t, org._id, north, { name: "Optællingslås" });
  await asUser.mutation(api.ownCheckTemplates.saveSettings, { lateSubmissionDays: 7, requireSecondPersonApproval: true, blockDuringCount: true, reason: "Test af optællingslås" });
  await expect(asUser.mutation(api.ownChecks.submitOwnCheck, { locationId: north, templateId: secondTemplate.templateId, dueDateKey: dateKey, values: values(4), clientRequestId: "count-locked" })).rejects.toThrowError("Andre funktioner er låst");
});
