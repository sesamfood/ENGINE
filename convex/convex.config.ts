import { defineApp } from "convex/server";
import { v } from "convex/values";
import migrations from "@convex-dev/migrations/convex.config.js";
import presence from "@convex-dev/presence/convex.config.js";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import betterAuth from "./betterAuth/convex.config";

const app = defineApp({
  env: {
    WOLT_CLIENT_ID: v.optional(v.string()),
    WOLT_CLIENT_SECRET: v.optional(v.string()),
    WOLT_WEBHOOK_SECRET: v.optional(v.string()),
    WOLT_WIO_API_KEY: v.optional(v.string()),
    WOLT_WIO_REDIRECT_URIS: v.optional(v.string()),
    WOLT_ENCRYPTION_KEY: v.optional(v.string()),
    WOLT_OAUTH_REDIRECT_URI: v.optional(v.string()),
    SITE_URL: v.optional(v.string()),
    WOLT_ENVIRONMENT: v.optional(
      v.union(v.literal("development"), v.literal("production")),
    ),
  },
});

app.use(betterAuth);
app.use(migrations);
app.use(presence);
app.use(rateLimiter);

export default app;
