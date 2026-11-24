import { ConvexError } from "convex/values";
import { z } from "zod";

// Classic REST API: https://restdocs.e-conomic.com/
const REST = "https://restapi.e-conomic.com";
const REQUEST_TIMEOUT_MS = 15_000;
const PAGE_SIZE = 1_000;
const MAX_PAGES = 20;

export type EconomicCredentials = {
  appSecretToken: string;
  agreementGrantToken: string;
};

const identifier = z.number().int().positive().max(2_147_483_647);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/).transform((value) => value.slice(0, 10));
const amount = z.number().finite();
const page = <T extends z.ZodType>(item: T) => z.object({
  collection: z.array(item),
  pagination: z.object({ nextPage: z.string().optional() }).optional(),
});

const selfSchema = z.object({
  agreementNumber: identifier,
  company: z.object({ name: z.string().max(1_000) }),
  settings: z.object({ baseCurrency: z.string().regex(/^[A-Z]{3}$/) }),
});
const journalSchema = z.object({ journalNumber: identifier, name: z.string().max(1_000).default("") });
const yearSchema = z.object({ year: z.string().max(20), fromDate: isoDate, toDate: isoDate });
const supplierSchema = z.object({ supplierNumber: identifier, name: z.string().max(1_000).default("") });
const supplierInvoiceSchema = z.object({
  entryNumber: identifier,
  date: isoDate,
  dueDate: isoDate.optional(),
  text: z.string().max(1_000).optional(),
  voucherNumber: identifier.optional(),
  supplier: z.object({ supplierNumber: identifier }).optional(),
  remainderInBaseCurrency: amount.optional(),
});
const journalEntrySchema = z.object({
  journalEntryNumber: identifier.optional(),
  date: isoDate,
  dueDate: isoDate.optional(),
  text: z.string().max(1_000).optional(),
  amount,
  exchangeRate: z.number().positive().optional(),
  account: z.object({ accountNumber: identifier }).optional(),
  supplier: z.object({ supplierNumber: identifier }).optional(),
  voucher: z.object({ voucherNumber: identifier }).optional(),
});
const accountSchema = z.object({ accountNumber: identifier, name: z.string().max(1_000).default(""), balance: amount.optional() });

function invalidData(): never {
  throw new ConvexError("e-conomic returnerede ufuldstændige eller ugyldige data. Prøv igen.");
}

async function request<T>(credentials: EconomicCredentials, url: string, schema: z.ZodType<T>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        "X-AppSecretToken": credentials.appSecretToken,
        "X-AgreementGrantToken": credentials.agreementGrantToken,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ConvexError("e-conomic svarer ikke. Prøv igen senere.");
  }
  if (response.status === 401) throw new ConvexError("e-conomic afviste nøglerne. Kontrollér appnøgle og aftalenøgle under Integrationer.");
  if (response.status === 403) throw new ConvexError("Integrationen har ikke adgang til de ønskede data i e-conomic. Kontrollér appens rettigheder.");
  if (response.status === 404) throw new ConvexError("e-conomic kunne ikke finde de ønskede data. Kontrollér kassekladde og bankkonto under Integrationer.");
  if (!response.ok) throw new ConvexError("Data kunne ikke hentes fra e-conomic. Prøv igen senere.");
  const result = schema.safeParse(await response.json().catch(invalidData));
  if (!result.success) invalidData();
  return result.data;
}

async function list<T>(credentials: EconomicCredentials, path: string, item: z.ZodType<T>, filter?: string): Promise<T[]> {
  const schema = page(item);
  const query = new URLSearchParams({ pagesize: String(PAGE_SIZE) });
  if (filter) query.set("filter", filter);
  let url: string | undefined = `${REST}${path}?${query}`;
  const rows: T[] = [];
  for (let pages = 0; url; pages++) {
    if (pages >= MAX_PAGES) throw new ConvexError("Der er for mange posteringer i e-conomic til at vise dem her.");
    const result: z.infer<typeof schema> = await request(credentials, url, schema);
    rows.push(...result.collection);
    url = result.pagination?.nextPage;
    if (url && !url.startsWith(`${REST}/`)) invalidData();
  }
  return rows;
}

// /self needs a Superuser grant. Bookkeeping grants can still read everything Økonomi uses,
// so they are verified with a read the page needs and return no agreement details.
export async function getEconomicSelf(credentials: EconomicCredentials) {
  try {
    const self = await request(credentials, `${REST}/self`, selfSchema);
    return { agreementNumber: self.agreementNumber, companyName: self.company.name, currency: self.settings.baseCurrency };
  } catch {
    await list(credentials, "/accounting-years", yearSchema);
    return null;
  }
}

