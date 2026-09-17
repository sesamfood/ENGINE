import { z } from "zod";
import type { Doc } from "../../../_generated/dataModel";
import type { EconomicCredentials } from "./api";

const JOURNALS = "https://apis.e-conomic.com/journalsapi/v15.0.1";
const ACCOUNTS = "https://apis.e-conomic.com/accountsapi/v7.0.1/Accounts";
const DIMENSIONS = "https://apis.e-conomic.com/dimensionsapi/v5.3.1/dimension-data/draft-entries";
const DOCUMENTS = "https://apis.e-conomic.com/documentsapi/v4.0.1/AttachedDocuments";
const REST = "https://restapi.e-conomic.com";
const number = z.number().int().positive().max(2_147_483_647);
const optionalCode = z.string().trim().nullish();
const accountSchema = z.object({
  number, type: z.number().int(), isBarred: z.boolean().optional(),
  isBlockedForDirectEntries: z.boolean().optional(), isUnitMandatory: z.boolean().optional(),
  isDepartmentMandatory: z.boolean().optional(), currency: optionalCode,
});
const periodSchema = z.object({
  fromDate: z.iso.date(), toDate: z.iso.date(), closed: z.boolean().optional(),
});
const entrySchema = z.object({
  entryNumber: number, voucherNumber: z.number().int().min(0).max(999_999_999),
  journalNumber: number, entryTypeNumber: z.number().int(),
  accountNumber: number, contraAccountNumber: number, amount: z.number().finite(),
  currency: z.string(), date: z.string(), vatCode: optionalCode, contraVatCode: optionalCode,
});
type Expense = Doc<"expenses">;
type Mapping = NonNullable<Expense["economic"]>;

export class ExpenseEconomicError extends Error {
  constructor(message: string, readonly ambiguous = false) {
    super(message);
  }
}

async function request<T>(
  credentials: EconomicCredentials,
  url: string | URL,
  schema: z.ZodType<T>,
  options?: { method: "POST" | "PUT"; body: string | FormData; key: string },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: options?.method ?? "GET", body: options?.body, redirect: "error",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "X-AppSecretToken": credentials.appSecretToken,
        "X-AgreementGrantToken": credentials.agreementGrantToken,
        Accept: "application/json",
        ...(options ? { "Idempotency-Key": options.key } : {}),
        ...(typeof options?.body === "string" ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch {
    throw new ExpenseEconomicError("Forbindelsen til e-conomic blev afbrudt. Kontrollér udgiftens status, før du prøver igen.", Boolean(options));
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new ExpenseEconomicError(
      response.status === 401 || response.status === 403
        ? "e-conomic afviste adgangen. Forbind aftalen igen med adgang til bogføring."
        : response.status === 429
          ? "e-conomic har nået grænsen for API-kald. Vent lidt og prøv igen."
          : response.status === 404
            ? "En konto, kassekladde eller postering findes ikke i e-conomic. Kontrollér opsætningen."
            : "e-conomic afviste overførslen. Kontrollér kassekladde, konti, moms og regnskabsperiode.",
      Boolean(options) && (response.status >= 500 || response.status === 408),
    );
  }
  try {
    if (response.status === 204) return schema.parse(null);
    if (!response.body || Number(response.headers.get("content-length")) > 1_000_000) throw new Error();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 1_000_000) throw new Error();
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return schema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new ExpenseEconomicError("e-conomic returnerede et ufuldstændigt svar. Kontrollér udgiftens status, før du prøver igen.", Boolean(options));
  }
}

function filtered(endpoint: string, filter: string) {
  const url = new URL(endpoint);
  url.searchParams.set("filter", filter);
  return url;
}

export async function validateExpenseReceipt(blob: Blob) {
  if (!blob.size || blob.size > 9_000_000) {
    throw new ExpenseEconomicError("Bilaget til e-conomic må højst fylde 9 MB. Reducér filstørrelsen, før du overfører udgiften.");
  }
  const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  const contentType = new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-" ? "application/pdf"
    : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "image/jpeg"
      : [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value) ? "image/png" : null;
  if (!contentType || (blob.type && blob.type !== contentType)) {
    throw new ExpenseEconomicError("e-conomic kræver et gyldigt bilag i PDF-, JPG- eller PNG-format.");
  }
  return new Blob([blob], { type: contentType });
}

