/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as apiIdempotency from "../apiIdempotency.js";
import type * as apiKeys from "../apiKeys.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as badDeliveries from "../badDeliveries.js";
import type * as badDeliveryNotices from "../badDeliveryNotices.js";
import type * as catalog from "../catalog.js";
import type * as count from "../count.js";
import type * as countAreas from "../countAreas.js";
import type * as countSales from "../countSales.js";
import type * as crons from "../crons.js";
import type * as customMetrics from "../customMetrics.js";
import type * as dashboard from "../dashboard.js";
import type * as dashboardShare from "../dashboardShare.js";
import type * as dashboardSummaries from "../dashboardSummaries.js";
import type * as employees from "../employees.js";
import type * as feedback from "../feedback.js";
import type * as feedbackDelivery from "../feedbackDelivery.js";
import type * as http from "../http.js";
import type * as kiosk from "../kiosk.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_authEmail from "../lib/authEmail.js";
import type * as lib_badDeliverySettings from "../lib/badDeliverySettings.js";
import type * as lib_categoryHierarchy from "../lib/categoryHierarchy.js";
import type * as lib_countAreas from "../lib/countAreas.js";
import type * as lib_countLock from "../lib/countLock.js";
import type * as lib_countSalesSource from "../lib/countSalesSource.js";
import type * as lib_countSettings from "../lib/countSettings.js";
import type * as lib_countWindow from "../lib/countWindow.js";
import type * as lib_customMetricExecutor from "../lib/customMetricExecutor.js";
import type * as lib_dashboardMetrics from "../lib/dashboardMetrics.js";
import type * as lib_dashboardShareCrypto from "../lib/dashboardShareCrypto.js";
import type * as lib_dashboardSummaries from "../lib/dashboardSummaries.js";
import type * as lib_dashboardValidators from "../lib/dashboardValidators.js";
import type * as lib_idempotency from "../lib/idempotency.js";
import type * as lib_linear from "../lib/linear.js";
import type * as lib_locationDeletion from "../lib/locationDeletion.js";
import type * as lib_locationMutations from "../lib/locationMutations.js";
import type * as lib_locationProducts from "../lib/locationProducts.js";
import type * as lib_masterData from "../lib/masterData.js";
import type * as lib_onlinePosApi from "../lib/onlinePosApi.js";
import type * as lib_openingHours from "../lib/openingHours.js";
import type * as lib_organizationTheme from "../lib/organizationTheme.js";
import type * as lib_ownCheckSettings from "../lib/ownCheckSettings.js";
import type * as lib_ownCheckValidators from "../lib/ownCheckValidators.js";
import type * as lib_ownChecks from "../lib/ownChecks.js";
import type * as lib_productCatalog from "../lib/productCatalog.js";
import type * as lib_rateLimits from "../lib/rateLimits.js";
import type * as lib_resend from "../lib/resend.js";
import type * as lib_salesRollup from "../lib/salesRollup.js";
import type * as lib_stock from "../lib/stock.js";
import type * as lib_timeZone from "../lib/timeZone.js";
import type * as lib_transferAggregates from "../lib/transferAggregates.js";
import type * as lib_woltApi from "../lib/woltApi.js";
import type * as lib_woltCrypto from "../lib/woltCrypto.js";
import type * as lib_woltMappings from "../lib/woltMappings.js";
import type * as lib_woltRollup from "../lib/woltRollup.js";
import type * as lib_woltValidators from "../lib/woltValidators.js";
import type * as lib_workfeedApi from "../lib/workfeedApi.js";
import type * as lib_workfeedSyncRequest from "../lib/workfeedSyncRequest.js";
import type * as locationProducts from "../locationProducts.js";
import type * as locations from "../locations.js";
import type * as masterData from "../masterData.js";
import type * as migrations from "../migrations.js";
import type * as navigation from "../navigation.js";
import type * as onlinePos from "../onlinePos.js";
import type * as onlinePosSync from "../onlinePosSync.js";
import type * as organization from "../organization.js";
import type * as ownCheckDocumentation from "../ownCheckDocumentation.js";
import type * as ownCheckOverview from "../ownCheckOverview.js";
import type * as ownCheckTemplates from "../ownCheckTemplates.js";
import type * as ownChecks from "../ownChecks.js";
import type * as rest_catalog from "../rest/catalog.js";
import type * as rest_employees from "../rest/employees.js";
import type * as rest_lib from "../rest/lib.js";
import type * as rest_locations from "../rest/locations.js";
import type * as rest_masterData from "../rest/masterData.js";
import type * as rest_me from "../rest/me.js";
import type * as rest_sales from "../rest/sales.js";
import type * as sales from "../sales.js";
import type * as staffFood from "../staffFood.js";
import type * as storageCleanup from "../storageCleanup.js";
import type * as transfers from "../transfers.js";
import type * as waste from "../waste.js";
import type * as wolt from "../wolt.js";
import type * as woltHttp from "../woltHttp.js";
import type * as woltSync from "../woltSync.js";
import type * as workfeed from "../workfeed.js";
import type * as workfeedSync from "../workfeedSync.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  apiIdempotency: typeof apiIdempotency;
  apiKeys: typeof apiKeys;
  audit: typeof audit;
  auth: typeof auth;
  badDeliveries: typeof badDeliveries;
  badDeliveryNotices: typeof badDeliveryNotices;
  catalog: typeof catalog;
  count: typeof count;
  countAreas: typeof countAreas;
  countSales: typeof countSales;
  crons: typeof crons;
  customMetrics: typeof customMetrics;
  dashboard: typeof dashboard;
  dashboardShare: typeof dashboardShare;
  dashboardSummaries: typeof dashboardSummaries;
  employees: typeof employees;
  feedback: typeof feedback;
  feedbackDelivery: typeof feedbackDelivery;
  http: typeof http;
  kiosk: typeof kiosk;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/authEmail": typeof lib_authEmail;
  "lib/badDeliverySettings": typeof lib_badDeliverySettings;
  "lib/categoryHierarchy": typeof lib_categoryHierarchy;
  "lib/countAreas": typeof lib_countAreas;
  "lib/countLock": typeof lib_countLock;
  "lib/countSalesSource": typeof lib_countSalesSource;
  "lib/countSettings": typeof lib_countSettings;
  "lib/countWindow": typeof lib_countWindow;
  "lib/customMetricExecutor": typeof lib_customMetricExecutor;
  "lib/dashboardMetrics": typeof lib_dashboardMetrics;
  "lib/dashboardShareCrypto": typeof lib_dashboardShareCrypto;
  "lib/dashboardSummaries": typeof lib_dashboardSummaries;
  "lib/dashboardValidators": typeof lib_dashboardValidators;
  "lib/idempotency": typeof lib_idempotency;
  "lib/linear": typeof lib_linear;
  "lib/locationDeletion": typeof lib_locationDeletion;
  "lib/locationMutations": typeof lib_locationMutations;
  "lib/locationProducts": typeof lib_locationProducts;
  "lib/masterData": typeof lib_masterData;
  "lib/onlinePosApi": typeof lib_onlinePosApi;
  "lib/openingHours": typeof lib_openingHours;
  "lib/organizationTheme": typeof lib_organizationTheme;
  "lib/ownCheckSettings": typeof lib_ownCheckSettings;
  "lib/ownCheckValidators": typeof lib_ownCheckValidators;
  "lib/ownChecks": typeof lib_ownChecks;
  "lib/productCatalog": typeof lib_productCatalog;
  "lib/rateLimits": typeof lib_rateLimits;
  "lib/resend": typeof lib_resend;
  "lib/salesRollup": typeof lib_salesRollup;
  "lib/stock": typeof lib_stock;
  "lib/timeZone": typeof lib_timeZone;
  "lib/transferAggregates": typeof lib_transferAggregates;
  "lib/woltApi": typeof lib_woltApi;
  "lib/woltCrypto": typeof lib_woltCrypto;
  "lib/woltMappings": typeof lib_woltMappings;
  "lib/woltRollup": typeof lib_woltRollup;
  "lib/woltValidators": typeof lib_woltValidators;
  "lib/workfeedApi": typeof lib_workfeedApi;
  "lib/workfeedSyncRequest": typeof lib_workfeedSyncRequest;
  locationProducts: typeof locationProducts;
  locations: typeof locations;
  masterData: typeof masterData;
  migrations: typeof migrations;
  navigation: typeof navigation;
  onlinePos: typeof onlinePos;
  onlinePosSync: typeof onlinePosSync;
  organization: typeof organization;
  ownCheckDocumentation: typeof ownCheckDocumentation;
  ownCheckOverview: typeof ownCheckOverview;
  ownCheckTemplates: typeof ownCheckTemplates;
  ownChecks: typeof ownChecks;
  "rest/catalog": typeof rest_catalog;
  "rest/employees": typeof rest_employees;
  "rest/lib": typeof rest_lib;
  "rest/locations": typeof rest_locations;
  "rest/masterData": typeof rest_masterData;
  "rest/me": typeof rest_me;
  "rest/sales": typeof rest_sales;
  sales: typeof sales;
  staffFood: typeof staffFood;
  storageCleanup: typeof storageCleanup;
  transfers: typeof transfers;
  waste: typeof waste;
  wolt: typeof wolt;
  woltHttp: typeof woltHttp;
  woltSync: typeof woltSync;
  workfeed: typeof workfeed;
  workfeedSync: typeof workfeedSync;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("../betterAuth/_generated/component.js").ComponentApi<"betterAuth">;
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