export function listEconomicJournals(credentials: EconomicCredentials) {
  return list(credentials, "/journals", journalSchema);
}

async function supplierNames(credentials: EconomicCredentials, numbers: number[]) {
  const names = new Map<number, string>();
  const unique = [...new Set(numbers)];
  // The REST filter accepts at most 200 values in $in.
  for (let index = 0; index < unique.length; index += 200) {
    const batch = unique.slice(index, index + 200);
    const suppliers = await list(credentials, "/suppliers", supplierSchema, `supplierNumber$in:[${batch.join(",")}]`);
    for (const supplier of suppliers) names.set(supplier.supplierNumber, supplier.name);
  }
  return names;
}

// Booked supplier invoices that still have an unpaid remainder, across accounting years that have started.
async function openSupplierInvoices(credentials: EconomicCredentials, today: string) {
  const years = (await list(credentials, "/accounting-years", yearSchema)).filter((year) => year.fromDate <= today);
  const entries = (await Promise.all(years.map((year) => list(
    credentials, `/accounting-years/${encodeURIComponent(year.year)}/entries`, supplierInvoiceSchema,
    "entryType$eq:supplierInvoice$and:remainder$ne:0$and:supplier.supplierNumber$gt:0",
  )))).flat();
  // Only the supplier-ledger line carries the supplier and the remaining amount.
  return entries.flatMap((entry) => entry.supplier && entry.remainderInBaseCurrency
    ? [{
      entryNumber: entry.entryNumber,
      supplierNumber: entry.supplier.supplierNumber,
      date: entry.date,
      dueDate: entry.dueDate ?? null,
      text: entry.text ?? "",
      voucherNumber: entry.voucherNumber ?? null,
      // Supplier invoices are credits, so the amount to pay is the negated remainder. Minor units.
      amount: Math.round(-entry.remainderInBaseCurrency * 100),
    }]
    : []);
}

async function bankJournalEntries(credentials: EconomicCredentials, journalNumber: number, bankAccountNumber: number) {
  const entries = await list(credentials, `/journals/${journalNumber}/entries`, journalEntrySchema,
    `contraAccount.accountNumber$eq:${bankAccountNumber}`);
  return entries.map((entry, index) => ({
    key: String(entry.journalEntryNumber ?? `${entry.voucher?.voucherNumber ?? 0}-${index}`),
    date: entry.date,
    dueDate: entry.dueDate ?? null,
    text: entry.text ?? "",
    voucherNumber: entry.voucher?.voucherNumber ?? null,
    accountNumber: entry.account?.accountNumber ?? null,
    supplierNumber: entry.supplier?.supplierNumber ?? null,
    // Journal amounts are in the entry currency, and exchangeRate is per 100 units. Minor units in base currency.
    amount: Math.round(entry.amount * (entry.exchangeRate ?? 100)),
  }));
}

// A missing journal or account only fails its own section.
async function section<T>(read: () => Promise<T>): Promise<{ value: T; error: null } | { value: null; error: string }> {
  try {
    return { value: await read(), error: null };
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") return { value: null, error: error.data };
    throw error;
  }
}

export async function getEconomicFinanceData(credentials: EconomicCredentials, options: { today: string; journalNumber: number | null; bankAccountNumber: number }) {
  const { journalNumber } = options;
  const [invoices, journalResult, accountResult] = await Promise.all([
    openSupplierInvoices(credentials, options.today),
    journalNumber === null ? Promise.resolve({ value: null, error: null }) : section(() => bankJournalEntries(credentials, journalNumber, options.bankAccountNumber)),
    section(() => request(credentials, `${REST}/accounts/${options.bankAccountNumber}`, accountSchema)),
  ]);
  const journal = journalResult.value;
  const account = accountResult.value;
  const names = await supplierNames(credentials, [
    ...invoices.map((invoice) => invoice.supplierNumber),
    ...(journal ?? []).flatMap((entry) => entry.supplierNumber === null ? [] : [entry.supplierNumber]),
  ]);
  const supplierName = (number: number | null) => number === null ? null : names.get(number) ?? `Leverandør ${number}`;
  return {
    payments: invoices
      .map(({ supplierNumber, ...invoice }) => ({ ...invoice, supplierName: supplierName(supplierNumber) ?? "" }))
      .sort((a, b) => (a.dueDate ?? a.date).localeCompare(b.dueDate ?? b.date) || a.entryNumber - b.entryNumber),
    journalError: journalResult.error,
    journalEntries: journal === null ? null : journal
      .map(({ supplierNumber, ...entry }) => ({ ...entry, supplierName: supplierName(supplierNumber) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    bankAccountError: accountResult.error,
    bankBalance: account?.balance === undefined ? null : Math.round(account.balance * 100),
  };
}
