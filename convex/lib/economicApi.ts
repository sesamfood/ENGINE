import { ConvexError } from "convex/values";
import { z } from "zod";

const REST = "https://restapi.e-conomic.com";
const ACCOUNTS = "https://apis.e-conomic.com/accountsapi/v7.0.1/Accounts";
const ENTRIES = "https://apis.e-conomic.com/bookedEntriesapi/v5.0.0/booked-entries";
const BUDGETS = "https://apis.e-conomic.com/budgetsapi/v2.0.0/budget-figures";
const DIMENSIONS = "https://apis.e-conomic.com/dimensionsapi/v5.3.1";
const REQUEST_TIMEOUT_MS = 15_000;
const REPORT_TIMEOUT_MS = 150_000;
const MAX_REQUESTS = 750;
const MAX_ROWS = 30_000;
const MAX_PAGE_BYTES = 2_000_000;
const MAX_TOTAL_BYTES = 12_000_000;
const MAX_ALLOCATION_PARTS = 100_000;
const FILTER_BATCH_SIZE = 200;

export type EconomicCredentials = {
  appSecretToken: string;
  agreementGrantToken: string;
};

const identifier = z.number().int().positive().max(2_147_483_647);
const dimensionNumberSchema = z.number().int().min(1).max(3);
const objectVersion = z.string().max(1_000).nullish().transform((value) => value ?? null);
const providerDate = z.union([
  z.iso.date(),
  z.iso.datetime({ offset: true, local: true }),
]).transform((value) => value.slice(0, 10));
const amount = z.number().finite();
const selfSchema = z.object({
  agreementNumber: identifier,
  company: z.object({ name: z.string().max(1_000) }),
  settings: z.object({ baseCurrency: z.string().regex(/^[A-Z]{3}$/) }),
});
const accountSchema = z.object({
  number: identifier,
  name: z.string().max(125).nullish(),
  type: z.number().int().min(1).max(7),
});
const dimensionSchema = z.object({
  number: dimensionNumberSchema,
  name: z.string().max(255),
});
const valueSchema = z.object({
  dimensionNumber: dimensionNumberSchema,
  key: identifier,
  name: z.string().max(255).nullish(),
});
const entrySchema = z.object({
  entryNumber: identifier,
  accountNumber: identifier,
  date: providerDate,
  amountInBaseCurrency: amount,
  objectVersion,
});
const budgetSchema = z.object({
  number: identifier,
  accountNumber: identifier,
  fromDate: providerDate,
  toDate: providerDate,
  amountDefaultCurrency: amount,
  objectVersion,
}).refine((value) => value.fromDate <= value.toDate);
const dimensionAssignmentSchema = z.object({
  dimensionNumber: dimensionNumberSchema,
  dimensionKey: identifier,
  isDistribution: z.boolean().default(false),
  objectVersion,
});
const entryDimensionSchema = dimensionAssignmentSchema.extend({ entryNumber: identifier });
const budgetDimensionSchema = dimensionAssignmentSchema.extend({ budgetFigureNumber: identifier });
const distributionSchema = z.object({
  dimensionNumber: dimensionNumberSchema,
  key: identifier,
  distributions: z.array(z.object({
    key: identifier,
    percent: z.number().min(0).max(100),
  })).min(1).max(10_000),
});
const periodSchema = z.object({
  fromDate: z.iso.date(),
  toDate: z.iso.date(),
  // Classic REST omits false booleans from its responses.
  closed: z.boolean().optional().default(false),
}).refine((value) => value.fromDate <= value.toDate);
const yearSchema = z.object({
  year: z.string().regex(/^\d{4}(?:\/\d{4})?$/),
  fromDate: z.iso.date(),
  toDate: z.iso.date(),
}).refine((value) => value.fromDate <= value.toDate);

type ReadContext = {
  credentials: EconomicCredentials;
  deadline: number;
  requests: number;
  rows: number;
  bytes: number;
};
type Allocation = { dimensionKey: number; percent: number };
type DimensionAssignment = z.infer<typeof dimensionAssignmentSchema>;

function invalidData(): never {
  throw new ConvexError("e-conomic returnerede ufuldstændige eller ugyldige data. Prøv at hente rapporten igen.");
}

function readLimit(): never {
  throw new ConvexError("Rapporten fra e-conomic er for stor eller tager for lang tid. Vælg en kortere periode og prøv igen.");
}

function parse<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) invalidData();
  return result.data;
}

