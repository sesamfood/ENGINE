/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as badDeliveries from "../badDeliveries.js";
import type * as badDeliveryNotices from "../badDeliveryNotices.js";
import type * as catalog from "../catalog.js";
import type * as count from "../count.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as dashboardShare from "../dashboardShare.js";
import type * as employees from "../employees.js";
import type * as http from "../http.js";
import type * as kiosk from "../kiosk.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_authEmail from "../lib/authEmail.js";
import type * as lib_badDeliverySettings from "../lib/badDeliverySettings.js";
import type * as lib_categoryHierarchy from "../lib/categoryHierarchy.js";
import type * as lib_countLock from "../lib/countLock.js";
import type * as lib_countSettings from "../lib/countSettings.js";
import type * as lib_countWindow from "../lib/countWindow.js";
import type * as lib_dashboardMetrics from "../lib/dashboardMetrics.js";
import type * as lib_dashboardShareCrypto from "../lib/dashboardShareCrypto.js";
import type * as lib_dashboardValidators from "../lib/dashboardValidators.js";
import type * as lib_openingHours from "../lib/openingHours.js";
import type * as lib_organizationTheme from "../lib/organizationTheme.js";
import type * as lib_rateLimits from "../lib/rateLimits.js";
import type * as lib_resend from "../lib/resend.js";
import type * as lib_stock from "../lib/stock.js";
import type * as lib_workfeedApi from "../lib/workfeedApi.js";
import type * as locations from "../locations.js";
import type * as navigation from "../navigation.js";
import type * as onlinePos from "../onlinePos.js";
import type * as organization from "../organization.js";
import type * as staffFood from "../staffFood.js";
import type * as transfers from "../transfers.js";
import type * as waste from "../waste.js";
import type * as workfeed from "../workfeed.js";
import type * as workfeedSync from "../workfeedSync.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  badDeliveries: typeof badDeliveries;
  badDeliveryNotices: typeof badDeliveryNotices;
  catalog: typeof catalog;
  count: typeof count;
  crons: typeof crons;
  dashboard: typeof dashboard;
  dashboardShare: typeof dashboardShare;
  employees: typeof employees;
  http: typeof http;
  kiosk: typeof kiosk;
  "lib/auth": typeof lib_auth;
  "lib/authEmail": typeof lib_authEmail;
  "lib/badDeliverySettings": typeof lib_badDeliverySettings;
  "lib/categoryHierarchy": typeof lib_categoryHierarchy;
  "lib/countLock": typeof lib_countLock;
  "lib/countSettings": typeof lib_countSettings;
  "lib/countWindow": typeof lib_countWindow;
  "lib/dashboardMetrics": typeof lib_dashboardMetrics;
  "lib/dashboardShareCrypto": typeof lib_dashboardShareCrypto;
  "lib/dashboardValidators": typeof lib_dashboardValidators;
  "lib/openingHours": typeof lib_openingHours;
  "lib/organizationTheme": typeof lib_organizationTheme;
  "lib/rateLimits": typeof lib_rateLimits;
  "lib/resend": typeof lib_resend;
  "lib/stock": typeof lib_stock;
  "lib/workfeedApi": typeof lib_workfeedApi;
  locations: typeof locations;
  navigation: typeof navigation;
  onlinePos: typeof onlinePos;
  organization: typeof organization;
  staffFood: typeof staffFood;
  transfers: typeof transfers;
  waste: typeof waste;
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
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
