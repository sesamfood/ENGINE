import type { PaginationOptions, PaginationResult } from "convex/server";
import { ConvexError, v, type Value } from "convex/values";
import { internal } from "../_generated/api";
import type { Id, TableNames } from "../_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { getDatabaseAdapter } from "../auth";
import {
  decryptCredential,
  encryptCredential,
  ensureOrganizationCredentialKey,
} from "../integrations/credentials";
import { integrationIds } from "../integrations/state";
import { featureIds, getEntitlements } from "../lib/features";
import { recordPlatformAudit, requirePlatformMember } from "../lib/platformAuth";
import {
  getCopiedId,
  getTestOrganization,
  getTestOrganizationForSource,
} from "../lib/testOrganizations";
import schema from "../schema";
import { requirePlatformOrganization } from "./organizations";

// A copy contains every table with an organizationId index except these. New tables are
// copied by default.
const keptTables = new Set<string>([
  "platformAuditLog",
  "supportGrants",
  "organizationEntitlements",
  "integrationSecrets",
  "testOrganizations",
  "testOrganizationCopies",
]);
const skippedTables = new Set<string>([
  ...keptTables,
  "auditLog",
  "apiKeyPolicies",
  "apiRequestIdempotency",
  "dashboardShares",
  // Access is read from the source organization.
  "memberLocationAccess",
  "addressSearchCache",
  // Wolt rotates OAuth tokens and routes webhooks by venue, so a copied connection would
  // break the source organization. Imported Wolt history is still copied.
  "woltIntegrations",
  "woltVenueConnections",
  "woltOAuthStates",
  "woltOnboardingEvents",
  "woltOnboardingQuarantine",
  "woltPartnerVenueMappings",
  "woltWebhookEvents",
  "woltWebhookQuarantine",
]);

const organizationTables = Object.entries(schema.tables)
  .flatMap(([table, definition]) => {
    const index = definition[" indexes"]()
      .filter(({ fields }) => fields[0] === "organizationId")
      .sort((a, b) => a.fields.length - b.fields.length)[0];
    return index ? [{ table: table as TableNames, index: index.indexDescriptor }] : [];
  })
  .sort((a, b) => a.table.localeCompare(b.table));
const copiedTables = organizationTables.filter(({ table }) => !skippedTables.has(table));
// Clearing also removes rows created in the test organization since the last copy.
const clearedTables = organizationTables.filter(({ table }) => !keptTables.has(table));

const BATCH_SIZE = 100;
const LINK_BATCH_SIZE = 50;
const FILE_BATCH_SIZE = 10;
const MAX_BATCH_BYTES = 4 * 1024 * 1024;
const FILE_ACTION_MS = 4 * 60 * 1000;
const ID_PATTERN = /^[0-9a-z]{31,37}$/;
const CREDENTIAL_PATTERN = /^v3\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/;

type StoredDocument = { _id: string; _creationTime: number } & Record<string, Value>;
type OrganizationQuery = {
  withIndex(
    index: string,
    range: (q: { eq(field: string, value: string): unknown }) => unknown,
  ): {
    take(count: number): Promise<StoredDocument[]>;
    paginate(options: PaginationOptions): Promise<PaginationResult<StoredDocument>>;
  };
};

// The table list is computed from the schema, so these reads cannot be typed per table.
function organizationRows(
  ctx: QueryCtx | MutationCtx,
  { table, index }: { table: TableNames; index: string },
  organizationId: string,
) {
  return (ctx.db.query(table) as unknown as OrganizationQuery).withIndex(index, (q) =>
    q.eq("organizationId", organizationId),
  );
}

async function mapStrings(
  value: Value,
  map: (value: string) => Promise<string>,
): Promise<Value> {
  if (typeof value === "string") return await map(value);
  if (Array.isArray(value)) {
    return await Promise.all(value.map((item) => mapStrings(item, map)));
  }
  if (value !== null && typeof value === "object" && !(value instanceof ArrayBuffer)) {
    return Object.fromEntries(
      await Promise.all(
        Object.entries(value).map(async ([key, item]) => [
          await map(key),
          await mapStrings(item, map),
        ]),
      ),
    );
  }
  return value;
}

function withoutSystemFields({ _id, _creationTime, ...fields }: StoredDocument) {
  void _id;
  void _creationTime;
  return fields;
}