class EconomicHttpError extends ConvexError<string> {
  constructor(readonly status: number, readonly dimensionUnavailable: boolean) {
    super(status === 401
      ? "Adgangen til e-conomic er udløbet eller afvist. Tilslut aftalen igen."
      : status === 403
        ? "Integrationen har ikke adgang til de ønskede data i e-conomic. Kontrollér aftalens moduler og appens rettigheder."
        : dimensionUnavailable
          ? "Dimensionsmodulet er ikke tilgængeligt på denne e-conomic-aftale."
          : "Data kunne ikke hentes fra e-conomic. Prøv igen senere.");
  }
}

function context(credentials: EconomicCredentials, deadlineAt = Date.now() + REPORT_TIMEOUT_MS): ReadContext {
  if (!credentials.appSecretToken.trim() || !credentials.agreementGrantToken.trim()) {
    throw new ConvexError("Tilslut e-conomic, før du henter data.");
  }
  return { credentials, deadline: Math.min(deadlineAt, Date.now() + REPORT_TIMEOUT_MS), requests: 0, rows: 0, bytes: 0 };
}

async function readJson(ctx: ReadContext, response: Response): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > MAX_PAGE_BYTES) readLimit();
  if (!response.body) invalidData();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      ctx.bytes += chunk.value.byteLength;
      if (bytes > MAX_PAGE_BYTES || ctx.bytes > MAX_TOTAL_BYTES || Date.now() > ctx.deadline) readLimit();
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally {
    await reader.cancel();
  }
}

async function request(ctx: ReadContext, url: URL): Promise<unknown> {
  if (url.protocol !== "https:" || !["apis.e-conomic.com", "restapi.e-conomic.com"].includes(url.hostname)
    || url.username || url.password || url.port || url.hash) invalidData();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const remaining = ctx.deadline - Date.now();
    if (remaining <= 0 || ++ctx.requests > MAX_REQUESTS) readLimit();
    let retryAfter: string | null = null;
    try {
      const response = await fetch(url, {
        method: "GET",
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remaining)),
        headers: {
          Accept: "application/json",
          "X-AppSecretToken": ctx.credentials.appSecretToken,
          "X-AgreementGrantToken": ctx.credentials.agreementGrantToken,
        },
      });
      if (response.status === 429) {
        retryAfter = response.headers.get("retry-after");
        await response.body?.cancel();
      } else if (!response.ok) {
        const problem = z.object({
          errorCode: z.string().optional(),
          errors: z.array(z.object({ errorCode: z.string().optional() })).optional(),
        }).safeParse(await readJson(ctx, response).catch(() => null));
        const dimensionUnavailable = problem.success && [
          problem.data.errorCode,
          ...(problem.data.errors ?? []).map((error) => error.errorCode),
        ].includes("DimensionIncorrectModule");
        throw new EconomicHttpError(response.status, dimensionUnavailable);
      } else {
        return await readJson(ctx, response);
      }
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      throw new ConvexError("Forbindelsen til e-conomic blev afbrudt. Prøv at hente data igen.");
    }
    if (attempt === 2) break;
    const retrySeconds = retryAfter === null ? NaN : Number(retryAfter);
    const retryDate = retryAfter === null ? NaN : Date.parse(retryAfter);
    const delay = Number.isFinite(retrySeconds) && retrySeconds >= 0
      ? retrySeconds * 1_000
      : Number.isFinite(retryDate) ? Math.max(0, retryDate - Date.now()) : 500 * 2 ** attempt;
    if (delay > 30_000 || Date.now() + delay >= ctx.deadline) break;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new ConvexError("e-conomic har nået grænsen for API-kald. Vent lidt og prøv igen.");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

