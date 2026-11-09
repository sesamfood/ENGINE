import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import {
  action,
  internalMutation,
  mutation,
  query,
  type ActionCtx,
} from "../../_generated/server";
import { recordAudit } from "../../lib/audit";
import {
  requireAllLocationAccess,
  requireHumanPrincipal,
  requireIntegrationManager,
} from "../../lib/auth";
import {
  decryptCredential,
  encryptCredential,
  ensureOrganizationCredentialKey,
} from "../credentials";
import { requireIntegrationEnabled } from "../state";
import {
  catalogItemValidator,
  ensureCatalogSupplier,
  getCatalogConnection,
  requireCatalogManager,
  requireCatalogReader,
  type CatalogItem,
} from "../supplierCatalog";
import { catalogLinkFunctions } from "../supplierCatalogApi";
import {
  AbTokenExpiredError,
  fetchCustomerProducts,
  requestAccessToken,
  validateLogin,
} from "./lib/api";

// Renew at about 80% of the token's lifetime, as AB recommends.
const TOKEN_RENEW_MARGIN_MS = 12 * 60 * 1000;

export const {
  listLinks,
  getProductLink,
  setProductLink,
  setCatalogLink,
  createProductFromCatalog,
  listOrderingLinks,
} = catalogLinkFunctions("abcatering");

export const getSettings = query({
  args: {},
  returns: v.object({
    organizationId: v.string(),
    connection: v.union(
      v.object({
        customerNo: v.string(),
        customerName: v.string(),
        department: v.string(),
        supplierName: v.union(v.string(), v.null()),
        connectedAt: v.number(),
      }),
      v.null(),
    ),
  }),
  handler: async (ctx) => {
    const auth = await requireCatalogManager(ctx, "abcatering");
    const connection = await getCatalogConnection(
      ctx,
      "abcatering",
      auth.organizationId,
    );
    const supplier = connection?.supplierId
      ? await ctx.db.get("suppliers", connection.supplierId)
      : null;
    return {
      organizationId: auth.organizationId,
      connection: connection
        ? {
            customerNo: connection.customerNo,
            customerName: connection.customerName,
            department: connection.department,
            supplierName: supplier?.name ?? null,
            connectedAt: connection.connectedAt,
          }
        : null,
    };
  },
});

export const saveConnection = internalMutation({
  args: {
    organizationId: v.string(),
    encryptedApiKey: v.string(),
    encryptedValidationKey: v.string(),
    encryptedAccessToken: v.string(),
    accessTokenExpiresAt: v.number(),
    customerNo: v.string(),
    customerName: v.string(),
    department: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { organizationId, ...fields }) => {
    const auth = await requireCatalogManager(ctx, "abcatering");
    if (auth.organizationId !== organizationId) {
      throw new ConvexError("Organisationen er ændret. Prøv igen");
    }
    const current = await getCatalogConnection(ctx, "abcatering", organizationId);
    const now = Date.now();
    let id;
    if (current) {
      id = current._id;
      await ctx.db.patch("abCateringConnections", id, {
        ...fields,
        updatedAt: now,
      });
    } else {
      id = await ctx.db.insert("abCateringConnections", {
        organizationId,
        ...fields,
        connectedAt: now,
        updatedAt: now,
      });
    }
    await ensureCatalogSupplier(ctx, auth, "abcatering", organizationId);
    await recordAudit(ctx, auth, {
      action: "abcatering.connected",
      entityTable: "abCateringConnections",
      entityId: id,
      summary: `AB Catering er forbundet til kunde ${fields.customerNo}`,
    });
    return null;
  },
});

const customerValidator = v.object({
  customerNo: v.string(),
  customerName: v.string(),
  department: v.string(),
});