async function activeRun(
  ctx: QueryCtx | MutationCtx,
  organizationId: string,
  runId: number,
) {
  const test = await getTestOrganization(ctx, organizationId);
  return test?.runId === runId ? test : null;
}

function nextTable(tables: typeof organizationTables, table: string | null) {
  const index = table === null ? 0 : tables.findIndex((item) => item.table === table) + 1;
  return tables[index]?.table ?? null;
}

const runArgs = { organizationId: v.string(), runId: v.number() };

// Copying keeps the test organization suspended, which blocks users and integration jobs.
async function suspendTestOrganization(ctx: MutationCtx, organizationId: string) {
  const entitlements = await getEntitlements(ctx, organizationId);
  if (entitlements) {
    await ctx.db.patch("organizationEntitlements", entitlements._id, {
      status: "suspended",
      updatedAt: Date.now(),
    });
  }
}

export const get = query({
  args: { organizationId: v.string() },
  returns: v.union(
    v.object({
      kind: v.literal("test"),
      source: v.object({ id: v.string(), name: v.string() }),
    }),
    v.object({
      kind: v.literal("source"),
      test: v.union(
        v.object({
          id: v.string(),
          name: v.string(),
          status: v.union(v.literal("copying"), v.literal("ready"), v.literal("deleting")),
          copiedAt: v.union(v.number(), v.null()),
        }),
        v.null(),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    await requirePlatformMember(ctx);
    const adapter = getDatabaseAdapter(ctx);
    const findName = async (id: string) =>
      (
        await adapter.findOne<{ name: string }>({
          model: "organization",
          where: [{ field: "id", value: id }],
        })
      )?.name ?? "";
    const own = await getTestOrganization(ctx, args.organizationId);
    if (own) {
      return {
        kind: "test" as const,
        source: {
          id: own.sourceOrganizationId,
          name: await findName(own.sourceOrganizationId),
        },
      };
    }
    const test = await getTestOrganizationForSource(ctx, args.organizationId);
    return {
      kind: "source" as const,
      test: test && {
        id: test.organizationId,
        name: await findName(test.organizationId),
        status: test.status,
        copiedAt: test.copiedAt ?? null,
      },
    };
  },
});

export const create = mutation({
  args: { organizationId: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const actor = await requirePlatformMember(ctx, "owner");
    const source = await requirePlatformOrganization(ctx, args.organizationId);
    if (await getTestOrganization(ctx, source.id)) {
      throw new ConvexError("En testorganisation kan ikke have sin egen testorganisation");
    }
    if (await getTestOrganizationForSource(ctx, source.id)) {
      throw new ConvexError("Organisationen har allerede en testorganisation");
    }
    const adapter = getDatabaseAdapter(ctx);
    const slug = `${source.slug}-test`;
    if (await adapter.findOne({ model: "organization", where: [{ field: "slug", value: slug }] })) {
      throw new ConvexError(`Slug ${slug} er allerede i brug`);
    }
    const organization = await adapter.create<{
      name: string;
      slug: string;
      logo: string | null;
      metadata: null;
      createdAt: Date;
    }, { id: string }>({
      model: "organization",
      data: {
        name: `${source.name} (test)`,
        slug,
        logo: source.logo ?? null,
        metadata: null,
        createdAt: new Date(),
      },
    });
    const sourceEntitlements = await getEntitlements(ctx, source.id);
    await ctx.db.insert("organizationEntitlements", {
      organizationId: organization.id,
      status: "suspended",
      plan: sourceEntitlements?.plan,
      features: sourceEntitlements?.features ?? [...featureIds],
      integrations: (sourceEntitlements?.integrations ?? integrationIds).filter(
        (integration) => integration !== "wolt",
      ),
      unavailableDisplay: sourceEntitlements?.unavailableDisplay,
      updatedAt: Date.now(),
    });
    await ensureOrganizationCredentialKey(ctx, organization.id);
    const runId = Date.now();
    await ctx.db.insert("testOrganizations", {
      organizationId: organization.id,
      sourceOrganizationId: source.id,
      status: "copying",
      runId,
    });
    await ctx.scheduler.runAfter(0, internal.platform.testOrganizations.insertBatch, {
      organizationId: organization.id,
      runId,
      table: copiedTables[0].table,
      cursor: null,
    });
    await recordPlatformAudit(ctx, actor, {
      organizationId: source.id,
      action: "testOrganization.created",
      summary: `Testorganisationen ${source.name} (test) er oprettet`,
    });
    return organization.id;
  },
});

async function requireSourceTest(ctx: MutationCtx, organizationId: string) {
  const source = await requirePlatformOrganization(ctx, organizationId);
  const test = await getTestOrganizationForSource(ctx, source.id);
  if (!test) throw new ConvexError("Organisationen har ingen testorganisation");
  return { source, test };
}

export const reset = mutation({
  args: { organizationId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requirePlatformMember(ctx, "owner");
    const { source, test } = await requireSourceTest(ctx, args.organizationId);
    if (test.status === "deleting") throw new ConvexError("Testorganisationen er ved at blive slettet");
    const runId = Date.now();
    await ctx.db.patch("testOrganizations", test._id, { status: "copying", runId });
    await suspendTestOrganization(ctx, test.organizationId);
    await ctx.scheduler.runAfter(0, internal.platform.testOrganizations.clearBatch, {
      organizationId: test.organizationId,
      runId,
      table: clearedTables[0].table,
      then: "copy",
    });
    await recordPlatformAudit(ctx, actor, {
      organizationId: source.id,
      action: "testOrganization.reset",
      summary: "Testorganisationen nulstilles med en ny kopi",
    });
    return null;
  },
});

export const remove = mutation({
  args: { organizationId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requirePlatformMember(ctx, "owner");
    const { source, test } = await requireSourceTest(ctx, args.organizationId);
    const runId = Date.now();
    await ctx.db.patch("testOrganizations", test._id, { status: "deleting", runId });
    await suspendTestOrganization(ctx, test.organizationId);
    await ctx.scheduler.runAfter(0, internal.platform.testOrganizations.clearBatch, {
      organizationId: test.organizationId,
      runId,
      table: clearedTables[0].table,
      then: "delete",
    });
    await recordPlatformAudit(ctx, actor, {
      organizationId: source.id,
      action: "testOrganization.deleted",
      summary: "Testorganisationen slettes",
    });
    return null;
  },
});

export const clearBatch = internalMutation({
  args: {
    ...runArgs,
    // null clears copy links and copied files after the tables.
    table: v.union(v.string(), v.null()),
    then: v.union(v.literal("copy"), v.literal("delete")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await activeRun(ctx, args.organizationId, args.runId))) return null;
    const table = clearedTables.find((item) => item.table === args.table);
    if (table) {
      const rows = await organizationRows(ctx, table, args.organizationId).take(BATCH_SIZE);
      for (const row of rows) await ctx.db.delete(table.table, row._id as Id<TableNames>);
      await ctx.scheduler.runAfter(0, internal.platform.testOrganizations.clearBatch, {
        ...args,
        table: rows.length === BATCH_SIZE ? table.table : nextTable(clearedTables, table.table),
      });
      return null;
    }
    const copies = await ctx.db
      .query("testOrganizationCopies")
      .withIndex("by_organizationId_and_sourceId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .take(BATCH_SIZE);
    for (const copy of copies) {
      const storageId =
        copy.table === "_storage" && copy.targetId && copy.targetId !== copy.sourceId
          ? ctx.db.system.normalizeId("_storage", copy.targetId)
          : null;
      if (storageId) {
        if (await ctx.db.system.get("_storage", storageId)) await ctx.storage.delete(storageId);
        const owner = await ctx.db
          .query("storageOwners")
          .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
          .unique();
        if (owner) await ctx.db.delete("storageOwners", owner._id);
      }
      await ctx.db.delete("testOrganizationCopies", copy._id);
    }
    if (copies.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.platform.testOrganizations.clearBatch, args);
    } else if (args.then === "copy") {
      await ctx.scheduler.runAfter(0, internal.platform.testOrganizations.insertBatch, {
        organizationId: args.organizationId,
        runId: args.runId,
        table: copiedTables[0].table,
        cursor: null,
      });
    } else {
      await deleteTestOrganization(ctx, args.organizationId);
    }
    return null;
  },
});

async function deleteTestOrganization(ctx: MutationCtx, organizationId: string) {
  const adapter = getDatabaseAdapter(ctx);
  await adapter.deleteMany({ model: "member", where: [{ field: "organizationId", value: organizationId }] });
  await adapter.deleteMany({ model: "invitation", where: [{ field: "organizationId", value: organizationId }] });
  await adapter.delete({ model: "organization", where: [{ field: "id", value: organizationId }] });
  for (const table of ["organizationEntitlements", "integrationSecrets", "testOrganizations"] as const) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
      .take(10);
    for (const row of rows) await ctx.db.delete(table, row._id);
  }
}

export const insertBatch = internalMutation({
  args: { ...runArgs, table: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const test = await activeRun(ctx, args.organizationId, args.runId);
    if (test?.status !== "copying") return null;
    const table = copiedTables.find((item) => item.table === args.table);
    if (!table) throw new ConvexError(`Ukendt tabel ${args.table}`);
    const sourceId = test.sourceOrganizationId;
    const targetId = test.organizationId;
    const page = await organizationRows(ctx, table, sourceId).paginate({
      cursor: args.cursor,
      numItems: BATCH_SIZE,
      maximumBytesRead: MAX_BATCH_BYTES,
    });
    const [sourceKey, targetKey] = await Promise.all([
      ctx.db
        .query("integrationSecrets")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", sourceId))
        .unique(),
      ensureOrganizationCredentialKey(ctx, targetId),
    ]);
    const files = new Set<string>();
    const copyString = async (value: string) => {
      if (value === sourceId) return targetId;
      if (ID_PATTERN.test(value) && ctx.db.system.normalizeId("_storage", value)) {
        files.add(value);
        return value;
      }
      // Credentials are encrypted with the organization ID, so they are encrypted again.
      if (sourceKey && CREDENTIAL_PATTERN.test(value)) {
        try {
          const plain = await decryptCredential(value, sourceId, sourceKey.key);
          return await encryptCredential(plain, targetId, targetKey);
        } catch {
          return value;
        }
      }
      return value;
    };
    for (const row of page.page) {
      const copy = await mapStrings(withoutSystemFields(row), copyString);
      const copiedId = await ctx.db.insert(table.table, copy as never);
      await ctx.db.insert("testOrganizationCopies", {
        organizationId: targetId,
        table: table.table,
        sourceId: row._id,
        targetId: copiedId,
      });
    }
    for (const file of files) {
      if (await getCopiedFile(ctx, targetId, file)) continue;
      await ctx.db.insert("testOrganizationCopies", {
        organizationId: targetId,
        table: "_storage",
        sourceId: file,
      });
    }
    const next = page.isDone ? nextTable(copiedTables, table.table) : table.table;
    if (next) {
      await ctx.scheduler.runAfter(0, internal.platform.testOrganizations.insertBatch, {
        ...args,
        table: next,
        cursor: page.isDone ? null : page.continueCursor,
      });
    } else {
      await ctx.scheduler.runAfter(0, internal.platform.testOrganizations.copyFiles, {
        organizationId: args.organizationId,
        runId: args.runId,
      });
    }
    return null;
  },
});

async function getCopiedFile(ctx: QueryCtx | MutationCtx, organizationId: string, sourceId: string) {
  return await ctx.db
    .query("testOrganizationCopies")
    .withIndex("by_organizationId_and_sourceId", (q) =>
      q.eq("organizationId", organizationId).eq("sourceId", sourceId),
    )
    .unique();
}

export const pendingFiles = internalQuery({
  args: runArgs,
  returns: v.union(
    v.array(v.object({ copyId: v.id("testOrganizationCopies"), sourceId: v.id("_storage") })),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const test = await activeRun(ctx, args.organizationId, args.runId);
    if (test?.status !== "copying") return null;
    const copies = await ctx.db
      .query("testOrganizationCopies")
      .withIndex("by_organizationId_and_table_and_targetId", (q) =>
        q.eq("organizationId", args.organizationId).eq("table", "_storage").eq("targetId", undefined),
      )
      .take(FILE_BATCH_SIZE);
    return copies.map((copy) => ({
      copyId: copy._id,
      sourceId: copy.sourceId as Id<"_storage">,
    }));
  },
});

export const saveFiles = internalMutation({
  args: {
    ...runArgs,
    files: v.array(
      v.object({ copyId: v.id("testOrganizationCopies"), targetId: v.id("_storage") }),
    ),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (!(await activeRun(ctx, args.organizationId, args.runId))) return false;
    for (const file of args.files) {
      const copy = await ctx.db.get("testOrganizationCopies", file.copyId);
      if (!copy) continue;
      await ctx.db.patch("testOrganizationCopies", copy._id, { targetId: file.targetId });
      if (file.targetId !== copy.sourceId) {
        await ctx.db.insert("storageOwners", {
          organizationId: args.organizationId,
          storageId: file.targetId,
        });
      }
    }
    return true;
  },
});

export const startLinking = internalMutation({
  args: runArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await activeRun(ctx, args.organizationId, args.runId))) return null;
    await ctx.scheduler.runAfter(0, internal.platform.testOrganizations.linkBatch, {
      ...args,
      cursor: null,
    });
    return null;
  },
});

