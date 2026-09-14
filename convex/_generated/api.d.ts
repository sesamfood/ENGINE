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
import type * as dashboardLive from "../dashboardLive.js";
import type * as dashboardShare from "../dashboardShare.js";
import type * as dashboardSummaries from "../dashboardSummaries.js";
import type * as dateLabels from "../dateLabels.js";
import type * as economic from "../economic.js";
import type * as economicReports from "../economicReports.js";
import type * as employees from "../employees.js";
import type * as expenseEconomic from "../expenseEconomic.js";
import type * as expenseNotices from "../expenseNotices.js";
import type * as expenses from "../expenses.js";
import type * as features from "../features.js";
import type * as feedback from "../feedback.js";
import type * as feedbackDelivery from "../feedbackDelivery.js";
import type * as forecasts from "../forecasts.js";
import type * as goodsReceipts from "../goodsReceipts.js";
import type * as googlePlaces from "../googlePlaces.js";
import type * as http from "../http.js";
import type * as integrations from "../integrations.js";
import type * as integrations_credentials from "../integrations/credentials.js";
import type * as integrations_economic_api from "../integrations/economic/api.js";
import type * as integrations_economic_expenses from "../integrations/economic/expenses.js";
import type * as integrations_economic_lib_api from "../integrations/economic/lib/api.js";
import type * as integrations_economic_lib_crypto from "../integrations/economic/lib/crypto.js";
import type * as integrations_economic_lib_expenseApi from "../integrations/economic/lib/expenseApi.js";
import type * as integrations_economic_lib_report from "../integrations/economic/lib/report.js";
import type * as integrations_economic_lib_validators from "../integrations/economic/lib/validators.js";
import type * as integrations_economic_lifecycle from "../integrations/economic/lifecycle.js";
import type * as integrations_economic_reports from "../integrations/economic/reports.js";
import type * as integrations_onlinepos_api from "../integrations/onlinepos/api.js";
import type * as integrations_onlinepos_crons from "../integrations/onlinepos/crons.js";
import type * as integrations_onlinepos_financial from "../integrations/onlinepos/financial.js";
import type * as integrations_onlinepos_lib_api from "../integrations/onlinepos/lib/api.js";
import type * as integrations_onlinepos_lib_connections from "../integrations/onlinepos/lib/connections.js";
import type * as integrations_onlinepos_lib_financialApi from "../integrations/onlinepos/lib/financialApi.js";
import type * as integrations_onlinepos_lifecycle from "../integrations/onlinepos/lifecycle.js";
import type * as integrations_onlinepos_menus from "../integrations/onlinepos/menus.js";
import type * as integrations_onlinepos_stock from "../integrations/onlinepos/stock.js";
import type * as integrations_onlinepos_sync from "../integrations/onlinepos/sync.js";
import type * as integrations_state from "../integrations/state.js";
import type * as integrations_wolt_api from "../integrations/wolt/api.js";
import type * as integrations_wolt_credentials from "../integrations/wolt/credentials.js";
import type * as integrations_wolt_crons from "../integrations/wolt/crons.js";
import type * as integrations_wolt_http from "../integrations/wolt/http.js";
import type * as integrations_wolt_lib_api from "../integrations/wolt/lib/api.js";
import type * as integrations_wolt_lib_credentialValidators from "../integrations/wolt/lib/credentialValidators.js";
import type * as integrations_wolt_lib_crypto from "../integrations/wolt/lib/crypto.js";
import type * as integrations_wolt_lib_mappings from "../integrations/wolt/lib/mappings.js";
import type * as integrations_wolt_lib_rollup from "../integrations/wolt/lib/rollup.js";
import type * as integrations_wolt_lib_validators from "../integrations/wolt/lib/validators.js";
import type * as integrations_wolt_lifecycle from "../integrations/wolt/lifecycle.js";
import type * as integrations_wolt_sync from "../integrations/wolt/sync.js";
import type * as integrations_workfeed_api from "../integrations/workfeed/api.js";
import type * as integrations_workfeed_crons from "../integrations/workfeed/crons.js";
import type * as integrations_workfeed_labor from "../integrations/workfeed/labor.js";
import type * as integrations_workfeed_lib_api from "../integrations/workfeed/lib/api.js";
import type * as integrations_workfeed_lib_syncRequest from "../integrations/workfeed/lib/syncRequest.js";
import type * as integrations_workfeed_lifecycle from "../integrations/workfeed/lifecycle.js";
import type * as integrations_workfeed_sync from "../integrations/workfeed/sync.js";
import type * as invitations from "../invitations.js";
import type * as invoices from "../invoices.js";
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
import type * as lib_dateLabelSettings from "../lib/dateLabelSettings.js";
import type * as lib_email from "../lib/email.js";
import type * as lib_expenseValidators from "../lib/expenseValidators.js";
import type * as lib_expiry from "../lib/expiry.js";
import type * as lib_features from "../lib/features.js";
import type * as lib_forecastConsumption from "../lib/forecastConsumption.js";
import type * as lib_forecastOpeningHours from "../lib/forecastOpeningHours.js";
import type * as lib_forecastProviders from "../lib/forecastProviders.js";
import type * as lib_forecastSettings from "../lib/forecastSettings.js";
import type * as lib_forecastValidators from "../lib/forecastValidators.js";
import type * as lib_googlePlaces from "../lib/googlePlaces.js";
import type * as lib_idempotency from "../lib/idempotency.js";
import type * as lib_linear from "../lib/linear.js";
import type * as lib_locationDeletion from "../lib/locationDeletion.js";
import type * as lib_locationMutations from "../lib/locationMutations.js";
import type * as lib_locationProducts from "../lib/locationProducts.js";
import type * as lib_locations from "../lib/locations.js";
import type * as lib_masterData from "../lib/masterData.js";
import type * as lib_menuGroups from "../lib/menuGroups.js";
import type * as lib_monthlyKpiValidators from "../lib/monthlyKpiValidators.js";
import type * as lib_openStreetMap from "../lib/openStreetMap.js";
import type * as lib_openingHours from "../lib/openingHours.js";
import type * as lib_organizationTheme from "../lib/organizationTheme.js";
import type * as lib_ownCheckRecords from "../lib/ownCheckRecords.js";
import type * as lib_ownCheckSettings from "../lib/ownCheckSettings.js";
import type * as lib_ownCheckValidators from "../lib/ownCheckValidators.js";
import type * as lib_ownChecks from "../lib/ownChecks.js";
import type * as lib_productCatalog from "../lib/productCatalog.js";
import type * as lib_productCategories from "../lib/productCategories.js";
import type * as lib_productStock from "../lib/productStock.js";
import type * as lib_productUnits from "../lib/productUnits.js";
import type * as lib_rateLimits from "../lib/rateLimits.js";
import type * as lib_resend from "../lib/resend.js";
import type * as lib_roles from "../lib/roles.js";
import type * as lib_salesRollup from "../lib/salesRollup.js";
import type * as lib_salesSources from "../lib/salesSources.js";
import type * as lib_salesStock from "../lib/salesStock.js";
import type * as lib_staffFoodCategories from "../lib/staffFoodCategories.js";
import type * as lib_stock from "../lib/stock.js";
import type * as lib_storageOwnership from "../lib/storageOwnership.js";
import type * as lib_timeZone from "../lib/timeZone.js";
import type * as lib_transferAggregates from "../lib/transferAggregates.js";
import type * as locationProducts from "../locationProducts.js";
import type * as locations from "../locations.js";
import type * as masterData from "../masterData.js";
import type * as migrations from "../migrations.js";
import type * as monthlyKpi from "../monthlyKpi.js";
import type * as navigation from "../navigation.js";
import type * as onlinePos from "../onlinePos.js";
import type * as onlinePosFinancial from "../onlinePosFinancial.js";
import type * as onlinePosMenus from "../onlinePosMenus.js";
import type * as onlinePosStock from "../onlinePosStock.js";
import type * as onlinePosSync from "../onlinePosSync.js";
import type * as ordering from "../ordering.js";
import type * as orderingSettings from "../orderingSettings.js";
import type * as organization from "../organization.js";
import type * as ownCheckDocumentation from "../ownCheckDocumentation.js";
import type * as ownCheckOverview from "../ownCheckOverview.js";
import type * as ownCheckTemplates from "../ownCheckTemplates.js";
import type * as ownChecks from "../ownChecks.js";
import type * as presence from "../presence.js";
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
import type * as woltCredentials from "../woltCredentials.js";
import type * as woltHttp from "../woltHttp.js";
import type * as woltSync from "../woltSync.js";
import type * as workfeed from "../workfeed.js";
import type * as workfeedLabor from "../workfeedLabor.js";
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
  dashboardLive: typeof dashboardLive;
  dashboardShare: typeof dashboardShare;
  dashboardSummaries: typeof dashboardSummaries;
  dateLabels: typeof dateLabels;
  economic: typeof economic;
  economicReports: typeof economicReports;
  employees: typeof employees;
  expenseEconomic: typeof expenseEconomic;
  expenseNotices: typeof expenseNotices;
  expenses: typeof expenses;
  features: typeof features;
  feedback: typeof feedback;
  feedbackDelivery: typeof feedbackDelivery;
  forecasts: typeof forecasts;
  goodsReceipts: typeof goodsReceipts;
  googlePlaces: typeof googlePlaces;
  http: typeof http;
  integrations: typeof integrations;
  "integrations/credentials": typeof integrations_credentials;
  "integrations/economic/api": typeof integrations_economic_api;
  "integrations/economic/expenses": typeof integrations_economic_expenses;
  "integrations/economic/lib/api": typeof integrations_economic_lib_api;
  "integrations/economic/lib/crypto": typeof integrations_economic_lib_crypto;
  "integrations/economic/lib/expenseApi": typeof integrations_economic_lib_expenseApi;
  "integrations/economic/lib/report": typeof integrations_economic_lib_report;
  "integrations/economic/lib/validators": typeof integrations_economic_lib_validators;
  "integrations/economic/lifecycle": typeof integrations_economic_lifecycle;
  "integrations/economic/reports": typeof integrations_economic_reports;
  "integrations/onlinepos/api": typeof integrations_onlinepos_api;
  "integrations/onlinepos/crons": typeof integrations_onlinepos_crons;
  "integrations/onlinepos/financial": typeof integrations_onlinepos_financial;
  "integrations/onlinepos/lib/api": typeof integrations_onlinepos_lib_api;
  "integrations/onlinepos/lib/connections": typeof integrations_onlinepos_lib_connections;
  "integrations/onlinepos/lib/financialApi": typeof integrations_onlinepos_lib_financialApi;
  "integrations/onlinepos/lifecycle": typeof integrations_onlinepos_lifecycle;
  "integrations/onlinepos/menus": typeof integrations_onlinepos_menus;
  "integrations/onlinepos/stock": typeof integrations_onlinepos_stock;
  "integrations/onlinepos/sync": typeof integrations_onlinepos_sync;
  "integrations/state": typeof integrations_state;
  "integrations/wolt/api": typeof integrations_wolt_api;
  "integrations/wolt/credentials": typeof integrations_wolt_credentials;
  "integrations/wolt/crons": typeof integrations_wolt_crons;
  "integrations/wolt/http": typeof integrations_wolt_http;
  "integrations/wolt/lib/api": typeof integrations_wolt_lib_api;
  "integrations/wolt/lib/credentialValidators": typeof integrations_wolt_lib_credentialValidators;
  "integrations/wolt/lib/crypto": typeof integrations_wolt_lib_crypto;
  "integrations/wolt/lib/mappings": typeof integrations_wolt_lib_mappings;
  "integrations/wolt/lib/rollup": typeof integrations_wolt_lib_rollup;
  "integrations/wolt/lib/validators": typeof integrations_wolt_lib_validators;
  "integrations/wolt/lifecycle": typeof integrations_wolt_lifecycle;
  "integrations/wolt/sync": typeof integrations_wolt_sync;
  "integrations/workfeed/api": typeof integrations_workfeed_api;
  "integrations/workfeed/crons": typeof integrations_workfeed_crons;
  "integrations/workfeed/labor": typeof integrations_workfeed_labor;
  "integrations/workfeed/lib/api": typeof integrations_workfeed_lib_api;
  "integrations/workfeed/lib/syncRequest": typeof integrations_workfeed_lib_syncRequest;
  "integrations/workfeed/lifecycle": typeof integrations_workfeed_lifecycle;
  "integrations/workfeed/sync": typeof integrations_workfeed_sync;
  invitations: typeof invitations;
  invoices: typeof invoices;
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
  "lib/dateLabelSettings": typeof lib_dateLabelSettings;
  "lib/email": typeof lib_email;
  "lib/expenseValidators": typeof lib_expenseValidators;
  "lib/expiry": typeof lib_expiry;
  "lib/features": typeof lib_features;
  "lib/forecastConsumption": typeof lib_forecastConsumption;
  "lib/forecastOpeningHours": typeof lib_forecastOpeningHours;
  "lib/forecastProviders": typeof lib_forecastProviders;
  "lib/forecastSettings": typeof lib_forecastSettings;
  "lib/forecastValidators": typeof lib_forecastValidators;
  "lib/googlePlaces": typeof lib_googlePlaces;
  "lib/idempotency": typeof lib_idempotency;
  "lib/linear": typeof lib_linear;
  "lib/locationDeletion": typeof lib_locationDeletion;
  "lib/locationMutations": typeof lib_locationMutations;
  "lib/locationProducts": typeof lib_locationProducts;
  "lib/locations": typeof lib_locations;
  "lib/masterData": typeof lib_masterData;
  "lib/menuGroups": typeof lib_menuGroups;
  "lib/monthlyKpiValidators": typeof lib_monthlyKpiValidators;
  "lib/openStreetMap": typeof lib_openStreetMap;
  "lib/openingHours": typeof lib_openingHours;
  "lib/organizationTheme": typeof lib_organizationTheme;
  "lib/ownCheckRecords": typeof lib_ownCheckRecords;
  "lib/ownCheckSettings": typeof lib_ownCheckSettings;
  "lib/ownCheckValidators": typeof lib_ownCheckValidators;
  "lib/ownChecks": typeof lib_ownChecks;
  "lib/productCatalog": typeof lib_productCatalog;
  "lib/productCategories": typeof lib_productCategories;
  "lib/productStock": typeof lib_productStock;
  "lib/productUnits": typeof lib_productUnits;
  "lib/rateLimits": typeof lib_rateLimits;
  "lib/resend": typeof lib_resend;
  "lib/roles": typeof lib_roles;
  "lib/salesRollup": typeof lib_salesRollup;
  "lib/salesSources": typeof lib_salesSources;
  "lib/salesStock": typeof lib_salesStock;
  "lib/staffFoodCategories": typeof lib_staffFoodCategories;
  "lib/stock": typeof lib_stock;
  "lib/storageOwnership": typeof lib_storageOwnership;
  "lib/timeZone": typeof lib_timeZone;
  "lib/transferAggregates": typeof lib_transferAggregates;
  locationProducts: typeof locationProducts;
  locations: typeof locations;
  masterData: typeof masterData;
  migrations: typeof migrations;
  monthlyKpi: typeof monthlyKpi;
  navigation: typeof navigation;
  onlinePos: typeof onlinePos;
  onlinePosFinancial: typeof onlinePosFinancial;
  onlinePosMenus: typeof onlinePosMenus;
  onlinePosStock: typeof onlinePosStock;
  onlinePosSync: typeof onlinePosSync;
  ordering: typeof ordering;
  orderingSettings: typeof orderingSettings;
  organization: typeof organization;
  ownCheckDocumentation: typeof ownCheckDocumentation;
  ownCheckOverview: typeof ownCheckOverview;
  ownCheckTemplates: typeof ownCheckTemplates;
  ownChecks: typeof ownChecks;
  presence: typeof presence;
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
  woltCredentials: typeof woltCredentials;
  woltHttp: typeof woltHttp;
  woltSync: typeof woltSync;
  workfeed: typeof workfeed;
  workfeedLabor: typeof workfeedLabor;
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
  presence: import("@convex-dev/presence/_generated/component.js").ComponentApi<"presence">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