async function fingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function cursorRows<T>(
  ctx: ReadContext,
  endpoint: string,
  schema: z.ZodType<T>,
  key: (item: T) => number | string,
  filter?: string,
): Promise<T[]> {
  const pageSchema = z.object({
    items: z.array(z.unknown()).max(1_000).nullable(),
    cursor: z.string().min(1).max(50).nullish(),
  });
  const rows = new Map<number | string, { item: T; fingerprint: string }>();
  const cursors = new Set<string>();
  let cursor: string | null = null;
  for (;;) {
    const url = new URL(endpoint);
    if (filter) url.searchParams.set("filter", filter);
    if (cursor) url.searchParams.set("cursor", cursor);
    const page = parse(pageSchema, await request(ctx, url));
    ctx.rows += page.items?.length ?? 0;
    if (ctx.rows > MAX_ROWS) readLimit();
    for (const raw of page.items ?? []) {
      const item = parse(schema, raw);
      const id = key(item);
      if (Date.now() >= ctx.deadline) readLimit();
      const signature = await fingerprint(raw);
      const previous = rows.get(id);
      if (previous && previous.fingerprint !== signature) {
        throw new ConvexError("Data i e-conomic ændrede sig under indlæsningen. Hent rapporten igen.");
      }
      if (!previous) rows.set(id, { item, fingerprint: signature });
    }
    if (!page.cursor) return [...rows.values()].map((row) => row.item);
    if (!page.items?.length || cursors.has(page.cursor)) invalidData();
    cursors.add(page.cursor);
    cursor = page.cursor;
  }
}

async function restRows<T>(ctx: ReadContext, endpoint: string, schema: z.ZodType<T>, filter: string): Promise<T[]> {
  const pageSchema = z.object({
    collection: z.array(schema).max(1_000),
    pagination: z.object({
      results: z.number().int().nonnegative(),
      pageSize: z.number().int().positive(),
      skipPages: z.number().int().nonnegative(),
      nextPage: z.string().optional(),
    }),
  });
  const rows: T[] = [];
  let expectedResults: number | null = null;
  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const url = new URL(endpoint);
    url.searchParams.set("filter", filter);
    url.searchParams.set("pagesize", "1000");
    url.searchParams.set("skippages", String(pageNumber));
    const page = parse(pageSchema, await request(ctx, url));
    if (page.pagination.pageSize !== 1_000 || page.pagination.skipPages !== pageNumber) invalidData();
    if (expectedResults !== null && expectedResults !== page.pagination.results) invalidData();
    expectedResults = page.pagination.results;
    ctx.rows += page.collection.length;
    if (ctx.rows > MAX_ROWS) readLimit();
    rows.push(...page.collection);
    if (!page.pagination.nextPage) {
      if (rows.length !== expectedResults) invalidData();
      return rows;
    }
    if (page.collection.length !== 1_000 || rows.length >= expectedResults) invalidData();
  }
  readLimit();
}

export async function getEconomicSelf(credentials: EconomicCredentials) {
  const self = parse(selfSchema, await request(context(credentials), new URL(`${REST}/self`)));
  return { agreementNumber: self.agreementNumber, name: self.company.name, currency: self.settings.baseCurrency };
}

export async function getEconomicCatalog(credentials: EconomicCredentials) {
  const ctx = context(credentials);
  const accounts = (await cursorRows(ctx, ACCOUNTS, accountSchema, (item) => item.number))
    .map((item) => ({ number: item.number, name: item.name ?? String(item.number), type: item.type }));
  let dimensions: Array<{ number: number; name: string }>;
  let values: Array<{ dimensionNumber: number; number: number; name: string }>;
  try {
    dimensions = (await cursorRows(ctx, `${DIMENSIONS}/dimensions`, dimensionSchema, (item) => item.number))
      .map((item) => ({ number: item.number, name: item.name }));
    values = (await cursorRows(ctx, `${DIMENSIONS}/values`, valueSchema, (item) => `${item.dimensionNumber}:${item.key}`))
      .map((item) => ({ dimensionNumber: item.dimensionNumber, number: item.key, name: item.name ?? String(item.key) }));
  } catch (error) {
    if (error instanceof EconomicHttpError && (error.status === 403 || error.dimensionUnavailable)) {
      return { accounts, dimensions: [], values: [], dimensionsAvailable: false };
    }
    throw error;
  }
  return { accounts, dimensions, values, dimensionsAvailable: true };
}

async function readPeriods(ctx: ReadContext, fromDate: string, toDate: string) {
  const overlap = `fromDate$lte:${toDate}$and:toDate$gte:${fromDate}`;
  try {
    const years = await restRows(ctx, `${REST}/accounting-years`, yearSchema, overlap);
    const periods: Array<{ fromDate: string; toDate: string; isClosed: boolean }> = [];
    for (const year of years) {
      const rows = await restRows(ctx, `${REST}/accounting-years/${encodeURIComponent(year.year)}/periods`, periodSchema, overlap);
      for (const row of rows) {
        if (row.fromDate < year.fromDate || row.toDate > year.toDate || row.fromDate > toDate || row.toDate < fromDate) invalidData();
        periods.push({ fromDate: row.fromDate, toDate: row.toDate, isClosed: row.closed });
      }
    }
    periods.sort((a, b) => a.fromDate.localeCompare(b.fromDate));
    for (let index = 1; index < periods.length; index += 1) {
      if (periods[index].fromDate <= periods[index - 1].toDate) invalidData();
    }
    return periods;
  } catch (error) {
    if (error instanceof EconomicHttpError && (error.status === 403 || error.status === 404)) return [];
    throw error;
  }
}