/** Logs in, and saves the chosen customer's key. The password is never stored. */
export const connect = action({
  args: {
    expectedOrganizationId: v.string(),
    apiKey: v.string(),
    username: v.string(),
    password: v.string(),
    customerNo: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ status: v.literal("connected"), productCount: v.number() }),
    v.object({
      status: v.literal("chooseCustomer"),
      customers: v.array(customerValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const auth = requireHumanPrincipal(await requireIntegrationManager(ctx));
    requireAllLocationAccess(auth);
    if (auth.organizationId !== args.expectedOrganizationId) {
      throw new ConvexError("Organisationen er ændret. Prøv igen");
    }
    await requireIntegrationEnabled(ctx, auth.organizationId, "abcatering");
    const apiKey = args.apiKey.trim();
    if (!apiKey || !args.username.trim() || !args.password) {
      throw new ConvexError("Udfyld API-nøgle, brugernavn og adgangskode");
    }
    const customers = await validateLogin(args.username.trim(), args.password);
    const customer =
      customers.find((row) => row.customerNo === args.customerNo) ??
      (customers.length === 1 ? customers[0] : undefined);
    if (!customer) {
      return {
        status: "chooseCustomer" as const,
        customers: customers.map(({ customerNo, customerName, department }) => ({
          customerNo,
          customerName,
          department,
        })),
      };
    }
    const token = await requestAccessToken(apiKey, customer.validationKey);
    const products = await fetchCustomerProducts(token.accessToken);
    const key = await ctx.runMutation(
      internal.integrations.credentials.ensureKey,
      { organizationId: auth.organizationId },
    );
    const encrypt = (value: string) =>
      encryptCredential(value, auth.organizationId, key);
    await ctx.runMutation(internal.integrations.abcatering.api.saveConnection, {
      organizationId: auth.organizationId,
      encryptedApiKey: await encrypt(apiKey),
      encryptedValidationKey: await encrypt(customer.validationKey),
      encryptedAccessToken: await encrypt(token.accessToken),
      accessTokenExpiresAt: token.expiresAt,
      customerNo: customer.customerNo,
      customerName: customer.customerName,
      department: customer.department,
    });
    return { status: "connected" as const, productCount: products.length };
  },
});

export const disconnect = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const auth = await requireCatalogManager(ctx, "abcatering");
    const connection = await getCatalogConnection(
      ctx,
      "abcatering",
      auth.organizationId,
    );
    if (!connection) return null;
    // Product links stay so a reconnect keeps the setup.
    await ctx.db.delete("abCateringConnections", connection._id);
    await recordAudit(ctx, auth, {
      action: "abcatering.disconnected",
      entityTable: "abCateringConnections",
      entityId: connection._id,
      summary: "AB Catering er afbrudt",
    });
    return null;
  },
});

export const getCredentials = internalMutation({
  args: { organizationId: v.string() },
  returns: v.union(
    v.object({
      apiKey: v.string(),
      validationKey: v.string(),
      accessToken: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, { organizationId }) => {
    await requireIntegrationEnabled(ctx, organizationId, "abcatering");
    const connection = await getCatalogConnection(ctx, "abcatering", organizationId);
    if (!connection) return null;
    const key = await ensureOrganizationCredentialKey(ctx, organizationId);
    const decrypt = (value: string) =>
      decryptCredential(value, organizationId, key);
    const tokenValid =
      connection.encryptedAccessToken &&
      (connection.accessTokenExpiresAt ?? 0) > Date.now() + TOKEN_RENEW_MARGIN_MS;
    return {
      apiKey: await decrypt(connection.encryptedApiKey),
      validationKey: await decrypt(connection.encryptedValidationKey),
      accessToken:
        tokenValid && connection.encryptedAccessToken
          ? await decrypt(connection.encryptedAccessToken)
          : null,
    };
  },
});

export const saveAccessToken = internalMutation({
  args: {
    organizationId: v.string(),
    accessToken: v.string(),
    expiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await getCatalogConnection(
      ctx,
      "abcatering",
      args.organizationId,
    );
    if (!connection) return null;
    const key = await ensureOrganizationCredentialKey(ctx, args.organizationId);
    await ctx.db.patch("abCateringConnections", connection._id, {
      encryptedAccessToken: await encryptCredential(
        args.accessToken,
        args.organizationId,
        key,
      ),
      accessTokenExpiresAt: args.expiresAt,
    });
    return null;
  },
});

/** Calls AB with a cached access token, renewing it once when AB rejects it. */
export async function withAccessToken<T>(
  ctx: ActionCtx,
  organizationId: string,
  call: (accessToken: string) => Promise<T>,
): Promise<T> {
  const credentials = await ctx.runMutation(
    internal.integrations.abcatering.api.getCredentials,
    { organizationId },
  );
  if (!credentials) throw new ConvexError("AB Catering er ikke forbundet");
  let accessToken = credentials.accessToken;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!accessToken) {
      const token = await requestAccessToken(
        credentials.apiKey,
        credentials.validationKey,
      );
      accessToken = token.accessToken;
      await ctx.runMutation(
        internal.integrations.abcatering.api.saveAccessToken,
        { organizationId, ...token },
      );
    }
    try {
      return await call(accessToken);
    } catch (error) {
      if (!(error instanceof AbTokenExpiredError)) throw error;
      accessToken = null;
    }
  }
  throw new ConvexError("AB Catering afviste adgangsnøglen. Prøv igen om lidt");
}

/** Reads the customer's live assortment. Used by ordering and by product link setup. */
export const fetchCatalog = action({
  args: {},
  returns: v.array(catalogItemValidator),
  handler: async (ctx): Promise<CatalogItem[]> => {
    const auth = await requireCatalogReader(ctx, "abcatering");
    return withAccessToken(ctx, auth.organizationId, fetchCustomerProducts);
  },
});
