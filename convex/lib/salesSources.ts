import { v } from "convex/values";

export const countSalesSourceValidator = v.union(
  v.literal("onlinePos"),
  v.literal("wolt"),
  v.literal("combined"),
);

export const salesSourceValidator = v.union(
  v.literal("onlinePos"),
  v.literal("onlinePosStore"),
  v.literal("onlinePosOnline"),
  v.literal("wolt"),
  v.literal("combined"),
);