async function readAssignments(
  ctx: ReadContext,
  dimensionNumber: number,
  entries: z.infer<typeof entrySchema>[],
  budgets: z.infer<typeof budgetSchema>[],
) {
  const entryAssignments = new Map<number, DimensionAssignment>();
  const budgetAssignments = new Map<number, DimensionAssignment>();
  for (let offset = 0; offset < entries.length; offset += FILTER_BATCH_SIZE) {
    const ids = entries.slice(offset, offset + FILTER_BATCH_SIZE).map((item) => item.entryNumber);
    const rows = await cursorRows(ctx, `${DIMENSIONS}/dimension-data/booked-entries`, entryDimensionSchema,
      (item) => `${item.entryNumber}:${item.dimensionNumber}`,
      `dimensionNumber$eq:${dimensionNumber}$and:entryNumber$in:[${ids.join(",")}]`);
    for (const row of rows) {
      if (row.dimensionNumber !== dimensionNumber || !ids.includes(row.entryNumber)) invalidData();
      entryAssignments.set(row.entryNumber, row);
    }
  }
  for (let offset = 0; offset < budgets.length; offset += FILTER_BATCH_SIZE) {
    const ids = budgets.slice(offset, offset + FILTER_BATCH_SIZE).map((item) => item.number);
    const rows = await cursorRows(ctx, `${DIMENSIONS}/dimension-data/budget-figures`, budgetDimensionSchema,
      (item) => `${item.budgetFigureNumber}:${item.dimensionNumber}`,
      `dimensionNumber$eq:${dimensionNumber}$and:budgetFigureNumber$in:[${ids.join(",")}]`);
    for (const row of rows) {
      if (row.dimensionNumber !== dimensionNumber || !ids.includes(row.budgetFigureNumber)) invalidData();
      budgetAssignments.set(row.budgetFigureNumber, row);
    }
  }
  const distributionKeys = [...new Set([...entryAssignments.values(), ...budgetAssignments.values()]
    .filter((item) => item.isDistribution).map((item) => item.dimensionKey))];
  const distributions = new Map<number, Allocation[]>();
  for (let offset = 0; offset < distributionKeys.length; offset += FILTER_BATCH_SIZE) {
    const keys = distributionKeys.slice(offset, offset + FILTER_BATCH_SIZE);
    const rows = await cursorRows(ctx, `${DIMENSIONS}/distributions`, distributionSchema, (item) => item.key,
      `dimensionNumber$eq:${dimensionNumber}$and:key$in:[${keys.join(",")}]`);
    for (const row of rows) {
      if (row.dimensionNumber !== dimensionNumber || !keys.includes(row.key)) invalidData();
      ctx.rows += row.distributions.length;
      if (ctx.rows > MAX_ROWS) readLimit();
      const total = row.distributions.reduce((sum, item) => sum + item.percent, 0);
      if (Math.abs(total - 100) > 0.000_001 || new Set(row.distributions.map((item) => item.key)).size !== row.distributions.length) invalidData();
      distributions.set(row.key, row.distributions.map((item) => ({ dimensionKey: item.key, percent: item.percent })));
    }
  }
  let allocationParts = 0;
  const expand = (assignment: DimensionAssignment | undefined): Allocation[] | null => {
    if (!assignment) return null;
    const allocation = assignment.isDistribution ? distributions.get(assignment.dimensionKey)
      : [{ dimensionKey: assignment.dimensionKey, percent: 100 }];
    if (!allocation) invalidData();
    allocationParts += allocation.length;
    if (allocationParts > MAX_ALLOCATION_PARTS || Date.now() >= ctx.deadline) readLimit();
    return allocation;
  };
  return {
    entries: new Map([...entryAssignments].map(([key, assignment]) => [key, expand(assignment)])),
    budgets: new Map([...budgetAssignments].map(([key, assignment]) => [key, expand(assignment)])),
  };
}

