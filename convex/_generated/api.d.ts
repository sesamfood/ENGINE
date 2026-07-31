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
import type * as catalog from "../catalog.js";
import type * as count from "../count.js";
import type * as crons from "../crons.js";
import type * as employees from "../employees.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_countLock from "../lib/countLock.js";
import type * as lib_countSettings from "../lib/countSettings.js";
import type * as lib_countWindow from "../lib/countWindow.js";
import type * as lib_openingHours from "../lib/openingHours.js";
import type * as lib_rateLimits from "../lib/rateLimits.js";
import type * as lib_stock from "../lib/stock.js";
import type * as lib_workfeedApi from "../lib/workfeedApi.js";
import type * as locations from "../locations.js";
import type * as onlinePos from "../onlinePos.js";
import type * as organization from "../organization.js";
import type * as transfers from "../transfers.js";
import type * as workfeed from "../workfeed.js";
import type * as workfeedSync from "../workfeedSync.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  catalog: typeof catalog;
  count: typeof count;
  crons: typeof crons;
  employees: typeof employees;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/countLock": typeof lib_countLock;
  "lib/countSettings": typeof lib_countSettings;
  "lib/countWindow": typeof lib_countWindow;
  "lib/openingHours": typeof lib_openingHours;
  "lib/rateLimits": typeof lib_rateLimits;
  "lib/stock": typeof lib_stock;
  "lib/workfeedApi": typeof lib_workfeedApi;
  locations: typeof locations;
  onlinePos: typeof onlinePos;
  organization: typeof organization;
  transfers: typeof transfers;
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
