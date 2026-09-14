import { v } from "convex/values";

export const salesSourceValidator = v.union(
  v.literal("onlinePos"),
  v.literal("wolt"),
  v.literal("combined"),
);