export async function prepareExpenseExport(credentials: EconomicCredentials, expense: Expense, mapping: Mapping) {
  const dateFilter = `fromDate$lte:${expense.date}$and:toDate$gte:${expense.date}`;
  const [journal, account, contraAccount, years] = await Promise.all([
    request(credentials, `${JOURNALS}/journals/${mapping.journalNumber}`, z.object({ number, allowedEntryType: z.number().int().nullish() })),
    request(credentials, `${ACCOUNTS}/${mapping.accountNumber}`, accountSchema),
    request(credentials, `${ACCOUNTS}/${mapping.contraAccountNumber}`, accountSchema),
    request(credentials, filtered(`${REST}/accounting-years`, dateFilter), z.object({ collection: z.array(periodSchema.extend({ year: z.string().regex(/^\d{4}(?:\/\d{4})?$/) })).max(2) })),
  ]);
  if (journal.number !== mapping.journalNumber || (journal.allowedEntryType && journal.allowedEntryType !== 5)) {
    throw new ExpenseEconomicError("Den valgte kassekladde tillader ikke finansbilag. Vælg en anden kassekladde i udgiftsindstillingerne.");
  }
  if (account.number !== mapping.accountNumber || account.type !== 1 || contraAccount.number !== mapping.contraAccountNumber || contraAccount.type !== 2 || account.number === contraAccount.number) {
    throw new ExpenseEconomicError("Vælg en driftskonto til udgiften og en balancekonto som modkonto i udgiftsindstillingerne.");
  }
  for (const selected of [account, contraAccount]) {
    if (selected.isBarred || selected.isBlockedForDirectEntries || selected.isUnitMandatory
      || (selected.currency && selected.currency !== expense.currency)
      || (selected.isDepartmentMandatory && (mapping.dimensionNumber !== 1 || mapping.dimensionKey === null))) {
      throw new ExpenseEconomicError("En valgt konto er spærret eller kræver andre oplysninger om valuta, enhed eller afdeling. Kontrollér kontoen i e-conomic.");
    }
  }
  const year = years.collection[0];
  if (years.collection.length !== 1 || !year || year.closed || expense.date < year.fromDate || expense.date > year.toDate) {
    throw new ExpenseEconomicError("Udgiftens dato skal ligge i et åbent regnskabsår i e-conomic.");
  }
  const periods = await request(credentials, filtered(`${REST}/accounting-years/${encodeURIComponent(year.year)}/periods`, dateFilter), z.object({ collection: z.array(periodSchema).max(2) }));
  const period = periods.collection[0];
  if (periods.collection.length !== 1 || !period || period.closed || expense.date < period.fromDate || expense.date > period.toDate) {
    throw new ExpenseEconomicError("Udgiftens dato skal ligge i en åben regnskabsperiode i e-conomic.");
  }
  if (expense.vatRate === 25) {
    if (!mapping.vatCode) throw new ExpenseEconomicError("Vælg en momskode for 25 % købsmoms i udgiftsindstillingerne.");
    const vat = await request(credentials, `${REST}/vat-accounts/${encodeURIComponent(mapping.vatCode)}`, z.object({
      vatCode: z.string().trim(), ratePercentage: z.number().finite(), vatType: z.object({ vatTypeNumber: number }),
    }));
    if (vat.vatCode !== mapping.vatCode.trim() || vat.ratePercentage !== 25 || vat.vatType.vatTypeNumber !== 2) {
      throw new ExpenseEconomicError("Momskoden skal være 25 % indgående købsmoms for indenlandske køb. Kontrollér udgiftsindstillingerne.");
    }
  } else if (expense.vatRate !== 0 || mapping.vatCode) {
    throw new ExpenseEconomicError("Udgiftens momssats passer ikke til e-conomic-opsætningen.");
  }
  if (mapping.dimensionNumber !== null && mapping.dimensionKey !== null) {
    const dimension = await request(credentials, `https://apis.e-conomic.com/dimensionsapi/v5.3.1/values/${mapping.dimensionNumber}/${mapping.dimensionKey}`, z.object({ dimensionNumber: number, key: number }));
    if (dimension.dimensionNumber !== mapping.dimensionNumber || dimension.key !== mapping.dimensionKey) {
      throw new ExpenseEconomicError("Lokationens afdeling findes ikke i e-conomic. Kontrollér lokationskoblingen.");
    }
  }
  return year.year;
}

export async function createExpenseDraft(credentials: EconomicCredentials, expense: Expense, mapping: Mapping) {
  return request(credentials, `${JOURNALS}/draft-entries`, z.object({ entryNumber: number }), {
    method: "POST", key: `expense/${expense._id}/draft/${expense.economicAttemptedAt}`, body: JSON.stringify({
      entryTypeNumber: 5, journalNumber: mapping.journalNumber, date: `${expense.date}T00:00:00Z`,
      accountNumber: mapping.accountNumber, contraAccountNumber: mapping.contraAccountNumber,
      amount: expense.grossAmount / 100, currency: expense.currency,
      vatCode: mapping.vatCode ?? "", contraVatCode: "",
      text: `Udgift ${expense._id} | ${expense.supplier} | ${expense.locationName} | ${expense.period}${expense.comment ? ` | ${expense.comment}` : ""}`.slice(0, 250),
    }),
  });
}

