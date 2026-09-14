import { ConvexError, v } from "convex/values";
import { expiryError, type Expiry } from "../../lib/expiry";

export const expiryValidator = v.object({
  value: v.number(),
  unit: v.union(v.literal("hours"), v.literal("days"), v.literal("months")),
});

export function requireValidExpiry(expiry: Expiry) {
  const error = expiryError(expiry);
  if (error) throw new ConvexError(error);
}