export async function fetchEconomicReportData(args: {
  credentials: EconomicCredentials;
  accountNumbers: number[];
  fromDate: string;
  toDate: string;
  dimensionNumber: number | null;
  includeBudgets: boolean;
  budgetFromDate?: string;
  budgetToDate?: string;
  deadlineAt?: number;
}) {
  const input = z.object({
    accountNumbers: z.array(identifier).min(1).max(1_000),
    fromDate: z.iso.date(),
    toDate: z.iso.date(),
    dimensionNumber: dimensionNumberSchema.nullable(),
    includeBudgets: z.boolean(),
    budgetFromDate: z.iso.date().optional(),
    budgetToDate: z.iso.date().optional(),
    deadlineAt: z.number().finite().optional(),
  }).safeParse(args);
  const budgetFromDate = args.budgetFromDate ?? args.fromDate;
  const budgetToDate = args.budgetToDate ?? args.toDate;
  if (!input.success || args.fromDate > args.toDate || budgetFromDate > budgetToDate) throw new ConvexError("Vælg gyldige konti og en gyldig periode til e-conomic-rapporten.");
  const ctx = context(args.credentials, args.deadlineAt);
  const accountNumbers = [...new Set(args.accountNumbers)];
  const accounts = await cursorRows(ctx, ACCOUNTS, accountSchema, (item) => item.number);
  if (accountNumbers.some((number) => !accounts.some((account) => account.number === number && account.type === 1))) {
    throw new ConvexError("En valgt konto findes ikke længere som resultatkonto i e-conomic. Opdatér kontotilknytningen.");
  }
  const entries: z.infer<typeof entrySchema>[] = [];
  const budgets: z.infer<typeof budgetSchema>[] = [];
  const entryNumbers = new Set<number>();
  const budgetNumbers = new Set<number>();
  // Include every timestamp on the final accounting date without shifting its calendar date.
  const dayAfter = (date: string) => {
    const nextDay = new Date(`${date}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    return nextDay.toISOString().slice(0, 10);
  };
  const exclusiveToDate = dayAfter(args.toDate);
  const exclusiveBudgetToDate = dayAfter(budgetToDate);
  for (let offset = 0; offset < accountNumbers.length; offset += FILTER_BATCH_SIZE) {
    const numbers = accountNumbers.slice(offset, offset + FILTER_BATCH_SIZE);
    const accountFilter = `accountNumber$in:[${numbers.join(",")}]`;
    const entryRows = await cursorRows(ctx, ENTRIES, entrySchema, (item) => item.entryNumber,
      `${accountFilter}$and:date$gte:${args.fromDate}$and:date$lt:${exclusiveToDate}`);
    for (const entry of entryRows) {
      if (!numbers.includes(entry.accountNumber) || entry.date < args.fromDate || entry.date > args.toDate) invalidData();
      if (entryNumbers.has(entry.entryNumber)) invalidData();
      entryNumbers.add(entry.entryNumber);
    }
    entries.push(...entryRows);
    if (args.includeBudgets) {
      const budgetRows = await cursorRows(ctx, BUDGETS, budgetSchema, (item) => item.number,
        `${accountFilter}$and:fromDate$lt:${exclusiveBudgetToDate}$and:toDate$gte:${budgetFromDate}`);
      for (const budget of budgetRows) {
        if (!numbers.includes(budget.accountNumber) || budget.fromDate > budgetToDate || budget.toDate < budgetFromDate) invalidData();
        if (budgetNumbers.has(budget.number)) invalidData();
        budgetNumbers.add(budget.number);
      }
      budgets.push(...budgetRows);
    }
  }
  const assignments = args.dimensionNumber === null ? null : await readAssignments(ctx, args.dimensionNumber, entries, budgets);
  const periods = await readPeriods(ctx, args.fromDate, args.toDate);
  return {
    entries: entries.map((item) => ({
      entryNumber: item.entryNumber,
      accountNumber: item.accountNumber,
      date: item.date,
      amountInBaseCurrency: item.amountInBaseCurrency,
      objectVersion: item.objectVersion,
      allocations: assignments?.entries.get(item.entryNumber) ?? null,
    })),
    budgets: budgets.map((item) => ({
      number: item.number,
      accountNumber: item.accountNumber,
      fromDate: item.fromDate,
      toDate: item.toDate,
      amountDefaultCurrency: item.amountDefaultCurrency,
      objectVersion: item.objectVersion,
      allocations: assignments?.budgets.get(item.number) ?? null,
    })),
    periods,
  };
}