// Files are copied so deleting one in the test organization never removes the source file.
export const copyFiles = internalAction({
  args: runArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < FILE_ACTION_MS) {
      const pending = await ctx.runQuery(internal.platform.testOrganizations.pendingFiles, args);
      if (!pending) return null;
      if (!pending.length) {
        await ctx.runMutation(internal.platform.testOrganizations.startLinking, args);
        return null;
      }
      const files = await Promise.all(
        pending.map(async ({ copyId, sourceId }) => {
          const blob = await ctx.storage.get(sourceId);
          // A missing source file keeps its old, dangling reference.
          return { copyId, targetId: blob ? await ctx.storage.store(blob) : sourceId };
        }),
      );
      const saved = await ctx.runMutation(internal.platform.testOrganizations.saveFiles, {
        ...args,
        files,
      });
      if (!saved) {
        await Promise.all(
          files
            .filter((file, index) => file.targetId !== pending[index].sourceId)
            .map((file) => ctx.storage.delete(file.targetId)),
        );
        return null;
      }
    }
    await ctx.scheduler.runAfter(0, internal.platform.testOrganizations.copyFiles, args);
    return null;
  },
});

// Replaces references to source documents and files with their copies. A copy that points
// to a source document created after its table was copied is deleted, so nothing in the
// test organization refers to live source data.
export const linkBatch = internalMutation({
  args: { ...runArgs, cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const test = await activeRun(ctx, args.organizationId, args.runId);
    if (test?.status !== "copying") return null;
    const page = await ctx.db
      .query("testOrganizationCopies")
      .withIndex("by_organizationId_and_sourceId", (q) =>
        q.eq("organizationId", args.organizationId),
      )
      .paginate({ cursor: args.cursor, numItems: LINK_BATCH_SIZE });
    const targets = new Map<string, string | null>();
    const findTarget = async (sourceId: string) => {
      if (!targets.has(sourceId)) {
        targets.set(sourceId, await getCopiedId(ctx, args.organizationId, sourceId));
      }
      return targets.get(sourceId) ?? null;
    };
    const live = new Map<string, boolean>();
    const isLiveSourceDocument = async (value: string) => {
      if (!live.has(value)) {
        let exists = false;
        for (const { table } of copiedTables) {
          const id = ctx.db.normalizeId(table, value);
          if (id) {
            exists = (await ctx.db.get(table, id)) !== null;
            break;
          }
        }
        live.set(value, exists);
      }
      return live.get(value) === true;
    };
    for (const copy of page.page) {
      if (copy.table === "_storage" || !copy.targetId) continue;
      const table = copy.table as TableNames;
      const id = ctx.db.normalizeId(table, copy.targetId);
      const row = id && ((await ctx.db.get(table, id)) as StoredDocument | null);
      if (!id || !row) continue;
      let changed = false;
      let orphan = false;
      const linked = await mapStrings(withoutSystemFields(row), async (value) => {
        if (!ID_PATTERN.test(value)) return value;
        const target = await findTarget(value);
        if (target !== null) {
          changed ||= target !== value;
          return target;
        }
        if (await isLiveSourceDocument(value)) orphan = true;
        return value;
      });
      if (orphan) await ctx.db.delete(table, id);
      else if (changed) await ctx.db.replace(table, id, linked as never);
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.platform.testOrganizations.linkBatch, {
        ...args,
        cursor: page.continueCursor,
      });
      return null;
    }
    const sourceEntitlements = await getEntitlements(ctx, test.sourceOrganizationId);
    const entitlements = await getEntitlements(ctx, args.organizationId);
    if (entitlements) {
      await ctx.db.patch("organizationEntitlements", entitlements._id, {
        status: sourceEntitlements?.status ?? "active",
        updatedAt: Date.now(),
      });
    }
    await ctx.db.patch("testOrganizations", test._id, {
      status: "ready",
      copiedAt: Date.now(),
    });
    return null;
  },
});