export async function readExpenseDraft(credentials: EconomicCredentials, expense: Expense, mapping: Mapping, entryNumber: number) {
  const entry = await request(credentials, `${JOURNALS}/draft-entries/${entryNumber}`, entrySchema);
  if (entry.entryNumber !== entryNumber || entry.journalNumber !== mapping.journalNumber || entry.entryTypeNumber !== 5
    || entry.accountNumber !== mapping.accountNumber || entry.contraAccountNumber !== mapping.contraAccountNumber
    || Math.round(entry.amount * 100) !== expense.grossAmount || entry.currency !== expense.currency
    || entry.date.slice(0, 10) !== expense.date || (entry.vatCode ?? "") !== (mapping.vatCode ?? "") || entry.contraVatCode) {
    throw new ExpenseEconomicError("Posteringen i e-conomic afviger fra udgiften. Kontrollér beløb, konti, dato og moms på posteringen.");
  }
  return entry;
}

export async function attachExpenseDimension(credentials: EconomicCredentials, expense: Expense, mapping: Mapping, entryNumber: number, beforeWrite: () => Promise<void>) {
  if (mapping.dimensionNumber === null || mapping.dimensionKey === null) return;
  const existing = await request(credentials, filtered(DIMENSIONS, `journalNumber$eq:${mapping.journalNumber}$and:entryNumber$eq:${entryNumber}$and:dimensionNumber$eq:${mapping.dimensionNumber}`), z.object({
    items: z.array(z.object({ journalNumber: number, entryNumber: number, dimensionNumber: number, dimensionKey: number, isDistribution: z.boolean().optional(), objectVersion: z.string().min(1).max(1_000).nullish() })).max(1).nullable(),
    cursor: z.string().nullish(),
  }));
  if (existing.cursor) throw new ExpenseEconomicError("e-conomic returnerede flere afdelinger end forventet. Kontrollér posteringen.");
  const current = existing.items?.[0];
  if (current && (current.entryNumber !== entryNumber || current.journalNumber !== mapping.journalNumber || current.dimensionNumber !== mapping.dimensionNumber)) {
    throw new ExpenseEconomicError("e-conomic returnerede en forkert afdelingstilknytning. Kontrollér posteringen.");
  }
  if (current?.dimensionKey === mapping.dimensionKey && !current.isDistribution) return;
  if (current && !current.objectVersion) throw new ExpenseEconomicError("Afdelingen kunne ikke opdateres sikkert. Kontrollér posteringen i e-conomic.");
  await beforeWrite();
  await request(credentials, DIMENSIONS, z.union([z.object({ dimensionNumber: number }), z.null()]), {
    method: current ? "PUT" : "POST", key: `expense/${expense._id}/dimension/${current?.objectVersion ?? "new"}`,
    body: JSON.stringify({ journalNumber: mapping.journalNumber, entryNumber, dimensionNumber: mapping.dimensionNumber, dimensionKey: mapping.dimensionKey, isDistribution: false, ...(current ? { objectVersion: current.objectVersion } : {}) }),
  });
}

export async function attachExpenseReceipt(credentials: EconomicCredentials, expense: Expense, accountingYear: string, voucherNumber: number, blob: Blob, beforeWrite: () => Promise<void>) {
  if (!voucherNumber) throw new ExpenseEconomicError("e-conomic kan ikke vedhæfte bilag til bilagsnummer 0. Kontrollér kassekladden.");
  const note = `Udgift ${expense._id}`;
  const existing = await request(credentials, filtered(DOCUMENTS, `accountingYear$eq:${accountingYear}$and:voucherNumber$eq:${voucherNumber}`), z.object({
    items: z.array(z.object({ number, accountingYear: z.string(), voucherNumber: number, note: z.string().nullish() })).max(1).nullable(),
    cursor: z.string().nullish(),
  }));
  const document = existing.items?.[0];
  if (existing.cursor || (document && (document.accountingYear !== accountingYear || document.voucherNumber !== voucherNumber || document.note !== note))) {
    throw new ExpenseEconomicError("Bilagsnummeret har allerede et andet bilag i e-conomic. Kontrollér bilagsnummereringen og vedhæftningen.");
  }
  if (document) return;
  const form = new FormData();
  const extension = blob.type === "application/pdf" ? "pdf" : blob.type === "image/png" ? "png" : "jpg";
  form.append("file", blob, `udgift-${expense._id}.${extension}`);
  form.append("accountingYear", accountingYear);
  form.append("voucherNumber", String(voucherNumber));
  form.append("note", note);
  form.append("onConflict", "1");
  await beforeWrite();
  await request(credentials, DOCUMENTS, z.object({ number }), { method: "POST", key: `expense/${expense._id}/receipt`, body: form });
}
